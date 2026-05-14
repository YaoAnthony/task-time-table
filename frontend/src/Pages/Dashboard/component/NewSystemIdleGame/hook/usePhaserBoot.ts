import { useEffect } from 'react';
import type { RefObject } from 'react';
import Phaser from 'phaser';
import { useDispatch } from 'react-redux';
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
import type { GameSettingsState } from '../../../../../Redux/Features/gameSlice';
import type { CreatureState } from '../../../../../Redux/Features/gameSlice';
import type { GameChest, IdleGameState } from '../../../../../Types/Profile';
import { gameBus } from '../Utils/EventBus';
import GameScene from '../GameScene';
import { useGameKeyboard } from './useGameKeyboard';

type HotbarSlot = { itemId?: string } | null;

interface GameInventoryItem {
  itemId: string;
}

interface RuntimeSceneApi {
    setNpcAuthProvider?: (provider: () => string | null) => void;
    setNpcInventoryProvider?: (provider: (name: string) => Record<string, number>) => void;
    loadNpcMemories?: (npcName: string, memories: unknown[]) => void;
    loadChests?: (chests: GameChest[]) => void;
    removeWorldItemsByIds?: (itemIds: string[]) => void;
    restoreCreatures?: (creatures: CreatureState[]) => void;
    getGameState?: () => IdleGameState;
    getGameTick?: () => number;
    getCreatureStates?: () => CreatureState[];
    triggerAction?: () => void;
    triggerInteract?: (initialValue?: string) => void;
    farmSystem?: {
        loadFromBackend?: (farmTiles: unknown) => void;
    };
}

interface UsePhaserBootProps {
  /** Phaser canvas 的 DOM 容器；输入值来自 React 的 useRef<HTMLDivElement>(null)。 */
  containerRef: RefObject<HTMLDivElement | null>;
  /** 当前 GameScene 实例引用；输入值来自 React 的 useRef<GameScene | null>(null)，hook 创建 scene 后会写入。 */
  sceneRef: RefObject<GameScene | null>;
  /** 当前 Phaser.Game 实例引用；输入值来自 React 的 useRef<Phaser.Game | null>(null)，用于避免重复启动和卸载销毁。 */
  gameRef: RefObject<Phaser.Game | null>;
  /** 聊天框是否打开；输入值来自 React 的 useRef<boolean>，键盘事件用它决定是否拦截游戏操作。 */
  chatOpenRef: RefObject<boolean>;
  /** 快捷栏物品列表引用；输入值是当前 hotbar slots，Q 键丢物品时读取。 */
  hotbarSlotsRef: RefObject<HotbarSlot[]>;
  /** 当前选中的快捷栏格子；输入值是 slot index，Q 键用它找到要丢的物品。 */
  selectedSlotRef: RefObject<number>;
  /** 后端读取到的 idle game 存档；输入值是 IdleGameState 或 null，Phaser 启动前注入 GameScene。 */
  savedIdleGameRef: RefObject<IdleGameState | null>;
  /** 当前游戏设置；输入值来自 Redux settings，自动存档时写入 worldState.settings。 */
  gameSettingsRef: RefObject<GameSettingsState>;
  /** 登录 token；输入值来自 auth hook，game:ready 后提供给 NPC/后端请求相关逻辑。 */
  tokenRef: RefObject<string | null>;
  /** NPC 背包快照；输入值是 npcName -> itemId -> quantity，game:ready 后提供给 GameScene。 */
  npcInventoriesRef: RefObject<Record<string, Record<string, number>>>;
  /** 多人房间 ID；输入值是 roomId 或 null，加载/保存农田和生物时用于区分房间。 */
  multiplayRoomIdRef: RefObject<string | null>;
  /** 设置 React HUD 时间文本；输入值是 setState 函数，收到 tick:update 后传入 dateTimeStr。 */
  setTimeStr: (value: string) => void;
  /** 设置 React 可用箱子列表；输入值是 setState 函数，game:ready 拉取箱子后调用。 */
  setAvailableChests: (chests: GameChest[]) => void;
  /** Q 键丢物品回调；输入值是业务函数，hook 会传入 slot index 和 itemId。 */
  onDropItem: (slot: number, itemId: string) => void;
  /** 主 NPC 名字；输入值可选，默认“老李”，用于 game:ready 后加载该 NPC 的记忆。 */
  primaryNpcName?: string;
}

function withWorldSettings(
  state: IdleGameState,
  settings: GameSettingsState,
): IdleGameState {
  return {
    ...state,
    worldState: {
      schemaVersion: 1,
      beds: [],
      nests: [],
      ...(state.worldState ?? {}),
      settings,
    },
  };
}

