import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FaCheckCircle, FaClock, FaCoins, FaGift, FaSpinner } from 'react-icons/fa';
import type { ProposalNode, Proposal } from '../types';

const listTypeLabel = (value: string) => (value === 'urgent' ? '紧急任务' : '主线任务');
const structureTypeLabel = (value?: string) => {
    if (value === 'branched') return '分支树';
    if (value === 'merge') return '分支合流';
    return '线性链';
};

const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes}分钟`;
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return remain > 0 ? `${hours}小时${remain}分钟` : `${hours}小时`;
};

const buildDisplayChain = (nodes: ProposalNode[]) => {
    const roots = nodes.filter((node) => !node.parentTempId);
    const result: ProposalNode[] = [];

    const visit = (node: ProposalNode) => {
        result.push(node);
        nodes.filter((child) => child.parentTempId === node.tempId).forEach(visit);
    };

    roots.forEach(visit);
    return result;
};

interface Props {
    proposal: Proposal;
    onConfirm: () => void;
    onOther: (text: string) => void;
    isConfirming: boolean;
}

const ProposalPreview: React.FC<Props> = ({ proposal, onConfirm, onOther, isConfirming }) => {
    const [otherInput, setOtherInput] = useState('');
    const chain = useMemo(() => buildDisplayChain(proposal.nodes), [proposal.nodes]);
    const totalCoins = proposal.nodes.reduce((sum, node) => sum + (node.rewards?.coins || 0), 0);
    const totalMinutes = proposal.nodes.reduce((sum, node) => sum + (node.timeCostMinutes || 0), 0);

    const handleOtherSend = () => {
        const text = otherInput.trim();
        if (!text) return;
        onOther(text);
        setOtherInput('');
    };

    return (
        <div className="rounded-xl border border-violet-200 dark:border-violet-500/30 bg-violet-50 dark:bg-violet-900/20 overflow-hidden">
            <div className="px-4 py-3 bg-violet-100 dark:bg-violet-900/40 border-b border-violet-200 dark:border-violet-500/30">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[10px] font-black tracking-widest px-1.5 py-0.5 rounded-md bg-violet-500/20 text-violet-700 dark:text-violet-300">
                        {listTypeLabel(proposal.listType)}
                    </span>
                    <span className="text-sm font-black text-neutral-800 dark:text-white truncate">{proposal.title}</span>
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-1">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-blue-500/15 text-blue-700 dark:text-blue-300">
                        {structureTypeLabel(proposal.structureType)}
                    </span>
                    {proposal.mode === 'attach_to_existing_list' && proposal.attachTargetMissionListTitle && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            接入 {proposal.attachTargetMissionListTitle}
                        </span>
                    )}
                </div>
                {proposal.description && (
                    <p className="text-[11px] text-neutral-500 dark:text-white/50 leading-relaxed mt-0.5">{proposal.description}</p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-500 dark:text-white/40">
                    <span className="flex items-center gap-1">
                        <FaClock className="text-[9px]" />
                        {formatMinutes(totalMinutes)}
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

            <div className="px-4 py-3 space-y-1.5 max-h-52 overflow-y-auto scrollbar-thin scrollbar-thumb-violet-200 dark:scrollbar-thumb-violet-700/40 scrollbar-track-transparent">
                {chain.map((node, index) => (
                    <div key={node.tempId} className="flex items-start gap-2">
                        <div className="flex flex-col items-center shrink-0 mt-1">
                            <div className="w-5 h-5 rounded-full bg-violet-500/20 dark:bg-violet-500/30 border border-violet-300 dark:border-violet-500/50 flex items-center justify-center">
                                <span className="text-[9px] font-black text-violet-600 dark:text-violet-300">{index + 1}</span>
                            </div>
                            {index < chain.length - 1 && (
                                <div className="w-px flex-1 bg-violet-200 dark:bg-violet-700/40 mt-1 mb-0" style={{ minHeight: 10 }} />
                            )}
                        </div>
                        <div className="flex-1 pb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[12px] font-semibold text-neutral-800 dark:text-white leading-tight">{node.title}</span>
                                <span className="text-[10px] text-neutral-400 dark:text-white/30 flex items-center gap-0.5">
                                    <FaClock className="text-[8px]" />
                                    {formatMinutes(node.timeCostMinutes)}
                                </span>
                                {(node.rewards?.coins || 0) > 0 && (
                                    <span className="text-[10px] text-amber-600 dark:text-amber-400 flex items-center gap-0.5">
                                        <FaCoins className="text-[8px]" />
                                        {node.rewards?.coins}
                                    </span>
                                )}
                                {(node.rewards?.items || []).length > 0 && (
                                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                        <FaGift className="text-[8px]" />
                                        {node.rewards?.items?.length} 件物品
                                    </span>
                                )}
                            </div>
                            {node.description && (
                                <p className="text-[11px] text-neutral-400 dark:text-white/40 leading-snug mt-0.5">{node.description}</p>
                            )}
                            {(node.prerequisiteTempIds || []).length > 1 && (
                                <p className="text-[10px] text-rose-500 dark:text-rose-300 mt-1">
                                    需完成 {node.prerequisiteTempIds?.length} 个前置节点后解锁
                                </p>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            <div className="px-4 py-3 border-t border-violet-200 dark:border-violet-500/30 bg-violet-50/50 dark:bg-violet-900/10 space-y-2">
                <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={onConfirm}
                    disabled={isConfirming}
                    className="w-full py-2 rounded-lg bg-gradient-to-r from-violet-500 to-blue-600 text-white text-sm font-black tracking-widest shadow disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                    {isConfirming ? (
                        <>
                            <FaSpinner className="animate-spin text-xs" />
                            创建中...
                        </>
                    ) : (
                        <>
                            <FaCheckCircle className="text-xs" />
                            确认创建
                        </>
                    )}
                </motion.button>

                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={otherInput}
                        onChange={(event) => setOtherInput(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && handleOtherSend()}
                        placeholder="其他要求，比如“增加复习节点”..."
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

export default ProposalPreview;
