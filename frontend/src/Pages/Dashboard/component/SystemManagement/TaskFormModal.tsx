import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { message } from 'antd';

import Modal from '../../../../Component/Modal';
import { useCreateMissionNodeMutation, useLazyGetSystemListQuery } from '../../../../api/systemRtkApi';

type MissionNodeReward = {
    experience?: Array<{ name: string; value: number }>;
    coins?: number;
    items?: Array<{ itemKey: string; quantity: number }>;
    unlockMissions?: Array<{ missionId: string; title: string; description?: string }>;
};

type MissionNodeLite = {
    nodeId: string;
    title: string;
    childrenNodeIds: string[];
};

type MissionListLite = {
    _id: string;
    title: string;
    rootNodeId?: string | null;
    taskTree: MissionNodeLite[];
};

type RewardItemOption = {
    key: string;
    label: string;
    source: 'store' | 'obtainable';
};

type TaskFormModalProps = {
    visible: boolean;
    onClose: () => void;
    systemId: string;
    selectedMissionList?: MissionListLite;
    rewardItemOptions: RewardItemOption[];
    initialParentNodeId?: string;
};

const createInitialForm = (parentNodeId = '') => ({
    parentNodeId,
    title: '',
    description: '',
    content: '',
    notice: '',
    timeCostMinutes: 30,
    canInterrupt: true,
    expName: '',
    expValue: 0,
    rewardCoins: 0,
    rewardItemKey: '',
    rewardItemQuantity: 1,
    unlockMissionId: '',
    unlockMissionTitle: '',
    unlockMissionDescription: '',
});

