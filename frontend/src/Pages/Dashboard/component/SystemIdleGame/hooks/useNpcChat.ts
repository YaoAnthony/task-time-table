import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RefObject } from 'react';
import type { RootState } from '../../../../../Redux/store';
import {
  useNpcChatMutation,
  useNpcDispatchReturnMutation,
} from '../../../../../api/profileStateRtkApi';
import { gameBus } from '../shared/EventBus';
import type { GameScene } from '../GameScene';

export interface DialogState {
  visible: boolean;
  text: string;
  npcName: string;
}

export interface ChatState {
  open: boolean;
  npcName: string;
  initialValue: string;
}

export interface StorylineChoiceState {
  requestId: string;
  storylineId: string;
  eventId: string;
  npcName: string;
  prompt: string;
  choices: Array<{ id: string; label: string }>;
}

export function useNpcChat(
  sceneRef: RefObject<GameScene | null>,
  chatOpenRef: RefObject<boolean>,
) {
  const npcInventories = useSelector((s: RootState) => s.game.npcInventories);
  const npcInventoriesRef = useRef(npcInventories);
  npcInventoriesRef.current = npcInventories;

  const [dialog, setDialog] = useState<DialogState>({
    visible: false,
    text: '',
    npcName: '',
  });

  const [chat, setChat] = useState<ChatState>({
    open: false,
    npcName: '',
    initialValue: '',
  });

  const [npcConfirm, setNpcConfirm] = useState<{
    npcName: string;
    question: string;
  } | null>(null);

  const [storylineChoice, setStorylineChoice] = useState<StorylineChoiceState | null>(null);

  const [npcChat] = useNpcChatMutation();
  const [npcDispatchReturn] = useNpcDispatchReturnMutation();

  useEffect(() => {
    const unsubs = [
      gameBus.on('npc:speak', ({ text, npcName }) => {
        setDialog({ visible: true, text, npcName });
        setTimeout(
          () => setDialog((current) => (
            current.text === text ? { ...current, visible: false } : current
          )),
          5000,
        );
      }),

      gameBus.on('npc:interact', ({ npcName, initialValue }) => {
        chatOpenRef.current = true;
        setChat({ open: true, npcName, initialValue: initialValue ?? '' });
        sceneRef.current?.pauseInput();
      }),

      gameBus.on('npc:ask_confirm', ({ npcName, question }) => {
        setNpcConfirm({ npcName, question });
      }),

      gameBus.on('storyline:choice_requested', (payload) => {
        chatOpenRef.current = true;
        setStorylineChoice(payload);
        sceneRef.current?.pauseInput();
      }),

      gameBus.on('dialogue:player_heard', async ({ npcName, text, shouldReply }) => {
        if (!shouldReply) return;
        const scene = sceneRef.current;
        if (!scene) return;
        if (scene.isAgentBrainEnabled?.() === false) {
          scene.makeNpcSay(npcName, 'Agent brain is off. Use /agent brain on to let me think again.');
          return;
        }

        scene.setNpcThinking(npcName, true);
        try {
          const gameTick = scene.getGameTick();
          const playerPos = scene.getPlayerPosition();
          const perception = scene.getPerceptionReport?.(npcName) ?? '';
          const perceptionContext = (scene as any).getPerceptionContext?.(npcName) ?? null;
          const familiarity = scene.getNpcFamiliarity?.(npcName) ?? 0;
          const chatCount = scene.getNpcChatCount?.(npcName) ?? 0;
          const result = await npcChat({
            npcName,
            playerMessage: text,
            gameTick,
            playerX: playerPos.x,
            playerY: playerPos.y,
            perception,
            perceptionContext,
            npcInventory: npcInventoriesRef.current[npcName] ?? {},
            familiarity,
            chatCount,
            agentBrainEnabled: scene.isAgentBrainEnabled?.() !== false,
          }).unwrap();

          scene.npcReply(npcName, result.reply ?? '……');
          if (result.actions?.length) {
            scene.executeNpcActions(npcName, result.actions);
          }
        } catch {
          scene.setNpcThinking(npcName, false);
          scene.makeNpcSay(npcName, '……我刚才没想清楚。');
        }
      }),

      gameBus.on('npc:chop_tree', ({ treeId }) => {
        sceneRef.current?.chopTreeById(treeId);
      }),

      gameBus.on('npc:dispatch', ({ npcName, carriedItems }) => {
        console.log(`[Dispatch] ${npcName} started`, carriedItems);
      }),

      gameBus.on('npc:dispatch_return', async ({ npcName, carriedItems }) => {
        console.log(`[Dispatch] ${npcName} returned`, carriedItems);
        try {
          const gameTick = sceneRef.current?.getGameTick?.() ?? 0;
          const result = await npcDispatchReturn({ npcName, carriedItems, gameTick }).unwrap();
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
          sceneRef.current?.makeNpcSay(npcName, '跑了一趟，没带回啥东西，下次再说吧。');
        }
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCancelChat = useCallback(() => {
    chatOpenRef.current = false;
    setChat({ open: false, npcName: '', initialValue: '' });
    sceneRef.current?.resumeInput();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNpcConfirmYes = useCallback(() => {
    if (!npcConfirm) return;
    sceneRef.current?.confirmNpcAction(npcConfirm.npcName, true);
    setNpcConfirm(null);
  }, [npcConfirm, sceneRef]);

  const handleNpcConfirmNo = useCallback(() => {
    if (!npcConfirm) return;
    sceneRef.current?.confirmNpcAction(npcConfirm.npcName, false);
    setNpcConfirm(null);
  }, [npcConfirm, sceneRef]);

  const handleStorylineChoiceSelect = useCallback((choiceId: string) => {
    if (!storylineChoice) return;
    gameBus.emit('storyline:choice_selected', {
      requestId: storylineChoice.requestId,
      choiceId,
    });
    chatOpenRef.current = false;
    setStorylineChoice(null);
    sceneRef.current?.resumeInput();
  }, [chatOpenRef, sceneRef, storylineChoice]);

  const handleSendMessage = useCallback(async (text: string) => {
    const { npcName } = chat;
    if (!sceneRef.current) return;

    if (text.startsWith('/')) {
      chatOpenRef.current = false;
      setChat({ open: false, npcName, initialValue: '' });
      sceneRef.current.resumeInput();
      const feedback = sceneRef.current.executeCommand(text);
      if (feedback) {
        setDialog({ visible: true, text: feedback, npcName: '系统' });
        setTimeout(
          () => setDialog((current) => (
            current.text === feedback ? { ...current, visible: false } : current
          )),
          4000,
        );
      }
      return;
    }

    chatOpenRef.current = false;
    setChat({ open: false, npcName, initialValue: '' });
    sceneRef.current.resumeInput();
    sceneRef.current.playerSpeak(text);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat]);

  return {
    dialog,
    setDialog,
    chat,
    setChat,
    npcConfirm,
    storylineChoice,
    npcInventoriesRef,
    handleSendMessage,
    handleCancelChat,
    handleNpcConfirmYes,
    handleNpcConfirmNo,
    handleStorylineChoiceSelect,
  };
}
