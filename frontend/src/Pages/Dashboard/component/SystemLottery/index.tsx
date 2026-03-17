import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import { FaArrowLeft, FaDice, FaScroll, FaShieldAlt, FaStar, FaGem, FaChevronLeft, FaChevronRight } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { getEnv } from '../../../../config/env';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import {
    useDrawLotteryPoolMutation,
    useGetMemberLotteryHistoryQuery,
    useGetMemberLotteryPityQuery,
    useLazyGetSystemListQuery,
} from '../../../../api/systemRtkApi';
import { useLazyGetProfileAndUserQuery } from '../../../../api/profileApi';

import { DrawResult, GenshinTier, LotteryHistoryRecord, LotteryPool, TierPity } from '../../../../Types/Lottery';
import GachaAnimation from './GachaAnimation';

// ─── Tier display meta ────────────────────────────────────────────────────────
const TIER_META = [
    { index: 0, label: '限定', color: 'text-yellow-300', bg: 'bg-yellow-500/15', border: 'border-yellow-400/30', icon: <FaStar className="text-yellow-400" /> },
    { index: 1, label: '精锐', color: 'text-purple-300', bg: 'bg-purple-500/15', border: 'border-purple-400/30', icon: <FaGem className="text-purple-400" /> },
    { index: 2, label: '普通', color: 'text-gray-400',   bg: 'bg-white/5',        border: 'border-white/10',      icon: <FaDice className="text-gray-400" /> },
];

// ─── History panel ────────────────────────────────────────────────────────────
const HistoryPanel: React.FC<{ records: LotteryHistoryRecord[] }> = ({ records }) => (
    <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1 scrollbar-hide">
        {records.length === 0 ? (
            <p className="text-xs text-white/30 text-center py-6">暂无记录</p>
        ) : records.map(r => (
            <div key={r._id} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2 border border-white/5">
                <span className={`text-xs font-bold shrink-0 ${r.won ? 'text-yellow-300' : 'text-white/30'}`}>{r.won ? '★' : '·'}</span>
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-white/70 truncate">
                        [{r.poolName}] {r.reward?.productName ? `${r.reward.productName} ×${r.reward.quantity ?? 1}` : '未获得奖励'}
                    </p>
                    <p className="text-xs text-white/30">{new Date(r.createdAt).toLocaleDateString()}</p>
                </div>
                <span className="text-xs text-white/25 shrink-0">{Number(r.randomValue).toFixed(3)}</span>
            </div>
        ))}
    </div>
);

