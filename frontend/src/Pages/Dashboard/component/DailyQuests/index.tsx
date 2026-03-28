import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import { message } from 'antd';
import { FaCoins, FaInfinity, FaSync } from 'react-icons/fa';
import { GiScrollQuill } from 'react-icons/gi';

import { RootState, AppDispatch } from '../../../../Redux/store';
import { patchWalletCoins } from '../../../../Redux/Features/profileSlice';
import {
    useGetMemberDailyQuestsQuery,
    useCompleteDailyQuestMutation,
    type UserDailyQuestStatus,
} from '../../../../api/systemRtkApi';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Derive a stable small rotation (−3…+3°) from a string id */
const getRotation = (id: string): number => {
    const sum = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return ((sum % 7) - 3);          // −3 to +3 degrees
};

/** Pin head color, cycling through 4 choices */
const PIN_COLORS = [
    { head: '#e53e3e', rim: '#c53030', shine: '#fed7d7' },   // red
    { head: '#3182ce', rim: '#2b6cb0', shine: '#bee3f8' },   // blue
    { head: '#d69e2e', rim: '#b7791f', shine: '#fefcbf' },   // gold
    { head: '#38a169', rim: '#276749', shine: '#c6f6d5' },   // green
];
const getPin = (id: string) => PIN_COLORS[id.charCodeAt(0) % PIN_COLORS.length];

// ── Ring progress SVG ─────────────────────────────────────────────────────────

const RingProgress: React.FC<{ completed: number; total: number; size?: number }> = ({
    completed, total, size = 120,
}) => {
    const r = 48;
    const circ = 2 * Math.PI * r;
    const pct  = total > 0 ? Math.min(completed / total, 1) : 0;
    const done = total > 0 && completed >= total;

    return (
        <svg width={size} height={size} viewBox="0 0 110 110">
            <defs>
                <linearGradient id="rg" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor={done ? '#48bb78' : '#ed8936'} />
                    <stop offset="100%" stopColor={done ? '#2f855a' : '#c05621'} />
                </linearGradient>
            </defs>
            {/* track */}
            <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="8" />
            {/* arc */}
            <motion.circle
                cx="55" cy="55" r={r}
                fill="none" stroke="url(#rg)" strokeWidth="8" strokeLinecap="round"
                strokeDasharray={circ}
                initial={{ strokeDashoffset: circ }}
                animate={{ strokeDashoffset: circ * (1 - pct) }}
                transition={{ duration: 1.2, ease: 'easeOut', delay: 0.1 }}
                transform="rotate(-90 55 55)"
            />
            {/* center */}
            {total === 0 ? (
                <text x="55" y="60" textAnchor="middle" fontSize="10" fill="#aaa">暂无</text>
            ) : (
                <>
                    <text x="55" y="50" textAnchor="middle" fontSize="24" fontWeight="800"
                        fill={done ? '#2f855a' : '#7b341e'} fontFamily="serif">
                        {completed}
                    </text>
                    <text x="55" y="67" textAnchor="middle" fontSize="11"
                        fill={done ? '#48bb78' : '#c05621'} fontFamily="serif">
                        / {total}
                    </text>
                </>
            )}
        </svg>
    );
};

// ── Thumbtack SVG ─────────────────────────────────────────────────────────────

const Tack: React.FC<{ color: typeof PIN_COLORS[number] }> = ({ color }) => (
    <svg width="22" height="28" viewBox="0 0 22 28" className="drop-shadow-md">
        <circle cx="11" cy="11" r="10" fill={color.head} />
        <circle cx="11" cy="11" r="10" fill="none" stroke={color.rim} strokeWidth="1.2" />
        <circle cx="8"  cy="8"  r="3.5" fill={color.shine} opacity="0.5" />
        <line   x1="11" y1="20" x2="11" y2="28" stroke={color.rim} strokeWidth="2.5" strokeLinecap="round" />
    </svg>
);

// ── Quest paper card ──────────────────────────────────────────────────────────

interface QuestCardProps {
    quest:      UserDailyQuestStatus;
    systemName: string;
    completing: string | null;
    onComplete: (questId: string) => void;
}

