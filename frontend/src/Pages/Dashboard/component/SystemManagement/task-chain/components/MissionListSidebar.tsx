import React from 'react';
import { FaGamepad, FaTrash } from 'react-icons/fa';

import type { MissionList } from '../../../../../../Types/System';

type MissionListSidebarProps = {
    missionLists: MissionList[];
    isLoading: boolean;
    selectedMissionListId: string;
    onSelect: (missionListId: string) => void;
    onRequestDelete: (listId: string, title: string, nodeCount: number) => void;
};

const MissionListSidebar: React.FC<MissionListSidebarProps> = ({
    missionLists,
    isLoading,
    selectedMissionListId,
    onSelect,
    onRequestDelete,
}) => {
    return (
        <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 shadow-sm dark:shadow-none">
            <h4 className="text-md font-bold tracking-widest mb-4 text-blue-600 dark:text-blue-200">任务列表</h4>
            {isLoading ? (
                <p className="text-gray-500 dark:text-white/50">加载中...</p>
            ) : missionLists.length === 0 ? (
                <div className="text-center py-12 text-gray-400 dark:text-white/30 bg-white/30 dark:bg-transparent rounded-xl border border-dashed border-gray-300 dark:border-white/10">
                    <FaGamepad className="text-5xl mb-4 opacity-30 mx-auto" />
                    <p className="tracking-widest">暂无任务列表，先定义一个任务列表</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {missionLists.map((list) => (
                        <div
                            key={list._id}
                            className={`relative group rounded-lg border transition-colors ${selectedMissionListId === list._id
                                ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10'
                                : 'border-gray-200 dark:border-white/10 bg-white/40 dark:bg-black/20 hover:border-gray-300 dark:hover:border-white/30 shadow-sm dark:shadow-none'
                            }`}
                        >
                            <button
                                onClick={() => onSelect(list._id)}
                                className="w-full text-left p-4 pr-10"
                            >
                                <div className="flex items-center justify-between mb-1">
                                    <p className="font-bold tracking-wider text-gray-800 dark:text-inherit">{list.title}</p>
                                    <span className={`text-xs px-2 py-1 rounded ${list.listType === 'urgent' ? 'bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-300' : 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300'}`}>
                                        {list.listType === 'urgent' ? '紧急' : '主线'}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-500 dark:text-white/50 mb-1">节点数: {list.taskTree?.length || 0}</p>
                                <p className="text-xs text-gray-500 dark:text-white/50">状态: {list.hasFailed ? '已失败（不可重开）' : '进行中'}</p>
                            </button>

                            <button
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onRequestDelete(list._id, list.title, list.taskTree?.length || 0);
                                }}
                                title="删除任务列表"
                                className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-red-400 hover:bg-red-500/10 transition-all duration-150"
                            >
                                <FaTrash className="text-xs" />
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default MissionListSidebar;
