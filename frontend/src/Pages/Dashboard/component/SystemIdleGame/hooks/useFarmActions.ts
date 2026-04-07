/**
 * useFarmActions — 农田操作、物品拾取、消耗等 gameBus 事件订阅。
 *
 * 无状态 hook（只副作用），包含：
 *   farm:action           → 调用 till / water / plant / harvest 后端 API
 *   player:item_pickup    → Redux 更新 + 后端持久化
 *   player:consume_item   → Redux 扣减
 *   npc:pickup_world_item → NPC 背包 Redux 更新
 *   npc:drop_item         → NPC 背包扣减 + 生成掉落物
 *   ui:show_message       → antd 全局提示
 */

import { useEffect }           from 'react';
import { useDispatch }         from 'react-redux';
import type { RefObject }      from 'react';
import {
  useTillFarmTileMutation,
  useWaterFarmTileMutation,
  usePlantCropMutation,
  useHarvestCropMutation,
  usePickupGameItemMutation,
} from '../../../../../api/profileStateRtkApi';
import {
  addItemToBackpack,
  addItemToNpcInventory,
  removeItemFromNpcInventory,
} from '../../../../../Redux/Features/gameSlice';
import type { FarmTile } from '../../../../../Redux/Features/gameSlice';
import { gameBus }             from '../shared/EventBus';
import type { GameScene }      from '../GameScene';
import { applyServerFarmTileUpdate } from './useIdleGameSyncBoundary';

const ITEM_NAME_MAP: Record<string, string> = {
  wheat_seed: '小麦种子', tomato_seed: '番茄种子',
  wheat:      '小麦',     tomato:      '番茄',
  fruit:      '果子',     egg:         '鸡蛋',
  log:        '木头',     stone:       '石头',
};

export function useFarmActions(
  sceneRef:          RefObject<GameScene | null>,
  multiplayRoomIdRef: RefObject<string | null>,
) {
  const dispatch = useDispatch();
  const [tillFarmTile]   = useTillFarmTileMutation();
  const [waterFarmTile]  = useWaterFarmTileMutation();
  const [plantCrop]      = usePlantCropMutation();
  const [harvestCrop]    = useHarvestCropMutation();
  const [pickupGameItem] = usePickupGameItemMutation();

  useEffect(() => {
    const unsubs = [

      // ── 农田操作 ────────────────────────────────────────────────────────
      gameBus.on('farm:action', async ({ action, tx, ty, itemId }) => {
        const gameTick = sceneRef.current?.getDayCycleTick?.() ?? 0;
        const roomId   = multiplayRoomIdRef.current ?? undefined;
        try {
          switch (action) {
            case 'till': {
              const res = await tillFarmTile({ tx, ty, roomId }).unwrap();
              if (res.farmTile) {
                applyServerFarmTileUpdate(sceneRef.current, dispatch, res.farmTile as FarmTile & { tx: number; ty: number; state: string });
              }
              if (res.droppedSeed) {
                const pos     = sceneRef.current?.getPlayerWorldPos();
                const offsetX = (Math.random() - 0.5) * 30;
                const offsetY = (Math.random() - 0.5) * 20 + 20;
                sceneRef.current?.spawnWorldItem(
                  (pos?.x ?? 0) + offsetX,
                  (pos?.y ?? 0) + offsetY,
                  res.droppedSeed.itemId,
                );
              }
              break;
            }
            case 'water':
              {
                const res = await waterFarmTile({ tx, ty, gameTick, roomId }).unwrap();
                if (res.farmTile) {
                  applyServerFarmTileUpdate(sceneRef.current, dispatch, res.farmTile as FarmTile & { tx: number; ty: number; state: string });
                }
              }
              break;

            case 'plant':
              if (itemId) {
                dispatch(addItemToBackpack({ itemId, quantity: -1 }));
                const plantRes = await plantCrop({ tx, ty, itemId, gameTick, roomId }).unwrap();
                if (plantRes.farmTiles) {
                  const tile = (plantRes.farmTiles as any[]).find((t: any) => t.tx === tx && t.ty === ty);
                  if (tile) {
                    applyServerFarmTileUpdate(sceneRef.current, dispatch, tile as FarmTile & { tx: number; ty: number; state: string });
                  }
                }
              }
              break;

            case 'harvest': {
              const tick      = sceneRef.current?.getGameTick?.() ?? 0;
              const harvestRes = await harvestCrop({ tx, ty, gameTick: tick, roomId }).unwrap();
              const updatedTile = (harvestRes.farmTiles as any[] | undefined)?.find((tile: any) => tile.tx === tx && tile.ty === ty);
              if (updatedTile) {
                applyServerFarmTileUpdate(sceneRef.current, dispatch, updatedTile as FarmTile & { tx: number; ty: number; state: string });
              }
              if (harvestRes.dropItems?.length) {
                const T = 32;
                const wx = tx * T + T / 2, wy = ty * T + T / 2;
                harvestRes.dropItems.forEach((drop: any, i: number) => {
                  const angle = (i / harvestRes.dropItems.length) * Math.PI * 2;
                  sceneRef.current?.spawnWorldItem(
                    wx + Math.cos(angle) * (20 + i * 10),
                    wy + Math.sin(angle) * (20 + i * 10),
                    drop.itemId,
                  );
                });
              }
              break;
            }
          }
        } catch (err) {
          console.error('[Farm] action error:', err);
          if (action === 'plant' && itemId) {
            dispatch(addItemToBackpack({ itemId, quantity: 1 }));
          }
        }
      }),

      // ── 玩家拾取物品 → Redux + 后端持久化 ────────────────────────────────
      gameBus.on('player:item_pickup', async ({ itemKey, quantity }) => {
        dispatch(addItemToBackpack({ itemId: itemKey, quantity }));
        import('antd').then(({ message: msg }) =>
          msg.success(`获得 ${ITEM_NAME_MAP[itemKey] ?? itemKey} ×${quantity}`, 1.5),
        );
        try {
          await pickupGameItem({ itemId: itemKey, quantity }).unwrap();
        } catch {
          dispatch(addItemToBackpack({ itemId: itemKey, quantity: -quantity }));
        }
      }),

      // ── 玩家消耗物品（放置 / Q 扔）→ Redux 扣减 ──────────────────────────
      gameBus.on('player:consume_item', ({ itemId, qty }) => {
        dispatch(addItemToBackpack({ itemId, quantity: -qty }));
      }),

      // ── NPC 拾取物品 → NPC 背包 Redux 更新 ──────────────────────────────
      gameBus.on('npc:pickup_world_item', ({ npcName, itemId, qty }) => {
        dispatch(addItemToNpcInventory({ npcName, itemId, qty }));
      }),

      // ── NPC 丢弃物品 → 扣背包 + 生成掉落物 ─────────────────────────────
      gameBus.on('npc:drop_item', ({ npcName, itemId, qty, x, y }) => {
        dispatch(removeItemFromNpcInventory({ npcName, itemId, qty }));
        if (x != null && y != null) {
          sceneRef.current?.spawnWorldItem(x, y, itemId);
        }
      }),

      // ── UI 全局提示 ───────────────────────────────────────────────────────
      gameBus.on('ui:show_message', ({ text }) => {
        import('antd').then(({ message: msg }) => msg.info(text, 2));
      }),
    ];
    return () => unsubs.forEach(u => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
