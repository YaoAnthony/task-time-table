import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mission, StoreProduct } from '../../../../Types/System';
import { FaPlay, FaCheck, FaTimes, FaRedo, FaGift, FaMapMarkerAlt, FaLock, FaQuestion } from 'react-icons/fa';
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
    isRestarting
}) => {
    // 根据itemKey查找物品详细信息
    const findItemByKey = (itemKey: string): StoreProduct | undefined => {
        return storeProducts.find(product => product._id === itemKey);
    };

    if (!mission) {
        return (
            <div className="h-full w-full flex items-center justify-center text-neutral-400 dark:text-white/30">
                <div className="text-center">
                    <FaMapMarkerAlt className="text-6xl mb-4 mx-auto opacity-20" />
                    <p className="text-lg font-bold tracking-widest">请在左侧选择一份委托</p>
                </div>
            </div>
        );
    }

    const { listType, title, description, accepted, nodes = [], image } = mission;
    const isUrgent = listType === 'urgent';

    // "做完一个才会显示下一个": Filter nodes to only show actionable or currently active ones.
    const activeNodes = nodes.filter(n => !n.completed && (n.isActive || n.failed || n.canStart || n.canRestart));
    const isFullyCompleted = accepted && nodes.length > 0 && nodes.every(n => n.completed);
    return (
        <div className="relative h-full w-full flex flex-col bg-white/50 dark:bg-black/30 rounded-2xl overflow-hidden border border-white/50 dark:border-white/10 shadow-sm group backdrop-blur-[2px]">
            
            {/* Background flourish */}
            <div className={`absolute top-0 right-0 w-96 h-96 blur-3xl rounded-full -mr-32 -mt-32 pointer-events-none transition-colors duration-700 opacity-20 z-0 ${
                isUrgent ? 'bg-red-500' : 'bg-amber-400 dark:bg-amber-600'
            }`} />

            {/* Header Section */}
            <div className="relative border-b border-black/5 dark:border-white/10 z-10 overflow-hidden min-h-[180px] flex flex-col justify-end bg-gradient-to-b from-black/5 to-transparent dark:from-white/5">
                {/* Header Elegant Image Overlay */}
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
                        {/* Left-to-right mask to keep text legible */}
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
                            {isUrgent ? '魔神任务' : '传说任务'} {/* Borrowing Genshin terms loosely, or stick to 紧急/常规 */}
                        </span>
                        <span className="text-xs font-bold text-neutral-500 dark:text-white/40 tracking-widest flex items-center gap-1 drop-shadow-sm">
                            <FaMapMarkerAlt /> 任务追踪
                        </span>
                    </div>
                    <h2 className="text-3xl font-black text-neutral-800 dark:text-white tracking-wider mb-3 drop-shadow-md">
                        {title}
                    </h2>
                    <p className="text-sm font-medium text-neutral-700 dark:text-white/70 leading-relaxed max-w-2xl drop-shadow-sm">
                        {description || '当前使命节点没有额外的情报描述。'}
                    </p>
                </div>
            </div>

            {/* Content Section (Active Objectives) */}
            <div className="flex-1 overflow-y-auto p-8 z-10">
                <AnimatePresence mode="wait">
                    {!accepted ? (
                        <motion.div 
                            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                            className="flex flex-col items-center justify-center p-12 bg-black/5 dark:bg-white/5 rounded-2xl border border-dashed border-black/10 dark:border-white/10"
                        >
                            <FaLock className="text-4xl text-neutral-400 dark:text-white/30 mb-4" />
                            <p className="text-sm font-bold text-neutral-500 dark:text-white/50 tracking-widest mb-6 px-10 text-center">
                                任务处于锁定状态，前方充满未知变量。<br/>是否接取此委托并开始同步世界线？
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
                                接受委托
                            </motion.button>
                        </motion.div>
                    ) : isFullyCompleted ? (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                            className="flex flex-col items-center justify-center p-12 text-neutral-500 dark:text-amber-500/50"
                        >
                            <FaCheck className="text-6xl mb-4 opacity-50 drop-shadow-md" />
                            <p className="text-xl font-black tracking-widest">委托已完成</p>
                            <p className="text-sm font-bold opacity-60 mt-2">所有的因果线均已平息</p>
                        </motion.div>
                    ) : activeNodes.length === 0 ? (
                        <div className="text-center py-10 opacity-50">
                            <p className="text-sm font-bold tracking-widest">未完待续...</p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {activeNodes.map((node) => (
                                <motion.div 
                                    key={node.nodeId}
                                    initial={{ opacity: 0, x: -20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="bg-white/60 dark:bg-black/40 border-l-4 border-amber-400 dark:border-amber-500 rounded-r-xl p-6 shadow-sm"
                                >
                                    <div className="flex items-center justify-between gap-4 mb-3">
                                        <h3 className="text-lg font-bold text-neutral-800 dark:text-white flex items-center gap-2">
                                            <FaPlay className="text-[10px] text-amber-500" />
                                            {node.title}
                                        </h3>
                                        <span className="text-[10px] font-bold text-neutral-500 dark:text-white/50 tracking-widest uppercase bg-black/5 dark:bg-white/10 px-2 py-0.5 rounded">
                                            {node.timeCostMinutes} min
                                        </span>
                                    </div>
                                    <p className="text-sm text-neutral-600 dark:text-white/70 leading-relaxed mb-6">
                                        {node.description || node.content || '跟随指示完成该阶段目标...'}
                                    </p>

                                    {node.rewards && ((node.rewards.coins ?? 0) > 0 || (node.rewards.experience && node.rewards.experience.length > 0) || (node.rewards.items && node.rewards.items.length > 0)) && (
                                        <div className="mb-6 flex flex-col gap-2">
                                            <p className="text-[11px] font-bold text-neutral-500 dark:text-white/40 tracking-widest flex items-center gap-1">
                                                <FaGift className="text-amber-500" />
                                                达成奖励
                                            </p>
                                            <div className="flex gap-4 overflow-x-auto pb-2 pt-2 px-1 -mx-1 scrollbar-hide">
                                                {(node.rewards.coins ?? 0) > 0 && (
                                                    <RewardBadge 
                                                        theme="amber"
                                                        icon={<img src={goldIcon} alt="Gold Coin" className="w-full h-full object-contain drop-shadow-sm" />}
                                                        value={node.rewards.coins ?? 0}
                                                        tooltipTitle="基础金币奖励"
                                                        tooltipDesc="一定数量的游戏金币，积累后可在商城购买道具或抽取卡池"
                                                    />
                                                )}
                                                {node.rewards.experience?.map((exp, idx) => (
                                                    <RewardBadge 
                                                        key={`exp-${idx}`}
                                                        theme="purple"
                                                        label={exp.name.substring(0, 2)}
                                                        value={exp.value}
                                                        tooltipTitle={`属性经验: ${exp.name}`}
                                                        tooltipDesc={`完成目标后，你的 [${exp.name}] 属性将获得 ${exp.value} 点成长经验`}
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
                                                            icon={
                                                                itemImage ? (
                                                                    <img src={itemImage} alt={itemName} className="w-full h-full object-contain drop-shadow-sm" />
                                                                ) : (
                                                                    <FaQuestion className="text-neutral-400" />
                                                                )
                                                            }
                                                            value={`x${item.quantity}`}
                                                            tooltipTitle={`道具: ${itemName}`}
                                                            tooltipDesc={`稀有道具！数量：${item.quantity}\n稀有度：${itemData?.rarity ? itemData.rarity : '未知'}\n${itemData?.description || '(开发中: 查看背包获取更多信息)'}`}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}

                                    <div className="flex flex-wrap items-center gap-3">
                                        {!node.completed && !node.isActive && node.canStart && (
                                            <motion.button
                                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                disabled={isStarting}
                                                className="bg-blue-500 hover:bg-blue-400 text-white px-5 py-2 rounded-lg text-xs font-bold tracking-widest shadow-[0_3px_10px_rgba(59,130,246,0.3)] flex items-center gap-2 disabled:opacity-50"
                                                onClick={() => handleStartTask(mission._id, node.nodeId, node.title)}
                                            >
                                                <FaPlay className="text-xs"/>  (开始任务)
                                            </motion.button>
                                        )}

                                        {node.isActive && (
                                            <>
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                    disabled={isCompleting}
                                                    className="bg-amber-400 hover:bg-amber-300 text-black px-5 py-2 rounded-lg text-xs font-black tracking-widest drop-shadow-[0_3px_10px_rgba(251,191,36,0.4)] flex items-center gap-2 disabled:opacity-50"
                                                    onClick={() => handleCompleteTask(mission._id, node.nodeId, node.title)}
                                                >
                                                    <FaCheck className="text-xs"/> 目标达成 (完成)
                                                </motion.button>
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                    disabled={isFailing}
                                                    className="bg-rose-500 hover:bg-rose-400 text-white px-5 py-2 rounded-lg text-xs font-bold tracking-widest shadow-[0_3px_10px_rgba(225,29,72,0.3)] flex items-center gap-2 disabled:opacity-50"
                                                    onClick={() => handleFailTask(mission._id, node.nodeId, node.title)}
                                                >
                                                    <FaTimes className="text-xs"/> 放弃并撤退 (失败)
                                                </motion.button>
                                            </>
                                        )}

                                        {node.failed && node.canRestart && (
                                            <motion.button
                                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                                disabled={isRestarting}
                                                className="bg-purple-500 hover:bg-purple-400 text-white px-5 py-2 rounded-lg text-xs font-bold tracking-widest shadow-[0_3px_10px_rgba(168,85,247,0.3)] flex items-center gap-2 disabled:opacity-50"
                                                onClick={() => handleRestartTask(mission._id, node.nodeId, node.title)}
                                            >
                                                <FaRedo className="text-xs"/> 重新挑战
                                            </motion.button>
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
