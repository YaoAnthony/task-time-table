import React from 'react';
import { motion } from 'framer-motion';
import { FaRobot, FaTimes, FaTrashAlt } from 'react-icons/fa';
import ChatInputBox from './components/ChatInputBox';
import ChatMessageList from './components/ChatMessageList';
import { useAiAssistantChatV2 } from './hooks/useAiAssistantChatV2';

interface Props {
    systemId: string;
    systemName: string;
    onClose: () => void;
    onCreated: (missionListId: string) => void;
}

const AiAssistantModal: React.FC<Props> = ({ systemId, systemName, onClose, onCreated }) => {
    const {
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
    } = useAiAssistantChatV2({ systemId, systemName, onCreated });

    const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            send();
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 md:p-5">
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                className="relative w-full max-w-[min(96vw,1480px)] h-[min(90vh,980px)] flex flex-col bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-white/20 dark:border-white/10 overflow-hidden select-text"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-center gap-3 px-5 py-4 border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-violet-500/10 to-blue-500/10">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 flex items-center justify-center shadow-lg">
                        <FaRobot className="text-white text-sm" />
                    </div>
                    <div className="flex-1">
                        <h3 className="font-black tracking-widest text-neutral-800 dark:text-white text-sm">AI 任务规划助手</h3>
                        <p className="text-[10px] text-neutral-400 dark:text-white/40 tracking-wider">{systemName}</p>
                    </div>
                    <button
                        onClick={reset}
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

                <ChatMessageList
                    messages={messages}
                    isLoading={isLoading}
                    confirmingIdx={confirmingIdx}
                    bottomRef={bottomRef}
                    onConfirm={confirmProposal}
                    onOther={requestRevision}
                />

                <ChatInputBox
                    input={input}
                    isLoading={isLoading}
                    inputRef={inputRef}
                    onChange={setInput}
                    onSend={() => send()}
                    onKeyDown={handleKeyDown}
                />
            </motion.div>
        </div>
    );
};

export default AiAssistantModal;
