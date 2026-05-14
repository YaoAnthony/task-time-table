import { useEffect } from 'react';
import type { RefObject } from 'react';
import type GameScene from '../GameScene';

type HotbarSlot = { itemId?: string } | null;

interface KeyboardSceneApi {
    triggerAction?: () => void;
    triggerInteract?: (initialValue?: string) => void;
}

interface UseGameKeyboardProps {
    /** 当前 GameScene 引用；键盘触发时从这里读取 scene。 */
    sceneRef: RefObject<GameScene | null>;
    /** 聊天框是否打开；打开时阻止 Space/Enter/Q 等游戏快捷键误触。 */
    chatOpenRef: RefObject<boolean>;
    /** 快捷栏物品列表；Q 键丢物品时读取当前 slot 的 itemId。 */
    hotbarSlotsRef: RefObject<HotbarSlot[]>;
    /** 当前选中的快捷栏序号；Q 键用它决定丢哪个格子的物品。 */
    selectedSlotRef: RefObject<number>;
    /** 丢物品回调；useGameKeyboard 只负责识别按键，真正业务交给外部。 */
    onDropItem: (slot: number, itemId: string) => void;
}

export function useGameKeyboard({
    sceneRef,
    chatOpenRef,
    hotbarSlotsRef,
    selectedSlotRef,
    onDropItem,
}: UseGameKeyboardProps): void {
    useEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            const tag = (event.target as HTMLElement | null)?.tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;

            const scene = sceneRef.current as (GameScene & KeyboardSceneApi) | null;

            if (event.code === 'Space') {
                event.preventDefault();
                if (!chatOpenRef.current) scene?.triggerAction?.();
                return;
            }

            if (chatOpenRef.current) return;

            if (event.code === 'Enter') {
                event.preventDefault();
                scene?.triggerInteract?.('');
                return;
            }

            if (event.code === 'KeyQ') {
                event.preventDefault();
                const slot = selectedSlotRef.current;
                const itemId = hotbarSlotsRef.current[slot]?.itemId;
                if (itemId) onDropItem(slot, itemId);
                return;
            }

            if (event.key === '/') {
                event.preventDefault();
                scene?.triggerInteract?.('/');
            }
        };

        document.addEventListener('keydown', onKeyDown, true);
        return () => document.removeEventListener('keydown', onKeyDown, true);
    }, [chatOpenRef, hotbarSlotsRef, onDropItem, sceneRef, selectedSlotRef]);
}