export function usePhaserBoot({
    containerRef,
    sceneRef,
    gameRef,
    chatOpenRef,
    hotbarSlotsRef,
    selectedSlotRef,
    savedIdleGameRef,
    gameSettingsRef,
    tokenRef,
    npcInventoriesRef,
    multiplayRoomIdRef,
    setTimeStr,
    setAvailableChests,
    onDropItem,
    primaryNpcName = '老李',
}: UsePhaserBootProps): void {
    const dispatch = useDispatch();
    const [saveIdleGame] = useSaveIdleGameMutation();
    const [tickFarm] = useTickFarmMutation();
    const [saveCreatures] = useSaveCreaturesMutation();
    const [fetchNpcMemories] = useLazyGetNpcMemoriesQuery();
    const [fetchGameChests] = useLazyGetGameChestsQuery();
    const [getGameInventory] = useLazyGetGameInventoryQuery();
    const [getFarmTiles] = useLazyGetFarmTilesQuery();
    const [getCreatures] = useLazyGetCreaturesQuery();

    useGameKeyboard({
        sceneRef,
        chatOpenRef,
        hotbarSlotsRef,
        selectedSlotRef,
        onDropItem,
    });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || gameRef.current) return;

    const scene = new GameScene();
    scene.setInitialSave(savedIdleGameRef.current);
    sceneRef.current = scene;
    const runtimeScene = scene as GameScene & RuntimeSceneApi;

    const unsubs = [
        gameBus.on('tick:update', ({ dateTimeStr }) => setTimeStr(dateTimeStr)),
        gameBus.on('game:ready', () => {
            runtimeScene.setNpcAuthProvider?.(() => tokenRef.current);
            runtimeScene.setNpcInventoryProvider?.(
            (name) => npcInventoriesRef.current[name] ?? {},
            );

            fetchNpcMemories(primaryNpcName)
            .then((res) => {
                if (res.data?.memories) {
                runtimeScene.loadNpcMemories?.(primaryNpcName, res.data.memories);
                }
            })
            .catch(() => {});

            fetchGameChests()
            .then((res) => {
                const chests: GameChest[] = res.data?.chests ?? [];
                setAvailableChests(chests);
                if (chests.length > 0) runtimeScene.loadChests?.(chests);
            })
            .catch(() => {});

            getGameInventory()
            .then((result) => {
                if (!result.data?.gameInventory) return;
                dispatch(initSlotsFromInventory(result.data.gameInventory));
                const owned = result.data.gameInventory.map(
                (item: GameInventoryItem) => item.itemId,
                );
                runtimeScene.removeWorldItemsByIds?.(owned);
            })
            .catch(() => {});

            const roomId = multiplayRoomIdRef.current ?? undefined;
            getFarmTiles(roomId)
            .then((result) => {
                if (result.data?.farmTiles) {
                runtimeScene.farmSystem?.loadFromBackend?.(result.data.farmTiles);
                }
            })
            .catch(() => {});

            getCreatures(roomId)
            .then((result) => {
                if (result.data?.creatures?.length) {
                runtimeScene.restoreCreatures?.(result.data.creatures);
                }
            })
            .catch(() => {});
        }),
    ];

    const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: container.clientWidth || 800,
        height: container.clientHeight || 600,
        parent: container,
        backgroundColor: '#12340e',
        pixelArt: true,
        physics: {
            default: 'arcade',
            arcade: { gravity: { x: 0, y: 0 }, debug: false },
        },
        scene,
    };

    gameRef.current = new Phaser.Game(config);

    const saveTimer = window.setInterval(() => {
      const activeScene = sceneRef.current as (GameScene & RuntimeSceneApi) | null;
      const rawGameState = activeScene?.getGameState?.();
      if (!activeScene || !rawGameState) return;

      const gameState = withWorldSettings(rawGameState, gameSettingsRef.current);
      saveIdleGame(gameState).catch(() => {});

      const currentTick = gameState.gameTick ?? activeScene.getGameTick?.() ?? 0;
      const roomId = multiplayRoomIdRef.current ?? undefined;
      tickFarm({ gameTick: currentTick, roomId }).catch(() => {});

      const creatureStates = activeScene.getCreatureStates?.();
      if (creatureStates?.length) {
        saveCreatures({ creatures: creatureStates, roomId }).catch(() => {});
      }
    }, 30_000);

    const resizeObserver = new ResizeObserver(() => {
      const width = container.clientWidth;
      const height = container.clientHeight;
      if (width > 0 && height > 0) {
        gameRef.current?.scale.resize(width, height);
      }
    });
    resizeObserver.observe(container);

    return () => {
      window.clearInterval(saveTimer);
      resizeObserver.disconnect();
      unsubs.forEach((unsubscribe) => unsubscribe());
      gameRef.current?.destroy(true);
      gameRef.current = null;
      sceneRef.current = null;
    };
  }, []);
}
