import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import { FaGamepad } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import type { MissionListType, SystemWithMission, MissionList } from '../../../../Types/System';

import TaskTree2D from './TaskTree2D';
import TaskFormModal from './TaskFormModal';
import CreateTaskModal from './CreateTaskModal';
import EditTaskModal from './EditTaskModal';
import {
    useLazyGetSystemListQuery,
    useCreateMissionListMutation,
    useUpdateMissionListMutation,
    useDeleteMissionListMutation,
    useDeleteMissionNodeMutation,
} from '../../../../api/systemRtkApi';

const createInitialListForm = () => ({
    listType: 'mainline' as MissionListType,
    title: '',
    image: '',
    description: '',
    unlockType: 'direct' as 'direct' | 'attributeLevel',
    unlockAttributeName: '',
    unlockMinLevel: 0,
    failureEnabled: false,
    pointPenaltyAttributeName: '',
    pointPenaltyValue: 1,
    itemPenaltyItemKey: '',
    itemPenaltyQuantity: 1,
});

const TaskChainPanel: React.FC<{ systemId: string }> = ({ systemId }) => {
    const systems = useSelector((state: RootState) => state.system.systems);
    const currentSystemData = systems.find((sys) => sys._id === systemId) as SystemWithMission | undefined;
    const missionLists = useMemo(() => currentSystemData?.missionLists || [], [currentSystemData]);
    const obtainableItems = useMemo(() => currentSystemData?.obtainableItems || [], [currentSystemData]);
    const rewardItemOptions = useMemo(() => {
        const options: Array<{ key: string; label: string; source: 'store' | 'obtainable' }> = [];
        const keySet = new Set<string>();

        for (const product of currentSystemData?.storeProducts || []) {
            if (product.type !== 'item') continue;
            if (keySet.has(product._id)) continue;
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

    const [selectedMissionListId, setSelectedMissionListId] = useState<string>('');
    const [showListForm, setShowListForm] = useState(false);
    const [showEditListForm, setShowEditListForm] = useState(false);
    const [showNodeForm, setShowNodeForm] = useState(false);
    const [nodeParentAnchor, setNodeParentAnchor] = useState('');

    const [listForm, setListForm] = useState(createInitialListForm);
    const [editListForm, setEditListForm] = useState(createInitialListForm);

    const [triggerGetSystemList, { isLoading }] = useLazyGetSystemListQuery();
    const [createMissionList, { isLoading: isCreatingList }] = useCreateMissionListMutation();
    const [updateMissionList, { isLoading: isUpdatingList }] = useUpdateMissionListMutation();
    const [deleteMissionList, { isLoading: isDeletingList }] = useDeleteMissionListMutation();
    const [deleteMissionNode, { isLoading: isDeletingNode }] = useDeleteMissionNodeMutation();

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    useEffect(() => {
        if (!selectedMissionListId && missionLists.length > 0) {
            setSelectedMissionListId(missionLists[0]._id);
        }
    }, [missionLists, selectedMissionListId]);

    const selectedMissionList = missionLists.find((list) => list._id === selectedMissionListId);

    const resetListForm = () => {
        setListForm(createInitialListForm());
    };

    const fillEditListForm = (missionList: MissionList) => {
        setEditListForm({
            listType: missionList.listType,
            title: missionList.title || '',
            image: missionList.image || '',
            description: missionList.description || '',
            unlockType: missionList.unlockCondition?.type === 'attributeLevel' ? 'attributeLevel' : 'direct',
            unlockAttributeName: missionList.unlockCondition?.attributeName || '',
            unlockMinLevel: Number(missionList.unlockCondition?.minLevel || 0),
            failureEnabled: !!missionList.failureMechanism?.enabled,
            pointPenaltyAttributeName: missionList.failureMechanism?.pointPenalty?.[0]?.attributeName || '',
            pointPenaltyValue: Number(missionList.failureMechanism?.pointPenalty?.[0]?.value || 1),
            itemPenaltyItemKey: missionList.failureMechanism?.itemPenalty?.[0]?.itemKey || '',
            itemPenaltyQuantity: Number(missionList.failureMechanism?.itemPenalty?.[0]?.quantity || 1),
        });
    };

    const handleCreateMissionList = async () => {
        if (!listForm.title.trim()) {
            message.error('请填写任务列表标题');
            return;
        }

        if (listForm.unlockType === 'attributeLevel' && !listForm.unlockAttributeName.trim()) {
            message.error('请填写解锁所需属性名称');
            return;
        }

        try {
            const payload = {
                systemId,
                listType: listForm.listType,
                title: listForm.title.trim(),
                image: listForm.image.trim() || undefined,
                description: listForm.description.trim(),
                unlockCondition: {
                    type: listForm.unlockType,
                    attributeName: listForm.unlockType === 'attributeLevel' ? listForm.unlockAttributeName.trim() : null,
                    minLevel: listForm.unlockType === 'attributeLevel' ? Math.max(0, listForm.unlockMinLevel) : 0,
                },
                failureMechanism: {
                    enabled: listForm.failureEnabled,
                    pointPenalty: listForm.failureEnabled && listForm.pointPenaltyAttributeName.trim()
                        ? [{
                            attributeName: listForm.pointPenaltyAttributeName.trim(),
                            value: Math.max(1, listForm.pointPenaltyValue),
                        }]
                        : [],
                    itemPenalty: listForm.failureEnabled && listForm.itemPenaltyItemKey
                        ? [{
                            itemKey: listForm.itemPenaltyItemKey,
                            quantity: Math.max(1, listForm.itemPenaltyQuantity),
                        }]
                        : [],
                },
            };

            const res = await createMissionList(payload).unwrap() as { missionList?: MissionList };
            message.success('任务列表创建成功');
            setShowListForm(false);
            resetListForm();
            await triggerGetSystemList().unwrap();

            if (res?.missionList?._id) {
                setSelectedMissionListId(res.missionList._id);
            }
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '任务列表创建失败');
        }
    };

    const openEditMissionListModal = () => {
        if (!selectedMissionList) {
            message.warning('请先选择任务列表');
            return;
        }
        fillEditListForm(selectedMissionList);
        setShowEditListForm(true);
    };

    const handleUpdateMissionList = async () => {
        if (!selectedMissionList) {
            message.error('请先选择任务列表');
            return;
        }

        if (!editListForm.title.trim()) {
            message.error('请填写任务列表标题');
            return;
        }

        if (editListForm.unlockType === 'attributeLevel' && !editListForm.unlockAttributeName.trim()) {
            message.error('请填写解锁所需属性名称');
            return;
        }

        try {
            await updateMissionList({
                systemId,
                missionListId: selectedMissionList._id,
                listType: editListForm.listType,
                title: editListForm.title.trim(),
                image: editListForm.image.trim() || undefined,
                description: editListForm.description.trim(),
                unlockCondition: {
                    type: editListForm.unlockType,
                    attributeName: editListForm.unlockType === 'attributeLevel' ? editListForm.unlockAttributeName.trim() : null,
                    minLevel: editListForm.unlockType === 'attributeLevel' ? Math.max(0, editListForm.unlockMinLevel) : 0,
                },
                failureMechanism: {
                    enabled: editListForm.failureEnabled,
                    pointPenalty: editListForm.failureEnabled && editListForm.pointPenaltyAttributeName.trim()
                        ? [{
                            attributeName: editListForm.pointPenaltyAttributeName.trim(),
                            value: Math.max(1, editListForm.pointPenaltyValue),
                        }]
                        : [],
                    itemPenalty: editListForm.failureEnabled && editListForm.itemPenaltyItemKey
                        ? [{
                            itemKey: editListForm.itemPenaltyItemKey,
                            quantity: Math.max(1, editListForm.itemPenaltyQuantity),
                        }]
                        : [],
                },
            }).unwrap();

            message.success('任务列表已更新');
            setShowEditListForm(false);
            await triggerGetSystemList().unwrap();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '任务列表更新失败');
        }
    };

    const handleDeleteMissionList = async () => {
        if (!selectedMissionList) {
            message.error('请先选择任务列表');
            return;
        }

        const confirmed = window.confirm(`确认删除任务列表「${selectedMissionList.title}」？\n\n删除后会同步清理所有成员在该任务列表下的接取状态、进行中任务、完成记录与历史记录。`);
        if (!confirmed) return;

        try {
            await deleteMissionList({
                systemId,
                missionListId: selectedMissionList._id,
            }).unwrap() as {
                cleanup?: {
                    affectedMembers?: number;
                    removedTaskCompletions?: number;
                    removedTaskHistories?: number;
                };
            };

            message.success('任务列表已删除，并完成成员历史清理');
            setShowEditListForm(false);
            setSelectedMissionListId('');
            await triggerGetSystemList().unwrap();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '任务列表删除失败');
        }
    };

    const handleDeleteMissionNode = async (nodeId: string) => {
        if (!selectedMissionList) return;

        const taskTree = selectedMissionList.taskTree || [];
        const targetNode = taskTree.find((n) => n.nodeId === nodeId);
        if (!targetNode) return;

        const isRoot = selectedMissionList.rootNodeId === nodeId;
        const childCount = targetNode.childrenNodeIds?.length ?? 0;

        // 计算会被级联删除的子树节点数（用于提示）
        const collectSubtreeIds = (rootId: string): string[] => {
            const ids: string[] = [];
            const queue = [rootId];
            while (queue.length > 0) {
                const curr = queue.shift()!;
                ids.push(curr);
                const n = taskTree.find((nd) => nd.nodeId === curr);
                if (n) queue.push(...n.childrenNodeIds);
            }
            return ids;
        };

        let confirmMsg = `确认删除节点「${targetNode.title}」？\n\n`;
        if (isRoot && childCount > 0) {
            const newRootNode = taskTree.find((n) => n.nodeId === targetNode.childrenNodeIds[0]);
            const newRootTitle = newRootNode?.title ?? targetNode.childrenNodeIds[0];
            confirmMsg += `该节点是根节点，「${newRootTitle}」将成为新的根节点。`;
            if (childCount > 1) {
                const slotsAvailable = 3 - (newRootNode?.childrenNodeIds?.length ?? 0);
                const cascadeCount = childCount - 1 - slotsAvailable;
                if (cascadeCount > 0) {
                    const cascadeSubtreeSize = targetNode.childrenNodeIds.slice(1 + slotsAvailable)
                        .flatMap((id) => collectSubtreeIds(id)).length;
                    confirmMsg += `\n\n⚠️ 新根节点已无多余子节点槽位，${cascadeSubtreeSize} 个节点将被级联删除。`;
                }
            }
        } else if (!isRoot && childCount > 0) {
            const parentNode = taskTree.find((n) => n.nodeId === targetNode.parentNodeId);
            const slotsAvailable = parentNode ? 3 - (parentNode.childrenNodeIds.length - 1) : 0;
            const cascadeCount = Math.max(0, childCount - slotsAvailable);
            if (cascadeCount > 0) {
                const cascadeSubtreeSize = targetNode.childrenNodeIds.slice(slotsAvailable)
                    .flatMap((id) => collectSubtreeIds(id)).length;
                confirmMsg += `子节点会尽量拼接到父节点，但父节点槽位不足，${cascadeSubtreeSize} 个节点将被级联删除。`;
            } else {
                confirmMsg += `该节点的 ${childCount} 个子节点将拼接到父节点下。`;
            }
        } else {
            confirmMsg += '此操作不可撤销。';
        }

        const confirmed = window.confirm(confirmMsg);
        if (!confirmed) return;

        try {
            const res = await deleteMissionNode({
                systemId,
                missionListId: selectedMissionList._id,
                nodeId,
            }).unwrap();

            const deletedCount = res.deletedNodeIds?.length ?? 1;
            message.success(`节点已删除（共移除 ${deletedCount} 个节点）`);
            await triggerGetSystemList().unwrap();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '节点删除失败');
        }
    };

    return (
        <div className="p-8 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
            <div className="max-w-[1600px] mx-auto w-full">
                <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 mb-6 shadow-sm dark:shadow-none">
                    <h3 className="text-lg font-bold tracking-widest mb-2 text-blue-600 dark:text-blue-300">任务链定义</h3>
                    <p className="text-sm text-gray-500 dark:text-white/50 mb-4">支持主线任务和紧急任务，创建任务树头节点与子任务（每个节点最多3个子任务）</p>

                    <div className="flex flex-wrap gap-3">
                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowListForm(true)}
                            className="bg-blue-500 hover:bg-blue-400 text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-colors"
                        >
                            + 创建系列任务
                        </motion.button>

                        <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={openEditMissionListModal}
                            disabled={!selectedMissionList}
                            className="bg-indigo-500 hover:bg-indigo-400 text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            编辑选中任务列表
                        </motion.button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-[1fr_2.5fr] gap-6">
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
                                    <button
                                        key={list._id}
                                        onClick={() => setSelectedMissionListId(list._id)}
                                        className={`w-full text-left rounded-lg border p-4 transition-colors ${selectedMissionListId === list._id
                                            ? 'border-blue-400 bg-blue-50 dark:bg-blue-500/10'
                                            : 'border-gray-200 dark:border-white/10 bg-white/40 dark:bg-black/20 hover:border-gray-300 dark:hover:border-white/30 shadow-sm dark:shadow-none'
                                        }`}
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
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white/40 dark:bg-black/40 border border-indigo-200 dark:border-indigo-500/30 rounded-xl p-1 relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 z-10 pointer-events-none">
                            <h4 className="text-md font-black tracking-widest text-indigo-500 dark:text-indigo-400 drop-shadow-[0_0_10px_rgba(99,102,241,0.2)] dark:drop-shadow-[0_0_10px_rgba(99,102,241,0.8)]">2D 任务树形图</h4>
                        </div>
                        {!selectedMissionList ? (
                            <div className="h-[500px] flex items-center justify-center bg-gray-50 dark:bg-black/80 rounded-lg border border-gray-200 dark:border-white/5">
                                <p className="text-gray-400 dark:text-white/30 font-mono tracking-widest animate-pulse">Awaiting System Selection...</p>
                            </div>
                        ) : (
                            <TaskTree2D 
                                taskTree={selectedMissionList.taskTree}
                                rootNodeId={selectedMissionList.rootNodeId}
                                onNodeClick={(nodeId) => {
                                    console.log('Clicked edit for node', nodeId);
                                    message.info('开发中: 编辑任务节点功能');
                                }}
                                onPhantomClick={(parentId) => {
                                    setNodeParentAnchor(parentId || '');
                                    setShowNodeForm(true);
                                }}
                                onNodeDelete={isDeletingNode ? undefined : handleDeleteMissionNode}
                            />
                        )}
                    </div>
                </div>

                <TaskFormModal
                    visible={showNodeForm}
                    onClose={() => {
                        setShowNodeForm(false);
                        setNodeParentAnchor('');
                    }}
                    systemId={systemId}
                    selectedMissionList={selectedMissionList}
                    rewardItemOptions={rewardItemOptions}
                    initialParentNodeId={nodeParentAnchor}
                />

                <CreateTaskModal
                    visible={showListForm}
                    isCreatingList={isCreatingList}
                    listForm={listForm}
                    rewardItemOptions={rewardItemOptions}
                    onListFormChange={setListForm}
                    onCreate={handleCreateMissionList}
                    onClose={() => setShowListForm(false)}
                    onCancel={() => {
                        resetListForm();
                        setShowListForm(false);
                    }}
                />

                <EditTaskModal
                    visible={showEditListForm}
                    selectedTitle={selectedMissionList?.title}
                    isUpdating={isUpdatingList}
                    isDeleting={isDeletingList}
                    listForm={editListForm}
                    rewardItemOptions={rewardItemOptions}
                    onListFormChange={setEditListForm}
                    onSave={handleUpdateMissionList}
                    onDelete={handleDeleteMissionList}
                    onClose={() => setShowEditListForm(false)}
                    onCancel={() => setShowEditListForm(false)}
                />
            </div>
        </div>
    );
};

export default TaskChainPanel;


