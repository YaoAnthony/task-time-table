import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { FaPlus, FaTrash, FaEdit, FaCheck, FaTimes, FaInfinity } from 'react-icons/fa';
import { message, Switch } from 'antd';
import {
    useGetDailyQuestPoolQuery,
    useGetDailyQuestSettingsQuery,
    useCreateDailyQuestMutation,
    useUpdateDailyQuestMutation,
    useDeleteDailyQuestMutation,
    useUpdateDailyQuestSettingsMutation,
    type DailyQuest,
} from '../../../../api/systemRtkApi';

interface Props {
    systemId: string;
}

interface QuestFormState {
    title: string;
    description: string;
    coins: number;
    isUnlimited: boolean;
    maxCompletions: number;
    isActive: boolean;
}

const EMPTY_FORM: QuestFormState = {
    title: '',
    description: '',
    coins: 0,
    isUnlimited: false,
    maxCompletions: 1,
    isActive: true,
};

const DailyQuestPanel: React.FC<Props> = ({ systemId }) => {
    const { data: poolData, refetch: refetchPool } = useGetDailyQuestPoolQuery({ systemId });
    const { data: settingsData, refetch: refetchSettings } = useGetDailyQuestSettingsQuery({ systemId });

    const [createQuest] = useCreateDailyQuestMutation();
    const [updateQuest] = useUpdateDailyQuestMutation();
    const [deleteQuest] = useDeleteDailyQuestMutation();
    const [updateSettings] = useUpdateDailyQuestSettingsMutation();

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<QuestFormState>(EMPTY_FORM);
    const [dailyCount, setDailyCount] = useState(3);
    const [enabled, setEnabled] = useState(true);
    const [savingSettings, setSavingSettings] = useState(false);

    const pool: DailyQuest[] = poolData?.pool || [];
    const settings = settingsData?.settings;

    useEffect(() => {
        if (settings) {
            setDailyCount(settings.dailyCount);
            setEnabled(settings.enabled);
        }
    }, [settings]);

    const handleSaveSettings = async () => {
        setSavingSettings(true);
        try {
            await updateSettings({ systemId, dailyCount, enabled }).unwrap();
            message.success('设置已保存');
            refetchSettings();
        } catch {
            message.error('保存设置失败');
        } finally {
            setSavingSettings(false);
        }
    };

    const openCreate = () => {
        setEditingId(null);
        setForm(EMPTY_FORM);
        setShowForm(true);
    };

    const openEdit = (q: DailyQuest) => {
        setEditingId(q._id);
        setForm({
            title: q.title,
            description: q.description,
            coins: q.rewards?.coins || 0,
            isUnlimited: q.isUnlimited,
            maxCompletions: q.maxCompletions,
            isActive: q.isActive,
        });
        setShowForm(true);
    };

    const handleSubmit = async () => {
        if (!form.title.trim()) {
            message.warning('请填写任务名称');
            return;
        }
        const body = {
            systemId,
            title: form.title.trim(),
            description: form.description,
            rewards: { coins: form.coins, experience: [], items: [] },
            isUnlimited: form.isUnlimited,
            maxCompletions: form.maxCompletions,
            isActive: form.isActive,
        };
        try {
            if (editingId) {
                await updateQuest({ ...body, questId: editingId }).unwrap();
                message.success('已更新');
            } else {
                await createQuest(body).unwrap();
                message.success('已创建');
            }
            setShowForm(false);
            refetchPool();
        } catch {
            message.error('操作失败');
        }
    };

    const handleDelete = async (questId: string) => {
        try {
            await deleteQuest({ systemId, questId }).unwrap();
            message.success('已删除');
            refetchPool();
        } catch {
            message.error('删除失败');
        }
    };

    const handleToggleActive = async (q: DailyQuest) => {
        try {
            await updateQuest({ systemId, questId: q._id, isActive: !q.isActive }).unwrap();
            refetchPool();
        } catch {
            message.error('操作失败');
        }
    };

    return (
        <div className="h-full overflow-y-auto p-6 space-y-6">
            {/* Settings */}
            <div className="rounded-xl border border-gray-200/50 dark:border-white/10 bg-white/50 dark:bg-white/5 p-5">
                <h3 className="text-sm font-bold tracking-widest text-gray-700 dark:text-white/80 mb-4">每日任务设置</h3>
                <div className="flex flex-wrap items-center gap-6">
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 dark:text-white/60 tracking-wide">每日派发数量</span>
                        <input
                            type="number"
                            min={1}
                            max={20}
                            value={dailyCount}
                            onChange={e => setDailyCount(Math.max(1, Math.min(20, Number(e.target.value))))}
                            className="w-16 text-center px-2 py-1 rounded border border-gray-300 dark:border-white/20 bg-white dark:bg-black/40 text-gray-800 dark:text-white text-sm"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-sm text-gray-600 dark:text-white/60 tracking-wide">功能开关</span>
                        <Switch
                            checked={enabled}
                            onChange={setEnabled}
                            checkedChildren="开启"
                            unCheckedChildren="关闭"
                        />
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={handleSaveSettings}
                        disabled={savingSettings}
                        className="px-4 py-1.5 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold tracking-wider transition-colors disabled:opacity-50"
                    >
                        保存设置
                    </motion.button>
                </div>
            </div>

            {/* Quest pool header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold tracking-widest text-gray-700 dark:text-white/80">任务池</h3>
                    <p className="text-xs text-gray-400 dark:text-white/40 mt-0.5">共 {pool.length} 个任务 · 每天从中随机抽取 {dailyCount} 个派发给成员</p>
                </div>
                <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={openCreate}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-400 text-sm font-bold tracking-wider transition-all"
                >
                    <FaPlus className="text-xs" />
                    新建任务
                </motion.button>
            </div>

            {/* Create/Edit form */}
            {showForm && (
                <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-5 space-y-4"
                >
                    <h4 className="text-sm font-bold tracking-widest text-blue-400">
                        {editingId ? '编辑任务' : '新建任务'}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs text-gray-500 dark:text-white/50 tracking-wide block mb-1">任务名称 *</label>
                            <input
                                value={form.title}
                                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                                placeholder="如：每日签到"
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-black/40 text-sm text-gray-800 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="text-xs text-gray-500 dark:text-white/50 tracking-wide block mb-1">金币奖励</label>
                            <input
                                type="number"
                                min={0}
                                value={form.coins}
                                onChange={e => setForm(f => ({ ...f, coins: Math.max(0, Number(e.target.value)) }))}
                                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-black/40 text-sm text-gray-800 dark:text-white"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs text-gray-500 dark:text-white/50 tracking-wide block mb-1">任务描述</label>
                        <textarea
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            rows={2}
                            placeholder="可选，描述任务内容..."
                            className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-white/20 bg-white dark:bg-black/40 text-sm text-gray-800 dark:text-white resize-none"
                        />
                    </div>
                    <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-white/50 tracking-wide">无限次完成</span>
                            <Switch
                                size="small"
                                checked={form.isUnlimited}
                                onChange={v => setForm(f => ({ ...f, isUnlimited: v }))}
                            />
                        </div>
                        {!form.isUnlimited && (
                            <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-500 dark:text-white/50 tracking-wide">每日上限</span>
                                <input
                                    type="number"
                                    min={1}
                                    value={form.maxCompletions}
                                    onChange={e => setForm(f => ({ ...f, maxCompletions: Math.max(1, Number(e.target.value)) }))}
                                    className="w-14 text-center px-2 py-1 rounded border border-gray-300 dark:border-white/20 bg-white dark:bg-black/40 text-sm text-gray-800 dark:text-white"
                                />
                                <span className="text-xs text-gray-400">次</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-gray-500 dark:text-white/50 tracking-wide">启用</span>
                            <Switch
                                size="small"
                                checked={form.isActive}
                                onChange={v => setForm(f => ({ ...f, isActive: v }))}
                            />
                        </div>
                    </div>
                    <div className="flex gap-3">
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={handleSubmit}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-white text-sm font-bold tracking-wider transition-colors"
                        >
                            <FaCheck />
                            {editingId ? '保存修改' : '创建'}
                        </motion.button>
                        <motion.button
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setShowForm(false)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/30 text-gray-400 text-sm font-bold tracking-wider transition-all"
                        >
                            <FaTimes />
                            取消
                        </motion.button>
                    </div>
                </motion.div>
            )}

            {/* Quest list */}
            {pool.length === 0 ? (
                <div className="text-center py-12 text-gray-400 dark:text-white/30 text-sm tracking-widest">
                    暂无任务，点击「新建任务」添加
                </div>
            ) : (
                <div className="space-y-3">
                    {pool.map(q => (
                        <motion.div
                            key={q._id}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className={`rounded-xl border p-4 flex items-center justify-between gap-4 transition-all ${
                                q.isActive
                                    ? 'border-gray-200/50 dark:border-white/10 bg-white/50 dark:bg-white/5'
                                    : 'border-gray-200/30 dark:border-white/5 bg-gray-100/30 dark:bg-white/2 opacity-60'
                            }`}
                        >
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-bold text-sm text-gray-800 dark:text-white tracking-wide">{q.title}</span>
                                    {q.isUnlimited ? (
                                        <span className="text-xs px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 flex items-center gap-1">
                                            <FaInfinity className="text-[10px]" /> 无限
                                        </span>
                                    ) : (
                                        <span className="text-xs px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                            每日 {q.maxCompletions} 次
                                        </span>
                                    )}
                                    {!q.isActive && (
                                        <span className="text-xs px-2 py-0.5 rounded bg-gray-500/20 text-gray-400 border border-gray-500/30">已停用</span>
                                    )}
                                    {(q.rewards?.coins || 0) > 0 && (
                                        <span className="text-xs text-yellow-400">🪙 {q.rewards.coins}</span>
                                    )}
                                </div>
                                {q.description && (
                                    <p className="text-xs text-gray-500 dark:text-white/40 mt-1 truncate">{q.description}</p>
                                )}
                                <p className="text-xs text-gray-400 dark:text-white/30 mt-1">累计完成 {q.totalCompletions} 次</p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={() => handleToggleActive(q)}
                                    className="text-xs text-gray-400 hover:text-gray-700 dark:hover:text-white px-2 py-1 rounded border border-gray-300/30 dark:border-white/10 hover:bg-gray-100 dark:hover:bg-white/10 transition-all"
                                >
                                    {q.isActive ? '停用' : '启用'}
                                </button>
                                <button
                                    onClick={() => openEdit(q)}
                                    className="p-2 rounded-lg text-blue-400 hover:bg-blue-500/10 transition-colors"
                                >
                                    <FaEdit className="text-sm" />
                                </button>
                                <button
                                    onClick={() => handleDelete(q._id)}
                                    className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors"
                                >
                                    <FaTrash className="text-sm" />
                                </button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default DailyQuestPanel;