const TaskFormModal: React.FC<TaskFormModalProps> = ({
    visible,
    onClose,
    systemId,
    selectedMissionList,
    rewardItemOptions,
    initialParentNodeId,
}) => {
    const [nodeForm, setNodeForm] = useState(createInitialForm(initialParentNodeId || ''));
    const [createMissionNode, { isLoading: isCreatingNode }] = useCreateMissionNodeMutation();
    const [triggerGetSystemList] = useLazyGetSystemListQuery();

    useEffect(() => {
        if (!visible) return;
        setNodeForm(createInitialForm(initialParentNodeId || ''));
    }, [visible, initialParentNodeId]);

    const parentNode = useMemo(() => {
        if (!selectedMissionList) return null;
        if (!nodeForm.parentNodeId.trim()) return null;
        return selectedMissionList.taskTree.find((node) => node.nodeId === nodeForm.parentNodeId.trim()) || null;
    }, [selectedMissionList, nodeForm.parentNodeId]);

    const closeAndReset = () => {
        setNodeForm(createInitialForm(initialParentNodeId || ''));
        onClose();
    };

    const handleCreateMissionNode = async () => {
        if (!selectedMissionList) {
            message.error('请先选择任务列表');
            return;
        }

        if (!nodeForm.title.trim()) {
            message.error('请填写任务标题');
            return;
        }

        if (!nodeForm.timeCostMinutes || nodeForm.timeCostMinutes <= 0) {
            message.error('任务耗时必须大于0分钟');
            return;
        }

        const parentNodeId = nodeForm.parentNodeId.trim() || null;
        const parent = parentNodeId
            ? selectedMissionList.taskTree.find((node) => node.nodeId === parentNodeId)
            : null;

        if (parentNodeId && !parent) {
            message.error('父任务不存在');
            return;
        }

        if (parent && (parent.childrenNodeIds || []).length >= 3) {
            message.error('每个任务最多只能有3个子任务');
            return;
        }

        if (!parentNodeId && selectedMissionList.rootNodeId) {
            message.error('该任务列表已存在头节点，请选择父任务创建子任务');
            return;
        }

        try {
            const rewards: MissionNodeReward = {
                experience: nodeForm.expName.trim()
                    ? [{ name: nodeForm.expName.trim(), value: Math.max(0, nodeForm.expValue) }]
                    : [],
                coins: Math.max(0, nodeForm.rewardCoins),
                items: nodeForm.rewardItemKey
                    ? [{ itemKey: nodeForm.rewardItemKey, quantity: Math.max(1, nodeForm.rewardItemQuantity) }]
                    : [],
                unlockMissions: nodeForm.unlockMissionId.trim() && nodeForm.unlockMissionTitle.trim()
                    ? [{
                        missionId: nodeForm.unlockMissionId.trim(),
                        title: nodeForm.unlockMissionTitle.trim(),
                        description: nodeForm.unlockMissionDescription.trim(),
                    }]
                    : [],
            };

            await createMissionNode({
                systemId,
                missionListId: selectedMissionList._id,
                parentNodeId,
                title: nodeForm.title.trim(),
                description: nodeForm.description.trim(),
                content: nodeForm.content.trim(),
                notice: nodeForm.notice.trim(),
                timeCostMinutes: Math.max(1, nodeForm.timeCostMinutes),
                canInterrupt: nodeForm.canInterrupt,
                rewards,
            }).unwrap();

            message.success('任务节点创建成功');
            await triggerGetSystemList().unwrap();
            closeAndReset();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '任务节点创建失败');
        }
    };

    return (
        <Modal isOpen={visible} onClose={closeAndReset} title="">
            <div className="w-[95vw] sm:w-[90vw] max-w-5xl max-h-[85vh] overflow-y-auto p-4 sm:p-8 bg-white/80 dark:bg-[#0a0a0a]/90  text-gray-800 dark:text-white rounded-2xl scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
                
                <div className="space-y-6">
                    {/* Basic Info Section */}
                    <div className="bg-white/90 dark:bg-white/5 p-6 rounded-2xl ">
                        <h4 className="text-lg font-black tracking-widest mb-6 text-indigo-500 dark:text-indigo-400 flex items-center gap-3">
                            <span className="w-1.5 h-5 bg-indigo-500 rounded-full"></span>
                            基础配置
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold tracking-widest text-gray-500 dark:text-gray-400 uppercase mb-2 block">父任务节点锚点</label>
                                <div className="p-4 bg-gray-50 dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-xl text-gray-600 dark:text-gray-300 font-mono text-sm flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-inner dark:shadow-none">
                                    <span className="truncate">{nodeForm.parentNodeId || 'ROOT [头节点]'}</span>
                                    <span className="text-xs font-bold text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-1 rounded-full whitespace-nowrap">
                                        {parentNode ? `父节点: ${parentNode.title}` : '在此节点下创建'}
                                    </span>
                                </div>
                                <select
                                    value={nodeForm.parentNodeId}
                                    onChange={(e) => setNodeForm({ ...nodeForm, parentNodeId: e.target.value })}
                                    className="w-full mt-3 bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-gray-800 dark:text-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none transition-all shadow-sm dark:shadow-none"
                                >
                                    <option value="">ROOT (顶层节点)</option>
                                    {(selectedMissionList?.taskTree || []).map((node) => (
                                        <option key={node.nodeId} value={node.nodeId}>
                                            {node.title} ({node.nodeId}) - 子任务 {(node.childrenNodeIds || []).length}/3
                                        </option>
                                    ))}
                                </select>
                            </div>
                            
                            <div>
                                <label className="text-xs font-bold tracking-widest text-gray-500 dark:text-gray-400 uppercase mb-2 block">节点标识 (标题)*</label>
                                <input
                                    value={nodeForm.title}
                                    onChange={(e) => setNodeForm({ ...nodeForm, title: e.target.value })}
                                    className="w-full bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none font-bold tracking-wide transition-all shadow-sm dark:shadow-none"
                                    placeholder="输入任务标题..."
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold tracking-widest text-gray-500 dark:text-gray-400 uppercase mb-2 block">推演耗时（分钟）*</label>
                                <input
                                    type="number"
                                    min="1"
                                    value={nodeForm.timeCostMinutes}
                                    onChange={(e) => setNodeForm({ ...nodeForm, timeCostMinutes: parseInt(e.target.value, 10) || 1 })}
                                    className="w-full bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-gray-900 dark:text-white focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400/20 outline-none font-mono text-lg transition-all shadow-sm dark:shadow-none"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Content Section */}
                    <div className="bg-white/90 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-none">
                        <h4 className="text-lg font-black tracking-widest mb-6 text-purple-500 dark:text-purple-400 flex items-center gap-3">
                            <span className="w-1.5 h-5 bg-purple-500 rounded-full"></span>
                            执行指令
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="text-xs font-bold tracking-widest text-gray-500 dark:text-gray-400 uppercase mb-2 block">简要指令 (介绍)</label>
                                <textarea
                                    rows={3}
                                    value={nodeForm.description}
                                    onChange={(e) => setNodeForm({ ...nodeForm, description: e.target.value })}
                                    className="w-full bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 outline-none resize-none leading-relaxed transition-all shadow-sm dark:shadow-none"
                                    placeholder="任务的一句话描述..."
                                />
                            </div>
                            <div>
                                <label className="text-xs font-bold tracking-widest text-gray-500 dark:text-gray-400 uppercase mb-2 block">核心执行流 (主要内容)</label>
                                <textarea
                                    rows={3}
                                    value={nodeForm.content}
                                    onChange={(e) => setNodeForm({ ...nodeForm, content: e.target.value })}
                                    className="w-full bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-200 focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20 outline-none resize-none leading-relaxed transition-all shadow-sm dark:shadow-none"
                                    placeholder="详细的任务执行步骤或内容..."
                                />
                            </div>
                            <div className="md:col-span-2">
                                <label className="text-xs font-bold tracking-widest text-gray-500 dark:text-gray-400 uppercase mb-2 block">额外提醒 (Notice)</label>
                                <textarea
                                    rows={2}
                                    value={nodeForm.notice}
                                    onChange={(e) => setNodeForm({ ...nodeForm, notice: e.target.value })}
                                    className="w-full bg-yellow-50/50 dark:bg-yellow-500/5 border border-yellow-200 dark:border-yellow-500/20 rounded-xl px-4 py-3 text-gray-800 dark:text-gray-200 focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 outline-none transition-all shadow-sm dark:shadow-none"
                                    placeholder="需要特别注意的事项..."
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex items-center">
                            <label className="relative flex items-center cursor-pointer gap-3 group">
                                <input
                                    type="checkbox"
                                    className="sr-only peer"
                                    checked={nodeForm.canInterrupt}
                                    onChange={(e) => setNodeForm({ ...nodeForm, canInterrupt: e.target.checked })}
                                />
                                <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-indigo-500 shadow-inner group-hover:scale-105 transition-transform"></div>
                                <span className="text-sm font-bold text-gray-700 dark:text-white/80 group-hover:text-indigo-500 transition-colors">允许任务执行被中断重置</span>
                            </label>
                        </div>
                    </div>

                    {/* Rewards Section */}
                    <div className="bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-900/10 dark:to-orange-900/10 border border-amber-200/50 dark:border-amber-500/20 p-6 rounded-2xl shadow-[0_4px_20px_rgba(0,0,0,0.03)] dark:shadow-none">
                        <h4 className="text-lg font-black tracking-widest mb-6 text-amber-600 dark:text-amber-500 flex items-center gap-3">
                            <span className="w-1.5 h-5 bg-amber-500 rounded-full"></span>
                            收益与解锁
                        </h4>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Standard Rewards */}
                            <div className="bg-white/80 dark:bg-black/40 border border-amber-100 dark:border-amber-500/10 rounded-xl p-5 shadow-sm dark:shadow-none">
                                <h5 className="text-sm font-black text-amber-700 dark:text-amber-400 mb-4 opacity-80">数值收益</h5>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-1 block">经验属性</label>
                                        <div className="flex gap-2">
                                            <input
                                                value={nodeForm.expName}
                                                onChange={(e) => setNodeForm({ ...nodeForm, expName: e.target.value })}
                                                placeholder="属性名 (如: 编程经验)"
                                                className="w-2/3 bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white focus:border-amber-400 outline-none text-sm transition-colors"
                                            />
                                            <input
                                                type="number"
                                                min="0"
                                                value={nodeForm.expValue}
                                                onChange={(e) => setNodeForm({ ...nodeForm, expValue: parseInt(e.target.value, 10) || 0 })}
                                                placeholder="点数"
                                                className="w-1/3 bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white focus:border-amber-400 outline-none text-sm transition-colors"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-1 block">金币奖励</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={nodeForm.rewardCoins}
                                            onChange={(e) => setNodeForm({ ...nodeForm, rewardCoins: parseInt(e.target.value, 10) || 0 })}
                                            className="w-full bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white focus:border-amber-400 outline-none font-mono transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Item Rewards */}
                            <div className="bg-white/80 dark:bg-black/40 border border-amber-100 dark:border-amber-500/10 rounded-xl p-5 shadow-sm dark:shadow-none">
                                <h5 className="text-sm font-black text-amber-700 dark:text-amber-400 mb-4 opacity-80">实物/道具收益</h5>
                                <div className="space-y-4">
                                    <div>
                                        <label className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-1 block">奖励道具</label>
                                        <select
                                            value={nodeForm.rewardItemKey}
                                            onChange={(e) => setNodeForm({ ...nodeForm, rewardItemKey: e.target.value })}
                                            className="w-full bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white focus:border-amber-400 outline-none text-sm transition-colors"
                                        >
                                            <option value="">不设置</option>
                                            {rewardItemOptions.map((item) => (
                                                <option key={item.key} value={item.key}>
                                                    {item.label} ({item.source === 'store' ? '商城商品' : item.key})
                                                </option>
                                            ))}
                                        </select>
                                        {rewardItemOptions.length === 0 && (
                                            <p className="text-[10px] text-amber-600 dark:text-amber-400/80 mt-1.5 flex items-center gap-1">
                                                <span className="w-1 h-1 bg-amber-500 rounded-full inline-block"></span>
                                                需先在系统商城上架“道具”商品
                                            </p>
                                        )}
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-1 block">数量</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={nodeForm.rewardItemQuantity}
                                            onChange={(e) => setNodeForm({ ...nodeForm, rewardItemQuantity: parseInt(e.target.value, 10) || 1 })}
                                            className="w-full bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white focus:border-amber-400 outline-none font-mono transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            {/* Feature Unlock Mission */}
                            <div className="lg:col-span-2 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/10 dark:to-indigo-900/10 border border-blue-100 dark:border-blue-500/20 rounded-xl p-5 shadow-sm dark:shadow-none">
                                <h5 className="text-sm font-black text-blue-700 dark:text-blue-400 mb-4 opacity-80">稀有解锁功能 (如触发隐藏任务)</h5>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-1 block">关联任务 ID</label>
                                        <input
                                            value={nodeForm.unlockMissionId}
                                            onChange={(e) => setNodeForm({ ...nodeForm, unlockMissionId: e.target.value })}
                                            placeholder="输入系统内部 Mission List ID"
                                            className="w-full bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white focus:border-blue-400 outline-none text-sm transition-colors font-mono"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-1 block">解锁任务代号</label>
                                        <input
                                            value={nodeForm.unlockMissionTitle}
                                            onChange={(e) => setNodeForm({ ...nodeForm, unlockMissionTitle: e.target.value })}
                                            placeholder="展现给用户的解锁提示名称"
                                            className="w-full bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white focus:border-blue-400 outline-none text-sm transition-colors"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="text-[10px] font-bold tracking-widest text-gray-400 dark:text-gray-500 uppercase mb-1 block">解锁介绍描述</label>
                                        <input
                                            value={nodeForm.unlockMissionDescription}
                                            onChange={(e) => setNodeForm({ ...nodeForm, unlockMissionDescription: e.target.value })}
                                            placeholder="描述此隐藏任务的作用..."
                                            className="w-full bg-white dark:bg-black/60 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white focus:border-blue-400 outline-none text-sm transition-colors"
                                        />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 mt-8 pt-6 border-t border-gray-200 dark:border-white/10">
                    <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleCreateMissionNode}
                        disabled={isCreatingNode}
                        className="flex-1 bg-indigo-500 text-white rounded-xl py-4 font-black tracking-[0.2em] transition-all shadow-[0_4px_14px_0_rgba(99,102,241,0.39)] disabled:opacity-50 uppercase relative overflow-hidden group"
                    >
                        {isCreatingNode ? '部署中 (Deploying...)' : '注入新节点 [CREATE]'}
                    </motion.button>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={closeAndReset}
                        className="px-8 sm:px-12 bg-gray-100 hover:bg-red-50 text-gray-500 hover:text-red-500 dark:bg-white/5 dark:hover:bg-red-500/10 dark:text-white/60 dark:hover:text-red-400 py-4 font-bold tracking-widest rounded-xl transition-all uppercase border border-transparent dark:border-white/5 dark:hover:border-red-500/30"
                    >
                        废弃 [ABORT]
                    </motion.button>
                </div>
            </div>
        </Modal>
    );
};

export default TaskFormModal;