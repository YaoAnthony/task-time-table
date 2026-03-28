/**
 * usePhaserBoot — Phaser 游戏实例的创建与销毁。
 *
 * 职责：
 *   · 创建 Phaser.Game，注入已保存的 IdleGame 状态
 *   · 订阅 gameBus tick:update（时间 HUD）和 game:ready（初始化数据加载）
 *   · 键盘快捷键（Space / Enter / Q / /）
 *   · 每 30 s 自动存档 + tickFarm + saveCreatures
 *   · ResizeObserver 让 canvas 跟随容器尺寸
 */

import { useEffect }          from 'react';
import Phaser                 from 'phaser';
import { useDispatch }        from 'react-redux';
import type { RefObject }     from 'react';
import {
  useSaveIdleGameMutation,
  useTickFarmMutation,
  useSaveCreaturesMutation,
  useLazyGetNpcMemoriesQuery,
  useLazyGetGameChestsQuery,
  useLazyGetGameInventoryQuery,
  useLazyGetFarmTilesQuery,
  useLazyGetCreaturesQuery,
} from '../../../../../api/profileStateRtkApi';
import { initSlotsFromInventory } from '../../../../../Redux/Features/gameSlice';
import { gameBus }            from '../shared/EventBus';
import { GameScene }          from '../GameScene';
import { NPC_NAME }           from '../constants';
import type { GameChest }     from '../../../../../Types/Profile';
import type { IdleGameState } from '../../../../../Types/Profile';

interface UsePhaserBootProps {
  /** Phaser canvas 容器 */
  containerRef:     RefObject<HTMLDivElement | null>;
  /** 共享场景 ref（由外层组件创建，boot 后填充） */
  sceneRef:         RefObject<GameScene | null>;
  /** 共享游戏实例 ref */
  gameRef:          RefObject<Phaser.Game | null>;
  /** chat 输入框是否打开（键盘逻辑需要读取） */
  chatOpenRef:      RefObject<boolean>;
  /** hotbar 当前槽位 ref（Q 键 drop 需要读取） */
  hotbarSlotsRef:   RefObject<({ itemId?: string } | null)[]>;
  selectedSlotRef:  RefObject<number>;
  /** 上次保存的 IdleGame 状态 */
  savedIdleGameRef: RefObject<IdleGameState | null>;
  /** auth token ref */
  tokenRef:         RefObject<string | null>;
  /** NPC 背包 ref */
  npcInventoriesRef:RefObject<Record<string, Record<string, number>>>;
  /** 联机 roomId ref */
  multiplayRoomIdRef: RefObject<string | null>;
  /** 更新时间字符串（tick:update 事件） */
  setTimeStr:       (ts: string) => void;
  /** 宝箱列表从 game:ready 加载后回调 */
  setAvailableChests: (chests: GameChest[]) => void;
  /** Q 键 drop 物品 */
  onDropItem:       (slot: number, itemId: string) => void;
}

