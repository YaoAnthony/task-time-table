/**
 * SystemIdleGame — Phaser 3 + React 游戏容器。
 *
 * 这里只负责：
 *   · 持有需要跨 hook 共享的 ref（sceneRef / gameRef / chatOpenRef）
 *   · 调用各领域 hook
 *   · 渲染 JSX
 *
 * 具体逻辑已拆分到 hooks/ 目录下各文件。
 */

import React, {
  useRef, useState, useCallback,
} from 'react';
import Phaser          from 'phaser';
import { useDispatch } from 'react-redux';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../../Redux/store';

import { clearHotbarSlot } from '../../../../Redux/Features/gameSlice';

import { GameScene }       from './GameScene';
import MultiplayPanel      from './components/MultiplayPanel';
import { HUD }             from './components/HUD';
import { Hotbar }          from './components/Hotbar';
import { DialogBox }       from './components/DialogBox';
import { ChatInput }       from './components/ChatInput';
import ChestRewardUI       from './components/ChestRewardUI';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';

// ── Custom hooks ─────────────────────────────────────────────────────────────
import { useGameAuth }      from './hooks/useGameAuth';
import { useHotbar }        from './hooks/useHotbar';
import { useNpcChat }       from './hooks/useNpcChat';
import { useChestManager }  from './hooks/useChestManager';
import { useIdleGameSyncBoundary } from './hooks/useIdleGameSyncBoundary';
import { useMultiplay }     from './hooks/useMultiplay';
import { useFarmActions }   from './hooks/useFarmActions';
import { usePhaserBoot }    from './hooks/usePhaserBoot';
import {
  useSaveIdleGameMutation,
} from '../../../../api/profileStateRtkApi';

