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
  useRef, useState, useCallback, useEffect,
} from 'react';
import Phaser          from 'phaser';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../../Redux/store';

import type { GameSettingsState } from '../../../../Redux/Features/gameSlice';

import { GameScene }       from './GameScene';
import {
  ChestRewardUI,
  ChatInput,
  DialogBox,
  Hotbar,
  HUD,
  MultiplayPanel,
} from './ui';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import { gameBus } from './shared/EventBus';

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
  useCompleteHouseConstructionMutation,
  useDeleteGameSaveMutation,
  useOpenGameHouseMutation,
  usePlaceGameHouseMutation,
  usePlaceStorageChestMutation,
  useSaveGameSaveMutation,
} from './api';
import { GameShopModal } from './components/GameShopModal';
import { HouseContractModal } from './components/HouseContractModal';
import { StorageChestModal } from './components/StorageChestModal';

// ─────────────────────────────────────────────────────────────────────────────
const SystemIdleGame: React.FC = () => {
  // ── 跨 hook 共享的 refs ────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef     = useRef<GameScene | null>(null);
  const gameRef      = useRef<Phaser.Game | null>(null);
  /** chat 输入框是否打开（键盘逻辑与 NpcChat 共用）。 */
  const chatOpenRef  = useRef(false);


  // ── 领域 hooks ────────────────────────────────────────────────────────────
  const auth = useGameAuth();

  const hotbar = useHotbar(sceneRef);

  const npcChat = useNpcChat(sceneRef, chatOpenRef);

  const multiplay = useMultiplay({
    sceneRef,
    tokenRef:         auth.tokenRef,
    myDisplayNameRef: auth.myDisplayNameRef,
    userId:           auth.userId,
  });

  const chests = useChestManager(sceneRef, multiplay.multiplayRoomIdRef);

  // 农田/物品 gameBus 订阅（无状态，副作用）
  useFarmActions(sceneRef, multiplay.multiplayRoomIdRef);

  const syncBoundary = useIdleGameSyncBoundary({
    sceneRef,
    multiplayActiveRef: multiplay.multiplayActiveRef,
    setAvailableChests: chests.setAvailableChests,
    setNpcDialog: npcChat.setDialog,
  });

  // ── 附加 UI 状态 ─────────────────────────────────────────────────────────
  const [timeStr,  setTimeStr ] = useState('2026-01-01 06:00');
  const [isSaving, setIsSaving] = useState(false);
  const [gameShopOpen, setGameShopOpen] = useState(false);
  const [houseContractOpen, setHouseContractOpen] = useState(false);
  const [storageChestOpenId, setStorageChestOpenId] = useState<string | null>(null);
  /** Closest NPC name to player (refreshed @4Hz) — drives the talk-button label. */
  const [nearbyNpc, setNearbyNpc] = useState<string | null>(null);
  useEffect(() => {
    const id = setInterval(() => {
      setNearbyNpc(sceneRef.current?.getNearestNpcName?.(220) ?? null);
    }, 250);
    return () => clearInterval(id);
  }, []);

  // ── 存档快捷 ─────────────────────────────────────────────────────────────
  const rawGameSettings = useSelector((s: RootState) => s.game.settings);
  const gameInventory = useSelector((s: RootState) => s.game.gameInventory);
  const backpackSlots = useSelector((s: RootState) => s.game.backpackSlots);
  const gameInventoryRef = useRef(gameInventory);
  const backpackSlotsRef = useRef(backpackSlots);
  gameInventoryRef.current = gameInventory;
  backpackSlotsRef.current = backpackSlots;
  const gameSettings: GameSettingsState = {
    ...rawGameSettings,
    pathLineEnabled: Boolean(rawGameSettings.pathLineEnabled),
    agentBrainEnabled: rawGameSettings.agentBrainEnabled !== false,
  };
  const gameSettingsRef = useRef(gameSettings);
  gameSettingsRef.current = gameSettings;

  const [saveGameSave] = useSaveGameSaveMutation();
  const [deleteGameSave] = useDeleteGameSaveMutation();
  const [placeGameHouse] = usePlaceGameHouseMutation();
  const [placeStorageChest] = usePlaceStorageChestMutation();
  const [completeHouseConstruction] = useCompleteHouseConstructionMutation();
  const [openGameHouse] = useOpenGameHouseMutation();
  const handleSave = useCallback(async () => {
    if (!sceneRef.current) return;
    setIsSaving(true);
    try {
      const roomId = multiplay.multiplayRoomIdRef.current ?? undefined;
      const gameSave = sceneRef.current.getGameSaveData({
        previousSave: savedGameSaveRef.current,
        roomId,
        userId: auth.userId,
        username: auth.myDisplayName,
        settings: gameSettingsRef.current,
        inventory: {
          gameInventory: gameInventoryRef.current,
          hotbarSlots: hotbar.hotbarSlotsRef.current as any,
          backpackSlots: backpackSlotsRef.current,
        },
        npcInventories: npcChat.npcInventoriesRef.current,
      });
      await saveGameSave({ gameSave, roomId }).unwrap();
    }
    catch { /* best-effort */ }
    finally { setIsSaving(false); }
  }, [auth.myDisplayName, auth.userId, hotbar.hotbarSlotsRef, multiplay.multiplayRoomIdRef, npcChat.npcInventoriesRef, saveGameSave]);

  useEffect(() => {
    const unsubscribe = gameBus.on('game:save_delete_requested', async ({ roomId }) => {
      setIsSaving(true);
      try {
        await deleteGameSave({ roomId }).unwrap();
        npcChat.setDialog({
          visible: true,
          text: '世界存档已删除，正在重新载入新世界。',
          npcName: 'System',
        });
        window.setTimeout(() => window.location.reload(), 300);
      } catch (error) {
        const message = (error as { data?: { message?: string } })?.data?.message
          ?? '删除存档失败。';
        npcChat.setDialog({ visible: true, text: message, npcName: 'System' });
        setIsSaving(false);
      }
    });
    return unsubscribe;
  }, [deleteGameSave, npcChat.setDialog]);

  useEffect(() => {
    const offPlace = gameBus.on('game:house_place_requested', async (payload: any) => {
      try {
        const result = await placeGameHouse({
          ...payload,
          roomId: payload.roomId ?? multiplay.multiplayRoomIdRef.current ?? undefined,
        }).unwrap();
        sceneRef.current?.loadHouseGameSaveData(result.gameSave);
      } catch (error) {
        const text = (error as { data?: { message?: string } })?.data?.message || '房屋放置失败。';
        npcChat.setDialog({ visible: true, text, npcName: 'System' });
      }
    });
    const offStoragePlace = gameBus.on('game:storage_chest_place_requested', async (payload: any) => {
      try {
        const result = await placeStorageChest({
          ...payload,
          roomId: payload.roomId ?? multiplay.multiplayRoomIdRef.current ?? undefined,
        }).unwrap();
        sceneRef.current?.loadStorageChestGameSaveData(result.gameSave);
      } catch (error) {
        const text = (error as { data?: { message?: string } })?.data?.message || 'Storage chest placement failed.';
        npcChat.setDialog({ visible: true, text, npcName: 'System' });
      }
    });
    const offStorageOpen = gameBus.on('game:storage_chest_open_requested', ({ chestId }) => {
      setStorageChestOpenId(chestId);
    });
    const offComplete = gameBus.on('game:house_complete_requested', async (payload: any) => {
      try {
        const result = await completeHouseConstruction({
          ...payload,
          roomId: payload.roomId ?? multiplay.multiplayRoomIdRef.current ?? undefined,
        }).unwrap();
        sceneRef.current?.loadHouseGameSaveData(result.gameSave);
      } catch (error) {
        console.warn('[House] complete construction failed', error);
      }
    });
    const toggleHouseDoor = async (payload: any) => {
      try {
        const result = await openGameHouse({
          ...payload,
          roomId: payload.roomId ?? multiplay.multiplayRoomIdRef.current ?? undefined,
        }).unwrap();
        sceneRef.current?.loadHouseGameSaveData(result.gameSave);
      } catch (error) {
        const text = (error as { data?: { message?: string } })?.data?.message || '切换房门失败，需要对应房屋钥匙。';
        npcChat.setDialog({ visible: true, text, npcName: 'System' });
      }
    };
    const offDoorToggle = gameBus.on('game:house_door_toggle_requested', toggleHouseDoor);
    const offOpen = gameBus.on('game:house_open_requested', toggleHouseDoor);
    return () => {
      offPlace();
      offStoragePlace();
      offStorageOpen();
      offComplete();
      offDoorToggle();
      offOpen();
    };
  }, [
    completeHouseConstruction,
    multiplay.multiplayRoomIdRef,
    npcChat.setDialog,
    openGameHouse,
    placeGameHouse,
    placeStorageChest,
  ]);

  // ── Q 键 drop 物品（由 usePhaserBoot 调用） ───────────────────────────────
  const onDropItem = useCallback((_slot: number, itemId: string) => {
    sceneRef.current?.dropPlayerItem(itemId);
  }, []);

  // ── 从 Redux 获取存档 + username ─────────────────────────────────────────
  const profile       = useSelector((s: RootState) => s.profile);
  const savedIdleGame = useSelector((s: RootState) => s.profile.profile?.idleGame ?? null);
  const savedGameSave = useSelector((s: RootState) => s.profile.profile?.gameSave ?? null);
  const savedIdleGameRef = useRef(savedIdleGame);
  const savedGameSaveRef = useRef(savedGameSave);
  savedIdleGameRef.current = savedIdleGame;
  savedGameSaveRef.current = savedGameSave;
  const username = (profile as any)?.profile?.user?.username ?? '';

  const applyGameSettings = useCallback(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    scene.executeCommand(`/weather ${gameSettings.weather}`);
    scene.executeCommand(`/debug ${gameSettings.physicsDebug ? 'on' : 'off'}`);
    scene.executeCommand(`/pathline ${gameSettings.pathLineEnabled ? 'on' : 'off'}`);
    scene.executeCommand(`/sleep threshold ${gameSettings.sleepThreshold}`);
    scene.executeCommand(`/agent brain ${gameSettings.agentBrainEnabled ? 'on' : 'off'}`);
  }, [
    gameSettings.agentBrainEnabled,
    gameSettings.pathLineEnabled,
    gameSettings.physicsDebug,
    gameSettings.sleepThreshold,
    gameSettings.weather,
  ]);

  useEffect(() => {
    const unsubscribe = gameBus.on('game:ready', applyGameSettings);
    applyGameSettings();
    return unsubscribe;
  }, [applyGameSettings]);


  // ── Phaser 启动（包含 game:ready 数据加载、键盘、自动存档） ───────────────
  usePhaserBoot({
    containerRef,
    sceneRef,
    gameRef,
    chatOpenRef,
    hotbarSlotsRef:    hotbar.hotbarSlotsRef,
    selectedSlotRef:   hotbar.selectedSlotRef,
    savedIdleGameRef,
    savedGameSaveRef,
    gameSettingsRef,
    gameInventoryRef,
    backpackSlotsRef,
    tokenRef:          auth.tokenRef,
    npcInventoriesRef: npcChat.npcInventoriesRef,
    userId:            auth.userId,
    username:          auth.myDisplayName,
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
        showHints={!npcChat.dialog.visible && !npcChat.chat.open}
      />

      {false && !npcChat.chat.open && !npcChat.dialog.visible && (
        <button
          type="button"
          onClick={() => setGameShopOpen(true)}
          style={{
            position: 'absolute',
            top: 88,
            right: 16,
            zIndex: 210,
            border: '2px solid var(--px-border-gold)',
            borderRadius: 6,
            background: 'var(--px-surface2)',
            color: 'var(--px-gold)',
            padding: '7px 12px',
            fontSize: 13,
            fontFamily: '"Courier New", monospace',
            fontWeight: 900,
            cursor: 'pointer',
          }}
        >
          NPC 商店
        </button>
      )}

      {/* 宝箱 HUD 指示器 */}
      {!npcChat.chat.open && !npcChat.dialog.visible && (
        <div style={{
          position: 'absolute',
          top: 128,
          right: 16,
          zIndex: 210,
          display: 'grid',
          gap: 8,
        }}>
          <button
            type="button"
            onClick={() => setGameShopOpen(true)}
            style={{
              border: '2px solid var(--px-border-gold)',
              borderRadius: 6,
              background: 'var(--px-surface2)',
              color: 'var(--px-gold)',
              padding: '7px 12px',
              fontSize: 13,
              fontFamily: '"Courier New", monospace',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            房屋商店
          </button>
          <button
            type="button"
            onClick={() => setHouseContractOpen(true)}
            style={{
              border: '2px solid var(--px-border)',
              borderRadius: 6,
              background: 'var(--px-surface2)',
              color: 'var(--px-text)',
              padding: '7px 12px',
              fontSize: 13,
              fontFamily: '"Courier New", monospace',
              fontWeight: 900,
              cursor: 'pointer',
            }}
          >
            房屋合同
          </button>
        </div>
      )}

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

      {/* 对话按钮 — 动态显示最近 NPC 名字；附近无人时按钮变灰但仍可点击（点击会提示） */}
      {!npcChat.chat.open && !npcChat.dialog.visible && (
        <button
          onClick={() => sceneRef.current?.triggerInteract()}
          style={{
            position:      'absolute',
            bottom:        90,
            right:         16,
            zIndex:        200,
            background:    nearbyNpc ? '#4a3500' : '#2a1f00',
            color:         nearbyNpc ? '#fffde8' : '#9a8866',
            border:        `2px solid ${nearbyNpc ? '#c8a850' : '#6a5530'}`,
            borderRadius:  6,
            padding:       '6px 18px',
            fontSize:      13,
            fontFamily:    '"Courier New", monospace',
            cursor:        'pointer',
            letterSpacing: 0.5,
          }}
        >
          {nearbyNpc ? `💬 [Enter] 和${nearbyNpc}对话` : '💬 附近没有人'}
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

      <GameShopModal
        open={gameShopOpen}
        roomId={multiplay.multiplayRoomId}
        sceneRef={sceneRef}
        onClose={() => setGameShopOpen(false)}
      />

      {/* NPC 确认弹窗 */}
      <StorageChestModal
        open={Boolean(storageChestOpenId)}
        chestId={storageChestOpenId}
        roomId={multiplay.multiplayRoomId}
        sceneRef={sceneRef}
        onClose={() => setStorageChestOpenId(null)}
      />

      <HouseContractModal
        open={houseContractOpen}
        roomId={multiplay.multiplayRoomId}
        sceneRef={sceneRef}
        onClose={() => setHouseContractOpen(false)}
      />

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