// ─── Main component ────────────────────────────────────────────────────────────
const SystemLottery: React.FC = () => {
    const { systemId } = useParams<{ systemId: string }>();
    const navigate = useNavigate();

    const systems = useSelector((state: RootState) => state.system.systems);
    const accessToken = useSelector((state: RootState) => state.user.accessToken);
    const profile = useSelector((state: RootState) => state.profile.profile);
    const currentSystem = systems.find(s => s._id === systemId);

    const [animDraws, setAnimDraws] = useState<DrawResult[] | null>(null);
    const [poolIdx, setPoolIdx] = useState(0);
    const [showHistory, setShowHistory] = useState(false);

    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [triggerGetProfileAndUser] = useLazyGetProfileAndUserQuery();
    const [drawPool, { isLoading: isDrawing }] = useDrawLotteryPoolMutation();

    const { data: historyData, refetch: refetchHistory } = useGetMemberLotteryHistoryQuery(
        { systemId: systemId || '', limit: 50 },
        { skip: !systemId },
    );
    const { data: pityData, refetch: refetchPity } = useGetMemberLotteryPityQuery(
        { systemId: systemId || '' },
        { skip: !systemId },
    );

    useEffect(() => {
        if (systems.length === 0) triggerGetSystemList();
    }, [systems.length, triggerGetSystemList]);

    // SSE
    const { backendUrl } = getEnv();
    const sseUrl = systemId && accessToken
        ? `${backendUrl}/system/${systemId}/updates/events?token=${encodeURIComponent(accessToken)}`
        : null;

    useSSEWithReconnect({
        url: sseUrl,
        enabled: Boolean(systemId && accessToken),
        onMessage: (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (!payload?.type || payload.type === 'connected') return;
                if (payload.type?.startsWith('lottery_pool')) {
                    triggerGetSystemList();
                    refetchHistory();
                }
                if (payload.type === 'system_deleted') {
                    navigate('/dashboard/home');
                }
            } catch { /* ignore */ }
        },
    });

    if (!currentSystem) return null;

    const pools = ((currentSystem as unknown as { lotteryPools?: LotteryPool[] }).lotteryPools || []);
    const history = (historyData?.history || []) as LotteryHistoryRecord[];
    const pityCounters = pityData?.pityCounters || [];

    const safePoolIdx = Math.min(poolIdx, Math.max(0, pools.length - 1));
    const pool = pools[safePoolIdx] || null;


    // Pity helpers
    const getSimplePity = (poolId: string) => pityCounters.find(c => c.poolId === poolId)?.pullCount ?? 0;
    const getTierPity = (poolId: string, tierIndex: number): TierPity | undefined => {
        const c = pityCounters.find(x => x.poolId === poolId);
        return c?.tierPities?.find(tp => tp.tierIndex === tierIndex);
    };

    // Affordability
    const canAfford = (p: LotteryPool, count: number): boolean => {
        const q = Math.max(1, Number(p.consume?.quantity || 1)) * count;
        if (p.consume?.type === 'coins') return Number(profile?.wallet?.coins ?? 0) >= q;
        if (p.consume?.type === 'item') {
            const owned = Number((profile?.inventory || []).find(i => i.inventoryKey === p.consume?.itemKey)?.quantity || 0);
            return owned >= q;
        }
        return true;
    };

    const consumeLabel = (p: LotteryPool, count: number) => {
        const q = Math.max(1, Number(p.consume?.quantity || 1)) * count;
        if (p.consume?.type === 'coins') return `${q} 金币`;
        if (p.consume?.type === 'item') return `物品 ×${q}`;
        return '免费';
    };

    const handleDraw = async (count: 1 | 10) => {
        if (!pool || !systemId) return;
        try {
            const res = await drawPool({ systemId, poolId: pool._id, count }).unwrap();
            const draws = res.draws ?? (res.draw ? [res.draw] : []);
            if (draws.length) setAnimDraws(draws);
            else message.info('本次未获得奖励');
            await Promise.all([triggerGetSystemList().unwrap(), triggerGetProfileAndUser().unwrap()]);
            refetchHistory();
            refetchPity();
        } catch (e) {
            const err = e as { data?: { message?: string } };
            message.error(err?.data?.message || '祈愿失败');
        }
    };

    // ─── Pool info: tiers (genshin) or prizes (simple) ───────────────────────
    const renderPoolInfo = () => {
        if (!pool) return null;
        if (pool.drawMode === 'genshin') {
            const tiers = ([...(pool.genshinTiers || [])].sort((a, b) => a.tierIndex - b.tierIndex)) as GenshinTier[];
            return (
                <div className="space-y-3">
                    {tiers.map(tier => {
                        const meta = TIER_META[tier.tierIndex];
                        if (!meta) return null;
                        const tp = getTierPity(pool._id, tier.tierIndex);
                        const pityPct = tier.tierIndex < 2 && tier.hardPityLimit > 1
                            ? ((tp?.pullCount ?? 0) / tier.hardPityLimit) * 100
                            : 0;
                        const inSoftPity = (tp?.pullCount ?? 0) >= tier.softPityStart;
                        return (
                            <div key={tier.tierIndex} className={`${meta.bg} border ${meta.border} rounded-xl p-3`}>
                                <div className="flex items-center gap-2 mb-2">
                                    {meta.icon}
                                    <span className={`text-sm font-bold ${meta.color}`}>{tier.name || meta.label}</span>
                                    {tier.tierIndex < 2 && (
                                        <span className="ml-auto text-xs text-white/40">
                                            {(tier.baseRate * 100).toFixed(2)}% · {tier.hardPityLimit}抽保底
                                        </span>
                                    )}
                                </div>

                                {/* Items */}
                                {tier.items.length === 0 ? (
                                    <p className="text-xs text-white/25 pl-1">空</p>
                                ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                        {tier.items.map(item => (
                                            <span key={item._id} className="text-xs bg-black/30 border border-white/10 rounded-lg px-2 py-1 text-white/70">
                                                {item.name} ×{item.quantity}
                                            </span>
                                        ))}
                                    </div>
                                )}

                                {/* Pity bar (tier 0 and 1 only) */}
                                {tier.tierIndex < 2 && tier.hardPityLimit > 1 && (
                                    <div className="mt-2">
                                        <div className="flex items-center justify-between text-xs text-white/40 mb-1">
                                            <span className="flex items-center gap-1">
                                                <FaShieldAlt className="text-xs" /> 保底
                                                {inSoftPity && <span className="text-yellow-400 ml-1">（软保底中）</span>}
                                            </span>
                                            <span>{tp?.pullCount ?? 0} / {tier.hardPityLimit}</span>
                                        </div>
                                        <div className="h-1 bg-black/30 rounded-full overflow-hidden">
                                            <motion.div className="h-full rounded-full"
                                                style={{ background: inSoftPity ? 'linear-gradient(90deg,#FFC72C,#FFE08C)' : 'linear-gradient(90deg,#818cf8,#a78bfa)' }}
                                                initial={{ width: 0 }} animate={{ width: `${Math.min(100, pityPct)}%` }}
                                                transition={{ duration: 0.6, ease: 'easeOut' }} />
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            );
        }

        // Simple mode
        const prizes = pool.prizes || [];
        return (
            <div className="space-y-2">
                <p className="text-xs text-white/40 tracking-wider mb-2">奖品列表</p>
                {prizes.length === 0 ? (
                    <p className="text-xs text-white/25">该卡池暂无奖品</p>
                ) : prizes.map(p => (
                    <div key={p._id} className="flex items-center gap-2">
                        <span className="text-xs text-white/70 flex-1 truncate">{p.name} ×{p.quantity}</span>
                        <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min(100, p.probability * 100)}%` }} />
                        </div>
                        <span className="text-xs text-white/40 w-10 text-right">{(p.probability * 100).toFixed(1)}%</span>
                    </div>
                ))}

                {/* Simple pity counter */}
                {(() => {
                    const pc = getSimplePity(pool._id);
                    return pc > 0 ? (
                        <p className="text-xs text-white/30 mt-3">本轮已抽 {pc} 次</p>
                    ) : null;
                })()}
            </div>
        );
    };

    // ─── Layout ────────────────────────────────────────────────────────────────
    return (
        <>
            <AnimatePresence>
                {animDraws && <GachaAnimation key="anim" draws={animDraws} onClose={() => setAnimDraws(null)} />}
            </AnimatePresence>

            {/* Full screen Genshin-style container */}
            <div className="relative w-full h-[85vh] rounded-2xl overflow-hidden border border-white/10 select-none"
                style={{ background: 'linear-gradient(135deg, #0f0c29 0%, #1a1040 50%, #0d0d1a 100%)' }}>

                {/* Background pool image */}
                {pool?.image && (
                    <motion.div key={pool._id} className="absolute inset-0 pointer-events-none"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }}>
                        <img src={pool.image} alt="" className="w-full h-full object-cover opacity-15" />
                        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 30%, #0f0c29 100%)' }} />
                    </motion.div>
                )}

                {/* Gold particle dots (CSS only) */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden">
                    {[...Array(20)].map((_, i) => (
                        <motion.div key={i}
                            className="absolute rounded-full"
                            style={{
                                width: 2 + (i % 3), height: 2 + (i % 3),
                                left: `${5 + i * 4.8}%`, top: `${10 + (i * 17) % 80}%`,
                                background: i % 3 === 0 ? '#FFC72C' : i % 3 === 1 ? '#818cf8' : '#fff',
                                opacity: 0.15 + (i % 5) * 0.07,
                            }}
                            animate={{ y: [-6, 6, -6], opacity: [0.15, 0.45, 0.15] }}
                            transition={{ duration: 3 + (i % 4), repeat: Infinity, delay: i * 0.2 }}
                        />
                    ))}
                </div>

                {/* Top bar */}
                <div className="relative z-10 flex items-center justify-between px-6 pt-5 pb-3">
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                        onClick={() => navigate(`/dashboard/system/${systemId}`)}
                        className="text-white/50 hover:text-[#FFC72C] transition-colors">
                        <FaArrowLeft className="text-lg" />
                    </motion.button>

                    <div className="flex items-center gap-3">
                        <FaDice className="text-2xl text-[#FFC72C]" />
                        <h1 className="text-2xl font-bold tracking-[0.2em] text-white"
                            style={{ textShadow: '0 0 20px rgba(255,199,44,0.4)' }}>
                            祈 愿
                        </h1>
                    </div>

                    <button onClick={() => setShowHistory(v => !v)}
                        className="text-white/50 hover:text-white transition-colors flex items-center gap-1 text-xs tracking-wider">
                        <FaScroll /> {showHistory ? '卡池' : '记录'}
                    </button>
                </div>

                <AnimatePresence mode="wait">
                    {showHistory ? (
                        <motion.div key="history" className="relative z-10 px-6 overflow-auto"
                            style={{ height: 'calc(85vh - 80px)' }}
                            initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }}>
                            <h2 className="text-sm font-bold tracking-widest text-white/60 mb-4 flex items-center gap-2">
                                <FaScroll className="text-[#FFC72C]" /> 祈愿历史
                            </h2>
                            <HistoryPanel records={history} />
                        </motion.div>
                    ) : (
                        <motion.div key="main" className="relative z-10 h-full flex flex-col"
                            style={{ height: 'calc(85vh - 80px)' }}
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

                            {/* Pool navigation */}
                            {pools.length > 1 && (
                                <div className="flex items-center justify-center gap-3 py-2">
                                    <button onClick={() => setPoolIdx(i => Math.max(0, i - 1))} disabled={safePoolIdx === 0}
                                        className="text-white/40 hover:text-white disabled:opacity-20 transition-colors">
                                        <FaChevronLeft />
                                    </button>
                                    <div className="flex gap-1.5">
                                        {pools.map((_, i) => (
                                            <button key={i} onClick={() => setPoolIdx(i)}
                                                className={`rounded-full transition-all ${i === safePoolIdx ? 'w-5 h-1.5 bg-[#FFC72C]' : 'w-1.5 h-1.5 bg-white/25 hover:bg-white/50'}`} />
                                        ))}
                                    </div>
                                    <button onClick={() => setPoolIdx(i => Math.min(pools.length - 1, i + 1))} disabled={safePoolIdx === pools.length - 1}
                                        className="text-white/40 hover:text-white disabled:opacity-20 transition-colors">
                                        <FaChevronRight />
                                    </button>
                                </div>
                            )}

                            {!pool ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <p className="text-white/30 text-sm tracking-widest">当前系统暂无可用卡池</p>
                                </div>
                            ) : (
                                <div className="flex-1 flex flex-col md:flex-row gap-0 overflow-hidden">

                                    {/* Left: Pool info / items */}
                                    <div className="flex-1 px-6 py-4 overflow-y-auto scrollbar-hide">
                                        <AnimatePresence mode="wait">
                                            <motion.div key={pool._id}
                                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                                                transition={{ duration: 0.3 }}>
                                                <div className="mb-4">
                                                    <h2 className="text-xl font-bold text-white tracking-widest"
                                                        style={{ textShadow: '0 0 16px rgba(255,199,44,0.3)' }}>
                                                        {pool.name}
                                                    </h2>
                                                    <p className="text-sm text-white/40 mt-1 leading-relaxed">{pool.description || ''}</p>
                                                    <span className="mt-2 inline-block text-xs px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/40">
                                                        {pool.drawMode === 'genshin' ? '⭐ 原神保底' : '🎲 普通随机'}
                                                    </span>
                                                </div>
                                                {renderPoolInfo()}
                                            </motion.div>
                                        </AnimatePresence>
                                    </div>

                                    {/* Right: Decorative spacer on desktop (pool image shown as overlay) */}
                                    <div className="hidden md:block w-48 shrink-0" />
                                </div>
                            )}

                            {/* Bottom: Draw buttons */}
                            {pool && (
                                <div className="px-6 pb-6 pt-3 border-t border-white/5">
                                    <div className="flex gap-3 max-w-md mx-auto">
                                        {/* ×1 */}
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                            onClick={() => handleDraw(1)}
                                            disabled={isDrawing || !canAfford(pool, 1) || ((pool.prizes || []).length === 0 && (pool.genshinTiers || []).every(t => t.items.length === 0))}
                                            className="flex-1 relative overflow-hidden rounded-xl py-3.5 font-bold text-sm tracking-widest text-black disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                                            style={{ background: 'linear-gradient(90deg,#c8a84b,#FFC72C,#ffe08c,#FFC72C)', boxShadow: '0 0 20px rgba(255,199,44,0.35)' }}>
                                            {isDrawing ? '祈愿中...' : !canAfford(pool, 1) ? '消耗不足' : `祈愿 ×1`}
                                            {canAfford(pool, 1) && pool.consume?.type !== 'none' && (
                                                <span className="block text-xs font-normal opacity-70">{consumeLabel(pool, 1)}</span>
                                            )}
                                        </motion.button>

                                        {/* ×10 */}
                                        <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                                            onClick={() => handleDraw(10)}
                                            disabled={isDrawing || !canAfford(pool, 10) || ((pool.prizes || []).length === 0 && (pool.genshinTiers || []).every(t => t.items.length === 0))}
                                            className="flex-1 relative overflow-hidden rounded-xl py-3.5 font-bold text-sm tracking-widest text-white disabled:opacity-40 disabled:cursor-not-allowed border border-purple-400/50 transition-all"
                                            style={{ background: 'linear-gradient(90deg,#3b0764,#6d28d9,#7c3aed)', boxShadow: '0 0 20px rgba(109,40,217,0.35)' }}>
                                            {isDrawing ? '祈愿中...' : !canAfford(pool, 10) ? '消耗不足×10' : `十连祈愿`}
                                            {canAfford(pool, 10) && pool.consume?.type !== 'none' && (
                                                <span className="block text-xs font-normal opacity-70">{consumeLabel(pool, 10)}</span>
                                            )}
                                        </motion.button>
                                    </div>
                                </div>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </>
    );
};

export default SystemLottery;
