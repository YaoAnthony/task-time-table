/**
 * useNpcChat — NPC 对话状态、发送消息逻辑，以及相关 gameBus 订阅。
 *
 * 订阅的 gameBus 事件：
 *   npc:speak       → 显示对话框
 *   npc:interact    → 打开 ChatInput
 *   npc:ask_confirm → 显示确认弹窗
 *   npc:chop_tree   → 让场景砍树
 *   npc:dispatch    → 派遣日志
 *   npc:dispatch_return → 调用后端派遣回归 API
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector }          from 'react-redux';
import type { RefObject }       from 'react';
import type { RootState }       from '../../../../../Redux/store';
import {
  useNpcChatMutation,
  useNpcDispatchReturnMutation,
} from '../../../../../api/profileStateRtkApi';
import { gameBus }              from '../shared/EventBus';
import type { GameScene }       from '../GameScene';

export interface DialogState {
  visible:  boolean;
  text:     string;
  npcName:  string;
}

export interface ChatState {
  open:         boolean;
  npcName:      string;
  initialValue: string;
}

export function useNpcChat(
  sceneRef:    RefObject<GameScene | null>,
  chatOpenRef: RefObject<boolean>,
) {
  // ── NPC 自身背包（来自 Redux，供 npcChat API 传递上下文）────────────────
  const npcInventories    = useSelector((s: RootState) => s.game.npcInventories);
  const npcInventoriesRef = useRef(npcInventories);
  npcInventoriesRef.current = npcInventories;

  // ── 对话框 ─────────────────────────────────────────────────────────────
  const [dialog, setDialog] = useState<DialogState>({
    visible: false, text: '', npcName: '',
  });

  // ── ChatInput ──────────────────────────────────────────────────────────
  const [chat, setChat] = useState<ChatState>({
    open: false, npcName: '', initialValue: '',
  });

  // ── NPC 确认弹窗 ────────────────────────────────────────────────────────
  const [npcConfirm, setNpcConfirm] = useState<{
    npcName:  string;
    question: string;
  } | null>(null);

  // ── RTK mutations ───────────────────────────────────────────────────────
  const [npcChat]           = useNpcChatMutation();
  const [npcDispatchReturn] = useNpcDispatchReturnMutation();

  // ── gameBus 订阅 ─────────────────────────────────────────────────────────
  useEffect(() => {
    const unsubs = [
      // NPC 说话 → 对话框 5 s 后自动隐藏
      gameBus.on('npc:speak', ({ text, npcName }) => {
        setDialog({ visible: true, text, npcName });
        setTimeout(
          () => setDialog(d => d.text === text ? { ...d, visible: false } : d),
          5000,
        );
      }),

      // 玩家 E 键 / 按钮 → 打开 ChatInput（initialValue 由键盘快捷键传入，如 "/" 命令前缀）
      gameBus.on('npc:interact', ({ npcName, initialValue }) => {
        chatOpenRef.current = true;
        setChat({ open: true, npcName, initialValue: initialValue ?? '' });
        sceneRef.current?.pauseInput();
      }),

      // NPC 请求玩家确认
      gameBus.on('npc:ask_confirm', ({ npcName, question }) => {
        setNpcConfirm({ npcName, question });
      }),

      // NPC 砍树（异步触发）
      gameBus.on('npc:chop_tree', ({ treeId }) => {
        sceneRef.current?.chopTreeById(treeId);
      }),

      // NPC 出发派遣
      gameBus.on('npc:dispatch', ({ npcName, carriedItems }) => {
        console.log(`[Dispatch] ${npcName} 出发，携带:`, carriedItems);
      }),

      // NPC 派遣回归 → 后端生成故事 + 掉落物品
      gameBus.on('npc:dispatch_return', async ({ npcName, carriedItems }) => {
        console.log(`[Dispatch] ${npcName} 回归，携带:`, carriedItems);
        try {
          const gameTick  = sceneRef.current?.getGameTick?.() ?? 0;
          const result    = await npcDispatchReturn({ npcName, carriedItems, gameTick }).unwrap();
          sceneRef.current?.makeNpcSay(npcName, result.story);
          const playerPos = sceneRef.current?.getPlayerPosition?.() ?? { x: 480, y: 350 };
          result.items.forEach((item: any, i: number) => {
            sceneRef.current?.spawnWorldItem(
              playerPos.x + (i % 3) * 20 - 20,
              playerPos.y + 30,
              item.itemId,
            );
          });
        } catch {
          sceneRef.current?.makeNpcSay(npcName, '属实跑了一趟，没带啥好东西回来，下次吧');
        }
      }),
    ];
    return () => unsubs.forEach(u => u());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 关闭 ChatInput ───────────────────────────────────────────────────────
  const handleCancelChat = useCallback(() => {
    chatOpenRef.current = false;
    setChat({ open: false, npcName: '', initialValue: '' });
    sceneRef.current?.resumeInput();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── NPC 确认弹窗操作 ─────────────────────────────────────────────────────
  const handleNpcConfirmYes = useCallback(() => {
    if (!npcConfirm) return;
    sceneRef.current?.confirmNpcAction(npcConfirm.npcName, true);
    setNpcConfirm(null);
  }, [npcConfirm]);

  const handleNpcConfirmNo = useCallback(() => {
    if (!npcConfirm) return;
    sceneRef.current?.confirmNpcAction(npcConfirm.npcName, false);
    setNpcConfirm(null);
  }, [npcConfirm]);

  // ── 发送消息（斜杠命令 或 NPC 对话）───────────────────────────────────────
  const handleSendMessage = useCallback(async (text: string) => {
    const { npcName } = chat;
    if (!sceneRef.current) return;

    // 斜杠命令 → CommandSystem，不发给 NPC
    if (text.startsWith('/')) {
      chatOpenRef.current = false;
      setChat({ open: false, npcName, initialValue: '' });
      sceneRef.current.resumeInput();
      const feedback = sceneRef.current.executeCommand(text);
      if (feedback) {
        setDialog({ visible: true, text: feedback, npcName: '系统' });
        setTimeout(
          () => setDialog(d => d.text === feedback ? { ...d, visible: false } : d),
          4000,
        );
      }
      return;
    }

    // 普通 NPC 对话
    chatOpenRef.current = false;
    setChat({ open: false, npcName, initialValue: '' });
    sceneRef.current.resumeInput();
    sceneRef.current.addPlayerMessageToNpc(npcName, text);
    sceneRef.current.setNpcThinking(npcName, true);

    try {
      const gameTick   = sceneRef.current.getGameTick();
      const playerPos  = sceneRef.current.getPlayerPosition();
      const perception = sceneRef.current.getPerceptionReport?.() ?? '';
      const result     = await npcChat({
        npcName,
        playerMessage: text,
        gameTick,
        playerX:       playerPos.x,
        playerY:       playerPos.y,
        perception,
        npcInventory:  npcInventoriesRef.current[npcName] ?? {},
      }).unwrap();

      sceneRef.current.npcReply(npcName, result.reply ?? '……');
      if (result.actions?.length) {
        sceneRef.current.executeNpcActions(npcName, result.actions);
      }
    } catch {
      sceneRef.current?.setNpcThinking(npcName, false);
      sceneRef.current?.npcReply(npcName, '……（老李没有回应）');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat, npcChat]);

  return {
    // state
    dialog, setDialog,
    chat, setChat,
    npcConfirm,
    npcInventoriesRef,
    // handlers
    handleSendMessage,
    handleCancelChat,
    handleNpcConfirmYes,
    handleNpcConfirmNo,
  };
}
