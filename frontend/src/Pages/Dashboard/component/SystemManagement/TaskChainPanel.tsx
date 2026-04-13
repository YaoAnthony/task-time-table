import React, { useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import { FaRobot } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import type { MissionList, SystemWithMission } from '../../../../Types/System';
import TaskDependencyGraph from './TaskDependencyGraph';
import TaskFormModal, { type EditableNode } from './TaskFormModal';
import CreateTaskModal from './CreateTaskModal';
import EditTaskModal from './EditTaskModal';
import AiAssistantModal from './ai-assistant/AiAssistantModal';
import DeleteMissionListDialog from './task-chain/components/DeleteMissionListDialog';
import MissionListSidebar from './task-chain/components/MissionListSidebar';
import { useTaskChainPanelController } from './task-chain/hooks/useTaskChainPanelController';
import type { TaskRewardItemOption } from './task-chain/taskChainForms';

const TaskChainPanel: React.FC<{ systemId: string }> = ({ systemId }) => {
    const systems = useSelector((state: RootState) => state.system.systems);
    const currentSystemData = systems.find((system) => system._id === systemId) as SystemWithMission | undefined;
    const missionLists = useMemo(() => currentSystemData?.missionLists || [], [currentSystemData]);
    const obtainableItems = useMemo(() => currentSystemData?.obtainableItems || [], [currentSystemData]);
    const rewardItemOptions = useMemo<TaskRewardItemOption[]>(() => {
        const options: TaskRewardItemOption[] = [];
        const keySet = new Set<string>();

        for (const product of currentSystemData?.storeProducts || []) {
            if (product.type !== 'item' || keySet.has(product._id)) continue;
            keySet.add(product._id);
            options.push({ key: product._id, label: product.name, source: 'store' });
        }

        for (const item of obtainableItems) {
            if (!item.itemKey || keySet.has(item.itemKey)) continue;
            keySet.add(item.itemKey);
            options.push({ key: item.itemKey, label: item.name || item.itemKey, source: 'obtainable' });
        }

        return options;
    }, [currentSystemData, obtainableItems]);

    const controller = useTaskChainPanelController({ systemId, missionLists });

    return (
        <div className="p-8 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
            <div className="max-w-[1600px] mx-auto w-full">
                <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 mb-6 shadow-sm dark:shadow-none">
                    <h3 className="text-lg font-bold tracking-widest mb-2 text-blue-600 dark:text-blue-300">任务链定义</h3>
                    <p className="text-sm text-gray-500 dark:text-white/50 mb-4">支持主线任务和紧急任务，创建任务树头节点与子任务（每个节点最多 3 个子任务）</p>

                    <div className="flex flex-wrap gap-3">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => controller.setShowListForm(true)}
                            className="bg-blue-500 hover:bg-blue-400 text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-colors"
                        >
                            + 创建系列任务
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={controller.openEditMissionListModal}
                            disabled={!controller.selectedMissionList}
                            className="bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            编辑选中任务列表
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => controller.setShowAiModal(true)}
                            className="flex items-center gap-2 bg-gradient-to-r from-violet-500 to-blue-600 hover:from-violet-400 hover:to-blue-500 text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-all shadow-[0_4px_12px_rgba(139,92,246,0.3)]"
                        >
                            <FaRobot className="text-sm" />
                            AI 模式
                        </motion.button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_2.5fr] gap-6">
                    <MissionListSidebar
                        missionLists={missionLists}
                        isLoading={controller.isLoading}
                        selectedMissionListId={controller.selectedMissionListId}
                        onSelect={controller.setSelectedMissionListId}
                        onRequestDelete={controller.handleRequestDeleteMissionList}
                    />

                    <div className="bg-white/40 dark:bg-black/40 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-1 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 z-10 pointer-events-none">
                            <h4 className="text-md font-black tracking-widest text-indigo-500 dark:text-indigo-400 drop-shadow-[0_0_10px_rgba(99,102,241,0.2)] dark:drop-shadow-[0_0_10px_rgba(99,102,241,0.8)]">Task Dependency View</h4>
                        </div>
                        {!controller.selectedMissionList ? (
                            <div className="h-[500px] flex items-center justify-center bg-gray-50 dark:bg-black/80 rounded-lg border border-gray-200 dark:border-white/5">
                                <p className="text-gray-400 dark:text-white/30 font-mono tracking-widest animate-pulse">Awaiting System Selection...</p>
                            </div>
                        ) : (
                            <TaskDependencyGraph
                                taskTree={controller.selectedMissionList.taskTree}
                                rootNodeId={controller.selectedMissionList.rootNodeId}
                                onNodeClick={(nodeId) => {
                                    const node = controller.selectedMissionList?.taskTree.find((item: MissionList['taskTree'][number]) => item.nodeId === nodeId);
                                    if (!node) return;
                                    controller.openEditNodeForm({
                                        nodeId: node.nodeId,
                                        title: node.title,
                                        description: node.description,
                                        content: node.content,
                                        notice: node.notice,
                                        timeCostMinutes: node.timeCostMinutes,
                                        canInterrupt: node.canInterrupt,
                                        rewards: node.rewards as EditableNode['rewards'],
                                    });
                                }}
                                onPhantomClick={(parentId) => controller.openCreateNodeForm(parentId || '')}
                                onNodeDelete={controller.isDeletingNode ? undefined : controller.handleDeleteMissionNode}
                            />
                        )}
                    </div>
                </div>

                <TaskFormModal
                    visible={controller.showNodeForm}
                    onClose={controller.closeNodeForm}
                    systemId={systemId}
                    selectedMissionList={controller.selectedMissionList}
                    rewardItemOptions={rewardItemOptions}
                    initialParentNodeId={controller.nodeParentAnchor}
                    editNode={controller.editingNode}
                />

                <CreateTaskModal
                    visible={controller.showListForm}
                    isCreatingList={controller.isCreatingList}
                    listForm={controller.listForm}
                    rewardItemOptions={rewardItemOptions}
                    onListFormChange={controller.setListForm}
                    onCreate={controller.handleCreateMissionList}
                    onClose={() => controller.setShowListForm(false)}
                    onCancel={() => {
                        controller.resetListForm();
                        controller.setShowListForm(false);
                    }}
                />

                <EditTaskModal
                    visible={controller.showEditListForm}
                    selectedTitle={controller.selectedMissionList?.title}
                    isUpdating={controller.isUpdatingList}
                    isDeleting={controller.isDeletingList}
                    listForm={controller.editListForm}
                    rewardItemOptions={rewardItemOptions}
                    onListFormChange={controller.setEditListForm}
                    onSave={controller.handleUpdateMissionList}
                    onDelete={() => {
                        if (controller.selectedMissionList) {
                            controller.handleRequestDeleteMissionList(
                                controller.selectedMissionList._id,
                                controller.selectedMissionList.title,
                                controller.selectedMissionList.taskTree?.length || 0,
                            );
                        }
                    }}
                    onClose={() => controller.setShowEditListForm(false)}
                    onCancel={() => controller.setShowEditListForm(false)}
                />

                <DeleteMissionListDialog
                    deleteTarget={controller.deleteTarget}
                    isDeleting={controller.isDeletingList}
                    onConfirm={controller.handleConfirmDeleteMissionList}
                    onCancel={() => controller.setDeleteTarget(null)}
                />
            </div>

            <AnimatePresence>
                {controller.showAiModal && (
                    <AiAssistantModal
                        systemId={systemId}
                        systemName={currentSystemData?.name || ''}
                        onClose={() => controller.setShowAiModal(false)}
                        onCreated={(id) => {
                            controller.setSelectedMissionListFromCreated(id);
                            message.success('AI 已自动创建任务列表，已为你选中');
                        }}
                    />
                )}
            </AnimatePresence>
        </div>
    );
};

export default TaskChainPanel;

