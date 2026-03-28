import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { message, Tabs } from 'antd';
import { FaArrowLeft, FaCogs, FaGamepad, FaStore, FaDice, FaBell, FaInfoCircle, FaChartBar, FaCalendarCheck } from 'react-icons/fa';


import { RootState } from '../../../../Redux/store';
import { getEnv } from '../../../../config/env';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import { 
    useLazyGetSystemListQuery,
} from '../../../../api/systemRtkApi';

// components
import SystemInfoPanel from './SystemInfoPanel';
import StorePanel from './StorePanel';
import LotteryPanel from './LotteryPanel';
import TaskChainPanel from './TaskChainPanel';
import AttributeBoardPanel from './AttributeBoardPanel';
import DailyQuestPanel from './DailyQuestPanel';
const { TabPane } = Tabs;

const SystemManagement: React.FC = () => {
    const { systemId } = useParams<{ systemId: string }>();
    const navigate = useNavigate();
    
    const systems = useSelector((state: RootState) => state.system.systems);
    const accessToken = useSelector((state: RootState) => state.user.accessToken);
    const currentSystem = systems.find(sys => sys._id === systemId);
    const [triggerGetSystemList] = useLazyGetSystemListQuery();

    const [activeTab, setActiveTab] = useState('info');
    const [taskEventFeed, setTaskEventFeed] = useState<Array<{ id: string; text: string; time: string; type: string }>>([]);

    useEffect(() => {
        if (!systemId) {
            message.error('系统ID缺失');
            navigate('/dashboard/setting');
            return;
        }
        if (!currentSystem) {
            message.warning('未找到该系统，请先在设置中选择');
            // 可以在这里调用API获取系统详情
        }
    }, [systemId, currentSystem, navigate]);

    const { backendUrl } = getEnv();
    const taskSseUrl = systemId && accessToken
        ? `${backendUrl}/system/${systemId}/tasks/events?token=${encodeURIComponent(accessToken)}`
        : null;

    useSSEWithReconnect({
        url: taskSseUrl,
        enabled: Boolean(systemId && accessToken),
        onMessage: (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (payload?.type === 'connected') return;

                let text = '';
                if (payload?.type === 'member_start_task') {
                    text = `成员开始任务：${payload.nodeTitle || payload.nodeId}`;
                    message.info(text);
                } else if (payload?.type === 'member_complete_task') {
                    text = `成员完成任务：${payload.nodeTitle || payload.nodeId}`;
                    message.success(text);
                } else if (payload?.type === 'member_accept_list') {
                    text = `成员接取任务列表：${payload.missionListTitle || ''}`;
                    message.info(text);
                } else if (payload?.type === 'member_fail_task') {
                    text = `成员任务失败：${payload.nodeTitle || payload.nodeId}`;
                    message.warning(text);
                } else if (payload?.type === 'member_restart_task') {
                    text = `成员重开任务：${payload.nodeTitle || payload.nodeId}`;
                    message.info(text);
                } else if (payload?.type === 'member_purchase_product') {
                    text = `成员购买商品：${payload.productName || payload.productId} x${payload.quantity || 1}`;
                    message.success(text);
                    triggerGetSystemList();
                } else if (payload?.type === 'member_lottery_draw') {
                    if (payload?.won && payload?.reward?.productName) {
                        text = `成员抽卡中奖：${payload.reward.productName} x${payload.reward.quantity || 1}`;
                        message.success(text);
                    } else {
                        text = `成员抽卡未中奖：${payload.poolName || payload.poolId}`;
                        message.info(text);
                    }
                    triggerGetSystemList();
                } else if (payload?.type === 'mission_list_deleted') {
                    text = `任务列表已删除：${payload.missionListTitle || payload.missionListId}`;
                    message.warning(text);
                    triggerGetSystemList();
                } else if (payload?.type === 'member_leave_system') {
                    text = `成员退出系统：${payload.memberUserId || '未知成员'}`;
                    message.warning(text);
                    triggerGetSystemList();
                } else if (payload?.type === 'system_deletion_started') {
                    text = `系统删除流程已开始：${payload.systemName || payload.systemId}`;
                    message.warning(text);
                } else if (payload?.type === 'system_deletion_cleaning_profiles_started') {
                    text = `正在清理成员数据：${payload.profileCount || 0} 个档案`;
                    message.loading({ content: text, key: 'system-delete-progress', duration: 1.2 });
                } else if (payload?.type === 'system_deletion_cleaning_profiles_completed') {
                    text = `成员数据清理完成：${payload.profileCount || 0} 个档案`;
                    message.success({ content: text, key: 'system-delete-progress', duration: 1.8 });
                } else if (payload?.type === 'system_deletion_deleting_system') {
                    text = '正在删除系统主体...';
                    message.loading({ content: text, key: 'system-delete-progress', duration: 1.2 });
                } else if (payload?.type === 'system_deleted') {
                    text = `系统已删除：${payload.systemName || payload.systemId}`;
                    message.success({ content: text, key: 'system-delete-progress' });
                    triggerGetSystemList();
                    navigate('/dashboard/setting');
                }

                if (text) {
                    setTaskEventFeed((prev) => {
                        const next = [{
                            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                            text,
                            time: new Date().toLocaleTimeString(),
                            type: payload?.type || 'unknown',
                        }, ...prev];
                        return next.slice(0, 30);
                    });
                }
            } catch (error) {
                console.error('Parse SSE payload error:', error);
            }
        },
    });

    if (!currentSystem) {
        return (
            <section className="w-full h-[85vh] flex items-center justify-center text-white">
                <div className="text-center">
                    <FaCogs className="text-6xl mb-4 opacity-30 mx-auto animate-spin" />
                    <p className="tracking-widest text-white/50">系统加载中...</p>
                </div>
            </section>
        );
    }

    

    return (
        <section className="w-full h-[85vh] flex flex-col rounded-2xl border border-gray-200/50 dark:border-white/10 bg-white/70 dark:bg-black/60 shadow-lg backdrop-blur-xl overflow-hidden text-gray-800 dark:text-white font-sans select-none transition-colors duration-300">
            {/* Top Bar */}
            <div className="flex justify-between items-center px-8 py-5 border-b border-gray-200/50 dark:border-white/10 bg-gradient-to-r from-gray-50/50 to-transparent dark:from-white/5 dark:to-transparent">
                <div className="flex items-center gap-4">
                    <motion.button 
                        whileHover={{ scale: 1.05, x: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => navigate('/dashboard/setting')}
                        className="flex items-center gap-2 text-gray-500 hover:text-gray-800 dark:text-white/70 dark:hover:text-white transition-colors"
                    >
                        <FaArrowLeft className="text-xl" />
                        <span className="hidden sm:inline tracking-widest">返回设置</span>
                    </motion.button>
                    <div className="h-8 w-px bg-gray-300/50 dark:bg-white/20" />
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-100 to-blue-50 dark:from-[#FFC72C] dark:to-[#FFE066] flex items-center justify-center shadow-sm dark:shadow-[0_0_15px_rgba(255,199,44,0.3)]">
                            <FaCogs className="text-xl text-blue-500 dark:text-black" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-black tracking-widest text-gray-800 dark:text-white dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">{currentSystem.name}</h1>
                            <p className="text-xs text-gray-400 dark:text-white/50 tracking-wider">系统ID: {systemId}</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    
                    {currentSystem.modules?.taskChain && (
                        <span className="text-xs font-bold tracking-wider px-3 py-1 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1"><FaGamepad /></span>
                    )}
                    {currentSystem.modules?.store && (
                        <span className="text-xs font-bold tracking-wider px-3 py-1 rounded bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 flex items-center gap-1"><FaStore /></span>
                    )}
                    {currentSystem.modules?.lottery && (
                        <span className="text-xs font-bold tracking-wider px-3 py-1 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30 flex items-center gap-1"><FaDice /></span>
                    )}
                </div>
            </div>

            <div className="px-8 py-4 border-b border-gray-200/50 dark:border-white/10 bg-gray-50/30 dark:bg-black/20">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-gray-700 dark:text-white/80">
                        <FaBell className="text-yellow-500 dark:text-yellow-300" />
                        <span className="font-bold tracking-widest text-sm">成员任务实时事件</span>
                    </div>
                    {taskEventFeed.length > 0 && (
                        <button
                            onClick={() => setTaskEventFeed([])}
                            className="text-xs text-gray-400 hover:text-gray-700 dark:text-white/50 dark:hover:text-white transition-colors"
                        >
                            清空
                        </button>
                    )}
                </div>

                {taskEventFeed.length === 0 ? (
                    <p className="text-xs text-gray-400 dark:text-white/40 tracking-wide">暂无事件，成员接取/开始/完成/失败任务后会显示在这里</p>
                ) : (
                    <div className="max-h-24 overflow-y-auto space-y-2 pr-1">
                        {taskEventFeed.map((eventItem) => (
                            <div key={eventItem.id} className="text-xs bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded px-3 py-2 flex items-center justify-between gap-3 shadow-sm dark:shadow-none">
                                <span className="text-gray-700 dark:text-white/80">{eventItem.text}</span>
                                <span className="text-gray-400 dark:text-white/40 whitespace-nowrap">{eventItem.time}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Tabs Content */}
            <div className="flex-1 overflow-hidden">
                <Tabs 
                    activeKey={activeTab} 
                    onChange={setActiveTab}
                    className="h-full system-tabs"
                    tabBarStyle={{
                        paddingLeft: '2rem',
                        paddingRight: '2rem',
                        marginBottom: 0,
                        borderBottom: '1px solid var(--border-color)',
                        backgroundColor: 'var(--tab-bg-color)',
                    }}
                >
                    <TabPane 
                        tab={<span className="flex items-center gap-2 tracking-widest"><FaInfoCircle />系统信息</span>} 
                        key="info"
                    >
                        <SystemInfoPanel system={currentSystem} />
                    </TabPane>

                    <TabPane 
                        tab={<span className="flex items-center gap-2 tracking-widest"><FaChartBar />属性板</span>} 
                        key="attributes"
                    >
                        <AttributeBoardPanel systemId={systemId!} />
                    </TabPane>

                    {currentSystem.modules?.taskChain && (
                        <TabPane 
                            tab={<span className="flex items-center gap-2 tracking-widest"><FaGamepad />任务链</span>} 
                            key="tasks"
                        >
                            <TaskChainPanel systemId={systemId!} />
                        </TabPane>
                    )}

                    {currentSystem.modules?.store && (
                        <TabPane 
                            tab={<span className="flex items-center gap-2 tracking-widest"><FaStore />系统商城</span>} 
                            key="store"
                        >
                            <StorePanel systemId={systemId!} />
                        </TabPane>
                    )}

                    {currentSystem.modules?.lottery && (
                        <TabPane
                            tab={<span className="flex items-center gap-2 tracking-widest"><FaDice />祈愿卡池</span>}
                            key="lottery"
                        >
                            <LotteryPanel systemId={systemId!} />
                        </TabPane>
                    )}

                    <TabPane
                        tab={<span className="flex items-center gap-2 tracking-widest"><FaCalendarCheck />每日任务</span>}
                        key="daily-quests"
                    >
                        <DailyQuestPanel systemId={systemId!} />
                    </TabPane>
                </Tabs>
            </div>
        </section>
    );
};



export default SystemManagement;
