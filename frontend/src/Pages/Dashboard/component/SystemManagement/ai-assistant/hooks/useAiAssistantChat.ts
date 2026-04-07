import { useEffect, useRef, useState } from 'react';
import { useAiTaskChatMutation, useAiTaskConfirmMutation, useLazyGetSystemListQuery } from '../../../../../../api/systemRtkApi';
import type { Message, Proposal } from '../types';
import { clearAiAssistantMessages, loadAiAssistantMessages, saveAiAssistantMessages } from '../utils/storage';

interface Options {
    systemId: string;
    systemName: string;
    onCreated: (missionListId: string) => void;
}

export const useAiAssistantChat = ({ systemId, systemName, onCreated }: Options) => {
    const greeting: Message = {
        role: 'assistant',
        content: `你好！我是「${systemName}」的任务规划助手。\n\n告诉我你想完成什么目标，我会帮你自动拆解成任务清单，并建议合理的奖励。比如：\n\n- "我想学完 React 全套课程"\n- "准备一场产品发布会"\n- "制定健身计划，每周三次"`,
    };

    const [messages, setMessages] = useState<Message[]>(() => loadAiAssistantMessages(systemId, [greeting]));
    const [input, setInput] = useState('');
    const [confirmingIdx, setConfirmingIdx] = useState<number | null>(null);
    const [aiTaskChat, { isLoading }] = useAiTaskChatMutation();
    const [aiTaskConfirm] = useAiTaskConfirmMutation();
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        saveAiAssistantMessages(systemId, messages);
    }, [messages, systemId]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const send = async (overrideText?: string) => {
        const text = (overrideText ?? input).trim();
        if (!text || isLoading) return;

        const userMessage: Message = { role: 'user', content: text };
        const nextMessages = [...messages, userMessage];
        setMessages(nextMessages);
        if (!overrideText) setInput('');

        const history = nextMessages.filter((_, index) => index > 0).map((message) => ({
            role: message.role,
            content: message.content,
        }));

        try {
            const response = await aiTaskChat({ systemId, messages: history }).unwrap();
            setMessages((prev) => [
                ...prev,
                {
                    role: 'assistant',
                    content: response.reply,
                    preview: response.action === 'preview' ? response.proposal : undefined,
                },
            ]);
        } catch (error) {
            const err = error as { data?: { message?: string } };
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: err?.data?.message || 'AI 服务暂时不可用，请稍后重试。' },
            ]);
        }
    };

    const confirmProposal = async (messageIndex: number, proposal: Proposal) => {
        setConfirmingIdx(messageIndex);
        try {
            const response = await aiTaskConfirm({ systemId, proposal }).unwrap();
            setMessages((prev) =>
                prev.map((message, index) =>
                    index === messageIndex
                        ? { ...message, preview: undefined, isAction: true, content: response.reply }
                        : message
                )
            );
            await triggerGetSystemList().unwrap();
            const missionList = response.missionList as { _id?: string };
            if (missionList?._id) onCreated(missionList._id);
        } catch (error) {
            const err = error as { data?: { message?: string } };
            setMessages((prev) => [
                ...prev,
                { role: 'assistant', content: err?.data?.message || '创建失败，请稍后重试。' },
            ]);
        } finally {
            setConfirmingIdx(null);
        }
    };

    const requestRevision = async (_messageIndex: number, text: string) => {
        await send(text);
    };

    const reset = () => {
        clearAiAssistantMessages(systemId);
        setMessages([greeting]);
    };

    return {
        messages,
        input,
        isLoading,
        confirmingIdx,
        bottomRef,
        inputRef,
        setInput,
        send,
        confirmProposal,
        requestRevision,
        reset,
    };
};
