import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { message } from 'antd';
import { FaSearch, FaPlus, FaSignOutAlt, FaCogs, FaGamepad, FaStore, FaDice, FaSignInAlt } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { logout as localLogout } from '../../../../Redux/Features/userSlice';
import { clearProfile } from '../../../../Redux/Features/profileSlice';
import { clearSystemState, setSelectedSystemId, type SystemLite } from '../../../../Redux/Features/systemSlice';
import { clearProfileState } from '../../../../Redux/Features/profileStateSlice';
import { useLogoutMutation } from '../../../../api/authApi';
import { useCreateSystemMutation, useLazyGetSystemListQuery, useLazySearchSystemQuery, useJoinSystemMutation } from '../../../../api/systemRtkApi';

type CreateSystemForm = {
    name: string;
    image: string;
    description: string;
    modules: {
        taskChain: boolean;
        store: boolean;
        lottery: boolean;
    };
};

const defaultFormState: CreateSystemForm = {
    name: '',
    image: '',
    description: '',
    modules: {
        taskChain: true,
        store: true,
        lottery: true,
    },
};

const Setting: React.FC = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    
    const systems = useSelector((state: RootState) => state.system.systems);
    const isSystemLoading = useSelector((state: RootState) => state.system.loading);
    
    const [logoutApi] = useLogoutMutation();
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [triggerSearchSystem, { isLoading: isSearching }] = useLazySearchSystemQuery();
    const [createSystem, { isLoading: isCreatingSystem }] = useCreateSystemMutation();
    const [joinSystem, { isLoading: isJoining }] = useJoinSystemMutation();

    // 标签页状态：'my' 或 'search'
    const [activeTab, setActiveTab] = useState<'my' | 'search'>('my');
    const [searchQuery, setSearchQuery] = useState("");
    const [searchId, setSearchId] = useState("");
    const [searchResults, setSearchResults] = useState<SystemLite[]>([]);
    const [isCreating, setIsCreating] = useState(false);
    const [form, setForm] = useState<CreateSystemForm>(defaultFormState);

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    const filteredSystems = useMemo(() => {
        return systems.filter((sys) => sys.name.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [systems, searchQuery]);

    const setModule = (key: 'taskChain' | 'store' | 'lottery') => {
        setForm((prev) => ({
            ...prev,
            modules: {
                ...prev.modules,
                [key]: !prev.modules[key],
            },
        }));
    };

    const resetCreatePanel = () => {
        setForm(defaultFormState);
        setIsCreating(false);
    };

    const handleCreateSystem = async () => {
        if (!form.name.trim()) {
            message.error('系统称号不能为空');
            return;
        }

        try {
            const payload = {
                name: form.name.trim(),
                image: form.image.trim() || null,
                description: form.description.trim(),
                modules: {
                    taskChain: form.modules.taskChain,
                    store: form.modules.store,
                    lottery: form.modules.lottery,
                },
            };

            const result = await createSystem(payload).unwrap();
            message.success('系统创建成功');

            if (result?.system?._id) {
                dispatch(setSelectedSystemId(String(result.system._id)));
            }

            resetCreatePanel();
            await triggerGetSystemList();
        } catch (error) {
            console.error('Create system error:', error);
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '创建系统失败');
        }
    };

    const handleSystemCardClick = (systemId: string) => {
        dispatch(setSelectedSystemId(systemId));
        navigate(`/dashboard/system/${systemId}`);
    };

    const handleLogout = async () => {
        try {
            await logoutApi().unwrap();
        } catch (e) {
            console.error("Logout API failed (it's ok):", e);
        }
        dispatch(localLogout());
        dispatch(clearProfile());
        dispatch(clearSystemState());
        dispatch(clearProfileState());
        message.success("已退出登录，断开链接。");
        navigate('/');
    };

    const handleSearchSystem = async () => {
        if (!searchId.trim()) {
            message.error('请输入系统ID');
            return;
        }

        try {
            const result = await triggerSearchSystem({ systemId: searchId.trim() }).unwrap();
            if (result?.system) {
                setSearchResults([result.system]);
                message.success('找到系统');
            }
        } catch (error) {
            console.error('Search system error:', error);
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '搜索失败');
            setSearchResults([]);
        }
    };

    const handleJoinSystem = async (systemId: string, systemName: string) => {
        try {
            await joinSystem({ systemId }).unwrap();
            message.success(`成功加入系统 "${systemName}"`);
            // 刷新系统列表
            await triggerGetSystemList();
            // 清除搜索结果
            setSearchId('');
            setSearchResults([]);
        } catch (error) {
            console.error('Join system error:', error);
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '加入系统失败');
        }
    };

    return (
        <section className="w-full h-[85vh] flex flex-col rounded-3xl border border-white/60 dark:border-white/10 
            bg-white/40 dark:bg-black/40 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8),_0_8px_32px_rgba(0,0,0,0.05)] 
            dark:shadow-[inset_0_0_15px_rgba(255,255,255,0.02),_0_8px_32px_rgba(0,0,0,0.5)] 
            backdrop-blur-xl overflow-hidden text-neutral-800 dark:text-white font-sans select-none transition-colors duration-300">
            {/* Top Bar with Logout */}
            <div className="flex justify-between items-center px-8 py-5 border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-white/40 dark:from-white/5 to-transparent relative overflow-hidden">
                <div className="absolute top-0 right-1/4 w-64 h-64 bg-red-400/10 dark:bg-red-500/10 rounded-full blur-3xl -translate-y-1/2 pointer-events-none" />
                <h1 className="text-3xl font-extrabold tracking-widest drop-shadow-sm dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] flex items-center gap-3">
                    <span className="w-2 h-8 rounded-full bg-blue-500 dark:bg-[#FFC72C] shadow-[0_0_10px_rgba(59,130,246,0.5)] dark:shadow-[0_0_10px_rgba(255,199,44,0.5)]" />
                    探索法则
                </h1>
                
                <motion.button 
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleLogout}
                    className="flex items-center gap-2 bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 text-white px-5 py-2.5 rounded-xl font-black shadow-[0_5px_15px_rgba(225,29,72,0.3)] dark:shadow-[0_0_15px_rgba(239,68,68,0.4)] transition-all tracking-widest border border-red-400/50"
                >
                    <FaSignOutAlt className="text-lg" />
                    <span>退出登入</span>
                </motion.button>
            </div>

            <div className="flex flex-1 overflow-hidden">
                {/* Systems List & Search */}
                <div className="flex-1 flex flex-col relative">
                    {/* Tab Switcher */}
                    <div className="flex border-b border-black/5 dark:border-white/10 bg-white/30 dark:bg-black/20">
                        <button
                            onClick={() => setActiveTab('my')}
                            className={`px-8 py-4 font-black tracking-widest transition-all relative ${
                                activeTab === 'my'
                                    ? 'text-blue-600 dark:text-[#FFC72C] bg-white/50 dark:bg-white/5'
                                    : 'text-neutral-500 dark:text-white/60 hover:text-blue-500 hover:bg-white/40 dark:hover:text-white/80 dark:hover:bg-white/5'
                            }`}
                        >
                            我的系统
                            {activeTab === 'my' && (
                                <motion.div
                                    layoutId="settingActiveTab"
                                    className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-blue-500 dark:bg-[#FFC72C] shadow-[0_0_10px_rgba(59,130,246,0.6)] dark:shadow-[0_0_10px_rgba(255,199,44,0.6)]"
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                />
                            )}
                        </button>
                        <button
                            onClick={() => setActiveTab('search')}
                            className={`px-8 py-4 font-black tracking-widest transition-all relative ${
                                activeTab === 'search'
                                    ? 'text-blue-600 dark:text-[#FFC72C] bg-white/50 dark:bg-white/5'
                                    : 'text-neutral-500 dark:text-white/60 hover:text-blue-500 hover:bg-white/40 dark:hover:text-white/80 dark:hover:bg-white/5'
                            }`}
                        >
                            搜索系统坐标
                            {activeTab === 'search' && (
                                <motion.div
                                    layoutId="settingActiveTab"
                                    className="absolute bottom-0 left-0 right-0 h-[3px] rounded-t-full bg-blue-500 dark:bg-[#FFC72C] shadow-[0_0_10px_rgba(59,130,246,0.6)] dark:shadow-[0_0_10px_rgba(255,199,44,0.6)]"
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                />
                            )}
                        </button>
                    </div>

                    {/* Toolbar */}
                    <div className="flex justify-between items-center px-4 md:px-8 py-5 border-b border-black/5 dark:border-white/5 gap-4 relative z-10">
                        {activeTab === 'my' ? (
                            <>
                                <div className="relative flex-1 max-w-sm">
                                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-white/40" />
                                    <input 
                                        type="text"
                                        placeholder="检索挂载的系统..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full bg-white/60 dark:bg-black/40 border border-white/80 dark:border-white/10 rounded-xl pl-12 pr-4 py-3 text-neutral-800 dark:text-white/90 placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:outline-none focus:border-blue-400 dark:focus:border-[#FFC72C] focus:ring-2 focus:ring-blue-400/20 dark:focus:ring-[#FFC72C]/20 shadow-inner transition-all font-medium tracking-wide"
                                    />
                                </div>

                                <motion.button 
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => setIsCreating(true)}
                                    className="bg-white/80 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20 border border-blue-200 dark:border-white/20 shadow-sm dark:shadow-none px-4 md:px-6 py-3 rounded-xl flex items-center gap-2 tracking-widest transition-all font-black text-blue-600 dark:text-white"
                                >
                                    <FaPlus className="text-blue-500 dark:text-[#FFC72C]" />
                                    <span className="hidden sm:inline">创造全新结界</span>
                                </motion.button>
                            </>
                        ) : (
                            <div className="flex gap-4 flex-1">
                                <div className="relative flex-1 max-w-lg">
                                    <FaSearch className="absolute left-4 top-1/2 -translate-y-1/2 text-neutral-400 dark:text-white/40" />
                                    <input 
                                        type="text"
                                        placeholder="输入系统ID进行跨系检索..."
                                        value={searchId}
                                        onChange={e => setSearchId(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleSearchSystem()}
                                        className="w-full bg-white/60 dark:bg-black/40 border border-white/80 dark:border-white/10 rounded-xl pl-12 pr-4 py-3 text-neutral-800 dark:text-white/90 placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:outline-none focus:border-blue-400 dark:focus:border-[#FFC72C] focus:ring-2 focus:ring-blue-400/20 dark:focus:ring-[#FFC72C]/20 shadow-inner transition-all font-medium tracking-wide"
                                    />
                                </div>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    onClick={handleSearchSystem}
                                    disabled={isSearching}
                                    className="bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-[#FFC72C] dark:to-orange-400 hover:opacity-90 text-white dark:text-black px-8 py-3 rounded-xl font-black tracking-widest shadow-[0_5px_15px_rgba(59,130,246,0.3)] dark:shadow-[0_0_15px_rgba(255,199,44,0.4)] transition-all disabled:opacity-50"
                                >
                                    {isSearching ? '检索中...' : '发起检索'}
                                </motion.button>
                            </div>
                        )}
                    </div>

                    {/* Systems Grid */}
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin scrollbar-thumb-black/20 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            <AnimatePresence mode="popLayout">
                                {(activeTab === 'my' ? filteredSystems : searchResults).map((sys) => (
                                    <motion.div
                                        key={sys._id}
                                        initial={{ filter: "brightness(2) contrast(1.5)", clipPath: 'inset(0 100% 0 0)' }}
                                        animate={{ filter: "brightness(1) contrast(1)", clipPath: 'inset(0 0% 0 0)' }}
                                        exit={{ scale: 0.95, filter: "brightness(0)" }}
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        layout
                                        className="relative bg-white/60 dark:bg-black/60 
                                            border-2 border-white/80 dark:border-[#FFC72C]/30 rounded-none overflow-hidden 
                                            hover:border-blue-500 dark:hover:border-[#FFC72C] 
                                            shadow-[8px_8px_0_rgba(59,130,246,0.1)] dark:shadow-[8px_8px_0_rgba(255,199,44,0.1)]
                                            hover:shadow-[4px_4px_0_rgba(59,130,246,0.3)] dark:hover:shadow-[4px_4px_0_rgba(255,199,44,0.3)]
                                            hover:-translate-x-1 hover:-translate-y-1
                                            transition-all duration-200 group"
                                        style={{ 
                                            cursor: activeTab === 'my' ? 'pointer' : 'default',
                                            clipPath: 'polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)'
                                        }}
                                        onClick={() => activeTab === 'my' && handleSystemCardClick(sys._id)}
                                    >
                                        <div className="p-6 flex flex-col h-full z-10 relative">
                                            <div className="flex items-center gap-4 mb-4">
                                                <div className="w-12 h-12 rounded-xl bg-white/80 dark:bg-black/40 flex items-center justify-center 
                                                    shadow-[inset_2px_2px_4px_rgba(255,255,255,1),_0_2px_5px_rgba(0,0,0,0.05)] 
                                                    dark:shadow-[inset_0_0_10px_rgba(255,255,255,0.05)] border border-white dark:border-white/10 
                                                    group-hover:border-blue-300 dark:group-hover:border-[#FFC72C]/50 transition-colors"
                                                >
                                                    <FaCogs className="text-2xl text-blue-500 dark:text-white/70 group-hover:text-blue-600 dark:group-hover:text-[#FFC72C] transition-colors" />
                                                </div>
                                                <h3 className="text-xl font-black tracking-wider text-neutral-800 dark:text-white">{sys.name}</h3>
                                            </div>
                                            <p className="text-neutral-600 dark:text-white/60 text-sm mb-5 min-h-[40px] font-medium leading-relaxed line-clamp-2">
                                                {sys.description || "未记录此系统运转法则。"}
                                            </p>
                                            
                                            {activeTab === 'my' ? (
                                                <>
                                                    <p className="text-blue-500 dark:text-[#FFC72C]/80 text-[10px] font-bold mb-3 tracking-widest uppercase opacity-70">&gt;&gt; 允许接入 &lt;&lt;</p>
                                                    
                                                    {/* Modules Badges */}
                                                    <div className="mt-auto flex gap-2 flex-wrap">
                                                        {sys.modules?.taskChain && (
                                                            <span className="text-[10px] font-black tracking-wider px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 shadow-sm flex items-center gap-1.5"><FaGamepad /> 任务链</span>
                                                        )}
                                                        {sys.modules?.store && (
                                                            <span className="text-[10px] font-black tracking-wider px-2 py-1 rounded-md bg-amber-50 dark:bg-yellow-900/40 text-amber-600 dark:text-yellow-300 border border-amber-200 dark:border-yellow-500/30 shadow-sm flex items-center gap-1.5"><FaStore /> 商城</span>
                                                        )}
                                                        {sys.modules?.lottery && (
                                                            <span className="text-[10px] font-black tracking-wider px-2 py-1 rounded-md bg-fuchsia-50 dark:bg-purple-900/40 text-fuchsia-600 dark:text-purple-300 border border-fuchsia-200 dark:border-purple-500/30 shadow-sm flex items-center gap-1.5"><FaDice /> 祈愿池</span>
                                                        )}
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    {/* Modules Badges */}
                                                    <div className="mb-4 flex gap-2 flex-wrap">
                                                        {sys.modules?.taskChain && (
                                                            <span className="text-[10px] font-black tracking-wider px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 shadow-sm flex items-center gap-1.5"><FaGamepad /> 任务链</span>
                                                        )}
                                                        {sys.modules?.store && (
                                                            <span className="text-[10px] font-black tracking-wider px-2 py-1 rounded-md bg-amber-50 dark:bg-yellow-900/40 text-amber-600 dark:text-yellow-300 border border-amber-200 dark:border-yellow-500/30 shadow-sm flex items-center gap-1.5"><FaStore /> 商城</span>
                                                        )}
                                                        {sys.modules?.lottery && (
                                                            <span className="text-[10px] font-black tracking-wider px-2 py-1 rounded-md bg-fuchsia-50 dark:bg-purple-900/40 text-fuchsia-600 dark:text-purple-300 border border-fuchsia-200 dark:border-purple-500/30 shadow-sm flex items-center gap-1.5"><FaDice /> 祈愿池</span>
                                                        )}
                                                    </div>
                                                    
                                                    <motion.button
                                                        whileHover={{ scale: 1.05 }}
                                                        whileTap={{ scale: 0.95 }}
                                                        onClick={() => handleJoinSystem(sys._id, sys.name)}
                                                        disabled={isJoining}
                                                        className="mt-auto bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 dark:from-[#FFC72C] dark:to-orange-400 dark:hover:from-yellow-300 dark:hover:to-orange-300 text-white dark:text-black shadow-[0_5px_15px_rgba(59,130,246,0.3)] dark:shadow-[0_0_15px_rgba(255,199,44,0.4)] px-4 py-2.5 rounded-xl font-black tracking-widest transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                                                    >
                                                        <FaSignInAlt className="text-sm" />
                                                        {isJoining ? '跃迁中...' : '接入系统'}
                                                    </motion.button>
                                                </>
                                            )}
                                        </div>
                                        {/* Subtle overlay effect */}
                                        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 dark:bg-white/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-blue-400/20 dark:group-hover:bg-[#FFC72C]/10 transition-colors pointer-events-none" />
                                    </motion.div>
                                ))}
                            </AnimatePresence>

                            {(activeTab === 'my' ? filteredSystems : searchResults).length === 0 && (
                                <div className="col-span-full h-48 flex flex-col items-center justify-center text-neutral-400 dark:text-white/30">
                                    <FaCogs className="text-5xl mb-4 opacity-50 drop-shadow-md" />
                                    <p className="font-bold tracking-widest">
                                        {activeTab === 'my' 
                                            ? (isSystemLoading ? '系统矩阵解析中...' : '未发现匹配的系统结界坐标。')
                                            : '输入目标结界 ID 获取访问权...'
                                        }
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Create System Slide Panel */}
                <AnimatePresence>
                    {isCreating && (
                        <motion.div 
                            initial={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
                            animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, -20% 100%)' }}
                            exit={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
                            transition={{ type: "spring", stiffness: 400, damping: 30 }}
                            className="w-full md:w-[450px] bg-white/90 dark:bg-[#0a0a0a] border-l-4 border-blue-500 dark:border-[#FFC72C] shrink-0 absolute md:relative inset-y-0 right-0 z-40 flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.3)] dark:shadow-[-30px_0_80px_rgba(255,199,44,0.15)] bg-[url('/grid-pattern.svg')] bg-[length:20px_20px]"
                        >
                            <div className="p-6 border-b-2 border-blue-500 dark:border-[#FFC72C] flex justify-between items-center bg-blue-500/10 dark:bg-[#FFC72C]/10 relative">
                                <div className="absolute top-0 right-0 w-16 h-16 bg-blue-500/20 dark:bg-[#FFC72C]/20 blur-2xl pointer-events-none" />
                                <h2 className="text-2xl font-black tracking-widest text-blue-600 dark:text-[#FFC72C] flex items-center gap-3">
                                    <div className="w-3 h-8 bg-blue-500 dark:bg-[#FFC72C] animate-pulse" />
                                    建立新界域设定
                                </h2>
                                <button onClick={() => setIsCreating(false)} className="text-blue-500 dark:text-[#FFC72C] hover:text-white hover:bg-red-500 transition-colors text-2xl font-black leading-none flex items-center justify-center w-10 h-10 border-2 border-transparent hover:border-red-400">×</button>
                            </div>
                            
                            <div className="flex-1 p-6 overflow-y-auto space-y-8 pb-32">
                                {/* Name Input */}
                                <div className="space-y-3">
                                    <label className="text-sm text-neutral-500 dark:text-white/60 tracking-widest font-black block uppercase">真名 / 系统称号</label>
                                    <input
                                        placeholder="如：深渊历练计划..."
                                        value={form.name}
                                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                                        className="w-full bg-blue-50/50 dark:bg-black/60 border-2 border-blue-200 dark:border-white/10 rounded-none px-5 py-3 text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 dark:focus:border-[#FFC72C] outline-none transition-all font-bold tracking-widest"
                                        style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
                                    />
                                </div>

                                {/* Desc Input */}
                                <div className="space-y-3">
                                    <label className="text-sm text-neutral-500 dark:text-white/60 tracking-widest font-black block uppercase">法则准则 (设定描述)</label>
                                    <textarea
                                        rows={4}
                                        placeholder="定义在此空间中宿主所需遵循的基础物理法则和世界观..."
                                        value={form.description}
                                        onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                                        className="w-full bg-blue-50/50 dark:bg-black/60 border-2 border-blue-200 dark:border-white/10 rounded-none px-5 py-3 text-neutral-800 dark:text-white placeholder:text-neutral-400 dark:placeholder:text-white/30 focus:border-blue-500 dark:focus:border-[#FFC72C] outline-none transition-all resize-none font-medium leading-relaxed tracking-wide"
                                        style={{ clipPath: 'polygon(8px 0, 100% 0, 100% calc(100% - 8px), calc(100% - 8px) 100%, 0 100%, 0 8px)' }}
                                    />
                                </div>

                                {/* Checklist Modules */}
                                <div className="space-y-4 pt-6 border-t border-black/5 dark:border-white/10">
                                    <label className="text-sm text-neutral-500 dark:text-white/60 tracking-widest font-black block mb-4 uppercase">激活模块核心阵列</label>
                                    
                                    <label className="flex items-center gap-4 cursor-pointer group p-3 bg-blue-50/30 dark:bg-black/40 border-l-4 border-transparent hover:border-blue-500 dark:hover:border-[#FFC72C] transition-all" onClick={() => setModule('taskChain')}>
                                        <div className="w-6 h-6 border-2 border-neutral-400 dark:border-white/30 flex items-center justify-center bg-transparent group-hover:border-blue-500 dark:group-hover:border-[#FFC72C] transition-colors relative" style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)' }}>
                                            {form.modules.taskChain && <div className="absolute inset-1 bg-blue-600 dark:bg-[#FFC72C]" />}
                                        </div>
                                        <span className="tracking-widest flex items-center gap-3 font-bold text-neutral-700 dark:text-white/90">
                                            <div className="text-blue-600 dark:text-[#FFC72C] text-xl"><FaGamepad /></div>
                                            任务链驱动核心
                                        </span>
                                    </label>
                                    
                                    <label className="flex items-center gap-4 cursor-pointer group p-3 bg-amber-50/30 dark:bg-black/40 border-l-4 border-transparent hover:border-amber-500 dark:hover:border-[#FFC72C] transition-all" onClick={() => setModule('store')}>
                                        <div className="w-6 h-6 border-2 border-neutral-400 dark:border-white/30 flex items-center justify-center bg-transparent group-hover:border-amber-500 dark:group-hover:border-[#FFC72C] transition-colors relative" style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)' }}>
                                            {form.modules.store && <div className="absolute inset-1 bg-amber-500 dark:bg-[#FFC72C]" />}
                                        </div>
                                        <span className="tracking-widest flex items-center gap-3 font-bold text-neutral-700 dark:text-white/90">
                                            <div className="text-amber-500 dark:text-[#FFC72C] text-xl"><FaStore /></div>
                                            资源流转交易馆
                                        </span>
                                    </label>

                                    <label className="flex items-center gap-4 cursor-pointer group p-3 bg-purple-50/30 dark:bg-black/40 border-l-4 border-transparent hover:border-purple-500 dark:hover:border-[#FFC72C] transition-all" onClick={() => setModule('lottery')}>
                                        <div className="w-6 h-6 border-2 border-neutral-400 dark:border-white/30 flex items-center justify-center bg-transparent group-hover:border-purple-500 dark:group-hover:border-[#FFC72C] transition-colors relative" style={{ clipPath: 'polygon(3px 0, 100% 0, 100% calc(100% - 3px), calc(100% - 3px) 100%, 0 100%, 0 3px)' }}>
                                            {form.modules.lottery && <div className="absolute inset-1 bg-purple-500 dark:bg-[#FFC72C]" />}
                                        </div>
                                        <span className="tracking-widest flex items-center gap-3 font-bold text-neutral-700 dark:text-white/90">
                                            <div className="text-purple-500 dark:text-[#FFC72C] text-xl"><FaDice /></div>
                                            高维概率祈愿池
                                        </span>
                                    </label>
                                </div>
                            </div>
                            
                            <div className="p-6 border-t-2 border-blue-500 dark:border-[#FFC72C] bg-white dark:bg-black absolute bottom-0 left-0 right-0">
                                <motion.button 
                                    onClick={handleCreateSystem}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    disabled={isCreatingSystem}
                                    className="w-full bg-blue-600 dark:bg-[#FFC72C] hover:bg-blue-500 dark:hover:bg-white text-white dark:text-black py-4 font-black tracking-[0.3em] transition-all disabled:opacity-50 relative overflow-hidden group uppercase"
                                    style={{ clipPath: 'polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px)' }}
                                >
                                    <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1s_infinite]" />
                                    {isCreatingSystem ? 'SYS.INIT...' : '创世注入 [CONFIRM]'}
                                </motion.button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </section>
    );
};

export default Setting;