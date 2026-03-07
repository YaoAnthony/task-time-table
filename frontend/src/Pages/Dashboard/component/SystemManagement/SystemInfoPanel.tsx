import React from 'react';
import { motion } from 'framer-motion';
import { message } from 'antd';
import { FaGamepad, FaStore, FaDice } from 'react-icons/fa';
import type { SystemLite } from '../../../../Types/System';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../../Redux/store';
import { useNavigate, useParams } from 'react-router-dom';

import DeleteSystem from './DeleteSystem';

const SystemInfoPanel: React.FC<{ system: SystemLite }> = ({ system }) => {

    const navigate = useNavigate();
    
    const { systemId } = useParams<{ systemId: string }>();
    const profile = useSelector((state: RootState) => state.profile.profile);
    const isOwner = String(system.profile || '') === String(profile?._id || '');

    return (
        <div className="p-8 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
            <div className="max-w-3xl space-y-6">
                <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 shadow-sm dark:shadow-none">
                    <h3 className="text-lg font-bold tracking-widest mb-4 text-blue-500 dark:text-[#FFC72C]">基本信息</h3>
                    <div className="space-y-3 text-sm">
                        <div className="flex">
                            <span className="text-gray-500 dark:text-white/50 w-24">系统称号：</span>
                            <span className="text-gray-800 dark:text-white font-medium">{system.name}</span>
                        </div>
                        <div className="flex">
                            <span className="text-gray-500 dark:text-white/50 w-24">系统ID：</span>
                            <span className="text-gray-600 dark:text-white font-mono text-xs">{system._id}</span>
                        </div>
                        <div className="flex">
                            <span className="text-gray-500 dark:text-white/50 w-24">法则描述：</span>
                            <span className="text-gray-800 dark:text-white">{system.description || '未设置'}</span>
                        </div>
                        {system.image && (
                            <div className="flex">
                                <span className="text-gray-500 dark:text-white/50 w-24">封面图片：</span>
                                <img src={system.image} alt="封面" className="max-w-xs rounded-lg border border-gray-200 dark:border-white/10 shadow-sm" />
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 shadow-sm dark:shadow-none">
                    <h3 className="text-lg font-bold tracking-widest mb-4 text-blue-500 dark:text-[#FFC72C]">激活模块</h3>
                    <div className="flex gap-3 flex-wrap">
                        {system.modules?.taskChain && (
                            <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg px-4 py-2 flex items-center gap-2">
                                <FaGamepad className="text-blue-400" />
                                <span className="tracking-wider">任务链驱动</span>
                            </div>
                        )}
                        {system.modules?.store && (
                            <div className="bg-yellow-50 dark:bg-yellow-500/10 border border-yellow-200 dark:border-yellow-500/30 rounded-lg px-4 py-2 flex items-center gap-2 text-gray-700 dark:text-white shadow-sm dark:shadow-none">
                                <FaStore className="text-yellow-500 dark:text-yellow-400" />
                                <span className="tracking-wider font-medium">商城与交易</span>
                            </div>
                        )}
                        {system.modules?.lottery && (
                            <div className="bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/30 rounded-lg px-4 py-2 flex items-center gap-2 text-gray-700 dark:text-white shadow-sm dark:shadow-none">
                                <FaDice className="text-purple-500 dark:text-purple-400" />
                                <span className="tracking-wider font-medium">祈愿抽卡池</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="bg-gradient-to-r from-blue-50 to-transparent dark:from-[#FFC72C]/10 dark:to-transparent border border-blue-100 dark:border-[#FFC72C]/20 rounded-xl p-6 shadow-sm dark:shadow-none">
                    <h3 className="text-lg font-bold tracking-widest mb-2 text-blue-600 dark:text-[#FFC72C]">分享系统</h3>
                    <p className="text-sm text-gray-500 dark:text-white/60 mb-4">其他用户可通过以下ID加入此系统：</p>
                    <div className="flex items-center gap-3">
                        <code className="flex-1 bg-white dark:bg-black/40 border border-gray-200 dark:border-white/10 rounded-lg px-4 py-2 font-mono text-sm text-gray-700 dark:text-white shadow-inner">
                            {system._id}
                        </code>
                        <motion.button 
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                                navigator.clipboard.writeText(system._id);
                                message.success('系统ID已复制到剪贴板');
                            }}
                            className="bg-blue-500 hover:bg-blue-600 dark:bg-[#FFC72C] dark:hover:bg-white text-white dark:text-black px-4 py-2 rounded-lg font-bold tracking-wider transition-colors shadow-sm"
                        >
                            复制ID
                        </motion.button>
                    </div>
                </div>

                {isOwner && systemId && (
                    <DeleteSystem
                        systemId={systemId}
                        systemName={system.name}
                        onDeleted={() => navigate('/dashboard/setting')}
                    />
                )}
            </div>
        </div>
    );
};

export default SystemInfoPanel;