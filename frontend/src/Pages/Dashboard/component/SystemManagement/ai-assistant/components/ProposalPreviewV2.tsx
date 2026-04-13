import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FaCheckCircle, FaClock, FaCoins, FaSpinner } from 'react-icons/fa';
import type { ProposalNode, Proposal } from '../types';
import TaskGraphCanvas, { type TaskGraphNode } from '../../task-graph/TaskGraphCanvas';

const listTypeLabel = (value: string) => (value === 'urgent' ? 'Urgent Mission' : 'Mainline Mission');

const structureTypeLabel = (value?: string) => {
    if (value === 'branched') return 'Branched';
    if (value === 'merge') return 'Merge Flow';
    return 'Linear';
};

const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return remain > 0 ? `${hours}h ${remain}m` : `${hours}h`;
};

const buildDisplayChain = (nodes: ProposalNode[]) => {
    const roots = nodes.filter((node) => !node.parentTempId);
    const result: ProposalNode[] = [];

    const visit = (node: ProposalNode) => {
        result.push(node);
        nodes
            .filter((child) => child.parentTempId === node.tempId)
            .forEach(visit);
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

const ProposalPreviewV2: React.FC<Props> = ({ proposal, onConfirm, onOther, isConfirming }) => {
    const [otherInput, setOtherInput] = useState('');
    const chain = useMemo(() => buildDisplayChain(proposal.nodes), [proposal.nodes]);
    const graphNodes = useMemo<TaskGraphNode[]>(
        () =>
            proposal.nodes.map((node) => {
                const incomingCount = new Set([node.parentTempId, ...(node.prerequisiteTempIds || [])].filter(Boolean)).size;
                const isMergeNode = incomingCount > 1;
                const nodeKind = isMergeNode ? (incomingCount >= 3 ? 'boss' : 'milestone') : 'standard';
                return {
                    id: node.tempId,
                    parentId: node.parentTempId,
                    prerequisiteIds: node.prerequisiteTempIds || [],
                    title: node.title,
                    description: node.description,
                    timeCostMinutes: node.timeCostMinutes,
                    childrenIds: proposal.nodes
                        .filter((candidate) => candidate.parentTempId === node.tempId)
                        .map((candidate) => candidate.tempId),
                    status: 'pending',
                    badgeText: isMergeNode ? (nodeKind === 'boss' ? 'Boss Gate' : 'Pending Merge') : 'Pending',
                    isMergeNode,
                    nodeKind,
                    progressText: isMergeNode ? `Unlocks after all ${incomingCount} incoming branches are complete.` : undefined,
                    rewardHint: isMergeNode ? 'Includes merge milestone bonus.' : undefined,
                };
            }),
        [proposal.nodes],
    );
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
                    {proposal.rewardGoalSummary && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            Reward Goal
                        </span>
                    )}
                    {typeof proposal.rewardTargetCoins === 'number' && proposal.rewardTargetCoins > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300">
                            {proposal.rewardPlanningMode === 'user_specified' ? 'User Reward Target' : 'AI Reward Suggestion'}: {proposal.rewardTargetCoins} coins
                        </span>
                    )}
                    {proposal.mode === 'attach_to_existing_list' && proposal.attachTargetMissionListTitle && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                            Attach to {proposal.attachTargetMissionListTitle}
                        </span>
                    )}
                </div>
                {proposal.description && (
                    <p className="text-[11px] text-neutral-500 dark:text-white/50 leading-relaxed mt-0.5">{proposal.description}</p>
                )}
                {proposal.rewardGoalSummary && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed mt-1">
                        Desired rewards: {proposal.rewardGoalSummary}
                    </p>
                )}
                {proposal.rewardPlanningNote && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 leading-relaxed mt-1">
                        Reward plan: {proposal.rewardPlanningNote}
                    </p>
                )}
                <div className="flex items-center gap-3 mt-2 text-[11px] text-neutral-500 dark:text-white/40">
                    <span className="flex items-center gap-1">
                        <FaClock className="text-[9px]" />
                        {formatMinutes(totalMinutes)}
                    </span>
                    {totalCoins > 0 && (
                        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <FaCoins className="text-[9px]" />
                            {totalCoins} coins
                        </span>
                    )}
                    <span>{chain.length} nodes</span>
                </div>
            </div>

            <div className="px-4 py-3">
                <TaskGraphCanvas
                    nodes={graphNodes}
                    rootNodeId={graphNodes.find((node) => node.parentId === null)?.id ?? null}
                    readonly
                    compact
                    showLegend={false}
                    className="bg-transparent min-h-[360px]"
                    emptyTitle="No preview nodes generated yet."
                />
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
                            Creating...
                        </>
                    ) : (
                        <>
                            <FaCheckCircle className="text-xs" />
                            Confirm Create
                        </>
                    )}
                </motion.button>

                <div className="flex items-center gap-2">
                    <input
                        type="text"
                        value={otherInput}
                        onChange={(event) => setOtherInput(event.target.value)}
                        onKeyDown={(event) => event.key === 'Enter' && handleOtherSend()}
                        placeholder="Ask for changes, for example: split frontend into UI and API integration..."
                        className="flex-1 text-[12px] bg-white dark:bg-white/10 border border-black/10 dark:border-white/15 rounded-lg px-3 py-1.5 text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:outline-none focus:border-violet-400 transition-all"
                    />
                    <button
                        onClick={handleOtherSend}
                        disabled={!otherInput.trim()}
                        className="px-3 py-1.5 rounded-lg bg-neutral-200 dark:bg-white/10 text-neutral-600 dark:text-white/70 text-[11px] font-semibold hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors disabled:opacity-40"
                    >
                        Revise
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProposalPreviewV2;
