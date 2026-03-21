/**
 * SystemIdleGame — React wrapper for the Phaser 3 idle/exploration game.
 *
 * Responsibilities:
 *   · Boot / destroy the Phaser.Game instance
 *   · Hold React UI state (time, dialog, selected hotbar slot)
 *   · Bridge React → Phaser: tool changes via sceneRef.setPlayerTool()
 *   · Bridge Phaser → React: time updates and NPC speech via callbacks
 *   · Load saved game state (position, gameTick) from Redux on boot
 *   · Auto-save every 30 s + manual save button
 */

import React, {
  useRef, useEffect, useState, useCallback,
} from 'react';
import Phaser from 'phaser';
import { useSelector } from 'react-redux';
import { RootState } from '../../../../Redux/store';
import {
  useSaveIdleGameMutation,
  useNpcChatMutation,
  useLazyGetNpcMemoriesQuery,
  useLazyGetGameChestsQuery,
  useOpenChestMutation,
} from '../../../../api/profileStateRtkApi';
import { setWalletCoins, setInventory } from '../../../../Redux/Features/profileStateSlice';
import { useDispatch } from 'react-redux';

import { GameScene }     from './GameScene';
import { HUD }           from './components/HUD';
import { Hotbar }        from './components/Hotbar';
import { DialogBox }     from './components/DialogBox';
import { ChatInput }     from './components/ChatInput';
import ChestRewardUI     from './components/ChestRewardUI';
import { HOTBAR_DEFS }   from './types';
import type { ToolType } from './types';
import { NPC_NAME }      from './constants';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import type { GameChest, ChestRewardItem } from '../../../../Types/Profile';

