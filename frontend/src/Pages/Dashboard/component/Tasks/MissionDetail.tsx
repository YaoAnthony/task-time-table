import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mission, StoreProduct } from '../../../../Types/System';
import { FaPlay, FaCheck, FaTimes, FaRedo, FaGift, FaMapMarkerAlt, FaLock, FaQuestion, FaCrown, FaLink, FaStar } from 'react-icons/fa';
import { goldIcon } from '../../../../assets';
import RewardBadge from '../../../../Component/RewardBadge';

interface MissionDetailProps {
    mission: Mission | null;
    storeProducts: StoreProduct[];
    handleAcceptMissionList: (missionListId: string, title: string) => void;
    handleStartTask: (missionListId: string, nodeId: string, title: string) => void;
    handleCompleteTask: (missionListId: string, nodeId: string, title: string) => void;
    handleFailTask: (missionListId: string, nodeId: string, title: string) => void;
    handleRestartTask: (missionListId: string, nodeId: string, title: string) => void;
    isAccepting: boolean;
    isCompleting: boolean;
    isFailing: boolean;
    isStarting: boolean;
    isRestarting: boolean;
}

const MissionDetail: React.FC<MissionDetailProps> = ({
    mission,
    storeProducts,
    handleAcceptMissionList,
    handleStartTask,
    handleCompleteTask,
    handleFailTask,
    handleRestartTask,
    isAccepting,
    isCompleting,
    isFailing,
    isStarting,
    isRestarting,
}) => {
    const findItemByKey = (itemKey: string): StoreProduct | undefined => {
        return storeProducts.find((product) => product._id === itemKey);
    };

    if (!mission) {
        return (
            <div className="h-full w-full flex items-center justify-center text-neutral-400 dark:text-white/30">
                <div className="text-center">
                    <FaMapMarkerAlt className="text-6xl mb-4 mx-auto opacity-20" />
                    <p className="text-lg font-bold tracking-widest">请先选择一个委托</p>
                </div>
            </div>
        );
    }

    const { listType, title, description, accepted, nodes = [], image } = mission;
    const isUrgent = listType === 'urgent';
    const visibleNodes = nodes.filter((node) => !node.completed);
    const nodeTitleMap = new Map(nodes.map((node) => [node.nodeId, node.title]));
    const isFullyCompleted = accepted && nodes.length > 0 && nodes.every((node) => node.completed);

    const jumpToNode = (nodeId: string) => {
        const target = document.getElementById(`mission-node-${nodeId}`);
        target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };

    return (
        <div className="relative h-full w-full flex flex-col bg-white/50 dark:bg-black/30 rounded-2xl overflow-hidden border border-white/50 dark:border-white/10 shadow-sm group backdrop-blur-[2px]">
            <div className={`absolute top-0 right-0 w-96 h-96 blur-3xl rounded-full -mr-32 -mt-32 pointer-events-none transition-colors duration-700 opacity-20 z-0 ${
                isUrgent ? 'bg-red-500' : 'bg-amber-400 dark:bg-amber-600'
            }`} />

            <div className="relative border-b border-black/5 dark:border-white/10 z-10 overflow-hidden min-h-[180px] flex flex-col justify-end bg-gradient-to-b from-black/5 to-transparent dark:from-white/5">
                {image && (
                    <>
                        <div
                            className="absolute inset-0 z-0 opacity-90 transition-transform duration-1000 ease-out group-hover:scale-105"
                            style={{
                                backgroundImage: `url(${image})`,
                                backgroundSize: 'cover',
                                backgroundPosition: 'center',
                                maskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
                                WebkitMaskImage: 'linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0) 100%)',
                            }}
                        />
                        <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/40 to-transparent dark:from-black/90 dark:via-black/40 dark:to-transparent z-0" />
                    </>
                )}

                <div className="relative z-10 px-8 pt-8 pb-6">
                    <div className="flex items-center gap-3 mb-2">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded border flex items-center gap-1.5 ${
                            isUrgent
                                ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300 border-red-200 dark:border-red-500/30'
                                : 'bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-200 dark:border-amber-500/30'
                        }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${isUrgent ? 'bg-red-500 animate-pulse' : 'bg-amber-500'}`} />
                            {isUrgent ? '紧急委托' : '主线委托'}
                        </span>
                        <span className="text-xs font-bold text-neutral-500 dark:text-white/40 tracking-widest flex items-center gap-1 drop-shadow-sm">
                            <FaMapMarkerAlt /> 委托追踪
                        </span>
                    </div>
                    <h2 className="text-3xl font-black text-neutral-800 dark:text-white tracking-wider mb-3 drop-shadow-md">{title}</h2>
                    <p className="text-sm font-medium text-neutral-700 dark:text-white/70 leading-relaxed max-w-2xl drop-shadow-sm">
                        {description || '当前委托还没有更多说明。'}
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 z-10">
                <AnimatePresence mode="wait">
                    {!accepted ? (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="flex flex-col items-center justify-center p-12 bg-black/5 dark:bg-white/5 rounded-2xl border border-dashed border-black/10 dark:border-white/10"
                        >
                            <FaLock className="text-4xl text-neutral-400 dark:text-white/30 mb-4" />
                            <p className="text-sm font-bold text-neutral-500 dark:text-white/50 tracking-widest mb-6 px-10 text-center">
                                你目前尚未接取该委托，接取后才能开始推进其中的任务节点。
                            </p>
                            <motion.button
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                disabled={isAccepting}
                                className={`px-8 py-3 rounded-xl text-sm font-black tracking-widest shadow-lg transition-all disabled:opacity-50 text-white ${
                                    isUrgent
                                        ? 'bg-gradient-to-r from-red-500 to-rose-600 shadow-red-500/30'
                                        : 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-amber-500/30'
                                }`}
                                onClick={() => handleAcceptMissionList(mission._id, mission.title)}
                            >
                                接取委托
                            </motion.button>
                        </motion.div>
                    ) : isFullyCompleted ? (
                        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="flex flex-col items-center justify-center p-12 text-neutral-500 dark:text-amber-500/50">
                            <FaCheck className="text-6xl mb-4 opacity-50 drop-shadow-md" />
                            <p className="text-xl font-black tracking-widest">委托已完成</p>
                            <p className="text-sm font-bold opacity-60 mt-2">这条任务线已经全部推进完成。</p>
                        </motion.div>
                    ) : visibleNodes.length === 0 ? (
                        <div className="text-center py-10 opacity-50">
                            <p className="text-sm font-bold tracking-widest">暂无未完成节点</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {visibleNodes.map((node) => (
                                <motion.div
                                    key={node.nodeId}
                                    id={`mission-node-${node.nodeId}`}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className={`bg-white/60 dark:bg-black/40 border-l-4 rounded-r-xl p-6 shadow-sm ${node.isLocked ? 'border-slate-400 dark:border-slate-500' : 'border-amber-400 dark:border-amber-500'}`}
                                >
                                    <div className="flex items-center justify-between gap-4 mb-3">
                                        <h3 className="text-lg font-bold text-neutral-800 dark:text-white flex items-center gap-2">
                                            {node.isLocked ? <FaLock className="text-[10px] text-slate-500" /> : <FaPlay className="text-[10px] text-amber-500" />}
                                            {node.title}
                                        </h3>
                                        <div className="flex items-center gap-2 flex-wrap justify-end">
                                            {node.isMergeNode && (
                                                <span className={`text-[10px] font-black tracking-widest uppercase px-2 py-0.5 rounded flex items-center gap-1 ${
                                                    node.mergeTier === 'boss'
                                                        ? 'bg-fuchsia-100 dark:bg-fuchsia-500/20 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-300 dark:border-fuchsia-500/30'
                                                        : 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30'
                                                }`}>
                                                    {node.mergeTier === 'boss' ? <FaCrown className="text-[10px]" /> : <FaStar className="text-[10px]" />}
                                                    {node.mergeTier === 'boss' ? 'Boss 节点' : '里程碑节点'}
                                                </span>
                                            )}
                                            <span className="text-[10px] font-bold text-neutral-500 dark:text-white/50 tracking-widest uppercase bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded">
                                                {node.timeCostMinutes} min
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-sm text-neutral-600 dark:text-white/70 leading-relaxed mb-6">
                                        {node.description || node.content || '暂无描述，你可以将它视作这一阶段的目标。'}
                                    </p>

                                    {node.isLocked && (
                                        <div className="mb-6 rounded-xl border border-slate-300/70 dark:border-slate-600 bg-slate-100/70 dark:bg-slate-900/30 px-4 py-3">
                                            <p className="text-xs font-black tracking-widest text-slate-600 dark:text-slate-300 mb-2">
                                                该节点暂未解锁，需要先完成以下前置条件
                                            </p>
                                            {node.isMergeNode && (
                                                <div className="mb-3 rounded-lg border border-amber-300/60 dark:border-amber-500/30 bg-amber-50/80 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-200">
                                                    <div className="flex items-center gap-2 font-black tracking-widest mb-1">
                                                        <FaLink className="text-[11px]" />
                                                        合流解锁条件
                                                    </div>
                                                    <div>
                                                        当前进度 {node.completedPrerequisiteCount || 0}/{node.totalPrerequisiteCount || 0}
                                                        {node.completedPrerequisiteTitles && node.completedPrerequisiteTitles.length > 0 ? `：${node.completedPrerequisiteTitles.join('、')}` : ''}
                                                    </div>
                                                    <div className="mt-1">
                                                        仍需完成 {node.remainingPrerequisiteCount || 0} 项：{(node.blockedByTitles || []).join('、')}
                                                    </div>
                                                </div>
                                            )}
                                            <div className="flex flex-wrap gap-2">
                                                {(node.blockedByNodeIds || []).map((blockedNodeId, index) => (
                                                    <button
                                                        key={blockedNodeId}
                                                        onClick={() => jumpToNode(blockedNodeId)}
                                                        className="text-xs px-2.5 py-1 rounded-lg bg-white dark:bg-white/10 border border-slate-300 dark:border-slate-500 text-slate-700 dark:text-slate-200 hover:border-amber-400 dark:hover:border-amber-400 transition-colors"
                                                    >
                                                        {(node.blockedByTitles && node.blockedByTitles[index]) || nodeTitleMap.get(blockedNodeId) || blockedNodeId}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {!node.isLocked && node.isMergeNode && (
                                        <div className={`mb-6 rounded-xl px-4 py-3 border ${
                                            node.mergeTier === 'boss'
                                                ? 'border-fuchsia-300/70 dark:border-fuchsia-500/30 bg-fuchsia-50/70 dark:bg-fuchsia-500/10'
                                                : 'border-amber-300/70 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10'
                                        }`}>
                                            <div className={`text-xs font-black tracking-widest mb-2 flex items-center gap-2 ${
                                                node.mergeTier === 'boss' ? 'text-fuchsia-700 dark:text-fuchsia-200' : 'text-amber-700 dark:text-amber-200'
                                            }`}>
                                                {node.mergeTier === 'boss' ? <FaCrown /> : <FaStar />}
                                                {node.mergeTier === 'boss' ? 'Boss 合流节点已解锁' : '里程碑节点已解锁'}
                                            </div>
                                            <p className="text-xs text-neutral-600 dark:text-white/70 leading-relaxed">
                                                这是一个合流节点，需要前置分支全部完成后才会解锁。你已经抵达关键进度，可以继续向更高阶段推进了。
                                            </p>
                                        </div>
                                    )}

                                    {node.rewards && ((node.rewards.coins ?? 0) > 0 || (node.rewards.experience && node.rewards.experience.length > 0) || (node.rewards.items && node.rewards.items.length > 0)) && (
                                        <div className="mb-6 flex flex-col gap-2">
                                            <p className="text-[11px] font-bold text-neutral-500 dark:text-white/40 tracking-widest flex items-center gap-1">
                                                <FaGift className="text-amber-500" />
                                                完成奖励
                                            </p>
                                            <div className="flex gap-4 overflow-x-auto pb-2 pt-2 px-1 -mx-1 scrollbar-hide">
                                                {(node.rewards.coins ?? 0) > 0 && (
                                                    <RewardBadge
                                                        theme="amber"
                                                        icon={<img src={goldIcon} alt="Gold Coin" className="w-full h-full object-contain drop-shadow-sm" />}
                                                        value={node.rewards.coins ?? 0}
                                                        tooltipTitle="金币奖励"
                                                        tooltipDesc="完成该节点后可获得的金币奖励。"
                                                    />
                                                )}
                                                {node.rewards.experience?.map((exp, idx) => (
                                                    <RewardBadge
                                                        key={`exp-${idx}`}
                                                        theme="purple"
                                                        label={exp.name.substring(0, 2)}
                                                        value={exp.value}
                                                        tooltipTitle={`属性经验：${exp.name}`}
                                                        tooltipDesc={`完成该目标后可提升 ${exp.name} ${exp.value} 点成长经验。`}
                                                    />
                                                ))}
                                                {node.rewards.items?.map((item, idx) => {
                                                    const itemData = findItemByKey(item.itemKey);
                                                    const itemName = itemData?.name || item.itemKey;
                                                    const itemRarity = itemData?.rarity || 'common';
                                                    const itemImage = itemData?.image;

                                                    return (
                                                        <RewardBadge
                                                            key={`item-${idx}`}
                                                            rarity={itemRarity}
                                                            icon={itemImage ? <img src={itemImage} alt={itemName} className="w-full h-full object-contain drop-shadow-sm" /> : <FaQuestion className="text-neutral-400" />}
                                                            value={`x${item.quantity}`}
                                                            tooltipTitle={`道具：${itemName}`}
                                                            tooltipDesc={`数量：${item.quantity}\n稀有度：${itemData?.rarity || '未知'}\n${itemData?.description || '查看详情可获得更多信息。'}`}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    {node.isMergeNode && node.mergeBonusPreview && (((node.mergeBonusPreview.coins ?? 0) > 0) || (node.mergeBonusPreview.experience?.length || 0) > 0) && (
                                        <div className={`mb-6 rounded-xl px-4 py-3 border ${
                                            node.mergeTier === 'boss'
                                                ? 'border-fuchsia-300/70 dark:border-fuchsia-500/30 bg-fuchsia-50/70 dark:bg-fuchsia-500/10'
                                                : 'border-amber-300/70 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-500/10'
                                        }`}>
                                            <div className={`text-xs font-black tracking-widest mb-2 flex items-center gap-2 ${
                                                node.mergeTier === 'boss' ? 'text-fuchsia-700 dark:text-fuchsia-200' : 'text-amber-700 dark:text-amber-200'
                                            }`}>
                                                <FaGift />
                                                合流额外奖励
                                            </div>
                                            <div className="flex flex-wrap gap-3 text-xs text-neutral-700 dark:text-white/80">
                                                {(node.mergeBonusPreview.coins ?? 0) > 0 && <span>金币 +{node.mergeBonusPreview.coins}</span>}
                                                {(node.mergeBonusPreview.experience || []).map((exp, index) => (
                                                    <span key={`${exp.name}-${index}`}>{exp.name} +{exp.value}</span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-3">
                                        {!node.completed && !node.isActive && node.canStart && (
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                disabled={isStarting}
                                                className="bg-blue-500 hover:bg-blue-400 text-white px-5 py-2 rounded-lg text-xs font-bold tracking-widest shadow-[0_3px_10px_rgba(59,130,246,0.3)] flex items-center gap-2 disabled:opacity-50"
                                                onClick={() => handleStartTask(mission._id, node.nodeId, node.title)}
                                            >
                                                <FaPlay className="text-xs" /> 开始任务
                                            </motion.button>
                                        )}

                                        {node.isActive && (
                                            <>
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    disabled={isCompleting}
                                                    className="bg-amber-400 hover:bg-amber-300 text-black px-5 py-2 rounded-lg text-xs font-black tracking-widest drop-shadow-[0_3px_10px_rgba(251,191,36,0.4)] flex items-center gap-2 disabled:opacity-50"
                                                    onClick={() => handleCompleteTask(mission._id, node.nodeId, node.title)}
                                                >
                                                    <FaCheck className="text-xs" /> 完成任务
                                                </motion.button>
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    disabled={isFailing}
                                                    className="bg-rose-500 hover:bg-rose-400 text-white px-5 py-2 rounded-lg text-xs font-bold tracking-widest shadow-[0_3px_10px_rgba(225,29,72,0.3)] flex items-center gap-2 disabled:opacity-50"
                                                    onClick={() => handleFailTask(mission._id, node.nodeId, node.title)}
                                                >
                                                    <FaTimes className="text-xs" /> 标记失败
                                                </motion.button>
                                            </>
                                        )}

                                        {node.failed && node.canRestart && (
                                            <motion.button
                                                whileHover={{ scale: 1.05 }}
                                                whileTap={{ scale: 0.95 }}
                                                disabled={isRestarting}
                                                className="bg-purple-500 hover:bg-purple-400 text-white px-5 py-2 rounded-lg text-xs font-bold tracking-widest shadow-[0_3px_10px_rgba(168,85,247,0.3)] flex items-center gap-2 disabled:opacity-50"
                                                onClick={() => handleRestartTask(mission._id, node.nodeId, node.title)}
                                            >
                                                <FaRedo className="text-xs" /> 重新挑战
                                            </motion.button>
                                        )}

                                        {node.isLocked && (
                                            <span className="text-xs font-bold tracking-widest text-slate-500 dark:text-slate-300">
                                                等待前置任务完成后解锁
                                            </span>
                                        )}
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
};

export default MissionDetail;
