/**
 * AiAssistantModal — AI 模式弹窗
 *
 * 用户在聊天框描述目标 → 后端调用 LLM → LLM 返回方案预览 JSON
 * 前端渲染可视化任务链预览 → 用户点击「确认创建」或输入修改意见
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaRobot, FaTimes, FaPaperPlane, FaSpinner, FaCheckCircle,
    FaCoins, FaClock, FaGift, FaTrashAlt,
} from 'react-icons/fa';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAiTaskChatMutation, useAiTaskConfirmMutation, useLazyGetSystemListQuery } from '../../../../api/systemRtkApi';

/* ─── types ─────────────────────────────────────────────────────────────── */

interface ProposalNode {
    tempId: string;
    parentTempId: string | null;
    title: string;
    description?: string;
    timeCostMinutes: number;
    rewards?: {
        coins?: number;
        items?: Array<{ itemKey: string; quantity: number }>;
    };
}

interface Proposal {
    title: string;
    listType: string;
    description: string;
    imageKeywords: string;
    nodes: ProposalNode[];
}

interface Message {
    role: 'user' | 'assistant';
    content: string;
    isAction?: boolean;   // true = created successfully
    preview?: Proposal;   // present = show preview card
}

interface Props {
    systemId: string;
    systemName: string;
    onClose: () => void;
    onCreated: (missionListId: string) => void;
}

/* ─── helper: render linear chain ───────────────────────────────────────── */

const listTypeLabel = (t: string) => t === 'urgent' ? '紧急任务' : '主线任务';

