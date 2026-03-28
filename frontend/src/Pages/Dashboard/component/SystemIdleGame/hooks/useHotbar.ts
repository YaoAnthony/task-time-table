/**
 * useHotbar — 快捷栏槽位选择 + 工具同步。
 *
 * · 维护 selectedSlot 状态
 * · 监听 hotbarSlots 变化，自动把当前槽位的 tool 同步到 Phaser Player
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector }     from 'react-redux';
import type { RefObject }  from 'react';
import type { RootState }  from '../../../../../Redux/store';
import type { GameScene }  from '../GameScene';
import type { ToolType }   from '../types';

// 物品 → 工具类型映射（模块常量，无 stale-closure 风险）
const ITEM_TO_TOOL: Record<string, ToolType> = {
  watering_can: 'water',
  axe:          'axe',
  scythe:       'scythe',
};

export function useHotbar(sceneRef: RefObject<GameScene | null>) {
  const hotbarSlots    = useSelector((s: RootState) => s.game.hotbarSlots);
  const hotbarSlotsRef = useRef(hotbarSlots);
  hotbarSlotsRef.current = hotbarSlots;

  const [selectedSlot, setSelectedSlot] = useState(0);
  const selectedSlotRef = useRef(selectedSlot);
  selectedSlotRef.current = selectedSlot;

  /** 用户切换槽位（Hotbar 组件点击/键盘数字键）。 */
  const handleSlotChange = useCallback((slot: number) => {
    setSelectedSlot(slot);
    const itemId = hotbarSlotsRef.current[slot]?.itemId ?? '';
    const tool: ToolType = ITEM_TO_TOOL[itemId] ?? 'empty';
    sceneRef.current?.setPlayerTool(tool);
    if (sceneRef.current?.player) {
      (sceneRef.current.player as any).heldItemId = itemId || undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // hotbarSlots 内容改变时（拖拽更新）重新同步当前槽位的工具
  useEffect(() => {
    if (!sceneRef.current) return;
    const itemId = hotbarSlots[selectedSlotRef.current]?.itemId ?? '';
    const tool: ToolType = ITEM_TO_TOOL[itemId] ?? 'empty';
    sceneRef.current.setPlayerTool(tool);
    if (sceneRef.current.player) {
      (sceneRef.current.player as any).heldItemId = itemId || undefined;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotbarSlots]);

  return {
    hotbarSlots,
    hotbarSlotsRef,
    selectedSlot,
    selectedSlotRef,
    handleSlotChange,
    ITEM_TO_TOOL,
  };
}
