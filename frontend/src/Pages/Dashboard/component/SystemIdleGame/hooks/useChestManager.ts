import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useDispatch } from 'react-redux';
import {
  useLazyGetGameChestsQuery,
  useOpenChestMutation,
} from '../../../../../api/profileStateRtkApi';
import { setWalletCoins, setInventory } from '../../../../../Redux/Features/profileStateSlice';
import { patchWalletCoins } from '../../../../../Redux/Features/profileSlice';
import type { GameChest, ChestRewardItem } from '../../../../../Types/Profile';
import type { GameScene } from '../GameScene';
import { gameBus } from '../shared/EventBus';

export interface PendingChest {
  chestId: string;
  rewards: { coins: number; items: ChestRewardItem[] };
  chest?: GameChest;
}

function isStaleChestOpenError(error: unknown): boolean {
  const status = (error as { status?: unknown } | null)?.status;
  if (status !== 400 && status !== 404 && status !== 410) return false;
  const message = String((error as { data?: { message?: unknown } } | null)?.data?.message ?? '');
  return status === 404 || /already opened|not found/i.test(message);
}

export function useChestManager(
  sceneRef: RefObject<GameScene | null>,
  roomIdRef?: RefObject<string | null | undefined>,
) {
  const dispatch = useDispatch();
  const [availableChests, setAvailableChests] = useState<GameChest[]>([]);
  const availableChestsRef = useRef<GameChest[]>([]);
  const [pendingChest, setPendingChest] = useState<PendingChest | null>(null);
  const [fetchGameChests] = useLazyGetGameChestsQuery();
  const [openChestMutation] = useOpenChestMutation();
  const chestFocusIdxRef = useRef(0);

  availableChestsRef.current = availableChests;

  const getRoomId = useCallback(() => roomIdRef?.current ?? undefined, [roomIdRef]);

  const removeLocalChest = useCallback((chestId: string) => {
    setAvailableChests((prev) => prev.filter((chest) => chest.id !== chestId));
    const removeResult = sceneRef.current?.dispatchWorldAction({
      type: 'REMOVE_OBJECT',
      actorId: 'player',
      objectId: chestId,
      objectKind: 'chest',
    }, 'server');
    if (!removeResult?.ok) {
      sceneRef.current?.removeChest(chestId);
    }
    console.log('[DEBUG-event-flow] useChestManager.removeLocalChest', { chestId, removeResult });
  }, [sceneRef]);

  const refreshChests = useCallback(() => {
    fetchGameChests(getRoomId())
      .then((res) => {
        const chests: GameChest[] = (res.data?.chests ?? []).filter((chest) => !chest.opened);
        setAvailableChests(chests);
        if (sceneRef.current) {
          sceneRef.current.loadChests(chests);
        }
      })
      .catch(() => {});
  }, [fetchGameChests, getRoomId, sceneRef]);

  useEffect(() => {
    const unsubs = [
      gameBus.on('chest:interact', ({ chestId, rewards, chest }) => {
        console.log('[DEBUG-event-flow] useChestManager received chest:interact', { chestId, rewards, chest });
        setPendingChest({ chestId, rewards, chest });
      }),
      gameBus.on('game:chest_spawned', ({ chest }) => {
        console.log('[DEBUG-event-flow] useChestManager received game:chest_spawned', { chest });
        if (!chest || chest.opened) return;
        setAvailableChests((prev) => (
          prev.some((entry) => entry.id === chest.id) ? prev : [...prev, chest]
        ));
      }),
    ];
    return () => unsubs.forEach((unsub) => unsub());
  }, []);

  const handleChestHudClick = useCallback(() => {
    const list = availableChestsRef.current;
    if (!list.length || !sceneRef.current) return;
    chestFocusIdxRef.current = chestFocusIdxRef.current % list.length;
    sceneRef.current.panToChest(list[chestFocusIdxRef.current].id);
    chestFocusIdxRef.current++;
  }, [sceneRef]);

  const handleChestConfirm = useCallback(async () => {
    if (!pendingChest) return;
    const { chestId } = pendingChest;
    console.log('[DEBUG-event-flow] useChestManager.handleChestConfirm start', { pendingChest });
    setPendingChest(null);

    try {
      const localChest = pendingChest.chest
        ?? availableChestsRef.current.find((chest) => chest.id === chestId)
        ?? null;
      const result = await openChestMutation({
        chestId,
        roomId: getRoomId(),
        localChest,
      }).unwrap();
      console.log('[DEBUG-event-flow] useChestManager.openChestMutation success', { chestId, result });
      dispatch(setWalletCoins(result.wallet.coins));
      dispatch(patchWalletCoins(result.wallet.coins));
      dispatch(setInventory(result.inventory));
      removeLocalChest(chestId);
      refreshChests();
    } catch (error) {
      console.error('[DEBUG-event-flow] useChestManager.openChestMutation failed', { chestId, error });
      if (isStaleChestOpenError(error)) {
        removeLocalChest(chestId);
      }
      refreshChests();
    }
  }, [dispatch, getRoomId, openChestMutation, pendingChest, refreshChests, removeLocalChest]);

  return {
    availableChests,
    setAvailableChests,
    availableChestsRef,
    pendingChest,
    refreshChests,
    handleChestHudClick,
    handleChestConfirm,
    fetchGameChests,
  };
}
