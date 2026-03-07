import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { message } from 'antd';
import { FaGamepad, FaTasks, FaCogs } from 'react-icons/fa';
import MissionDetail from './MissionDetail';

import { RootState } from '../../../../Redux/store';
import { getEnv } from '../../../../config/env';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import { useLazyGetActiveSystemTasksQuery } from '../../../../api/profileApi';
import { setSelectedSystemId } from '../../../../Redux/Features/systemSlice';
import { 
    useLazyGetSystemListQuery,
    useGetMemberTaskCenterQuery,
    useAcceptMissionListMutation,
    useStartMemberTaskMutation,
    useCompleteMemberTaskMutation,
    useFailMemberTaskMutation,
    useRestartMemberTaskMutation
} from '../../../../api/systemRtkApi';

const Tasks: React.FC = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();

    const targetSystemId = searchParams.get('systemId');
    const targetMissionListId = searchParams.get('missionListId');

    const systems = useSelector((state: RootState) => state.system.systems);
    const selectedSystemId = useSelector((state: RootState) => state.system.selectedSystemId);
    const profile = useSelector((state: RootState) => state.profile.profile);
    const accessToken = useSelector((state: RootState) => state.user.accessToken);
    const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [triggerGetActiveSystemTasks] = useLazyGetActiveSystemTasksQuery();
    const { data: taskCenterData, refetch, isFetching } = useGetMemberTaskCenterQuery(
        { systemId: selectedSystemId || '' },
        { skip: !selectedSystemId }
    );
    const [acceptMissionList, { isLoading: isAccepting }] = useAcceptMissionListMutation();
    const [startMemberTask, { isLoading: isStarting }] = useStartMemberTaskMutation();
    const [completeMemberTask, { isLoading: isCompleting }] = useCompleteMemberTaskMutation();
    const [failMemberTask, { isLoading: isFailing }] = useFailMemberTaskMutation();
    const [restartMemberTask, { isLoading: isRestarting }] = useRestartMemberTaskMutation();

    const { backendUrl } = getEnv();
    const updateSseUrl = selectedSystemId && accessToken
        ? `${backendUrl}/system/${selectedSystemId}/updates/events?token=${encodeURIComponent(accessToken)}`
        : null;

    useSSEWithReconnect({
        url: updateSseUrl,
        enabled: Boolean(selectedSystemId && accessToken),
        onMessage: (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (!payload?.type || payload.type === 'connected') return;

                if (
                    payload.type === 'mission_list_created'
                    || payload.type === 'mission_list_updated'
                    || payload.type === 'mission_list_deleted'
                    || payload.type === 'mission_node_created'
                ) {
                    triggerGetSystemList();
                    refetch();
                    message.info('任务列表已更新，已自动同步');
                } else if (payload.type === 'system_deleted') {
                    message.info('系统已删除，正在返回首页');
                    triggerGetSystemList();
                    navigate('/dashboard/home');
                }
            } catch (error) {
                console.error('Tasks page update SSE parse error:', error);
            }
        },
    });

    const handleAcceptMissionList = async (missionListId: string, title: string) => {
        if (!selectedSystemId) return;
        try {
            await acceptMissionList({ systemId: selectedSystemId, missionListId }).unwrap();
            message.success(`已接取重任：${title}`);
            refetch();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '接取任务失败');
        }
    };

    const handleStartTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!selectedSystemId) return;
        try {
            await startMemberTask({ systemId: selectedSystemId, missionListId, nodeId }).unwrap();
            message.success(`行动启动：${title}`);
            refetch();
            triggerGetActiveSystemTasks();
            navigate('/dashboard/home');
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '开始任务失败');
        }
    };

    const handleCompleteTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!selectedSystemId) return;
        try {
            const result = await completeMemberTask({ systemId: selectedSystemId, missionListId, nodeId }).unwrap();
            const rewardCoins = result?.rewards?.coins || 0;
            message.success(`节点已攻破：${title}${rewardCoins > 0 ? `，获得储备能量 ${rewardCoins}` : ''}`);
            refetch();
            triggerGetSystemList(); // 奖励可能更新金币
            triggerGetActiveSystemTasks();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '完成任务失败');
        }
    };

    const handleFailTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!selectedSystemId) return;
        try {
            await failMemberTask({ systemId: selectedSystemId, missionListId, nodeId }).unwrap();
            message.warning(`节点崩坏：${title}`);
            refetch();
            triggerGetActiveSystemTasks();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '操作失败');
        }
    };

    const handleRestartTask = async (missionListId: string, nodeId: string, title: string) => {
        if (!selectedSystemId) return;
        try {
            await restartMemberTask({ systemId: selectedSystemId, missionListId, nodeId }).unwrap();
            message.success(`时空回溯，重新挑战：${title}`);
            refetch();
            triggerGetActiveSystemTasks();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '重置失败');
        }
    };

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    useEffect(() => {
        if (!selectedSystemId && systems.length > 0) {
            dispatch(setSelectedSystemId(systems[0]._id));
        }
    }, [selectedSystemId, systems, dispatch]);

    useEffect(() => {
        if (!targetSystemId) return;
        const exists = systems.some((sys) => sys._id === targetSystemId);
        if (!exists) return;
        if (selectedSystemId !== targetSystemId) {
            dispatch(setSelectedSystemId(targetSystemId));
        }
    }, [targetSystemId, systems, selectedSystemId, dispatch]);

    const selectedSystem = useMemo(() => {
        if (!systems.length) return null;
        return systems.find((sys) => sys._id === selectedSystemId) || systems[0];
    }, [systems, selectedSystemId]);

    const isOwner = selectedSystem?.profile === profile?._id;
    const missionLists = useMemo(() => taskCenterData?.missionLists || [], [taskCenterData?.missionLists]);

    useEffect(() => {
        if (missionLists.length > 0) {
            if (targetMissionListId && missionLists.some((m) => m._id === targetMissionListId)) {
                if (selectedMissionId !== targetMissionListId) {
                    setSelectedMissionId(targetMissionListId);
                }

                if (searchParams.get('missionListId') || searchParams.get('nodeId')) {
                    const nextParams = new URLSearchParams(searchParams);
                    nextParams.delete('missionListId');
                    nextParams.delete('nodeId');
                    setSearchParams(nextParams, { replace: true });
                }
                return;
            }

            if (!selectedMissionId || !missionLists.find(m => m._id === selectedMissionId)) {
                setSelectedMissionId(missionLists[0]._id);
            }
        } else {
            setSelectedMissionId(null);
        }
    }, [missionLists, selectedMissionId, targetMissionListId, searchParams, setSearchParams]);

    if (!systems.length) {
        return (
            <section className="w-full h-[85vh] flex flex-col rounded-3xl border border-white/60 dark:border-white/10 
            bg-white/40 dark:bg-black/40 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8),_0_8px_32px_rgba(0,0,0,0.05)] 
            dark:shadow-[inset_0_0_15px_rgba(255,255,255,0.02),_0_8px_32px_rgba(0,0,0,0.5)] 
            backdrop-blur-xl overflow-hidden text-neutral-800 dark:text-white font-sans select-none transition-colors duration-300 p-8">
                <div className="flex flex-col items-center justify-center h-full text-neutral-400 dark:text-white/40">
                    <FaTasks className="text-7xl mb-6 opacity-40 drop-shadow-md" />
                    <p className="text-2xl font-black tracking-widest mb-2">未监测到系统指令</p>
                    <p className="text-sm font-bold tracking-wider opacity-70">请先在系统总览或系统设置中创建/加入系统结界</p>
                </div>
            </section>
        );
    }

    return (
        <section className="w-full h-[85vh] flex flex-col rounded-3xl border border-white/60 dark:border-white/10 
            bg-white/40 dark:bg-black/40 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8),_0_8px_32px_rgba(0,0,0,0.05)] 
            dark:shadow-[inset_0_0_15px_rgba(255,255,255,0.02),_0_8px_32px_rgba(0,0,0,0.5)] 
            backdrop-blur-xl overflow-hidden text-neutral-800 dark:text-white font-sans select-none transition-colors duration-300 relative">
            
            {/* Background Ambient Layers */}
            <div className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20 flex justify-end items-start p-20 z-0">
                <div className="w-96 h-96 bg-blue-300 dark:bg-blue-600 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen" />
            </div>

            <div className="px-8 py-6 border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-white/50 dark:from-white/5 to-transparent relative z-10 overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-blue-400/20 dark:bg-[#FFC72C]/10 rounded-full blur-3xl -translate-y-1/2 pointer-events-none" />
                
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl shadow-[0_5px_15px_rgba(59,130,246,0.4)] text-white">
                            <FaGamepad className="text-3xl drop-shadow-md" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-widest drop-shadow-sm dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-neutral-800 dark:text-white">使命大厅</h1>
                            <p className="text-sm font-bold text-neutral-500 dark:text-white/60 tracking-widest uppercase mt-1">Mission Control Board</p>
                        </div>
                    </div>

                    {isOwner && selectedSystem && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => navigate(`/dashboard/system/${selectedSystem._id}`)}
                            className="px-6 py-2.5 bg-gradient-to-r from-neutral-800 to-black hover:from-neutral-700 dark:from-[#FFC72C] dark:to-orange-400 text-white dark:text-black rounded-xl text-sm font-black tracking-widest shadow-[0_5px_15px_rgba(0,0,0,0.2)] dark:shadow-[0_0_15px_rgba(255,199,44,0.4)] transition-all border border-black/10 dark:border-transparent flex items-center gap-2"
                        >
                            <FaCogs className="text-xs" />
                            管理控制枢纽
                        </motion.button>
                    )}
                </div>

                <div className="mt-6 flex flex-wrap gap-2 md:gap-3">
                    {systems.map((sys) => (
                        <button
                            key={sys._id}
                            onClick={() => dispatch(setSelectedSystemId(sys._id))}
                            className={`px-4 py-2 rounded-xl text-xs md:text-sm font-black tracking-widest transition-all duration-300 relative overflow-hidden group ${
                                selectedSystem?._id === sys._id
                                    ? 'text-white dark:text-black bg-neutral-800 dark:bg-[#FFC72C] shadow-[0_4px_10px_rgba(0,0,0,0.2)] dark:shadow-[0_0_15px_rgba(255,199,44,0.4)] border border-neutral-700 dark:border-transparent'
                                    : 'text-neutral-500 dark:text-white/60 bg-white/60 dark:bg-white/5 border border-white/80 dark:border-white/15 hover:border-neutral-300 dark:hover:border-white/40 hover:bg-white dark:hover:bg-white/10'
                            }`}
                        >
                            <span className="relative z-10">{sys.name}</span>
                            {selectedSystem?._id === sys._id && (
                                <motion.div layoutId="taskSystemTab" className="absolute inset-0 bg-neutral-800 dark:bg-[#FFC72C]" style={{ zIndex: 0 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-hidden p-4 md:p-8 relative z-10 flex flex-col md:flex-row gap-6">
                {!selectedSystem?.modules?.taskChain ? (
                    <div className="w-full h-full flex items-center justify-center text-neutral-400 dark:text-white/35">
                        <div className="text-center">
                            <FaTasks className="text-7xl mb-6 opacity-30 drop-shadow-md mx-auto" />
                            <p className="text-2xl font-black tracking-widest mb-2">指令链机制未激活</p>
                            <p className="text-sm font-bold tracking-wider opacity-70">请在探索法则(设置)中启用 taskChain 模块以解锁任务</p>
                        </div>
                    </div>
                ) : isFetching && missionLists.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center text-neutral-400 dark:text-white/35">
                        <div className="text-center animate-pulse">
                            <FaTasks className="text-7xl mb-6 opacity-20 drop-shadow-md mx-auto transition-all" />
                            <p className="text-2xl font-black tracking-widest mb-2">正在解码世界线...</p>
                        </div>
                    </div>
                ) : missionLists.length === 0 ? (
                    <div className="w-full h-full flex items-center justify-center text-neutral-400 dark:text-white/35">
                        <div className="text-center">
                            <FaTasks className="text-7xl mb-6 opacity-30 drop-shadow-md mx-auto" />
                            <p className="text-2xl font-black tracking-widest mb-2">暂无指令派发</p>
                            <p className="text-sm font-bold tracking-wider opacity-70">世界主宰尚未在此节点分配主线任务</p>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Left Side: Mission List (approx 1/3 width) */}
                        <div className="w-full md:w-1/3 md:min-w-[280px] md:max-w-[360px] flex flex-col gap-3 overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-black/10 dark:scrollbar-thumb-white/10 scrollbar-track-transparent">
                            {missionLists.map((list) => {
                                const isSelected = selectedMissionId === list._id;
                                const isUrgent = list.listType === 'urgent';
                                return (
                                    <button
                                        key={list._id}
                                        onClick={() => setSelectedMissionId(list._id)}
                                        className={`w-full text-left relative overflow-hidden rounded-xl border transition-all duration-300 py-4 px-5 group ${
                                            isSelected 
                                            ? (isUrgent ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.7),_0_4px_10px_rgba(0,0,0,0.05)] text-red-900 dark:text-red-100' : 'bg-white dark:bg-neutral-800 border-amber-300 dark:border-amber-600 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.7),_0_4px_10px_rgba(0,0,0,0.05)] text-neutral-900 dark:text-white')
                                            : 'bg-white/40 dark:bg-black/20 border-white/50 dark:border-white/5 hover:bg-white/70 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400'
                                        }`}
                                    >
                                        {/* Selection Indicator */}
                                        {isSelected && (
                                            <motion.div layoutId="activeMissionSelection" className={`absolute left-0 top-0 bottom-0 w-1.5 ${isUrgent ? 'bg-red-500' : 'bg-amber-500'}`} />
                                        )}
                                        <div className="flex items-center gap-3 relative z-10">
                                            {list.image ? (
                                                <div className={`w-9 h-9 rounded-lg overflow-hidden border flex-shrink-0 shadow-sm ${
                                                    isUrgent ? 'border-red-300 dark:border-red-700/50' : 'border-amber-300 dark:border-amber-700/50'
                                                }`}>
                                                    <img src={list.image} alt={list.title} className="w-full h-full object-cover" />
                                                </div>
                                            ) : (
                                                <div className={`w-9 h-9 rounded-full flex items-center justify-center border shadow-sm flex-shrink-0 ${
                                                    isUrgent ? 'bg-red-100 dark:bg-red-900/50 text-red-500 border-red-200 dark:border-red-800' : 'bg-amber-100 dark:bg-amber-900/50 text-amber-500 border-amber-200 dark:border-amber-800'
                                                }`}>
                                                    <span className="text-xs font-black">!</span>
                                                </div>
                                            )}
                                            <div className="flex-1 truncate">
                                                <h4 className={`text-sm font-bold truncate ${isSelected ? '' : 'opacity-80'}`}>{list.title}</h4>
                                                <p className="text-[10px] font-bold tracking-widest uppercase opacity-60 mt-0.5">{isUrgent ? '魔神任务' : '传说任务'}</p>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Right Side: Mission Details */}
                        <div className="flex-1 h-full min-h-[400px]">
                            <MissionDetail
                                mission={missionLists.find(m => m._id === selectedMissionId) || null}
                                storeProducts={selectedSystem?.storeProducts || []}
                                handleAcceptMissionList={handleAcceptMissionList}
                                handleStartTask={handleStartTask}
                                handleCompleteTask={handleCompleteTask}
                                handleFailTask={handleFailTask}
                                handleRestartTask={handleRestartTask}
                                isAccepting={isAccepting}
                                isCompleting={isCompleting}
                                isFailing={isFailing}
                                isStarting={isStarting}
                                isRestarting={isRestarting}
                            />
                        </div>
                    </>
                )}
            </div>
        </section>
    );
};

export default Tasks;
