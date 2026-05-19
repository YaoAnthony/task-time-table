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
  useLazyGetGameSaveQuery,
  useSaveGameSaveMutation,
} from '../../../../../api/profileStateRtkApi';
import { initSlotsFromInventory } from '../../../../../Redux/Features/gameSlice';
import type { GameInventoryItem, GameSettingsState, SlotItem } from '../../../../../Redux/Features/gameSlice';
import { gameBus }            from '../shared/EventBus';
import { GameScene }          from '../GameScene';
import type { GameChest }     from '../../../../../Types/Profile';
import type { IdleGameState } from '../../../../../Types/Profile';
import type { GameSaveV1 } from '../persistence/save/GameSaveTypes';
import { normalizeGameSave } from '../persistence/save/GameSaveMapper';

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
  savedGameSaveRef: RefObject<GameSaveV1 | null>;
  /** Current settings saved inside idleGame.worldState. */
  gameSettingsRef:  RefObject<GameSettingsState>;
  gameInventoryRef: RefObject<GameInventoryItem[]>;
  backpackSlotsRef: RefObject<(SlotItem | null)[]>;
  /** auth token ref */
  tokenRef:         RefObject<string | null>;
  /** NPC 背包 ref */
  npcInventoriesRef:RefObject<Record<string, Record<string, number>>>;
  /** 联机 roomId ref */
  multiplayRoomIdRef: RefObject<string | null>;
  userId: string | null;
  username: string;
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
  savedGameSaveRef,
  gameSettingsRef,
  gameInventoryRef,
  backpackSlotsRef,
  tokenRef,
  npcInventoriesRef,
  multiplayRoomIdRef,
  userId,
  username,
  setTimeStr,
  setAvailableChests,
  onDropItem,
}: UsePhaserBootProps) {
  const dispatch = useDispatch();

  const [fetchGameSave] = useLazyGetGameSaveQuery();
  const [saveGameSave]  = useSaveGameSaveMutation();

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    const scene = new GameScene();
    if (savedGameSaveRef.current) {
      scene.setInitialGameSave(savedGameSaveRef.current, userId ?? 'player');
    } else if (savedIdleGameRef.current) {
      scene.initialState = savedIdleGameRef.current;
    }

    // ── gameBus 订阅 ──────────────────────────────────────────────────────
    const saveCurrentGame = () => {
      const s = sceneRef.current;
      if (!s) return;
      const roomId = multiplayRoomIdRef.current ?? undefined;
      const gameSave = s.getGameSaveData({
        previousSave: savedGameSaveRef.current,
        roomId,
        userId,
        username,
        settings: gameSettingsRef.current,
        inventory: {
          gameInventory: gameInventoryRef.current,
          hotbarSlots: hotbarSlotsRef.current as (SlotItem | null)[],
          backpackSlots: backpackSlotsRef.current,
        },
        npcInventories: npcInventoriesRef.current,
      });
      saveGameSave({ gameSave, roomId }).catch(() => {});
    };

    const unsubs = [
      // 时间 HUD — 显示完整日期+时间 ("2026-01-01 06:00")
      gameBus.on('tick:update', ({ dateTimeStr }) => setTimeStr(dateTimeStr)),
      gameBus.on('game:save_requested', () => saveCurrentGame()),

      // 场景就绪 → 连接 NPC 提供者 + 加载持久数据
      gameBus.on('game:ready', () => {
        console.log('[IdleGame] game:ready — 初始化 NPC 提供者并加载数据');
        scene.setNpcAuthProvider(() => tokenRef.current);
        scene.setNpcInventoryProvider(
          (name) => npcInventoriesRef.current[name] ?? {},
        );

        fetchGameSave(multiplayRoomIdRef.current ?? undefined)
          .then((result) => {
            const save = result.data?.gameSave
              ? normalizeGameSave(result.data.gameSave, { userId: userId ?? 'player' })
              : null;
            if (!save) return;
            scene.setRuntimeStorylines(result.data?.storylines ?? []);
            scene.loadGameSaveData(save, userId ?? 'player');
            scene.evaluateRuntimeStorylinesNow?.();

            const playerSave = save.players[userId ?? 'player'] ?? Object.values(save.players)[0];
            const inventory = playerSave?.inventory?.gameInventory ?? [];
            dispatch(initSlotsFromInventory(inventory));
            const owned = inventory.map((i: { itemId: string }) => i.itemId);
            scene.removeWorldItemsByIds(owned);

            const savedChests = save.worldStatus?.entities?.chests;
            const chests: GameChest[] = (Array.isArray(savedChests) ? savedChests : []).filter((chest) => !chest.opened);
            setAvailableChests(chests);
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
      audio: {
        disableWebAudio: true,
      },
      physics: {
        default: 'arcade',
        arcade:  { gravity: { x: 0, y: 0 }, debug: false },
      },
      scene,
    };
    console.log('[IdleGame] 启动 Phaser。savedIdleGame:', savedIdleGameRef.current);
    gameRef.current = new Phaser.Game(config);

    // ── 键盘快捷键 ──────────────────────────────────────────────────────────
    // openChat 委托给 GameScene.triggerInteract — 它会查找最近 NPC，
    // 如果范围内没人，就会发出 'ui:show_message' 而不是空打开 chat。
    // setChat / chatOpenRef / pauseInput 均由 useNpcChat 侧完成。
    const openChat = (initialValue: string) => {
      sceneRef.current?.triggerInteract(initialValue);
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
    const saveTimer = setInterval(saveCurrentGame, 30_000);

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