export function usePhaserBoot({
  containerRef,
  sceneRef,
  gameRef,
  chatOpenRef,
  hotbarSlotsRef,
  selectedSlotRef,
  savedIdleGameRef,
  tokenRef,
  npcInventoriesRef,
  multiplayRoomIdRef,
  setTimeStr,
  setAvailableChests,
  onDropItem,
}: UsePhaserBootProps) {
  const dispatch = useDispatch();

  const [saveIdleGame]     = useSaveIdleGameMutation();
  const [tickFarm]         = useTickFarmMutation();
  const [saveCreatures]    = useSaveCreaturesMutation();
  const [fetchNpcMemories] = useLazyGetNpcMemoriesQuery();
  const [fetchGameChests]  = useLazyGetGameChestsQuery();
  const [getGameInventory] = useLazyGetGameInventoryQuery();
  const [getFarmTiles]     = useLazyGetFarmTilesQuery();
  const [getCreatures]     = useLazyGetCreaturesQuery();

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    const scene = new GameScene();
    if (savedIdleGameRef.current) scene.initialState = savedIdleGameRef.current;

    // ── gameBus 订阅 ──────────────────────────────────────────────────────
    const unsubs = [
      // 时间 HUD
      gameBus.on('tick:update', ({ timeStr: ts }) => setTimeStr(ts)),

      // 场景就绪 → 连接 NPC 提供者 + 加载持久数据
      gameBus.on('game:ready', () => {
        console.log('[IdleGame] game:ready — 初始化 NPC 提供者并加载数据');
        scene.setNpcAuthProvider(() => tokenRef.current);
        scene.setNpcInventoryProvider(
          (name) => npcInventoriesRef.current[name] ?? {},
        );

        fetchNpcMemories(NPC_NAME)
          .then((res) => {
            if (res.data?.memories) {
              scene.loadNpcMemories(NPC_NAME, res.data.memories);
            }
          }).catch(() => {});

        fetchGameChests()
          .then((res) => {
            const chests: GameChest[] = res.data?.chests ?? [];
            setAvailableChests(chests);
            if (chests.length > 0) scene.loadChests(chests);
          }).catch(() => {});

        getGameInventory()
          .then((result) => {
            if (result.data?.gameInventory) {
              dispatch(initSlotsFromInventory(result.data.gameInventory));
              const owned = result.data.gameInventory.map((i: { itemId: string }) => i.itemId);
              scene.removeWorldItemsByIds(owned);
            }
          }).catch(() => {});

        getFarmTiles(multiplayRoomIdRef.current ?? undefined)
          .then((result) => {
            if (result.data?.farmTiles) scene.farmSystem?.loadFromBackend?.(result.data.farmTiles);
          }).catch(() => {});

        getCreatures(multiplayRoomIdRef.current ?? undefined)
          .then((result) => {
            if (result.data?.creatures?.length) scene.restoreCreatures(result.data.creatures);
          }).catch(() => {});
      }),
    ];

    sceneRef.current = scene;

    // ── Phaser 初始化 ───────────────────────────────────────────────────────
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
    console.log('[IdleGame] 启动 Phaser。savedIdleGame:', savedIdleGameRef.current);
    gameRef.current = new Phaser.Game(config);

    // ── 键盘快捷键 ──────────────────────────────────────────────────────────
    // openChat 发出 npc:interact 事件，useNpcChat 的订阅者会处理
    // setChat / chatOpenRef / pauseInput 均由 useNpcChat 侧完成。
    const openChat = (initialValue: string) => {
      gameBus.emit('npc:interact', { npcName: NPC_NAME, initialValue });
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!chatOpenRef.current) sceneRef.current?.triggerAction();
        return;
      }
      if (chatOpenRef.current) return;

      if (e.code === 'Enter') {
        e.preventDefault();
        openChat('');
        return;
      }
      if (e.code === 'KeyQ') {
        e.preventDefault();
        const slot   = selectedSlotRef.current;
        const itemId = hotbarSlotsRef.current[slot]?.itemId;
        if (itemId) onDropItem(slot, itemId);
        return;
      }
      if (e.key === '/') {
        e.preventDefault();
        openChat('/');
      }
    };
    document.addEventListener('keydown', onKeyDown, true);

    // ── 自动存档（每 30 s）─────────────────────────────────────────────────
    const saveTimer = setInterval(() => {
      const s = sceneRef.current;
      if (!s) return;
      const gameState   = s.getGameState();
      saveIdleGame(gameState).catch(() => {});

      const currentTick = gameState.gameTick ?? s.getGameTick?.() ?? 0;
      const roomId      = multiplayRoomIdRef.current ?? undefined;
      tickFarm({ gameTick: currentTick, roomId }).catch(() => {});

      const creatureStates = s.getCreatureStates?.();
      if (creatureStates?.length) {
        saveCreatures({ creatures: creatureStates, roomId }).catch(() => {});
      }
    }, 30_000);

    // ── ResizeObserver ───────────────────────────────────────────────────────
    const ro = new ResizeObserver(() => {
      const w = container.clientWidth, h = container.clientHeight;
      if (w > 0 && h > 0) gameRef.current?.scale.resize(w, h);
    });
    ro.observe(container);

    // ── 清理 ─────────────────────────────────────────────────────────────────
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      clearInterval(saveTimer);
      ro.disconnect();
      unsubs.forEach(u => u());
      gameRef.current?.destroy(true);
      (gameRef as any).current  = null;
      (sceneRef as any).current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