const ProposalPreview: React.FC<{
    proposal: Proposal;
    onConfirm: () => void;
    onOther: (text: string) => void;
    isConfirming: boolean;
}> = ({ proposal, onConfirm, onOther, isConfirming }) => {
    const [otherInput, setOtherInput] = useState('');

    // Build linear chain (depth-first order for display)
    const buildChain = (nodes: ProposalNode[]): ProposalNode[] => {
        const rootNodes = nodes.filter(n => !n.parentTempId);
        const result: ProposalNode[] = [];
        const visit = (n: ProposalNode) => {
            result.push(n);
            nodes.filter(c => c.parentTempId === n.tempId).forEach(visit);
        };
        rootNodes.forEach(visit);
        return result;
    };
    const chain = buildChain(proposal.nodes);

    const totalCoins = proposal.nodes.reduce((s, n) => s + (n.rewards?.coins || 0), 0);
    const totalMinutes = proposal.nodes.reduce((s, n) => s + (n.timeCostMinutes || 0), 0);

    const fmtTime = (mins: number) => {
        if (mins < 60) return `${mins}分钟`;
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return m > 0 ? `${h}小时${m}分` : `${h}小时`;
    };

    const handleOtherSend = () => {
        const t = otherInput.trim();
        if (!t) return;
        onOther(t);
        setOtherInput('');
    };

    return (
        <div className="rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-900/20 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 bg-violet-100 dark:bg-violet-900/40 border-b border-violet-200 dark:border-violet-500/30">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded-md bg-violet-500/20 text-violet-700 dark:text-violet-300">
                        {listTypeLabel(proposal.listType)}
                    </span>
                    <span className="text-sm font-black text-neutral-800 dark:text-white truncate">{proposal.title}</span>
                </div>
                {proposal.description && (
                    <p className="text-[11px] text-neutral-500 dark:text-white/50 leading-relaxed mt-0.5">{proposal.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-500 dark:text-white/40">
                    <span className="flex items-center gap-1">
                        <FaClock className="text-[9px]" />
                        {fmtTime(totalMinutes)}
                    </span>
                    {totalCoins > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <FaCoins className="text-[9px]" />
                            共 {totalCoins} 金币
                        </span>
                    )}
                    <span>{chain.length} 个节点</span>
                </div>
            </div>

            {/* Node chain */}
            <div className="px-4 py-3 space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-violet-200 dark:scrollbar-thumb-violet-700/40 scrollbar-track-transparent">
                {chain.map((node, idx) => (
                    <div key={node.tempId} className="flex items-start gap-2">
                        {/* Connector */}
                        <div className="flex flex-col items-center shrink-0 mt-1">
                            <div className="w-5 h-5 rounded-full bg-violet-500/20 dark:bg-violet-500/30 border border-violet-300 dark:border-violet-500/50 flex items-center justify-center">
                                <span className="text-[9px] font-black text-violet-600 dark:text-violet-300">{idx + 1}</span>
                            </div>
                            {idx < chain.length - 1 && (
                                <div className="w-px flex-1 bg-violet-200 dark:bg-violet-700/40 mt-1 mb-0" style={{ minHeight: 10 }} />
                            )}
                        </div>
                        {/* Content */}
                        <div className="flex-1 pb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[12px] font-semibold text-neutral-800 dark:text-white leading-tight">{node.title}</span>
                                <span className="text-[10px] text-neutral-400 dark:text-white/30 flex items-center gap-0.5">
                                    <FaClock className="text-[8px]" />{fmtTime(node.timeCostMinutes)}
                                </span>
                                {(node.rewards?.coins || 0) > 0 && (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                        <FaCoins className="text-[8px]" />{node.rewards!.coins}
                                    </span>
                                )}
                                {(node.rewards?.items || []).length > 0 && (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                        <FaGift className="text-[8px]" />{node.rewards!.items!.length} 件物品
                                    </span>
                                )}
                            </div>
                            {node.description && (
                                <p className="text-[11px] text-neutral-400 dark:text-white/40 leading-snug mt-0.5">{node.description}</p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Actions */}
            <div className="px-4 py-3 border-t border-violet-200 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-900/10 space-y-2">
                {/* Confirm button */}
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={onConfirm}
                    disabled={isConfirming}
                    className="w-full py-2 rounded-lg bg-gradient-to-r from-violet-500 to-blue-600 text-white text-sm font-black tracking-widest shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isConfirming ? (
                        <><FaSpinner className="animate-spin text-xs" />创建中...</>
                    ) : (
                        <><FaCheckCircle className="text-xs" />确认创建</>
                    )}
                </motion.button>

                {/* Other / revision input */}
                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={otherInput}
                        onChange={e => setOtherInput(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleOtherSend()}
                        placeholder="其他要求，如「增加复习节点」..."
                        className="flex-1 text-[12px] bg-white dark:bg-white/10 border border-black/10 dark:border-white/15 rounded-lg px-3 py-1.5 text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:outline-none focus:border-violet-400 transition-all"
                    />
                    <button
                        onClick={handleOtherSend}
                        disabled={!otherInput.trim()}
                        className="px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-white/10 text-neutral-600 dark:text-white/70 text-[11px] font-semibold hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors disabled:opacity-40"
                    >
                        修改
                    </button>
                </div>
            </div>
        </div>
    );
};

/* ─── session storage helpers ────────────────────────────────────────────── */

const storageKey = (systemId: string) => `ai_chat_${systemId}`;

const loadMessages = (systemId: string, fallback: Message[]): Message[] => {
    try {
        const raw = sessionStorage.getItem(storageKey(systemId));
        if (raw) return JSON.parse(raw) as Message[];
    } catch (_) { /* ignore */ }
    return fallback;
};

const saveMessages = (systemId: string, msgs: Message[]) => {
    try {
        sessionStorage.setItem(storageKey(systemId), JSON.stringify(msgs));
    } catch (_) { /* ignore */ }
};

/* ─── main component ─────────────────────────────────────────────────────── */

const AiAssistantModal: React.FC<Props> = ({ systemId, systemName, onClose, onCreated }) => {
    const greeting: Message = {
        role: 'assistant',
        content: `你好！我是「${systemName}」的任务规划助手。\n\n告诉我你想完成什么目标，我会帮你自动拆解成任务清单，并建议合理的奖励。比如：\n\n• "我想学完 React 全套课程"\n• "准备一场产品发布会"\n• "制定健身计划，每周三次"`,
    };

    const [messages, setMessages] = useState<Message[]>(() =>
        loadMessages(systemId, [greeting])
    );
    const [input, setInput] = useState('');
    const [confirmingIdx, setConfirmingIdx] = useState<number | null>(null);

    const [aiTaskChat, { isLoading }] = useAiTaskChatMutation();
    const [aiTaskConfirm] = useAiTaskConfirmMutation();
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const bottomRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Persist messages to sessionStorage whenever they change
    useEffect(() => {
        saveMessages(systemId, messages);
    }, [systemId, messages]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleSend = async (overrideText?: string) => {
        const text = (overrideText ?? input).trim();
        if (!text || isLoading) return;

        const userMsg: Message = { role: 'user', content: text };
        const next = [...messages, userMsg];
        setMessages(next);
        if (!overrideText) setInput('');

        // Build history for backend (exclude initial greeting)
        const history = next
            .filter((_, i) => i > 0) // skip greeting
            .map(m => ({ role: m.role, content: m.content }));

        try {
            const res = await aiTaskChat({ systemId, messages: history }).unwrap();

            const assistantMsg: Message = {
                role: 'assistant',
                content: res.reply,
                preview: res.action === 'preview' ? res.proposal : undefined,
            };
            setMessages(prev => [...prev, assistantMsg]);
        } catch (err: any) {
            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: err?.data?.message || 'AI 服务暂时不可用，请稍后重试。',
                },
            ]);
        }
    };

    const handleConfirm = async (msgIdx: number, proposal: Proposal) => {
        setConfirmingIdx(msgIdx);
        try {
            const res = await aiTaskConfirm({ systemId, proposal }).unwrap();

            // Replace preview message with confirmed success message
            setMessages(prev =>
                prev.map((m, i) =>
                    i === msgIdx
                        ? { ...m, preview: undefined, isAction: true, content: res.reply }
                        : m
                )
            );

            await triggerGetSystemList().unwrap();
            const ml = res.missionList as any;
            if (ml?._id) onCreated(ml._id);
        } catch (err: any) {
            setMessages(prev => [
                ...prev,
                {
                    role: 'assistant',
                    content: err?.data?.message || '创建失败，请稍后重试。',
                },
            ]);
        } finally {
            setConfirmingIdx(null);
        }
    };

    const handleOther = (_msgIdx: number, text: string) => {
        // Send user's revision request as new message
        handleSend(text);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Backdrop */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            {/* Modal */}
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="relative w-full max-w-2xl h-[640px] flex flex-col bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-violet-500/10 to-blue-500/10">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg">
                        <FaRobot className="text-white text-sm" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-black tracking-widest text-neutral-800 dark:text-white text-sm">AI 任务规划助手</h3>
                        <p className="text-[10px] text-neutral-400 dark:text-white/40 tracking-wider">{systemName}</p>
                    </div>
                    <button
                        onClick={() => {
                            sessionStorage.removeItem(storageKey(systemId));
                            setMessages([greeting]);
                        }}
                        title="清空聊天记录"
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                        <FaTrashAlt className="text-xs" />
                    </button>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-neutral-700 dark:hover:text-white hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                    >
                        <FaTimes />
                    </button>
                </div>

                {/* Chat history */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10 scrollbar-track-transparent">
                    <AnimatePresence initial={false}>
                        {messages.map((msg, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 8 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.2 }}
                                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                            >
                                {msg.role === 'assistant' && (
                                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                                        <FaRobot className="text-white text-[10px]" />
                                    </div>
                                )}
                                <div className={`flex flex-col gap-2 max-w-[88%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                    {/* Text bubble */}
                                    {msg.content && (
                                        <div
                                            className={`px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                                                msg.role === 'user'
                                                    ? 'bg-violet-500 text-white rounded-br-sm whitespace-pre-wrap'
                                                    : msg.isAction
                                                    ? 'bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-500/30 text-emerald-800 dark:text-emerald-200 rounded-bl-sm'
                                                    : 'bg-neutral-100 dark:bg-white/10 text-neutral-800 dark:text-white rounded-bl-sm'
                                            }`}
                                        >
                                            {msg.isAction && (
                                                <div className="flex items-center gap-1.5 mb-2 text-emerald-600 dark:text-emerald-400 text-[11px] font-black tracking-widest">
                                                    <FaCheckCircle />
                                                    任务列表已创建
                                                </div>
                                            )}
                                            {msg.role === 'user' ? (
                                                msg.content
                                            ) : (
                                                <ReactMarkdown
                                                    remarkPlugins={[remarkGfm]}
                                                    components={{
                                                        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                                                        strong: ({ children }) => <strong className="font-black">{children}</strong>,
                                                        em: ({ children }) => <em className="italic">{children}</em>,
                                                        ul: ({ children }) => <ul className="list-disc pl-4 mb-1.5 space-y-0.5">{children}</ul>,
                                                        ol: ({ children }) => <ol className="list-decimal pl-4 mb-1.5 space-y-0.5">{children}</ol>,
                                                        li: ({ children }) => <li className="leading-snug">{children}</li>,
                                                        code: ({ children }) => (
                                                            <code className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[12px]">{children}</code>
                                                        ),
                                                        h1: ({ children }) => <h1 className="font-black text-base mb-1">{children}</h1>,
                                                        h2: ({ children }) => <h2 className="font-black text-sm mb-1">{children}</h2>,
                                                        h3: ({ children }) => <h3 className="font-bold text-sm mb-0.5">{children}</h3>,
                                                        hr: () => <hr className="border-current opacity-20 my-2" />,
                                                    }}
                                                >
                                                    {msg.content}
                                                </ReactMarkdown>
                                            )}
                                        </div>
                                    )}

                                    {/* Proposal preview card */}
                                    {msg.preview && (
                                        <div className="w-full">
                                            <ProposalPreview
                                                proposal={msg.preview}
                                                onConfirm={() => handleConfirm(i, msg.preview!)}
                                                onOther={(text) => handleOther(i, text)}
                                                isConfirming={confirmingIdx === i}
                                            />
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        ))}
                    </AnimatePresence>

                    {/* Typing indicator */}
                    {isLoading && (
                        <motion.div
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex justify-start"
                        >
                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center mr-2 mt-0.5 shrink-0">
                                <FaRobot className="text-white text-[10px]" />
                            </div>
                            <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-neutral-100 dark:bg-white/10 flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-white/40 animate-bounce" style={{ animationDelay: '0ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-white/40 animate-bounce" style={{ animationDelay: '150ms' }} />
                                <span className="w-1.5 h-1.5 rounded-full bg-neutral-400 dark:bg-white/40 animate-bounce" style={{ animationDelay: '300ms' }} />
                            </div>
                        </motion.div>
                    )}

                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div className="px-4 py-3 border-t border-black/5 dark:border-white/10 bg-white/50 dark:bg-black/20">
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                            rows={1}
                            placeholder="描述你的目标，按 Enter 发送..."
                            className="flex-1 resize-none bg-white dark:bg-white/10 border border-black/10 dark:border-white/15 rounded-xl px-4 py-2.5 text-sm text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:outline-none focus:border-violet-400 dark:focus:border-violet-500 focus:ring-2 focus:ring-violet-400/20 transition-all max-h-32 overflow-y-auto scrollbar-none disabled:opacity-50"
                            style={{ lineHeight: '1.5' }}
                        />
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleSend()}
                            disabled={!input.trim() || isLoading}
                            className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 text-white flex items-center justify-center shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shrink-0"
                        >
                            {isLoading ? (
                                <FaSpinner className="animate-spin text-sm" />
                            ) : (
                                <FaPaperPlane className="text-sm" />
                            )}
                        </motion.button>
                    </div>
                    <p className="text-[10px] text-neutral-400 dark:text-white/30 mt-1.5 pl-1">Shift+Enter 换行 · Enter 发送</p>
                </div>
            </motion.div>
        </div>
    );
};

export default AiAssistantModal;
