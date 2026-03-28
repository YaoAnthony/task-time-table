/**
 * useChestManager — 宝箱状态、刷新逻辑、奖励弹窗，以及 gameBus chest:interact 订阅。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDispatch }         from 'react-redux';
import type { RefObject }      from 'react';
import {
  useLazyGetGameChestsQuery,
  useOpenChestMutation,
} from '../../../../../api/profileStateRtkApi';
import { setWalletCoins, setInventory } from '../../../../../Redux/Features/profileStateSlice';
import { patchWalletCoins }    from '../../../../../Redux/Features/profileSlice';
import { gameBus }             from '../shared/EventBus';
import type { GameScene }      from '../GameScene';
import type { GameChest, ChestRewardItem } from '../../../../../Types/Profile';

export interface PendingChest {
  chestId: string;
  rewards: { coins: number; items: ChestRewardItem[] };
}

export function useChestManager(sceneRef: RefObject<GameScene | null>) {
  const dispatch = useDispatch();

  const [availableChests, setAvailableChests] = useState<GameChest[]>([]);
  const availableChestsRef = useRef<GameChest[]>([]);
  availableChestsRef.current = availableChests;

  const [pendingChest, setPendingChest] = useState<PendingChest | null>(null);

  const [fetchGameChests]   = useLazyGetGameChestsQuery();
  const [openChestMutation] = useOpenChestMutation();

  // 用于循环定位宝箱
  const chestFocusIdxRef = useRef(0);

  /** 从后端重新拉取宝箱列表，并同步到 Phaser 场景。 */
  const refreshChests = useCallback(() => {
    fetchGameChests().then((res) => {
      const chests: GameChest[] = res.data?.chests ?? [];
      setAvailableChests(chests);
      if (sceneRef.current) {
        chests.forEach(c => sceneRef.current!.addChest(c));
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchGameChests]);

  // gameBus 订阅：玩家踩上宝箱
  useEffect(() => {
    const unsub = gameBus.on('chest:interact', ({ chestId, rewards }) => {
      setPendingChest({ chestId, rewards });
    });
    return () => unsub();
  }, []);

  /** HUD 宝箱图标点击 → 摄像机依次聚焦到各宝箱位置。 */
  const handleChestHudClick = useCallback(() => {
    const list = availableChestsRef.current;
    if (!list.length || !sceneRef.current) return;
    chestFocusIdxRef.current = chestFocusIdxRef.current % list.length;
    sceneRef.current.panToChest(list[chestFocusIdxRef.current].id);
    chestFocusIdxRef.current++;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** 玩家确认领取奖励 → 调用后端 open API，更新 Redux，刷新宝箱列表。 */
  const handleChestConfirm = useCallback(async () => {
    if (!pendingChest) return;
    const { chestId } = pendingChest;
    setPendingChest(null);
    // 乐观更新：立即从 HUD 移除
    setAvailableChests(prev => prev.filter(c => c.id !== chestId));
    try {
      const result = await openChestMutation({ chestId }).unwrap();
      dispatch(setWalletCoins(result.wallet.coins));
      dispatch(patchWalletCoins(result.wallet.coins));
      dispatch(setInventory(result.inventory));
      sceneRef.current?.removeChest(chestId);
      refreshChests();
    } catch {
      sceneRef.current?.removeChest(chestId);
      refreshChests();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingChest, openChestMutation, dispatch, refreshChests]);

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
