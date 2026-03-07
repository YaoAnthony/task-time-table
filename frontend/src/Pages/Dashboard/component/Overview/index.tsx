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
                        <p className="text-xl font-bold tracking-widest mb-4">暂无加入的系统法则</p>
                        <p className="text-sm tracking-wider">前往 "探索法则" (Setting) 缔造纪元或搜寻坐标</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 2xl:grid-cols-3 gap-8">
                        {systems.map((sys) => (
                            <motion.div
                                key={sys._id}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                whileHover={{ scale: 1.02}}
                                onClick={() => handleSystemClick(sys._id)}
                                className="relative bg-white/60 dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900 
                                border border-white/80 dark:border-gray-700/50 rounded-2xl overflow-hidden 
                                hover:border-blue-400/50 dark:hover:border-[#FFC72C] 
                                shadow-[inset_1px_1px_2px_rgba(255,255,255,1),_0_10px_20px_rgba(0,0,0,0.05)]
                                dark:shadow-[0_0_20px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_0_30px_rgba(255,199,44,0.2)] 
                                transition-all duration-300 cursor-pointer group"
                            >
                                {/* Owner Badge */}
                                {sys.profile === profile?._id && (
                                    <div className="absolute top-4 right-4 z-20">
                                        <span className="bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-[#FFC72C] dark:to-orange-500 text-white dark:text-black text-xs font-black px-3 py-1.5 rounded-full tracking-widest shadow-[0_4px_10px_rgba(59,130,246,0.3)] dark:shadow-[0_4px_10px_rgba(255,199,44,0.4)]">
                                            我的主场
                                        </span>
                                    </div>
                                )}
                                {sys.profile && sys.profile !== profile?._id && (
                                    <div className="absolute top-4 right-4 z-20">
                                        <span className="bg-gradient-to-r from-emerald-400 to-teal-500 text-white text-xs font-black px-3 py-1.5 rounded-full tracking-widest shadow-lg">
                                            客座成员
                                        </span>
                                    </div>
                                )}

                                {/* Background Ambient Colors */}
                                <div className="absolute inset-0 opacity-40 dark:opacity-10 pointer-events-none transition-opacity duration-500 group-hover:opacity-70 dark:group-hover:opacity-20">
                                    <div className="absolute top-[-20%] right-[-10%] w-48 h-48 bg-blue-300 dark:bg-[#FFC72C] rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen transition-transform duration-700 group-hover:scale-150" />
                                    <div className="absolute bottom-[-20%] left-[-10%] w-48 h-48 bg-purple-300 dark:bg-blue-600 rounded-full blur-3xl mix-blend-multiply dark:mix-blend-screen transition-transform duration-700 group-hover:scale-150" />
                                </div>

                                <div className="relative p-7 flex flex-col h-full z-10">
                                    {/* Header with Icon */}
                                    <div className="flex items-center justify-between mb-5">
                                        <div className="flex items-center gap-4">
                                            <div className="w-14 h-14 rounded-xl bg-white/80 dark:bg-black/40 flex items-center justify-center 
                                                shadow-[inset_2px_2px_4px_rgba(255,255,255,1),_0_4px_10px_rgba(0,0,0,0.05)] 
                                                dark:shadow-[inset_0_0_10px_rgba(255,255,255,0.05)] border border-white dark:border-white/10 
                                                group-hover:border-blue-300 dark:group-hover:border-[#FFC72C]/50 transition-colors"
                                            >
                                                <FaCogs className="text-3xl text-blue-500 dark:text-white/70 group-hover:text-blue-600 dark:group-hover:text-[#FFC72C] transition-colors drop-shadow-sm" />
                                            </div>
                                            <div>
                                                <h3 className="text-2xl font-black tracking-wider text-neutral-800 dark:text-white group-hover:text-blue-600 dark:group-hover:text-[#FFC72C] transition-colors">{sys.name}</h3>
                                                <p className="text-neutral-500 dark:text-white/40 text-[10px] font-bold tracking-[0.2em] mt-1">SYS_ID: {sys._id.slice(-8).toUpperCase()}</p>
                                            </div>
                                        </div>
                                        <motion.div
                                            className="text-blue-600 dark:text-[#FFC72C] opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
                                        >
                                            <FaArrowRight className="text-2xl drop-shadow-[0_0_5px_currentColor]" />
                                        </motion.div>
                                    </div>

                                    {/* Description */}
                                    <p className="text-neutral-600 dark:text-white/60 font-medium text-sm mb-6 line-clamp-2 flex-1 leading-relaxed">
                                        {sys.description || "世界线变动中，尚未观测到此系统的详细法则描述。"}
                                    </p>

                                    {/* Modules Badges - Gamified Specs */}
                                    <div className="flex flex-wrap gap-2.5 mb-5">
                                        {sys.modules?.taskChain && (
                                            <span className="text-xs font-black tracking-wider px-3 py-1.5 rounded-lg 
                                                bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 
                                                border border-blue-200 dark:border-blue-500/30 shadow-sm flex items-center gap-1.5"
                                            >
                                                <FaGamepad className="text-sm" /> 任务链
                                            </span>
                                        )}
                                        {sys.modules?.store && (
                                            <span className="text-xs font-black tracking-wider px-3 py-1.5 rounded-lg 
                                                bg-amber-50 dark:bg-yellow-900/40 text-amber-600 dark:text-yellow-300 
                                                border border-amber-200 dark:border-yellow-500/30 shadow-sm flex items-center gap-1.5"
                                            >
                                                <FaStore className="text-sm" /> 交易馆
                                            </span>
                                        )}
                                        {sys.modules?.lottery && (
                                            <span className="text-xs font-black tracking-wider px-3 py-1.5 rounded-lg 
                                                bg-fuchsia-50 dark:bg-purple-900/40 text-fuchsia-600 dark:text-purple-300 
                                                border border-fuchsia-200 dark:border-purple-500/30 shadow-sm flex items-center gap-1.5"
                                            >
                                                <FaDice className="text-sm" /> 祈愿池
                                            </span>
                                        )}
                                    </div>

                                    {/* Footer Info */}
                                    <div className="flex items-center justify-between text-[11px] font-bold text-neutral-400 dark:text-white/40 pt-4 border-t border-black/5 dark:border-white/10">
                                        <span className="tracking-widest uppercase">
                                            EST. {new Date(sys.createdAt || '').toLocaleDateString('zh-CN')}
                                        </span>
                                        <span className="text-blue-600 dark:text-[#FFC72C]/80 tracking-widest uppercase group-hover:text-blue-700 dark:group-hover:text-[#FFC72C] transition-colors relative overflow-hidden group/link">
                                            <span className="relative z-10">跃迁至此空间</span>
                                            <div className="absolute bottom-0 left-0 w-full h-[2px] bg-blue-600 dark:bg-[#FFC72C] -translate-x-full group-hover/link:translate-x-0 transition-transform duration-300" />
                                        </span>
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