const QuestCard: React.FC<QuestCardProps> = ({ quest, systemName, completing, onComplete }) => {
    const isDone    = quest.completed;
    const canRepeat = quest.isUnlimited;
    const canAct    = !isDone || canRepeat;
    const isBusy    = completing === quest.questId;
    const rotation  = getRotation(quest.questId);
    const pin       = getPin(quest.questId);

    return (
        <motion.div
            layout
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22 }}
            whileHover={{ scale: 1.03, rotate: 0, zIndex: 20, transition: { duration: 0.18 } }}
            style={{ rotate: rotation, originX: '50%', originY: '0%' }}
            className="relative"
        >
            {/* Tack */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 pointer-events-none">
                <Tack color={pin} />
            </div>

            {/* Paper */}
            <div
                className={`relative overflow-hidden rounded-[2px] px-4 pt-7 pb-5 transition-all duration-300 ${
                    isDone
                        ? 'opacity-65 saturate-50'
                        : 'shadow-[3px_6px_22px_rgba(0,0,0,0.32),0_1px_3px_rgba(0,0,0,0.18)]'
                }`}
                style={{
                    background: isDone
                        ? 'linear-gradient(160deg,#e8dfce,#d9cebc)'
                        : 'linear-gradient(160deg,#fdf6e3,#f5ebcc)',
                    boxShadow: isDone
                        ? '2px 4px 14px rgba(0,0,0,0.22)'
                        : '3px 6px 22px rgba(0,0,0,0.32), 0 1px 3px rgba(0,0,0,0.18)',
                    border: '1px solid rgba(180,140,80,0.25)',
                }}
            >
                {/* Lined paper effect */}
                <div className="absolute inset-0 pointer-events-none"
                    style={{
                        backgroundImage: 'repeating-linear-gradient(transparent, transparent 23px, rgba(180,140,60,0.12) 23px, rgba(180,140,60,0.12) 24px)',
                        backgroundPositionY: '28px',
                    }}
                />
                {/* Left margin line */}
                <div className="absolute top-0 bottom-0 left-8 w-px bg-red-300/30 pointer-events-none" />

                {/* System label (top-right corner) */}
                <div className="absolute top-2 right-3 text-[9px] font-bold tracking-widest uppercase text-amber-800/50"
                    style={{ fontFamily: 'serif' }}>
                    {systemName}
                </div>

                {/* Content */}
                <div className="relative z-10 space-y-2 pl-2">
                    {/* Title */}
                    <h3
                        className={`font-bold text-[15px] leading-snug tracking-wide ${
                            isDone ? 'line-through text-stone-500' : 'text-stone-800'
                        }`}
                        style={{ fontFamily: 'serif' }}
                    >
                        {quest.title}
                    </h3>

                    {/* Description */}
                    {quest.description && (
                        <p className="text-[11px] text-stone-600 leading-relaxed line-clamp-2"
                            style={{ fontFamily: 'serif' }}>
                            {quest.description}
                        </p>
                    )}

                    {/* Badges row */}
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                        {(quest.rewards?.coins || 0) > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-100/80 border border-amber-300/60 rounded px-2 py-0.5">
                                <FaCoins className="text-[9px] text-amber-500" />
                                {quest.rewards.coins}
                            </span>
                        )}
                        {quest.isUnlimited && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-100/80 border border-indigo-300/40 rounded px-2 py-0.5">
                                <FaInfinity className="text-[8px]" /> 无限
                            </span>
                        )}
                        {!quest.isUnlimited && quest.maxCompletions > 1 && (
                            <span className="text-[10px] text-stone-500">
                                {quest.completedCount}/{quest.maxCompletions}次
                            </span>
                        )}
                        {quest.isUnlimited && quest.completedCount > 0 && (
                            <span className="text-[10px] text-stone-500">×{quest.completedCount}</span>
                        )}
                    </div>

                    {/* Complete button */}
                    {canAct && (
                        <motion.button
                            whileTap={{ scale: 0.9 }}
                            disabled={isBusy}
                            onClick={() => onComplete(quest.questId)}
                            className={`mt-1 w-full py-1.5 text-[12px] font-black tracking-widest rounded-sm border transition-all disabled:opacity-50 ${
                                isDone
                                    ? 'border-indigo-400/50 text-indigo-700 bg-indigo-50/80 hover:bg-indigo-100/80'
                                    : 'border-amber-600/60 text-amber-900 bg-amber-200/70 hover:bg-amber-300/70'
                            }`}
                            style={{ fontFamily: 'serif' }}
                        >
                            {isBusy ? '...' : isDone ? '再次完成' : '✓ 接受奖励'}
                        </motion.button>
                    )}
                </div>

                {/* DONE stamp overlay */}
                <AnimatePresence>
                    {isDone && !canRepeat && (
                        <motion.div
                            initial={{ opacity: 0, scale: 1.4 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                        >
                            <div
                                className="text-[22px] font-black tracking-widest border-4 border-red-500/50 text-red-500/55 px-3 py-1 rounded"
                                style={{ fontFamily: 'serif', transform: 'rotate(-18deg)' }}
                            >
                                已完成
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </motion.div>
    );
};

// ── Per-system section ────────────────────────────────────────────────────────

interface SystemSectionProps {
    systemId:      string;
    systemName:    string;
    onCountUpdate: (id: string, completed: number, total: number) => void;
}

const SystemSection: React.FC<SystemSectionProps> = ({ systemId, systemName, onCountUpdate }) => {
    const { data, isLoading, refetch } = useGetMemberDailyQuestsQuery({ systemId });
    const [completeQuest] = useCompleteDailyQuestMutation();
    const [completing, setCompleting] = useState<string | null>(null);
    const dispatch = useDispatch<AppDispatch>();
    const currentCoins = useSelector((state: RootState) => state.profile.profile?.wallet?.coins ?? 0);

    const quests: UserDailyQuestStatus[] = data?.quests || [];
    const message_ = data?.message;

    React.useEffect(() => {
        if (data) {
            const q = data.quests || [];
            onCountUpdate(systemId, q.filter(x => x.completed).length, q.length);
        }
    }, [data, systemId, onCountUpdate]);

    const handleComplete = async (questId: string) => {
        setCompleting(questId);
        try {
            const result = await completeQuest({ systemId, questId }).unwrap();
            const rewards = result.rewards as { coins?: number };
            if (rewards?.coins) {
                dispatch(patchWalletCoins(currentCoins + rewards.coins));
                message.success(`完成！获得 🪙 ${rewards.coins} 金币`);
            } else {
                message.success('任务完成！');
            }
            refetch();
        } catch (err: unknown) {
            const e = err as { data?: { message?: string } };
            message.error(e?.data?.message || '完成失败');
        } finally {
            setCompleting(null);
        }
    };

    const completedCount = quests.filter(q => q.completed).length;

    return (
        <div className="mb-10">
            {/* Section header */}
            <div className="flex items-center justify-between mb-5 px-1">
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg shadow-sm bg-gradient-to-r from-amber-100 to-amber-200 border border-amber-300 dark:from-amber-900/50 dark:to-amber-800/40 dark:border-amber-700/50">
                        <GiScrollQuill className="text-amber-600 dark:text-amber-400 text-sm" />
                        <span className="text-amber-900 dark:text-amber-200 font-black tracking-widest text-sm"
                            style={{ fontFamily: 'serif' }}>
                            {systemName}
                        </span>
                        {quests.length > 0 && (
                            <span className={`ml-1 text-xs font-bold px-2 py-0.5 rounded-full border ${
                                completedCount === quests.length
                                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 border-green-300 dark:border-green-700'
                                    : 'bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700/50'
                            }`}>
                                {completedCount}/{quests.length}
                            </span>
                        )}
                    </div>
                </div>
                <button
                    onClick={() => refetch()}
                    className="p-1.5 text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 transition-colors"
                >
                    <FaSync className={`text-xs ${isLoading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            {/* Quest paper grid */}
            {isLoading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 px-2">
                    {[1, 2, 3].map(i => (
                        <div key={i}
                            className="h-40 rounded-sm animate-pulse bg-amber-100/60 dark:bg-amber-900/20"
                        />
                    ))}
                </div>
            ) : message_ ? (
                <p className="text-stone-400 dark:text-amber-800 text-xs tracking-widest text-center py-6"
                    style={{ fontFamily: 'serif' }}>{message_}</p>
            ) : quests.length === 0 ? (
                <p className="text-stone-400 dark:text-amber-800 text-xs tracking-widest text-center py-6"
                    style={{ fontFamily: 'serif' }}>今日暂无委托</p>
            ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-6 px-2">
                    {quests.map(quest => (
                        <QuestCard
                            key={quest.questId}
                            quest={quest}
                            systemName={systemName}
                            completing={completing}
                            onComplete={handleComplete}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

// ── Main page ─────────────────────────────────────────────────────────────────

const DailyQuests: React.FC = () => {
    const systems = useSelector((state: RootState) => state.system.systems);
    const profile = useSelector((state: RootState) => state.profile.profile);
    const [systemCounts, setSystemCounts] =
        useState<Record<string, { completed: number; total: number }>>({});

    const joinedSystems = systems.filter(sys => sys._id && sys.profile !== profile?._id);

    const onCountUpdate = useCallback((id: string, completed: number, total: number) => {
        setSystemCounts(prev => {
            if (prev[id]?.completed === completed && prev[id]?.total === total) return prev;
            return { ...prev, [id]: { completed, total } };
        });
    }, []);

    const totalCompleted = Object.values(systemCounts).reduce((s, c) => s + c.completed, 0);
    const totalQuests    = Object.values(systemCounts).reduce((s, c) => s + c.total,    0);
    const allDone        = totalQuests > 0 && totalCompleted >= totalQuests;

    const todayStr = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    })();

    return (
        <section className="w-full h-[85vh] flex flex-col rounded-2xl overflow-hidden font-sans select-none border border-amber-200/60 dark:border-amber-900/40 bg-[#faf6ef] dark:bg-[#1c1508]">

            {/* ── Top overview banner ── */}
            <div className="shrink-0 flex items-center gap-6 px-7 py-5 border-b border-amber-200/60 dark:border-amber-900/40 bg-gradient-to-r from-[#fff9ee] to-[#fdf3de] dark:from-[#241c0a] dark:to-[#1c1508]">
                {/* Ring */}
                <div className="shrink-0">
                    <RingProgress completed={totalCompleted} total={totalQuests} size={110} />
                </div>

                {/* Divider */}
                <div className="w-px self-stretch bg-gradient-to-b from-transparent via-amber-300/50 dark:via-amber-700/40 to-transparent" />

                {/* Stats */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <GiScrollQuill className="text-amber-500 dark:text-amber-400 text-lg" />
                        <h1 className="text-lg font-black tracking-widest text-stone-800 dark:text-amber-100"
                            style={{ fontFamily: 'serif' }}>
                            每日委托
                        </h1>
                    </div>
                    <p className="text-xs text-stone-400 dark:text-amber-700 tracking-wider mb-3"
                        style={{ fontFamily: 'serif' }}>
                        {todayStr} · 每天刷新
                    </p>

                    {joinedSystems.length > 0 && totalQuests > 0 && (
                        <>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className={`text-2xl font-black ${allDone ? 'text-green-600 dark:text-green-400' : 'text-amber-700 dark:text-amber-400'}`}
                                    style={{ fontFamily: 'serif' }}>
                                    {totalCompleted}
                                </span>
                                <span className="text-sm text-stone-400 dark:text-amber-800" style={{ fontFamily: 'serif' }}>
                                    / {totalQuests} 项委托
                                </span>
                                {allDone && (
                                    <motion.span
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="text-[11px] font-black tracking-widest px-2.5 py-1 rounded-md border border-green-300 dark:border-green-700 bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-400"
                                        style={{ fontFamily: 'serif' }}
                                    >
                                        全部完成 ✓
                                    </motion.span>
                                )}
                            </div>
                            {/* Progress bar */}
                            <div className="h-1.5 w-48 rounded-full overflow-hidden bg-stone-200 dark:bg-amber-900/40">
                                <motion.div
                                    className={`h-full rounded-full ${allDone ? 'bg-gradient-to-r from-green-400 to-green-600' : 'bg-gradient-to-r from-amber-400 to-orange-500'}`}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${totalQuests > 0 ? (totalCompleted / totalQuests) * 100 : 0}%` }}
                                    transition={{ duration: 1, ease: 'easeOut' }}
                                />
                            </div>
                        </>
                    )}

                    {joinedSystems.length === 0 && (
                        <p className="text-sm text-stone-400 dark:text-amber-800" style={{ fontFamily: 'serif' }}>
                            加入公会后这里会出现委托
                        </p>
                    )}
                </div>
            </div>

            {/* ── Board area ── */}
            <div className="flex-1 overflow-y-auto px-7 pt-7 pb-6 bg-[#f5ede0] dark:bg-[#181007]"
                style={{
                    backgroundImage: 'radial-gradient(ellipse at 10% 30%, rgba(245,210,140,0.18) 0%, transparent 50%), radial-gradient(ellipse at 90% 80%, rgba(220,185,120,0.12) 0%, transparent 50%)',
                }}
            >
                {joinedSystems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-stone-400 dark:text-amber-900">
                        <GiScrollQuill className="text-5xl opacity-20" />
                        <p className="text-sm tracking-widest" style={{ fontFamily: 'serif' }}>
                            公告栏空空如也
                        </p>
                    </div>
                ) : (
                    joinedSystems.map(sys => (
                        <SystemSection
                            key={sys._id}
                            systemId={sys._id}
                            systemName={sys.name}
                            onCountUpdate={onCountUpdate}
                        />
                    ))
                )}
            </div>
        </section>
    );
};

export default DailyQuests;
