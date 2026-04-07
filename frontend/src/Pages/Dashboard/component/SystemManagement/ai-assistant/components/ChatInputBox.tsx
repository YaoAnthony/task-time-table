import React from 'react';
import { motion } from 'framer-motion';
import { FaPaperPlane, FaSpinner } from 'react-icons/fa';

interface Props {
    input: string;
    isLoading: boolean;
    inputRef: React.RefObject<HTMLTextAreaElement | null>;
    onChange: (value: string) => void;
    onSend: () => void;
    onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
}

const ChatInputBox: React.FC<Props> = ({ input, isLoading, inputRef, onChange, onSend, onKeyDown }) => {
    return (
        <div className="px-4 py-3 border-t border-black/5 dark:border-white/10 bg-white/50 dark:bg-black/20">
            <div className="flex items-end gap-2">
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(event) => onChange(event.target.value)}
                    onKeyDown={onKeyDown}
                    disabled={isLoading}
                    rows={1}
                    placeholder="描述你的目标，按 Enter 发送..."
                    className="flex-1 resize-none bg-white dark:bg-white/10 border border-black/10 dark:border-white/15 rounded-xl px-4 py-2.5 text-sm text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:outline-none focus:border-violet-400 dark:focus:border-violet-500 focus:ring-2 focus:ring-violet-400/20 transition-all max-h-32 overflow-y-auto scrollbar-none disabled:opacity-50"
                    style={{ lineHeight: '1.5' }}
                />
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={onSend}
                    disabled={!input.trim() || isLoading}
                    className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-blue-600 text-white flex items-center justify-center shadow-lg disabled:opacity-40 disabled:cursor-not-allowed transition-opacity shrink-0"
                >
                    {isLoading ? <FaSpinner className="animate-spin text-sm" /> : <FaPaperPlane className="text-sm" />}
                </motion.button>
            </div>
            <p className="text-[10px] text-neutral-400 dark:text-white/30 mt-1.5 pl-1">Shift+Enter 换行 · Enter 发送</p>
        </div>
    );
};

export default ChatInputBox;
