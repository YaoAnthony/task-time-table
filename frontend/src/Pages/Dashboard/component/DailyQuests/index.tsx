import React, { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import { message } from 'antd';
import { FaInfinity, FaSync, FaScroll } from 'react-icons/fa';

import { RootState, AppDispatch } from '../../../../Redux/store';
import { patchWalletCoins } from '../../../../Redux/Features/profileSlice';
import {
    useGetMemberDailyQuestsQuery,
    useCompleteDailyQuestMutation,
    type UserDailyQuestStatus,
} from '../../../../api/systemRtkApi';

// ── Pixel progress bar ────────────────────────────────────────────────────────
const PixelProgress: React.FC<{ completed: number; total: number }> = ({ completed, total }) => {
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
    const allDone = total > 0 && completed >= total;
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {/* Block bar */}
            <div style={{
                flex: 1,
                height: '10px',
                background: 'var(--px-surface2)',
                border: '2px solid var(--px-border)',
                position: 'relative',
                overflow: 'hidden',
            }}>
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    style={{
                        height: '100%',
                        background: allDone ? '#22c55e' : 'var(--px-gold)',
                        imageRendering: 'pixelated',
                    }}
                />
            </div>
            <span style={{
                fontFamily: 'monospace',
                fontSize: '12px',
                fontWeight: 800,
                color: allDone ? '#22c55e' : 'var(--px-gold)',
                minWidth: '48px',
                textAlign: 'right',
            }}>
                {completed}/{total}
            </span>
        </div>
    );
};

