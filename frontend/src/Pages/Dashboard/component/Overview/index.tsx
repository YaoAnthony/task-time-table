import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { FaCogs, FaGamepad, FaStore, FaDice, FaArrowRight, FaExclamationTriangle } from "react-icons/fa";

// redux
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

const formatSeconds = (value: number) => {
    const safe = Math.max(0, Math.floor(value));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = String(seconds).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
};

const ActiveTaskTimerCard: React.FC<{ task: ActiveSystemTask; onJump: (task: ActiveSystemTask) => void }> = ({ task, onJump }) => {
    const [nowMs, setNowMs] = useState(() => Date.now());

    useEffect(() => {
        const timer = setInterval(() => {
            setNowMs(Date.now());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const startedAtMs = new Date(task.startedAt).getTime();
    const elapsedSeconds = Number.isNaN(startedAtMs)
        ? Math.max(0, task.elapsedSeconds || 0)
        : Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));

    const requiredSeconds = Math.max(60, Number(task.requiredSeconds || task.timeCostMinutes * 60 || 60));
    const overtimeSeconds = Math.max(0, elapsedSeconds - requiredSeconds);
    const isOvertime = overtimeSeconds > 0;
    const ratio = Math.min(100, Math.floor((elapsedSeconds / requiredSeconds) * 100));

    return (
        <button
            type="button"
            onClick={() => onJump(task)}
            title="跳转到使命大厅对应任务列表"
            className={`rounded-xl border p-4 ${isOvertime
                ? 'border-rose-300 dark:border-rose-500/40 bg-rose-50/70 dark:bg-rose-900/20'
                : 'border-emerald-200 dark:border-emerald-500/30 bg-white/70 dark:bg-white/5'
            } w-full text-left cursor-pointer transition-transform hover:scale-[1.01]`}
        >
            <div className="flex items-center justify-between gap-3 mb-2">
                <p className="font-black tracking-wider text-sm text-neutral-800 dark:text-white">{task.nodeTitle}</p>
                {isOvertime ? (
                    <span className="text-[10px] px-2 py-1 rounded bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200 font-bold tracking-widest flex items-center gap-1">
                        <FaExclamationTriangle /> 超时
                    </span>
                ) : (
                    <span className="text-[10px] px-2 py-1 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-200 font-bold tracking-widest">
                        进行中
                    </span>
                )}
            </div>
            <p className="text-xs text-neutral-600 dark:text-white/70 mb-1">系统: {task.systemName}</p>
            <p className="text-xs text-neutral-600 dark:text-white/70 mb-3">任务线: {task.missionListTitle}</p>

            <div className="flex items-center justify-between text-xs font-bold tracking-wider mb-2">
                <span className="text-neutral-500 dark:text-white/60">已执行: {formatSeconds(elapsedSeconds)}</span>
                <span className="text-neutral-500 dark:text-white/60">要求: {formatSeconds(requiredSeconds)}</span>
            </div>
            <div className="h-2 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                <div
                    className={`h-full transition-all ${isOvertime ? 'bg-rose-500' : 'bg-emerald-500'}`}
                    style={{ width: `${Math.min(100, ratio)}%` }}
                />
            </div>

            {isOvertime && (
                <p className="text-xs text-rose-600 dark:text-rose-300 font-bold tracking-wider mt-2">
                    已超时 {formatSeconds(overtimeSeconds)}，建议尽快处理，否则可能触发失败惩罚。
                </p>
            )}
        </button>
    );
};


const Overview: React.FC = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    // Get user profile and systems from Redux store
    const { profile } = useSelector((state: RootState) => state.profile);
    const systems = useSelector((state: RootState) => state.system.systems);
    const isSystemLoading = useSelector((state: RootState) => state.system.loading);
    
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const { data: activeTasksData } = useGetActiveSystemTasksQuery(undefined, {
        pollingInterval: 15000,
        refetchOnFocus: true,
        refetchOnMountOrArgChange: true,
        skip: !profile,
    });

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    const activeTasks = useMemo(() => activeTasksData?.activeTasks || [], [activeTasksData]);
    
    if (!profile) {
        return (
            <div className="flex min-h-[85vh] items-center justify-center">
                <main className="px-10 py-6 rounded-2xl bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-xl">
                    <p className="font-bold tracking-widest text-neutral-600 dark:text-neutral-400">尚未记录宿主坐标，请先登入。</p>
                </main>
            </div>
        );
    }

    const handleSystemClick = (systemId: string) => {
        dispatch(setSelectedSystemId(systemId));
        navigate('/dashboard/tasks');
    };

    const handleActiveTaskCardJump = (task: ActiveSystemTask) => {
        dispatch(setSelectedSystemId(task.systemId));
        navigate(`/dashboard/tasks?systemId=${encodeURIComponent(task.systemId)}&missionListId=${encodeURIComponent(task.missionListId)}&nodeId=${encodeURIComponent(task.nodeId)}`);
    };

    const Title = () => (
        <div className="px-8 py-8 border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-white/40 dark:from-white/5 to-transparent relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/20 dark:bg-[#FFC72C]/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
            <motion.h1
                className="text-3xl font-extrabold tracking-widest drop-shadow-sm dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
            >
                <span className="w-2 h-8 rounded-full bg-blue-500 dark:bg-[#FFC72C] shadow-[0_0_10px_rgba(59,130,246,0.5)] dark:shadow-[0_0_10px_rgba(255,199,44,0.5)]" />
                系统总览
            </motion.h1>
            <p className="text-neutral-500 dark:text-white/60 font-bold text-sm mt-3 tracking-wider pl-5">纵览您所掌控或参与的所有运行法则</p>
        </div>
    );


    return (
        <div className="w-full min-h-[85vh] flex flex-col rounded-3xl border border-white/60 dark:border-white/10 
            bg-white/40 dark:bg-black/40 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8),_0_8px_32px_rgba(0,0,0,0.05)] 
            dark:shadow-[inset_0_0_15px_rgba(255,255,255,0.02),_0_8px_32px_rgba(0,0,0,0.5)] 
            backdrop-blur-xl overflow-hidden text-neutral-800 dark:text-white font-sans select-none transition-colors duration-300"
        >
            {/* Header */}
            <Title />

            {/* Systems Grid */}
            <div className="flex-1 overflow-y-auto p-8 scrollbar-thin scrollbar-thumb-black/20 dark:scrollbar-thumb-white/20 scrollbar-track-transparent relative">
                {activeTasks.length > 0 && (
                    <div className="mb-8 rounded-2xl border border-amber-200/70 dark:border-amber-500/30 bg-amber-50/70 dark:bg-amber-900/10 p-5">
                        
                        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                            {activeTasks.map((task) => (
                                <ActiveTaskTimerCard
                                    key={`${task.systemId}-${task.missionListId}-${task.nodeId}`}
                                    task={task as ActiveSystemTask}
                                    onJump={handleActiveTaskCardJump}
                                />
                            ))}
                        </div>
                    </div>
                )}

                {isSystemLoading ? (
                    <div className="flex items-center justify-center h-64">
                        <div className="flex flex-col items-center gap-4">
                            <div className="w-12 h-12 border-4 border-blue-500 dark:border-[#FFC72C] border-t-transparent rounded-full animate-spin shadow-[0_0_15px_rgba(59,130,246,0.3)] dark:shadow-[0_0_15px_rgba(255,199,44,0.3)]"></div>
                            <p className="text-neutral-500 dark:text-white/60 font-bold tracking-widest animate-pulse">解析法则坐标中...</p>
                        </div>
                    </div>
                ) : systems.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-neutral-400 dark:text-white/30">
                        <motion.div animate={{ rotate: 360 }} transition={{ duration: 20, repeat: Infinity, ease: "linear" }}>
                            <FaCogs className="text-6xl mb-6 opacity-50 drop-shadow-lg" />
                        </motion.div>
                        <p className="text-xl font-bold tracking-widest mb-4">尚未接入任何世界线</p>
                        <p className="text-sm tracking-wider">前往 "探索法则" (Setting) 缔造纪元或搜寻坐标</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 gap-8 p-4">
                        {systems.map((sys, idx) => (
                            <motion.div
                                key={sys._id}
                                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                transition={{ duration: 0.4, delay: idx * 0.1, type: "spring", stiffness: 100 }}
                                whileHover={{ scale: 1.02, y: -4 }}
                                onClick={() => handleSystemClick(sys._id)}
                                className="group relative cursor-pointer"
                            >
                                {/* Holographic Glow Border */}
                                <div className="absolute -inset-0.5 bg-gradient-to-br from-blue-400 to-purple-600 dark:from-cyan-400 dark:to-[#FFC72C] rounded-2xl opacity-20 group-hover:opacity-75 blur-sm transition duration-500" />
                                
                                <div className="relative h-full bg-white/80 dark:bg-slate-900/90 backdrop-blur-xl border border-white/50 dark:border-white/10 rounded-2xl p-6 flex flex-col overflow-hidden">
                                    
                                    {/* Tech/Magic pattern overlay */}
                                    <div className="absolute top-0 right-0 w-40 h-40 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.15),transparent_60%)] dark:bg-[radial-gradient(circle_at_top_right,rgba(255,199,44,0.15),transparent_60%)] pointer-events-none" />
                                    
                                    {/* Cyberpunk Decoration dots */}
                                    <div className="absolute bottom-5 right-5 grid grid-cols-3 gap-1.5 opacity-20 group-hover:opacity-60 transition-opacity">
                                        {[...Array(9)].map((_, i) => <div key={i} className="w-1 h-1 bg-blue-600 dark:bg-[#FFC72C] rounded-full" />)}
                                    </div>

                                    {/* Gaming Style Owner Badge */}
                                    {sys.profile === profile?._id && (
                                        <div className="absolute top-0 right-0 z-20">
                                            <div className="bg-gradient-to-bl from-blue-600 to-indigo-700 dark:from-[#cf9c0e] dark:to-[#FFC72C] text-white dark:text-black text-[10px] font-black px-4 py-1.5 rounded-bl-xl shadow-lg tracking-widest flex items-center gap-1.5 border-l border-b border-blue-400 dark:border-[#FFC72C]">
                                                <span>★</span> MASTER
                                            </div>
                                        </div>
                                    )}
                                    {sys.profile && sys.profile !== profile?._id && (
                                        <div className="absolute top-0 right-0 z-20">
                                            <div className="bg-gradient-to-bl from-emerald-500 to-teal-700 text-white text-[10px] font-black px-4 py-1.5 rounded-bl-xl shadow-lg tracking-widest flex items-center gap-1.5 border-l border-b border-emerald-400">
                                                <span>◆</span> GUEST
                                            </div>
                                        </div>
                                    )}

                                    {/* Header & Icon */}
                                    <div className="flex items-start gap-4 mb-4 relative z-10 w-[90%]">
                                        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-800 dark:to-slate-900 border border-blue-200 dark:border-white/10 flex items-center justify-center shadow-inner group-hover:rotate-12 transition-transform duration-500 shrink-0 relative overflow-hidden">
                                            <div className="absolute inset-0 bg-white/40 dark:bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                            <FaCogs className="text-3xl text-blue-600 dark:text-[#FFC72C] drop-shadow-sm" />
                                        </div>
                                        <div className="flex-1 pt-1 overflow-hidden">
                                            <h3 className="text-xl font-black tracking-widest text-neutral-800 dark:text-white truncate">
                                                {sys.name}
                                            </h3>
                                            <div className="flex items-center mt-1.5">
                                                <div className="px-2 py-0.5 rounded text-[10px] font-bold tracking-[0.2em] bg-black/5 dark:bg-white/10 text-neutral-500 dark:text-white/50 border border-black/5 dark:border-white/5">
                                                    ID: {sys._id.slice(-8).toUpperCase()}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Description */}
                                    <div className="flex-1 mb-6 relative z-10">
                                        <div className="h-full border-l-2 border-blue-100 dark:border-gray-800 pl-3 py-1">
                                            <p className="text-sm font-medium text-neutral-600 dark:text-white/60 line-clamp-2 leading-relaxed tracking-wide">
                                                {sys.description || "未知的能量波动...无法解析该区域法则细节。"}
                                            </p>
                                        </div>
                                    </div>

                                    {/* Game-like Status Modules */}
                                    <div className="space-y-2 relative z-10">
                                        <div className="text-[10px] font-bold text-neutral-400 dark:text-white/40 tracking-[0.2em] flex items-center gap-2">
                                            <span className="w-2 h-2 rounded bg-blue-500 dark:bg-[#FFC72C] animate-pulse" />
                                            ACTIVE MODULES
                                        </div>
                                        <div className="flex gap-2 h-9">
                                            {sys.modules?.taskChain ? (
                                                <div className="flex-1 rounded bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/40 dark:to-blue-800/20 border border-blue-200 dark:border-blue-500/30 flex items-center justify-center gap-1.5 text-blue-700 dark:text-blue-300 transform hover:-translate-y-1 transition-transform relative overflow-hidden group/mod shadow-sm">
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/20 to-transparent -translate-x-full group-hover/mod:translate-x-full transition-transform duration-700 ease-in-out" />
                                                    <FaGamepad className="text-sm" />
                                                    <span className="text-xs font-black tracking-wider">核心任务</span>
                                                </div>
                                            ) : (
                                                <div className="flex-1 rounded bg-neutral-100/50 dark:bg-neutral-800/20 border border-neutral-200/50 dark:border-white/5 flex items-center justify-center text-neutral-400 dark:text-white/20">
                                                    <span className="text-[10px] font-bold tracking-widest opacity-50">LOCKED</span>
                                                </div>
                                            )}
                                            
                                            {sys.modules?.store ? (
                                                <div className="flex-1 rounded bg-gradient-to-r from-amber-50 to-amber-100 dark:from-amber-900/40 dark:to-amber-800/20 border border-amber-200 dark:border-amber-500/30 flex items-center justify-center gap-1.5 text-amber-700 dark:text-amber-300 transform hover:-translate-y-1 transition-transform relative overflow-hidden group/mod shadow-sm">
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/20 to-transparent -translate-x-full group-hover/mod:translate-x-full transition-transform duration-700 ease-in-out" />
                                                    <FaStore className="text-sm" />
                                                    <span className="text-xs font-black tracking-wider">交易所</span>
                                                </div>
                                            ) : (
                                                <div className="flex-1 rounded bg-neutral-100/50 dark:bg-neutral-800/20 border border-neutral-200/50 dark:border-white/5 flex items-center justify-center text-neutral-400 dark:text-white/20">
                                                    <span className="text-[10px] font-bold tracking-widest opacity-50">LOCKED</span>
                                                </div>
                                            )}

                                            {sys.modules?.lottery ? (
                                                <div className="flex-1 rounded bg-gradient-to-r from-fuchsia-50 to-fuchsia-100 dark:from-fuchsia-900/40 dark:to-fuchsia-800/20 border border-fuchsia-200 dark:border-fuchsia-500/30 flex items-center justify-center gap-1.5 text-fuchsia-700 dark:text-fuchsia-300 transform hover:-translate-y-1 transition-transform relative overflow-hidden group/mod shadow-sm">
                                                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 dark:via-white/20 to-transparent -translate-x-full group-hover/mod:translate-x-full transition-transform duration-700 ease-in-out" />
                                                    <FaDice className="text-sm" />
                                                    <span className="text-xs font-black tracking-wider">祈愿池</span>
                                                </div>
                                            ) : (
                                                <div className="flex-1 rounded bg-neutral-100/50 dark:bg-neutral-800/20 border border-neutral-200/50 dark:border-white/5 flex items-center justify-center text-neutral-400 dark:text-white/20">
                                                    <span className="text-[10px] font-bold tracking-widest opacity-50">LOCKED</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="mt-5 pt-4 border-t border-black/5 dark:border-white/10 flex items-center justify-between relative z-10 w-full">
                                        <div className="text-[10px] font-bold text-neutral-400 dark:text-white/30 tracking-widest">
                                            EST {new Date(sys.createdAt || '').toLocaleDateString('zh-CN')}
                                        </div>
                                        <div className="flex items-center gap-2 text-blue-600 dark:text-[#FFC72C] text-xs font-black tracking-widest bg-blue-50 dark:bg-[#FFC72C]/10 px-3 py-1.5 rounded-lg group-hover:bg-blue-600 group-hover:text-white dark:group-hover:bg-[#FFC72C] dark:group-hover:text-black transition-colors">
                                            <span>ENTER SYSTEM</span>
                                            <FaArrowRight className="group-hover:translate-x-1 transition-transform" />
                                        </div>
                                    </div>
                                    
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default Overview;