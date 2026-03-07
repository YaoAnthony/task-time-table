import React from 'react';
import { FaPlus, FaTrash, FaEdit } from 'react-icons/fa';

export interface MissionNodeReward {
    experience?: Array<{ name: string; value: number }>;
    coins?: number;
    items?: Array<{ itemKey: string; quantity: number }>;
    unlockMissions?: Array<{ missionId: string; title: string; description?: string }>;
}

export interface MissionNode {
    nodeId: string;
    parentNodeId: string | null;
    title: string;
    description?: string;
    content?: string;
    notice?: string;
    timeCostMinutes: number;
    canInterrupt?: boolean;
    rewards?: MissionNodeReward;
    childrenNodeIds: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

interface TaskTree2DProps {
    taskTree: MissionNode[];
    rootNodeId: string | null | undefined;
    onNodeClick: (nodeId: string) => void;
    onPhantomClick: (parentId: string | null) => void;
    onNodeDelete?: (nodeId: string) => void;
}

const statusColors = {
    pending: 'bg-gray-100 text-gray-500 border-gray-300 dark:bg-gray-800 dark:text-gray-400 dark:border-gray-600',
    in_progress: 'bg-blue-50 text-blue-600 border-blue-400 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-500',
    completed: 'bg-green-50 text-green-600 border-green-400 dark:bg-green-900/40 dark:text-green-300 dark:border-green-500',
    failed: 'bg-red-50 text-red-600 border-red-400 dark:bg-red-900/40 dark:text-red-300 dark:border-red-500'
};

const statusLabels = {
    pending: '待开启',
    in_progress: '进行中',
    completed: '已完成',
    failed: '已失败'
};

const TaskTreeNode: React.FC<{
    node: MissionNode;
    allNodes: MissionNode[];
    onNodeClick: (nodeId: string) => void;
    onPhantomClick: (parentId: string | null) => void;
    onNodeDelete?: (nodeId: string) => void;
}> = ({ node, allNodes, onNodeClick, onPhantomClick, onNodeDelete }) => {
    const children = allNodes.filter(n => node.childrenNodeIds.includes(n.nodeId));
    
    return (
        <div className="flex flex-col items-center">
            {/* Node Card */}
            <div className={`relative px-4 py-3 rounded-lg border-2 shadow-sm min-w-[200px] flex flex-col items-center gap-2 transition-all hover:scale-105 z-10 ${statusColors[node.status]}`}>
                <div className="font-bold text-sm tracking-wider">{node.title}</div>
                <div className="text-xs opacity-70 mb-2">{statusLabels[node.status]}</div>
                
                <div className="flex gap-3">
                    <button 
                        onClick={() => onNodeClick(node.nodeId)}
                        className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-200 transition-colors p-1"
                        title="编辑/查看节点"
                    >
                        <FaEdit />
                    </button>
                    <button 
                        onClick={() => onNodeDelete && onNodeDelete(node.nodeId)}
                        className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200 transition-colors p-1"
                        title="删除节点"
                    >
                        <FaTrash />
                    </button>
                    {children.length < 3 && (
                        <button 
                            onClick={() => onPhantomClick(node.nodeId)}
                            className="text-green-500 hover:text-green-700 dark:text-green-400 dark:hover:text-green-200 transition-colors p-1"
                            title="添加子节点"
                        >
                            <FaPlus />
                        </button>
                    )}
                </div>
            </div>

            {/* Children Container */}
            {children.length > 0 && (
                <div className="relative flex justify-center mt-8 pt-4 gap-8">
                    {/* Horizontal connector line for children */}
                    {children.length > 1 && (
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 h-px bg-gray-300 dark:bg-gray-600" style={{ width: `calc(100% - ${100 / children.length}%)` }}></div>
                    )}
                    {/* Vertical line connecting parent to horizontal line */}
                    <div className="absolute -top-8 left-1/2 w-px h-8 bg-gray-300 dark:bg-gray-600"></div>

                    {children.map(child => (
                        <div key={child.nodeId} className="relative flex flex-col items-center">
                            {/* Vertical line from horizontal line to child */}
                            <div className="absolute -top-4 left-1/2 w-px h-4 bg-gray-300 dark:bg-gray-600"></div>
                            <TaskTreeNode 
                                node={child} 
                                allNodes={allNodes} 
                                onNodeClick={onNodeClick} 
                                onPhantomClick={onPhantomClick}
                                onNodeDelete={onNodeDelete}
                            />
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export const TaskTree2D: React.FC<TaskTree2DProps> = ({ taskTree, rootNodeId, onNodeClick, onPhantomClick, onNodeDelete }) => {
    const rootNode = rootNodeId ? taskTree.find(n => n.nodeId === rootNodeId) : null;

    return (
        <div className="w-full h-full min-h-[500px] overflow-auto bg-white/40 dark:bg-black/40 rounded-xl">
            {/* Wrapper ensures that when content exceeds viewport, flex-center doesn't clip the left side */}
            <div className="min-w-max min-h-full p-8 flex flex-col items-center justify-start">
                {rootNode ? (
                    <div className="mx-auto flex justify-center pb-8 pt-2">
                        <TaskTreeNode 
                            node={rootNode} 
                            allNodes={taskTree} 
                            onNodeClick={onNodeClick} 
                            onPhantomClick={onPhantomClick}
                            onNodeDelete={onNodeDelete}
                        />
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center flex-1 text-center space-y-4 m-auto">
                        <p className="text-gray-500 dark:text-white/40 font-bold tracking-widest">暂无任务节点，请先添加主任务</p>
                        <button 
                            onClick={() => onPhantomClick(null)}
                            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white px-6 py-2 rounded-lg font-bold transition-colors"
                        >
                            <FaPlus /> 创建头节点
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TaskTree2D;