// ─────────────────────────────────────────────────────────────────────────────
const SystemIdleGame: React.FC = () => {
  // ── 跨 hook 共享的 refs ────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef     = useRef<GameScene | null>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  /** chat 输入框是否打开（键盘逻辑与 NpcChat 共用）。 */
  const chatOpenRef  = useRef(false);

  const dispatch = useDispatch();

  // ── 领域 hooks ────────────────────────────────────────────────────────────
  const auth = useGameAuth();

  const hotbar = useHotbar(sceneRef);

  const npcChat = useNpcChat(sceneRef, chatOpenRef);

  const chests = useChestManager(sceneRef);

  const multiplay = useMultiplay({
    sceneRef,
    tokenRef:         auth.tokenRef,
    myDisplayNameRef: auth.myDisplayNameRef,
    userId:           auth.userId,
  });

  // 农田/物品 gameBus 订阅（无状态，副作用）
  useFarmActions(sceneRef, multiplay.multiplayRoomIdRef);

  const syncBoundary = useIdleGameSyncBoundary({
    sceneRef,
    multiplayActiveRef: multiplay.multiplayActiveRef,
    setAvailableChests: chests.setAvailableChests,
    setNpcDialog: npcChat.setDialog,
  });

  // ── 附加 UI 状态 ─────────────────────────────────────────────────────────
  const [timeStr,  setTimeStr ] = useState('06:00');
  const [isSaving, setIsSaving] = useState(false);

  // ── 存档快捷 ─────────────────────────────────────────────────────────────
  const [saveIdleGame] = useSaveIdleGameMutation();
  const handleSave = useCallback(async () => {
    if (!sceneRef.current) return;
    setIsSaving(true);
    try { await saveIdleGame(sceneRef.current.getGameState()).unwrap(); }
    catch { /* best-effort */ }
    finally { setIsSaving(false); }
  }, [saveIdleGame]);

  // ── Q 键 drop 物品（由 usePhaserBoot 调用） ───────────────────────────────
  const onDropItem = useCallback((slot: number, itemId: string) => {
    dispatch(clearHotbarSlot(slot));
    sceneRef.current?.dropPlayerItem(itemId);
  }, [dispatch]);

  // ── 从 Redux 获取存档 + username ─────────────────────────────────────────
  const profile       = useSelector((s: RootState) => s.profile);
  const savedIdleGame = useSelector((s: RootState) => s.profile.profile?.idleGame ?? null);
  const savedIdleGameRef = useRef(savedIdleGame);
  savedIdleGameRef.current = savedIdleGame;
  const username = (profile as any)?.profile?.user?.username ?? '';

  // ── Phaser 启动（包含 game:ready 数据加载、键盘、自动存档） ───────────────
  usePhaserBoot({
    containerRef,
    sceneRef,
    gameRef,
    chatOpenRef,
    hotbarSlotsRef:    hotbar.hotbarSlotsRef,
    selectedSlotRef:   hotbar.selectedSlotRef,
    savedIdleGameRef,
    tokenRef:          auth.tokenRef,
    npcInventoriesRef: npcChat.npcInventoriesRef,
    multiplayRoomIdRef: multiplay.multiplayRoomIdRef,
    setTimeStr,
    setAvailableChests: chests.setAvailableChests,
    onDropItem,
  });

  // ── SSE：服务器推送宝箱生成 / 农田更新 / NPC 命令 ────────────────────────
  const sseUrl = auth.accessToken
    ? `/api/profile/game/events?token=${encodeURIComponent(auth.accessToken)}`
    : null;

  useSSEWithReconnect({
    url: sseUrl,
    onMessage: syncBoundary.handleSseMessage,
  });

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0d1f08' }}>
      {/* Phaser canvas */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', zIndex: 0 }} />

      {/* HUD */}
      <HUD
        timeStr={timeStr}
        isSaving={isSaving}
        username={username}
        onSave={handleSave}
      />

      {/* 宝箱 HUD 指示器 */}
      {chests.availableChests.length > 0 && (
        <button
          onClick={chests.handleChestHudClick}
          title={`有 ${chests.availableChests.length} 个箱子在地图上\n点击定位`}
          style={{
            position:     'absolute',
            top:          48,
            left:         10,
            zIndex:       200,
            display:      'flex',
            alignItems:   'center',
            gap:          4,
            background:   '#1a1208',
            border:       '2px solid #c8a850',
            borderRadius: 8,
            padding:      '5px 9px',
            boxShadow:    '0 0 10px #c8a85066',
            animation:    'chestPulse 1.8s ease-in-out infinite',
            cursor:       'pointer',
            userSelect:   'none',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>🎁</span>
          {chests.availableChests.length > 1 && (
            <span style={{
              fontSize:      11,
              fontFamily:    '"Courier New", monospace',
              color:         '#ffe57a',
              fontWeight:    'bold',
              letterSpacing: 0.5,
            }}>
              ×{chests.availableChests.length}
            </span>
          )}
        </button>
      )}
      <style>{`
        @keyframes chestPulse {
          0%,100% { box-shadow: 0 0 6px #c8a85066; }
          50%      { box-shadow: 0 0 16px #ffe57aaa; border-color: #ffe57a; }
        }
      `}</style>

      {/* NPC 对话框 */}
      <DialogBox
        visible={npcChat.dialog.visible}
        npcName={npcChat.dialog.npcName}
        text={npcChat.dialog.text}
      />

      {/* 对话按钮 */}
      {!npcChat.chat.open && (
        <button
          onClick={() => sceneRef.current?.triggerInteract()}
          style={{
            position:      'absolute',
            bottom:        90,
            right:         16,
            zIndex:        200,
            background:    '#4a3500',
            color:         '#fffde8',
            border:        '2px solid #c8a850',
            borderRadius:  6,
            padding:       '6px 18px',
            fontSize:      13,
            fontFamily:    '"Courier New", monospace',
            cursor:        'pointer',
            letterSpacing: 0.5,
          }}
        >
          💬 [Enter] 和老李对话
        </button>
      )}

      {/* 快捷栏 */}
      <Hotbar
        selected={hotbar.selectedSlot}
        onChange={hotbar.handleSlotChange}
        hotbarSlots={hotbar.hotbarSlots}
      />

      {/* NPC 聊天输入框 */}
      {npcChat.chat.open && (
        <ChatInput
          npcName={npcChat.chat.npcName}
          initialValue={npcChat.chat.initialValue}
          onSend={npcChat.handleSendMessage}
          onCancel={npcChat.handleCancelChat}
        />
      )}

      {/* 宝箱奖励弹窗 */}
      {chests.pendingChest && (
        <ChestRewardUI
          rewards={chests.pendingChest.rewards}
          onConfirm={chests.handleChestConfirm}
        />
      )}

      {/* 联机面板 */}
      <MultiplayPanel
        isOpen={multiplay.multiplayOpen}
        onToggle={() => multiplay.setMultiplayOpen(o => !o)}
        status={multiplay.multiplayStatus}
        roomId={multiplay.multiplayRoomId}
        peerInfo={multiplay.multiplayPeer}
        error={multiplay.multiplayError}
        onHost={multiplay.handleMultiplayHost}
        onJoin={multiplay.handleMultiplayJoin}
        onDisconnect={multiplay.handleMultiplayDisconnect}
      />

      {/* NPC 确认弹窗 */}
      {npcChat.npcConfirm && (
        <div style={{
          position:     'absolute',
          top:          '50%',
          left:         '50%',
          transform:    'translate(-50%, -50%)',
          zIndex:       300,
          background:   '#1a120a',
          border:       '2px solid #c8a850',
          borderRadius: 8,
          padding:      '18px 24px',
          minWidth:     220,
          boxShadow:    '0 4px 24px #0008',
          textAlign:    'center',
          fontFamily:   '"Courier New", monospace',
          color:        '#fffde8',
        }}>
          <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5 }}>
            💬 {npcChat.npcConfirm.question}
          </p>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button
              onClick={npcChat.handleNpcConfirmYes}
              style={{
                background: '#2d5a1b', color: '#d4f0a0',
                border: '1px solid #6ab03a', borderRadius: 4,
                padding: '5px 18px', cursor: 'pointer', fontSize: 13,
                fontFamily: 'inherit',
              }}
            >✓ 确认</button>
            <button
              onClick={npcChat.handleNpcConfirmNo}
              style={{
                background: '#5a1b1b', color: '#f0a0a0',
                border: '1px solid #b03a3a', borderRadius: 4,
                padding: '5px 18px', cursor: 'pointer', fontSize: 13,
                fontFamily: 'inherit',
              }}
            >✗ 取消</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SystemIdleGame;
