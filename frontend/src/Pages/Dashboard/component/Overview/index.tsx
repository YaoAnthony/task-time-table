import React, { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FaCogs, FaGamepad, FaStore, FaDice, FaArrowRight, FaExclamationTriangle } from "react-icons/fa";

import { useSelector, useDispatch } from "react-redux";
import { RootState } from "../../../../Redux/store";
import { setSelectedSystemId } from "../../../../Redux/Features/systemSlice";
import { useLazyGetSystemListQuery } from "../../../../api/systemRtkApi";
import { useGetActiveSystemTasksQuery } from "../../../../api/profileApi";

type ActiveSystemTask = {
    systemId: string;
    systemName: string;
    memberUserId: string;
    memberProfileId: string;
    missionListId: string;
    missionListTitle: string;
    nodeId: string;
    nodeTitle: string;
    startedAt: string;
    timeCostMinutes: number;
    requiredSeconds: number;
    elapsedSeconds: number;
    overtimeSeconds: number;
    isOvertime: boolean;
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const pad = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const formatHMS = (s: number) => {
    const safe = Math.max(0, Math.floor(s));
    return `${pad(safe / 3600)}:${pad((safe % 3600) / 60)}:${pad(safe % 60)}`;
};

// ── Analog Clock ──────────────────────────────────────────────────────────────
const AnalogClock: React.FC = () => {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(id);
    }, []);

    const s = now.getSeconds();
    const m = now.getMinutes() + s / 60;
    const h = (now.getHours() % 12) + m / 60;

    const secDeg  = s * 6;
    const minDeg  = m * 6;
    const hourDeg = h * 30;

    const ticks = Array.from({ length: 60 }, (_, i) => i);

    return (
        <div className="flex flex-col items-center gap-3">
            <svg viewBox="0 0 200 200" width={180} height={180} className="drop-shadow-xl">
                {/* Outer ring */}
                <circle cx="100" cy="100" r="95" fill="none"
                    stroke="rgba(59,130,246,0.15)" strokeWidth="2" />
                <circle cx="100" cy="100" r="88" fill="url(#clockFace)" />

                <defs>
                    <radialGradient id="clockFace" cx="40%" cy="35%">
                        <stop offset="0%" stopColor="rgba(255,255,255,0.12)" />
                        <stop offset="100%" stopColor="rgba(15,23,42,0.6)" />
                    </radialGradient>
                </defs>

                {/* Tick marks */}
                {ticks.map(i => {
                    const isMajor = i % 5 === 0;
                    const angle = (i / 60) * 2 * Math.PI - Math.PI / 2;
                    const r1 = isMajor ? 72 : 78;
                    const r2 = 84;
                    return (
                        <line key={i}
                            x1={100 + r1 * Math.cos(angle)} y1={100 + r1 * Math.sin(angle)}
                            x2={100 + r2 * Math.cos(angle)} y2={100 + r2 * Math.sin(angle)}
                            stroke={isMajor ? 'rgba(148,163,184,0.9)' : 'rgba(100,116,139,0.4)'}
                            strokeWidth={isMajor ? 2 : 1}
                            strokeLinecap="round"
                        />
                    );
                })}

                {/* Hour numbers */}
                {[12,1,2,3,4,5,6,7,8,9,10,11].map((n, i) => {
                    const angle = (i / 12) * 2 * Math.PI - Math.PI / 2;
                    const r = 62;
                    return (
                        <text key={n}
                            x={100 + r * Math.cos(angle)} y={100 + r * Math.sin(angle)}
                            textAnchor="middle" dominantBaseline="central"
                            fill="rgba(203,213,225,0.8)" fontSize="9" fontWeight="bold"
                            fontFamily="monospace"
                        >{n}</text>
                    );
                })}

                {/* Hour hand */}
                <line
                    x1="100" y1="100"
                    x2={100 + 40 * Math.cos((hourDeg - 90) * Math.PI / 180)}
                    y2={100 + 40 * Math.sin((hourDeg - 90) * Math.PI / 180)}
                    stroke="#e2e8f0" strokeWidth="4" strokeLinecap="round"
                />
                {/* Minute hand */}
                <line
                    x1="100" y1="100"
                    x2={100 + 55 * Math.cos((minDeg - 90) * Math.PI / 180)}
                    y2={100 + 55 * Math.sin((minDeg - 90) * Math.PI / 180)}
                    stroke="#93c5fd" strokeWidth="2.5" strokeLinecap="round"
                />
                {/* Second hand */}
                <line
                    x1={100 - 12 * Math.cos((secDeg - 90) * Math.PI / 180)}
                    y1={100 - 12 * Math.sin((secDeg - 90) * Math.PI / 180)}
                    x2={100 + 68 * Math.cos((secDeg - 90) * Math.PI / 180)}
                    y2={100 + 68 * Math.sin((secDeg - 90) * Math.PI / 180)}
                    stroke="#f97316" strokeWidth="1.5" strokeLinecap="round"
                />
                {/* Center dot */}
                <circle cx="100" cy="100" r="4" fill="#f97316" />
                <circle cx="100" cy="100" r="2" fill="#fff" />
            </svg>

            {/* Digital time */}
            <div className="font-mono text-3xl font-black tracking-widest text-neutral-800 dark:text-white tabular-nums"
                style={{ textShadow: '0 0 20px rgba(59,130,246,0.4)' }}>
                {pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}
            </div>
            <div className="text-xs font-bold tracking-widest text-neutral-400 dark:text-white/40 uppercase">
                {now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
            </div>
        </div>
    );
};