// ── Quest card (pixel RPG style) ──────────────────────────────────────────────
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

    return (
        <div style={{
            background: isDone ? 'var(--px-surface)' : 'var(--px-surface2)',
            border: `2px solid ${isDone ? 'var(--px-border)' : 'var(--px-border-gold)'}`,
            padding: '14px',
            position: 'relative',
            opacity: isDone && !canRepeat ? 0.55 : 1,
            transition: 'opacity 0.2s',
            boxShadow: isDone ? 'none' : 'inset 1px 1px 0 rgba(255,215,0,0.06)',
        }}>
            {/* Corner decoration */}
            {!isDone && (
                <>
                    <div style={{ position:'absolute', top:0, left:0, width:6, height:6, background:'var(--px-gold)', opacity:0.6 }} />
                    <div style={{ position:'absolute', top:0, right:0, width:6, height:6, background:'var(--px-gold)', opacity:0.6 }} />
                </>
            )}

            {/* System label */}
            <div style={{
                fontSize: '9px',
                letterSpacing: '0.15em',
                color: 'var(--px-muted)',
                marginBottom: '6px',
                textTransform: 'uppercase',
            }}>
                {systemName}
            </div>

            {/* Title */}
            <div style={{
                fontSize: '13px',
                fontWeight: 800,
                color: isDone ? 'var(--px-muted)' : 'var(--px-text)',
                marginBottom: '6px',
                textDecoration: isDone && !canRepeat ? 'line-through' : 'none',
                lineHeight: 1.4,
            }}>
                {quest.title}
            </div>

            {/* Description */}
            {quest.description && (
                <div style={{
                    fontSize: '11px',
                    color: 'var(--px-muted)',
                    marginBottom: '8px',
                    lineHeight: 1.5,
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                }}>
                    {quest.description}
                </div>
            )}

            {/* Badges */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
                {(quest.rewards?.coins || 0) > 0 && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: 'rgba(255,215,0,0.1)',
                        border: '1px solid var(--px-border-gold)',
                        color: 'var(--px-gold)',
                        fontSize: '11px', fontWeight: 700,
                        padding: '2px 7px',
                    }}>
                        🪙 {quest.rewards.coins}
                    </span>
                )}
                {quest.isUnlimited && (
                    <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                        background: 'rgba(99,102,241,0.12)',
                        border: '1px solid rgba(99,102,241,0.4)',
                        color: '#818cf8',
                        fontSize: '10px', fontWeight: 700,
                        padding: '2px 7px',
                    }}>
                        <FaInfinity style={{ fontSize: '8px' }} /> 无限
                    </span>
                )}
                {!quest.isUnlimited && quest.maxCompletions > 1 && (
                    <span style={{ fontSize: '10px', color: 'var(--px-muted)' }}>
                        {quest.completedCount}/{quest.maxCompletions}次
                    </span>
                )}
                {quest.isUnlimited && quest.completedCount > 0 && (
                    <span style={{ fontSize: '10px', color: 'var(--px-muted)' }}>
                        ×{quest.completedCount}
                    </span>
                )}
            </div>

            {/* Action button */}
            {canAct && (
                <button
                    disabled={isBusy}
                    onClick={() => onComplete(quest.questId)}
                    style={{
                        width: '100%',
                        padding: '6px 0',
                        fontSize: '12px',
                        fontWeight: 800,
                        letterSpacing: '0.05em',
                        cursor: isBusy ? 'not-allowed' : 'pointer',
                        opacity: isBusy ? 0.5 : 1,
                        background: isDone
                            ? 'rgba(99,102,241,0.15)'
                            : 'rgba(255,215,0,0.12)',
                        border: isDone
                            ? '2px solid rgba(99,102,241,0.5)'
                            : '2px solid var(--px-border-gold)',
                        color: isDone ? '#818cf8' : 'var(--px-gold)',
                        transition: 'background 0.15s',
                    }}
                >
                    {isBusy ? '...' : isDone ? '再次完成' : '✓ 接受奖励'}
                </button>
            )}

            {/* DONE stamp */}
            <AnimatePresence>
                {isDone && !canRepeat && (
                    <motion.div
                        initial={{ opacity: 0, scale: 1.3 }}
                        animate={{ opacity: 1, scale: 1 }}
                        style={{
                            position: 'absolute', inset: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            pointerEvents: 'none',
                        }}
                    >
                        <div style={{
                            fontSize: '18px', fontWeight: 900, letterSpacing: '0.2em',
                            border: '3px solid rgba(239,68,68,0.45)',
                            color: 'rgba(239,68,68,0.45)',
                            padding: '4px 10px',
                            transform: 'rotate(-15deg)',
                            fontFamily: 'monospace',
                        }}>
                            DONE
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
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
        <div style={{ marginBottom: '32px' }}>
            {/* Section header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '14px',
                paddingBottom: '8px',
                borderBottom: '1px solid var(--px-border)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FaScroll style={{ color: 'var(--px-gold)', fontSize: '12px' }} />
                    <span style={{
                        fontSize: '13px', fontWeight: 800,
                        letterSpacing: '0.08em',
                        color: 'var(--px-text)',
                    }}>
                        {systemName}
                    </span>
                    {quests.length > 0 && (
                        <span style={{
                            fontSize: '11px', fontWeight: 700,
                            padding: '1px 8px',
                            background: completedCount === quests.length
                                ? 'rgba(34,197,94,0.12)'
                                : 'rgba(255,215,0,0.1)',
                            border: `1px solid ${completedCount === quests.length ? 'rgba(34,197,94,0.4)' : 'var(--px-border-gold)'}`,
                            color: completedCount === quests.length ? '#22c55e' : 'var(--px-gold)',
                        }}>
                            {completedCount}/{quests.length}
                        </span>
                    )}
                </div>
                <button
                    onClick={() => refetch()}
                    style={{
                        background: 'transparent', border: 'none', cursor: 'pointer',
                        color: 'var(--px-muted)', padding: '4px',
                    }}
                >
                    <FaSync style={{ fontSize: '11px' }} className={isLoading ? 'animate-spin' : ''} />
                </button>
            </div>

            {/* Quest grid */}
            {isLoading ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{
                            height: '120px',
                            background: 'var(--px-surface2)',
                            border: '2px solid var(--px-border)',
                            animation: 'pulse 1.5s infinite',
                        }} />
                    ))}
                </div>
            ) : message_ ? (
                <div style={{ textAlign: 'center', color: 'var(--px-muted)', fontSize: '12px', padding: '24px 0' }}>
                    {message_}
                </div>
            ) : quests.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--px-muted)', fontSize: '12px', padding: '24px 0' }}>
                    今日暂无委托
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '12px' }}>
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
    const totalQuests    = Object.values(systemCounts).reduce((s, c) => s + c.total, 0);
    const allDone        = totalQuests > 0 && totalCompleted >= totalQuests;

    const todayStr = (() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    })();

    return (
        <section style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'var(--px-bg)',
            overflow: 'hidden',
        }}>
            {/* ── HUD header ── */}
            <div style={{
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '24px',
                padding: '16px 24px',
                background: 'var(--px-surface)',
                borderBottom: '2px solid var(--px-border)',
            }}>
                {/* Icon + title */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{
                        width: '36px', height: '36px',
                        background: 'rgba(255,215,0,0.12)',
                        border: '2px solid var(--px-border-gold)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '16px',
                    }}>
                        🗓
                    </div>
                    <div>
                        <div style={{
                            fontSize: '15px', fontWeight: 900,
                            color: 'var(--px-gold)', letterSpacing: '0.06em',
                        }}>
                            每日委托
                        </div>
                        <div style={{ fontSize: '10px', color: 'var(--px-muted)', letterSpacing: '0.1em', marginTop: '2px' }}>
                            {todayStr} · 每天刷新
                        </div>
                    </div>
                </div>

                {/* Divider */}
                <div style={{ width: '1px', alignSelf: 'stretch', background: 'var(--px-border)' }} />

                {/* Progress */}
                {totalQuests > 0 ? (
                    <div style={{ flex: 1, maxWidth: '360px' }}>
                        <PixelProgress completed={totalCompleted} total={totalQuests} />
                    </div>
                ) : (
                    <span style={{ fontSize: '12px', color: 'var(--px-muted)' }}>暂无委托数据</span>
                )}

                {/* All done badge */}
                {allDone && (
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        style={{
                            padding: '4px 12px',
                            background: 'rgba(34,197,94,0.12)',
                            border: '2px solid rgba(34,197,94,0.5)',
                            color: '#22c55e',
                            fontSize: '12px', fontWeight: 800,
                            letterSpacing: '0.05em',
                        }}
                    >
                        ✓ 全部完成
                    </motion.div>
                )}
            </div>

            {/* ── Quest board ── */}
            <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '20px 24px',
            }}>
                {joinedSystems.length === 0 ? (
                    <div style={{
                        display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center',
                        height: '100%', gap: '12px',
                        color: 'var(--px-muted)',
                    }}>
                        <FaScroll style={{ fontSize: '40px', opacity: 0.2 }} />
                        <p style={{ fontSize: '13px', letterSpacing: '0.1em' }}>加入公会后这里会出现委托</p>
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