// ─────────────────────────────────────────────────────────────────────────────
const SystemIdleGame: React.FC = () => {
  const containerRef  = useRef<HTMLDivElement>(null);
  const gameRef       = useRef<Phaser.Game | null>(null);
  const sceneRef      = useRef<GameScene | null>(null);
  /** Ref keeps the chat-open flag accessible inside the keydown closure. */
  const chatOpenRef   = useRef(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [timeStr,      setTimeStr     ] = useState('06:00');
  const [isSaving,     setIsSaving    ] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState(0);
  const [dialog, setDialog] = useState<{ visible: boolean; text: string; npcName: string }>({
    visible: false, text: '', npcName: '',
  });

  // ── Chat / NPC interaction state ──────────────────────────────────────────
  const [chat, setChat] = useState<{ open: boolean; npcName: string }>({
    open: false, npcName: '',
  });

  const dispatch = useDispatch();
  const [saveIdleGame]      = useSaveIdleGameMutation();
  const [npcChat]           = useNpcChatMutation();
  const [fetchNpcMemories]  = useLazyGetNpcMemoriesQuery();
  const [fetchGameChests]   = useLazyGetGameChestsQuery();
  const [openChestMutation] = useOpenChestMutation();

  // ── Chest state ───────────────────────────────────────────────────────────
  /** All currently unopened chests — drives the top-left HUD icons. */
  const [availableChests, setAvailableChests] = useState<GameChest[]>([]);
  /** Ref so closures (SSE handler, onGameReady) can always see the latest value. */
  const availableChestsRef = useRef<GameChest[]>([]);
  availableChestsRef.current = availableChests;

  const [pendingChest, setPendingChest] = useState<{
    chestId: string;
    rewards: { coins: number; items: ChestRewardItem[] };
  } | null>(null);

  // ── Auth token — declared early so SSE URL can use it ───────────────────
  const accessToken = useSelector((s: RootState) => (s as any).user?.accessToken as string | null ?? null);
  const tokenRef    = useRef<string | null>(null);
  tokenRef.current  = accessToken;

  /** Helper: re-fetch chest list from backend and sync state + scene. */
  const refreshChests = useCallback(() => {
    fetchGameChests().then((res) => {
      const chests: GameChest[] = res.data?.chests ?? [];
      console.log('[IdleGame] refreshChests:', chests.length);
      setAvailableChests(chests);
      // Sync scene: add any chests not yet in the scene
      if (sceneRef.current) {
        chests.forEach(c => sceneRef.current!.addChest(c));
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchGameChests]);

  // ── Profile game SSE (receives chest spawn events) ───────────────────────
  // EventSource cannot send custom headers — pass the token as a query param.
  const sseUrl = accessToken
    ? `/api/profile/game/events?token=${encodeURIComponent(accessToken)}`
    : null;

  useSSEWithReconnect({
    url: sseUrl,
    onMessage: (event) => {
      try {
        const data = JSON.parse(event.data) as { type: string; chest?: GameChest };
        if (data.type === 'game_chest_spawned' && data.chest) {
          console.log('[IdleGame] SSE: chest spawned', data.chest.id);
          // Add to HUD list
          setAvailableChests(prev =>
            prev.some(c => c.id === data.chest!.id) ? prev : [...prev, data.chest!]
          );
          // Add to Phaser scene (visual only)
          sceneRef.current?.addChest(data.chest);
        }
      } catch {
        // malformed SSE data — ignore
      }
    },
  });

  // ── Profile data ──────────────────────────────────────────────────────────
  const profile       = useSelector((s: RootState) => s.profile);
  // Inventory — ref keeps it fresh inside Phaser callbacks (stale-closure safe)
  const inventory     = useSelector((s: RootState) => (s as any).profileState.inventory as import('../../../../Redux/Features/profileStateSlice').InventoryItem[]);
  const inventoryRef  = useRef(inventory);
  inventoryRef.current = inventory;
  const username      = (profile as any)?.profile?.user?.username ?? '';
  /** Saved idle-game state — captured in a ref so the boot effect can read it. */
  const savedIdleGame = useSelector((s: RootState) => s.profile.profile?.idleGame ?? null);
  const savedIdleGameRef = useRef(savedIdleGame);
  savedIdleGameRef.current = savedIdleGame;

  // ── Manual save ───────────────────────────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!sceneRef.current) return;
    setIsSaving(true);
    try { await saveIdleGame(sceneRef.current.getGameState()).unwrap(); }
    catch { /* best-effort */ }
    finally { setIsSaving(false); }
  }, [saveIdleGame]);

  // ── Hotbar slot change ────────────────────────────────────────────────────
  const handleSlotChange = useCallback((slot: number) => {
    setSelectedSlot(slot);
    const tool: ToolType = HOTBAR_DEFS[slot]?.tool ?? 'empty';
    sceneRef.current?.setPlayerTool(tool);
  }, []);

  // ── NPC chat ──────────────────────────────────────────────────────────────
  const handleCancelChat = useCallback(() => {
    chatOpenRef.current = false;
    setChat({ open: false, npcName: '' });
    sceneRef.current?.resumeInput();
  }, []);

  // ── HUD chest icon click → pan camera to next chest ─────────────────────
  const chestFocusIdxRef = useRef(0);
  const handleChestHudClick = useCallback(() => {
    const list = availableChestsRef.current;
    if (!list.length || !sceneRef.current) return;
    // Cycle through chests each click
    chestFocusIdxRef.current = chestFocusIdxRef.current % list.length;
    const target = list[chestFocusIdxRef.current];
    sceneRef.current.panToChest(target.id);
    chestFocusIdxRef.current++;
  }, []);

  // ── Chest reward confirm ──────────────────────────────────────────────────
  const handleChestConfirm = useCallback(async () => {
    if (!pendingChest) return;
    const { chestId } = pendingChest;
    setPendingChest(null);
    // Optimistically remove from HUD immediately
    setAvailableChests(prev => prev.filter(c => c.id !== chestId));
    try {
      const result = await openChestMutation({ chestId }).unwrap();
      dispatch(setWalletCoins(result.wallet.coins));
      dispatch(setInventory(result.inventory));
      sceneRef.current?.removeChest(chestId);
      // Re-fetch to keep HUD in sync with server truth
      refreshChests();
    } catch (err) {
      console.error('[IdleGame] openChest error:', err);
      sceneRef.current?.removeChest(chestId);
      refreshChests();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChest, openChestMutation, dispatch, refreshChests]);

  const handleSendMessage = useCallback(async (text: string) => {
    const { npcName } = chat;
    if (!sceneRef.current || !npcName) return;

    // 1. Close the input (player message sent)
    chatOpenRef.current = false;
    setChat({ open: false, npcName });
    sceneRef.current.resumeInput();

    // 2. Record the player's message in the NPC's local cache (for speech bubbles)
    sceneRef.current.addPlayerMessageToNpc(npcName, text);

    // 3. Show "thinking" indicator in the NPC's speech bubble
    sceneRef.current.setNpcThinking(npcName, true);

    try {
      const gameTick = sceneRef.current.getGameTick();

      console.log('[IdleGame] Sending NPC chat:', { npcName, playerMessage: text, gameTick });
      // Memory is now managed server-side — backend loads it from DB
      const result = await npcChat({ npcName, playerMessage: text, gameTick }).unwrap();
      console.log('[IdleGame] NPC chat response:', result);
      const reply  = result.reply ?? '……';

      // 4. NPC speaks the reply (also calls onNpcSpeak → shows React dialog)
      sceneRef.current.npcReply(npcName, reply);
    } catch (err) {
      console.error('[IdleGame] NPC chat error:', err);
      sceneRef.current.setNpcThinking(npcName, false);
      sceneRef.current.npcReply(npcName, '……（老李没有回应）');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, npcChat]);

  // ── Phaser boot ───────────────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    const scene = new GameScene();

    // ── Restore saved game state (position + time-of-day) ─────────────────
    // savedIdleGameRef.current is the latest value read from Redux at mount time.
    if (savedIdleGameRef.current) {
      scene.initialState = savedIdleGameRef.current;
    }

    // ── Phaser → React callbacks ───────────────────────────────────────────
    scene.callbacks = {
      onTickUpdate: (_tick, ts)     => setTimeStr(ts),
      onNpcSpeak:   (text, npcName) => {
        setDialog({ visible: true, text, npcName });
        setTimeout(() => setDialog(d => d.text === text ? { ...d, visible: false } : d), 5000);
      },
      onInteract: (npcName) => {
        chatOpenRef.current = true;
        setChat({ open: true, npcName });
        scene.pauseInput();
      },
      getAuthToken: () => tokenRef.current,
      // ── Called once GameScene.create() finishes — safe to access NPC ──
      onGameReady: () => {
        console.log('[IdleGame] onGameReady fired — fetching NPC memories for:', NPC_NAME);
        fetchNpcMemories(NPC_NAME)
          .then((res) => {
            console.log('[IdleGame] getNpcMemories response:', res);
            if (res.data?.memories) {
              console.log('[IdleGame] Loaded', res.data.memories.length, 'memories for', NPC_NAME);
              if (sceneRef.current) {
                sceneRef.current.loadNpcMemories(NPC_NAME, res.data.memories);
              }
            } else if (res.error) {
              console.warn('[IdleGame] Failed to load memories:', res.error);
            }
          })
          .catch((err) => {
            console.error('[IdleGame] fetchNpcMemories exception:', err);
          });

        // Load any existing unopened chests from backend
        fetchGameChests()
          .then((res) => {
            const chests: GameChest[] = res.data?.chests ?? [];
            console.log('[IdleGame] Loaded', chests.length, 'chests');
            setAvailableChests(chests);
            if (sceneRef.current && chests.length > 0) {
              sceneRef.current.loadChests(chests);
            }
          })
          .catch((err) => {
            console.error('[IdleGame] fetchGameChests exception:', err);
          });
      },

      // ── Called when player opens a chest (F key + animation complete) ──
      onChestInteract: (chestId, rewards) => {
        setPendingChest({ chestId, rewards });
      },

      // ── Called when player harvests a world item (fruit from tree, etc.) ──
      onItemPickup: (itemKey, quantity) => {
        const ITEM_NAMES: Record<string, string> = { fruit: '苹果' };
        const name = ITEM_NAMES[itemKey] ?? itemKey;
        const cur  = inventoryRef.current;
        const existing = cur.find(i => i.inventoryKey === itemKey);
        type Inv = typeof cur[number];
        const newInv = existing
          ? cur.map((i: Inv) => i.inventoryKey === itemKey
              ? { ...i, quantity: i.quantity + quantity }
              : i)
          : [...cur, { inventoryKey: itemKey, name, type: 'item' as const, quantity }];
        dispatch(setInventory(newInv));
      },
    };
    sceneRef.current = scene;

    const config: Phaser.Types.Core.GameConfig = {
      type:            Phaser.AUTO,
      width:           container.clientWidth  || 800,
      height:          container.clientHeight || 600,
      parent:          container,
      backgroundColor: '#12340e',
      pixelArt:        true,
      physics: {
        default: 'arcade',
        arcade:  { gravity: { x: 0, y: 0 }, debug: false },
      },
      scene,
    };

    console.log('[IdleGame] Booting Phaser game. savedIdleGame:', savedIdleGameRef.current);
    gameRef.current = new Phaser.Game(config);

    // ── Keyboard: Space → tool action, E → NPC chat ────────────────────────
    // document + capture phase guarantees events fire even when Phaser or
    // DevTools has focus.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== 'Space' && e.code !== 'KeyE') return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      e.preventDefault();
      if (chatOpenRef.current) return;

      if (e.code === 'KeyE') {
        sceneRef.current?.triggerInteract();
      } else {
        sceneRef.current?.triggerAction();
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    // ── Auto-save every 30 s ───────────────────────────────────────────────
    const saveTimer = setInterval(() => {
      if (sceneRef.current) {
        saveIdleGame(sceneRef.current.getGameState()).catch(() => {});
      }
    }, 30_000);

    // ── Resize observer ────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight;
      if (w > 0 && h > 0) gameRef.current?.scale.resize(w, h);
    });
    ro.observe(container);

    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      clearInterval(saveTimer);
      ro.disconnect();
      gameRef.current?.destroy(true);
      gameRef.current = sceneRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#0d1f08' }}>
      {/* Phaser canvas — zIndex: 0 establishes a stacking context so all
          sibling absolute-positioned UI sits above the canvas */}
      <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', zIndex: 0 }} />

      {/* React HUD layer */}
      <HUD
        timeStr={timeStr}
        isSaving={isSaving}
        username={username}
        onSave={handleSave}
      />

      {/* ── Chest HUD indicator (top-left) ────────────────────────────────
           Click → camera pans to the chest + flash highlight.
           Multiple chests → click cycles through them.              */}
      {availableChests.length > 0 && (
        <button
          onClick={handleChestHudClick}
          title={`有 ${availableChests.length} 个箱子在地图上\n点击定位`}
          style={{
            position:      'absolute',
            top:           48,
            left:          10,
            zIndex:        200,
            display:       'flex',
            alignItems:    'center',
            gap:           4,
            background:    '#1a1208',
            border:        '2px solid #c8a850',
            borderRadius:  8,
            padding:       '5px 9px',
            boxShadow:     '0 0 10px #c8a85066',
            animation:     'chestPulse 1.8s ease-in-out infinite',
            cursor:        'pointer',
            userSelect:    'none',
          }}
        >
          <span style={{ fontSize: 18, lineHeight: 1 }}>🎁</span>
          {availableChests.length > 1 && (
            <span style={{
              fontSize:    11,
              fontFamily:  '"Courier New", monospace',
              color:       '#ffe57a',
              fontWeight:  'bold',
              letterSpacing: 0.5,
            }}>
              ×{availableChests.length}
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

      {/* NPC dialog */}
      <DialogBox
        visible={dialog.visible}
        npcName={dialog.npcName}
        text={dialog.text}
      />

      {/* Talk button — bypasses keyboard focus issues entirely */}
      {!chat.open && (
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
          💬 [E] 和老李对话
        </button>
      )}

      {/* Hotbar */}
      <Hotbar selected={selectedSlot} onChange={handleSlotChange} />

      {/* NPC chat input — shown when player interacts with an NPC */}
      {chat.open && (
        <ChatInput
          npcName={chat.npcName}
          onSend={handleSendMessage}
          onCancel={handleCancelChat}
        />
      )}

      {/* Chest reward modal */}
      {pendingChest && (
        <ChestRewardUI
          rewards={pendingChest.rewards}
          onConfirm={handleChestConfirm}
        />
      )}
    </div>
  );
};

export default SystemIdleGame;