// ── Circular countdown for active tasks ───────────────────────────────────────
const TaskCountdownCard: React.FC<{
    task: ActiveSystemTask;
    onJump: (t: ActiveSystemTask) => void;
}> = ({ task, onJump }) => {
    const [nowMs, setNowMs] = useState(Date.now);
    useEffect(() => {
        const id = setInterval(() => setNowMs(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    const startedAtMs   = new Date(task.startedAt).getTime();
    const elapsed       = Number.isNaN(startedAtMs)
        ? Math.max(0, task.elapsedSeconds || 0)
        : Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
    const required      = Math.max(60, Number(task.requiredSeconds || task.timeCostMinutes * 60 || 60));
    const remaining     = Math.max(0, required - elapsed);
    const overtime      = Math.max(0, elapsed - required);
    const isOvertime    = overtime > 0;
    const ratio         = Math.min(1, elapsed / required);

    // SVG circle progress
    const R = 28, C = 2 * Math.PI * R;
    const dashOffset = C * (1 - ratio);

    return (
        <motion.button
            type="button"
            onClick={() => onJump(task)}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className={`w-full text-left rounded-2xl p-4 border transition-all ${
                isOvertime
                    ? 'border-rose-300 dark:border-rose-500/40 bg-rose-50/80 dark:bg-rose-900/20'
                    : 'border-blue-200 dark:border-blue-500/30 bg-white/70 dark:bg-blue-900/10'
            }`}
        >
            <div className="flex items-center gap-4">
                {/* Circular progress */}
                <div className="shrink-0 relative">
                    <svg width="72" height="72" viewBox="0 0 72 72">
                        <circle cx="36" cy="36" r={R} fill="none"
                            stroke={isOvertime ? 'rgba(254,202,202,0.4)' : 'rgba(219,234,254,0.4)'}
                            strokeWidth="5" />
                        <circle cx="36" cy="36" r={R} fill="none"
                            stroke={isOvertime ? '#ef4444' : '#3b82f6'}
                            strokeWidth="5" strokeLinecap="round"
                            strokeDasharray={C}
                            strokeDashoffset={dashOffset}
                            transform="rotate(-90 36 36)"
                            style={{ transition: 'stroke-dashoffset 0.8s ease' }}
                        />
                        <text x="36" y="36" textAnchor="middle" dominantBaseline="central"
                            fill={isOvertime ? '#ef4444' : '#3b82f6'}
                            fontSize="8" fontWeight="bold" fontFamily="monospace">
                            {isOvertime ? '超时' : `${Math.round(ratio * 100)}%`}
                        </text>
                    </svg>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                        <span className="font-black text-sm text-neutral-800 dark:text-white truncate">
                            {task.nodeTitle}
                        </span>
                        {isOvertime
                            ? <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-300 font-bold flex items-center gap-1">
                                <FaExclamationTriangle /> 超时
                              </span>
                            : <span className="shrink-0 text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">
                                进行中
                              </span>
                        }
                    </div>
                    <div className="text-[11px] text-neutral-500 dark:text-white/50 truncate mb-2">
                        {task.systemName} · {task.missionListTitle}
                    </div>

                    {/* Countdown / Overtime */}
                    {isOvertime ? (
                        <div className="font-mono font-black text-rose-600 dark:text-rose-400 text-base tabular-nums">
                            +{formatHMS(overtime)}
                            <span className="text-[10px] font-normal ml-1 opacity-60">已超时</span>
                        </div>
                    ) : (
                        <div className="flex items-end gap-1">
                            <span className="font-mono font-black text-blue-600 dark:text-blue-400 text-base tabular-nums">
                                {formatHMS(remaining)}
                            </span>
                            <span className="text-[10px] text-neutral-400 dark:text-white/40 mb-0.5">剩余</span>
                        </div>
                    )}
                </div>
                <FaArrowRight className="shrink-0 text-neutral-300 dark:text-white/20 group-hover:text-blue-500 transition-colors" />
            </div>
        </motion.button>
    );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const Overview: React.FC = () => {
    const dispatch  = useDispatch();
    const navigate  = useNavigate();

    const { profile }     = useSelector((s: RootState) => s.profile);
    const systems         = useSelector((s: RootState) => s.system.systems);
    const isSystemLoading = useSelector((s: RootState) => s.system.loading);
    const coins           = useSelector((s: RootState) => s.profileState?.wallet?.coins ?? 0);

    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const { data: activeTasksData } = useGetActiveSystemTasksQuery(undefined, {
        pollingInterval: 15000,
        refetchOnFocus: true,
        refetchOnMountOrArgChange: true,
        skip: !profile,
    });

    useEffect(() => { triggerGetSystemList(); }, [triggerGetSystemList]);

    const activeTasks   = useMemo(() => activeTasksData?.activeTasks || [], [activeTasksData]);
    const joinedSystems = useMemo(
        () => systems.filter(s => s.profile !== profile?._id),
        [systems, profile]
    );

    if (!profile) return (
        <div className="flex min-h-[85vh] items-center justify-center">
            <p className="font-bold tracking-widest text-neutral-500 dark:text-neutral-400">尚未记录宿主坐标，请先登入。</p>
        </div>
    );

    const handleSystemClick    = (id: string) => { dispatch(setSelectedSystemId(id)); navigate('/dashboard/tasks'); };
    const handleActiveTaskJump = (t: ActiveSystemTask) => {
        dispatch(setSelectedSystemId(t.systemId));
        navigate(`/dashboard/tasks?systemId=${encodeURIComponent(t.systemId)}&missionListId=${encodeURIComponent(t.missionListId)}&nodeId=${encodeURIComponent(t.nodeId)}`);
    };

    return (
        <div className="w-full min-h-[85vh] flex flex-col rounded-3xl border border-white/60 dark:border-white/10
            bg-white/40 dark:bg-black/40
            shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8),_0_8px_32px_rgba(0,0,0,0.05)]
            dark:shadow-[inset_0_0_15px_rgba(255,255,255,0.02),_0_8px_32px_rgba(0,0,0,0.5)]
            backdrop-blur-xl overflow-hidden text-neutral-800 dark:text-white font-sans select-none transition-colors duration-300">

            {/* ── Top bar ── */}
            <div className="px-8 py-5 border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-white/40 dark:from-white/5 to-transparent flex items-center gap-3">
                <span className="w-2 h-8 rounded-full bg-blue-500 dark:bg-[#FFC72C] shadow-[0_0_10px_rgba(59,130,246,0.5)]" />
                <div>
                    <h1 className="text-2xl font-extrabold tracking-widest">主界面</h1>
                    <p className="text-xs text-neutral-400 dark:text-white/40 tracking-wider mt-0.5">
                        {profile.user?.username ?? '未知'} · {coins.toLocaleString()} 储备能量
                    </p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-black/20 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
                <div className="flex flex-col lg:flex-row gap-0 h-full">

                    {/* ── Left panel: Clock + Active tasks ── */}
                    <div className="lg:w-[320px] shrink-0 border-r border-black/5 dark:border-white/5 p-6 flex flex-col gap-6">

                        {/* Clock */}
                        <div className="rounded-2xl bg-gradient-to-br from-slate-800/80 to-slate-900/90 dark:from-black/60 dark:to-slate-900/80 border border-white/10 p-6 flex flex-col items-center shadow-[0_8px_32px_rgba(0,0,0,0.15)] backdrop-blur-sm">
                            <AnalogClock />
                        </div>

                        {/* Active tasks */}
                        <div>
                            <div className="text-[10px] font-black tracking-[0.2em] text-neutral-400 dark:text-white/40 mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                进行中的任务 ({activeTasks.length})
                            </div>
                            <AnimatePresence>
                                {activeTasks.length === 0 ? (
                                    <motion.div
                                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                                        className="rounded-xl border border-dashed border-black/10 dark:border-white/10 p-6 text-center text-neutral-400 dark:text-white/30 text-sm font-bold tracking-wider"
                                    >
                                        暂无进行中的任务
                                    </motion.div>
                                ) : (
                                    <div className="flex flex-col gap-3">
                                        {activeTasks.map(t => (
                                            <motion.div
                                                key={`${t.systemId}-${t.missionListId}-${t.nodeId}`}
                                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                                            >
                                                <TaskCountdownCard task={t as ActiveSystemTask} onJump={handleActiveTaskJump} />
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>

                    {/* ── Right panel: Joined systems ── */}
                    <div className="flex-1 p-6 overflow-y-auto">
                        <div className="text-[10px] font-black tracking-[0.2em] text-neutral-400 dark:text-white/40 mb-4 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-blue-400 dark:bg-[#FFC72C] animate-pulse" />
                            已加入的系统 ({joinedSystems.length})
                        </div>

                        {isSystemLoading ? (
                            <div className="flex items-center justify-center h-48">
                                <div className="w-10 h-10 border-4 border-blue-500 dark:border-[#FFC72C] border-t-transparent rounded-full animate-spin" />
                            </div>
                        ) : joinedSystems.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-neutral-400 dark:text-white/30 gap-4">
                                <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}>
                                    <FaCogs className="text-5xl opacity-40" />
                                </motion.div>
                                <p className="font-bold tracking-widest text-sm">尚未加入任何系统</p>
                                <p className="text-xs tracking-wider opacity-60">前往 "探索法则" 搜索并加入系统</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
                                {joinedSystems.map((sys, idx) => (
                                    <motion.div
                                        key={sys._id}
                                        initial={{ opacity: 0, y: 16 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        transition={{ delay: idx * 0.07, type: 'spring', stiffness: 120 }}
                                        whileHover={{ scale: 1.02, y: -3 }}
                                        onClick={() => handleSystemClick(sys._id)}
                                        className="group relative cursor-pointer"
                                    >
                                        <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-400 to-purple-600 dark:from-cyan-400 dark:to-[#FFC72C] rounded-2xl opacity-0 group-hover:opacity-40 blur-sm transition duration-500" />
                                        <div className="relative bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border border-white/50 dark:border-white/10 rounded-2xl p-5 flex flex-col overflow-hidden">

                                            {/* GUEST badge */}
                                            <div className="absolute top-0 right-0 z-20">
                                                <div className="bg-gradient-to-bl from-emerald-500 to-teal-700 text-white text-[9px] font-black px-3 py-1 rounded-bl-xl tracking-widest">
                                                    ◆ GUEST
                                                </div>
                                            </div>

                                            {/* Ambient */}
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.1),transparent_60%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,199,44,0.1),transparent_60%)] pointer-events-none" />

                                            {/* Header */}
                                            <div className="flex items-start gap-3 mb-3 w-[85%]">
                                                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-800 dark:to-slate-900 border border-blue-200 dark:border-white/10 flex items-center justify-center shrink-0 group-hover:rotate-12 transition-transform duration-500">
                                                    <FaCogs className="text-xl text-blue-600 dark:text-[#FFC72C]" />
                                                </div>
                                                <div className="flex-1 min-w-0 pt-0.5">
                                                    <h3 className="font-black tracking-widest text-base truncate">{sys.name}</h3>
                                                    <div className="text-[9px] font-bold tracking-[0.15em] bg-black/5 dark:bg-white/10 text-neutral-400 dark:text-white/40 px-2 py-0.5 rounded mt-1 inline-block">
                                                        ID: {sys._id.slice(-8).toUpperCase()}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Description */}
                                            <p className="text-xs text-neutral-500 dark:text-white/50 line-clamp-2 leading-relaxed mb-4 border-l-2 border-blue-100 dark:border-gray-700 pl-3">
                                                {sys.description || "未知的能量波动…无法解析该区域法则细节。"}
                                            </p>

                                            {/* Modules */}
                                            <div className="flex gap-1.5 mb-4">
                                                {sys.modules?.taskChain && (
                                                    <span className="text-[9px] font-black px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 flex items-center gap-1">
                                                        <FaGamepad /> 核心任务
                                                    </span>
                                                )}
                                                {sys.modules?.store && (
                                                    <span className="text-[9px] font-black px-2 py-1 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 flex items-center gap-1">
                                                        <FaStore /> 交易所
                                                    </span>
                                                )}
                                                {sys.modules?.lottery && (
                                                    <span className="text-[9px] font-black px-2 py-1 rounded bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300 border border-fuchsia-200 dark:border-fuchsia-500/30 flex items-center gap-1">
                                                        <FaDice /> 祈愿池
                                                    </span>
                                                )}
                                            </div>

                                            {/* Footer */}
                                            <div className="flex items-center justify-between pt-3 border-t border-black/5 dark:border-white/10">
                                                <span className="text-[9px] text-neutral-400 dark:text-white/30 font-bold tracking-widest">
                                                    EST {new Date(sys.createdAt || '').toLocaleDateString('zh-CN')}
                                                </span>
                                                <div className="flex items-center gap-1.5 text-blue-600 dark:text-[#FFC72C] text-[10px] font-black tracking-widest bg-blue-50 dark:bg-[#FFC72C]/10 px-2.5 py-1.5 rounded-lg group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-[#FFC72C] dark:group-hover:text-black transition-colors">
                                                    ENTER <FaArrowRight className="group-hover:translate-x-0.5 transition-transform" />
                                                </div>
                                            </div>
                                        </div>
                                    </motion.div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Overview;
