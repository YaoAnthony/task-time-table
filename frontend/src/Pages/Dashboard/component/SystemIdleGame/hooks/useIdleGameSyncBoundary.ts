import { useCallback, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { FarmTile } from '../../../../../Redux/Features/gameSlice';
import { upsertFarmTile } from '../../../../../Redux/Features/gameSlice';
import { gameBus } from '../shared/EventBus';
import type { GameScene } from '../GameScene';
import type { WorldAction, WorldActionResult } from '../systems/WorldActionSystem';
import type { NpcAction } from '../types';
import type { GameChest } from '../../../../../Types/Profile';
import { getWorldActionSyncPolicy, type ServerPushType, type WorldSyncSource } from '../sync/syncPolicy';

type ServerPushEvent =
  | { type: 'game_chest_spawned'; chest: GameChest }
  | { type: 'farm_tile_updated'; tile: FarmTile & { tx: number; ty: number; state: string } }
  | { type: 'npc_command'; npcName: string; actions: NpcAction[]; announcement?: string };

interface UseIdleGameSyncBoundaryProps {
  sceneRef: RefObject<GameScene | null>;
  multiplayActiveRef: RefObject<boolean>;
  setAvailableChests: Dispatch<SetStateAction<GameChest[]>>;
  setNpcDialog: Dispatch<SetStateAction<{ visible: boolean; text: string; npcName: string }>>;
}

export function applyServerChestSpawn(
  scene: GameScene | null,
  setAvailableChests: Dispatch<SetStateAction<GameChest[]>>,
  chest: GameChest,
): void {
  setAvailableChests((prev) => (
    prev.some((entry) => entry.id === chest.id) ? prev : [...prev, chest]
  ));
  scene?.addChest(chest);
}

export function applyServerFarmTileUpdate(
  scene: GameScene | null,
  dispatch: Dispatch<any>,
  tile: FarmTile & { tx: number; ty: number; state: string },
): void {
  dispatch(upsertFarmTile(tile as FarmTile));
  const cropData = tile.cropId ? {
    cropId: tile.cropId,
    plantRow: (tile as any).plantRow ?? 0,
    numStages: (tile as any).numStages ?? 4,
    plantedAt: (tile as any).plantedAt,
    readyAt: (tile as any).readyAt,
  } : null;
  scene?.farmSystem?.updateTileState?.(tile.tx, tile.ty, tile.state, cropData);
}

function parseServerPush(raw: string): ServerPushEvent | null {
  try {
    const parsed = JSON.parse(raw) as {
      type?: ServerPushType;
      chest?: GameChest;
      tile?: FarmTile & { tx: number; ty: number; state: string };
      npcName?: string;
      actions?: NpcAction[];
      announcement?: string;
    };
    if (parsed.type === 'game_chest_spawned' && parsed.chest) {
      return { type: 'game_chest_spawned', chest: parsed.chest };
    }
    if (parsed.type === 'farm_tile_updated' && parsed.tile) {
      return { type: 'farm_tile_updated', tile: parsed.tile };
    }
    if (parsed.type === 'npc_command' && parsed.npcName && Array.isArray(parsed.actions)) {
      return {
        type: 'npc_command',
        npcName: parsed.npcName,
        actions: parsed.actions,
        announcement: parsed.announcement,
      };
    }
  } catch {
    return null;
  }
  return null;
}

export function useIdleGameSyncBoundary({
  sceneRef,
  multiplayActiveRef,
  setAvailableChests,
  setNpcDialog,
}: UseIdleGameSyncBoundaryProps) {
  const dispatch = useDispatch();

  useEffect(() => {
    const syncActionToRoom = (
      action: WorldAction,
      result: WorldActionResult,
      source: WorldSyncSource,
    ) => {
      if (!result.ok || source !== 'local' || !multiplayActiveRef.current) return;
      const policy = getWorldActionSyncPolicy(action);
      if (policy.category !== 'room_broadcast') return;

      switch (action.type) {
        case 'DROP_ITEM':
          gameBus.emit('mp:relay', {
            type: 'item_spawn',
            payload: { itemId: action.itemId, x: action.x, y: action.y },
          });
          return;
        case 'CHOP_TREE':
          gameBus.emit('mp:relay', {
            type: 'tree_chop',
            payload: { treeId: action.treeId },
          });
          return;
        default:
          return;
      }
    };

    const unsubs = [
      gameBus.on('world:action_applied', ({ action, result, source }) => {
        syncActionToRoom(action, result, source);
      }),
      gameBus.on('world:item_picked_up', ({ itemId, x, y, source }) => {
        if ((source ?? 'local') !== 'local' || !multiplayActiveRef.current) return;
        gameBus.emit('mp:relay', { type: 'item_claim', payload: { itemId, x, y } });
      }),
      gameBus.on('world:position_broadcast_requested', ({ x, y, facing, velX, velY }) => {
        if (!multiplayActiveRef.current) return;
        gameBus.emit('mp:relay', {
          type: 'player_move',
          payload: { x, y, facing, velX, velY },
        });
      }),
      gameBus.on('world:sleep_state_changed', ({ sleeping }) => {
        if (!multiplayActiveRef.current) return;
        gameBus.emit('mp:relay', {
          type: 'player_sleep',
          payload: { sleeping },
        });
      }),
      gameBus.on('mp:game_event', (event) => {
        sceneRef.current?.applyRemoteEvent(event.type, event.payload);
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [multiplayActiveRef]);

  const handleSseMessage = useCallback((event: MessageEvent) => {
    const serverEvent = parseServerPush(event.data);
    if (!serverEvent) return;

    switch (serverEvent.type) {
      case 'game_chest_spawned':
        applyServerChestSpawn(sceneRef.current, setAvailableChests, serverEvent.chest);
        return;
      case 'farm_tile_updated':
        applyServerFarmTileUpdate(sceneRef.current, dispatch, serverEvent.tile);
        return;
      case 'npc_command':
        if (serverEvent.announcement) {
          setNpcDialog({
            visible: true,
            text: serverEvent.announcement,
            npcName: serverEvent.npcName,
          });
          setTimeout(() => {
            setNpcDialog((current) => (
              current.text === serverEvent.announcement
                ? { ...current, visible: false }
                : current
            ));
          }, 4000);
        }
        sceneRef.current?.executeNpcActions(serverEvent.npcName, serverEvent.actions);
        return;
    }
  }, [dispatch, sceneRef, setAvailableChests, setNpcDialog]);

  return {
    handleSseMessage,
    applyServerFarmTileUpdate: (tile: FarmTile & { tx: number; ty: number; state: string }) =>
      applyServerFarmTileUpdate(sceneRef.current, dispatch, tile),
    applyServerChestSpawn: (chest: GameChest) =>
      applyServerChestSpawn(sceneRef.current, setAvailableChests, chest),
  };
}
