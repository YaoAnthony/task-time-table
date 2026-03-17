import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import {
    FaDice, FaTrash, FaMagic, FaPlus, FaCog, FaTimes,
    FaGem, FaStar, FaToggleOn, FaToggleOff,
} from 'react-icons/fa';

import Modal from '../../../../Component/Modal';
import { RootState } from '../../../../Redux/store';
import { SystemLite } from '../../../../Redux/Features/systemSlice';
import { GenshinTier, LotteryPool, SimplePrize } from '../../../../Types/Lottery';
import type { StoreProduct } from '../../../../Types/System';
import {
    useLazyGetSystemListQuery,
    useCreateLotteryPoolMutation,
    useUpdateLotteryPoolMutation,
    useDeleteLotteryPoolMutation,
    useGeneratePoolDescriptionMutation,
    useAddSimplePrizeMutation,
    useDeleteSimplePrizeMutation,
    useUpdateGenshinTierMutation,
    useAddGenshinTierItemMutation,
    useDeleteGenshinTierItemMutation,
} from '../../../../api/systemRtkApi';

// ─── Tier metadata ────────────────────────────────────────────────────────────
const TIER_META = [
    { index: 0, label: '限定 (T0)', color: 'from-yellow-500/20 to-amber-400/10 dark:from-yellow-500/30 dark:to-amber-400/20', border: 'border-yellow-300 dark:border-yellow-400/50', badge: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-300', icon: <FaStar className="text-yellow-500 dark:text-yellow-400" /> },
    { index: 1, label: '精锐 (T1)', color: 'from-purple-500/20 to-indigo-400/10 dark:from-purple-500/30 dark:to-indigo-400/20', border: 'border-purple-300 dark:border-purple-400/50', badge: 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300', icon: <FaGem className="text-purple-500 dark:text-purple-400" /> },
    { index: 2, label: '普通 (T2)', color: 'from-gray-200/50 to-gray-100/30 dark:from-gray-500/20 dark:to-gray-400/10', border: 'border-gray-300 dark:border-gray-400/30', badge: 'bg-gray-100 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400', icon: <FaDice className="text-gray-500 dark:text-gray-400" /> },
];

// ─── Shared input/label styles ────────────────────────────────────────────────
const inp = 'w-full bg-white dark:bg-white/10 border border-gray-300 dark:border-white/20 rounded-lg px-3 py-2 text-gray-800 dark:text-white text-sm placeholder-gray-400 dark:placeholder-white/30 focus:outline-none focus:border-purple-400 dark:focus:border-white/40';
const lbl = 'text-xs font-semibold text-gray-500 dark:text-white/50 uppercase tracking-wider mb-1 block';

// ─── Create Pool Modal ────────────────────────────────────────────────────────
interface CreatePoolModalProps {
    isOpen: boolean;
    onClose: () => void;
    onCreated: (poolId: string) => void;
    systemId: string;
    storeProducts: StoreProduct[];
}
const CreatePoolModal: React.FC<CreatePoolModalProps> = ({ isOpen, onClose, onCreated, systemId, storeProducts }) => {
    const [form, setForm] = useState({ name: '', description: '', image: '', drawMode: 'simple' as 'simple' | 'genshin', consumeType: 'none' as 'none' | 'item' | 'coins', consumeItemKey: '', consumeQty: 1 });
    const [createPool, { isLoading }] = useCreateLotteryPoolMutation();
    const [triggerList] = useLazyGetSystemListQuery();

    const handleCreate = async () => {
        if (!form.name.trim()) return message.error('请填写卡池名称');
        try {
            const res = await createPool({
                systemId,
                name: form.name.trim(),
                description: form.description,
                image: form.image || undefined,
                drawMode: form.drawMode,
                consume: { type: form.consumeType, itemKey: form.consumeType === 'item' ? form.consumeItemKey : null, quantity: form.consumeQty },
            }).unwrap();
            const pools = (res as { lotteryPools?: Array<{ _id: string }> }).lotteryPools || [];
            const newId = pools[pools.length - 1]?._id || '';
            await triggerList().unwrap();
            onCreated(newId);
            message.success('卡池创建成功');
            onClose();
        } catch (e) {
            message.error((e as { data?: { message?: string } })?.data?.message || '创建失败');
        }
    };

    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="p-6 min-w-[380px] max-w-[480px] space-y-4 bg-white dark:bg-transparent rounded-2xl">
                <h2 className="text-xl font-bold text-gray-800 dark:text-white tracking-widest">✨ 新建卡池</h2>

                <div><label className={lbl}>卡池名称 *</label>
                    <input className={inp} placeholder="如：新年限定祈愿" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>

                <div><label className={lbl}>封面图片 URL</label>
                    <input className={inp} placeholder="https://..." value={form.image} onChange={e => setForm({ ...form, image: e.target.value })} /></div>

                <div><label className={lbl}>描述（可留空）</label>
                    <textarea rows={2} className={inp} placeholder="卡池简介..." value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>

                <div>
                    <label className={lbl}>抽卡模式</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(['simple', 'genshin'] as const).map(m => (
                            <button key={m} onClick={() => setForm({ ...form, drawMode: m })}
                                className={`py-2 rounded-lg text-sm font-bold border transition-all ${form.drawMode === m
                                    ? 'bg-purple-500 border-purple-400 text-white shadow-[0_0_12px_rgba(168,85,247,0.3)]'
                                    : 'border-gray-300 dark:border-white/20 text-gray-500 dark:text-white/50 hover:border-purple-300 dark:hover:border-white/40'
                                }`}>
                                {m === 'simple' ? '🎲 普通随机' : '⭐ 原神保底'}
                            </button>
                        ))}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-white/30 mt-2">
                        {form.drawMode === 'simple' ? '每件物品独立设置概率，随机抽取' : '分三档（限定/精锐/普通），各档有保底机制'}
                    </p>
                </div>

                <div>
                    <label className={lbl}>每次消耗</label>
                    <div className="flex gap-2">
                        <select className={`flex-1 ${inp}`} value={form.consumeType} onChange={e => setForm({ ...form, consumeType: e.target.value as 'none' | 'item' | 'coins' })}>
                            <option value="none">无消耗</option>
                            <option value="coins">金币</option>
                            <option value="item">物品</option>
                        </select>
                        {form.consumeType !== 'none' && (
                            <input type="number" min={1} className={`w-24 ${inp}`} value={form.consumeQty} onChange={e => setForm({ ...form, consumeQty: Math.max(1, Number(e.target.value)) })} placeholder="数量" />
                        )}
                    </div>
                    {form.consumeType === 'item' && (
                        <select className={`mt-2 ${inp}`} value={form.consumeItemKey} onChange={e => setForm({ ...form, consumeItemKey: e.target.value })}>
                            <option value="">选择消耗物品</option>
                            {storeProducts.filter(p => p.type === 'item').map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                        </select>
                    )}
                </div>

                <div className="flex gap-2 pt-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-white/20 text-gray-600 dark:text-white/60 hover:text-gray-800 dark:hover:text-white text-sm transition-colors">取消</button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={handleCreate} disabled={isLoading}
                        className="flex-1 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white font-bold text-sm disabled:opacity-50 transition-colors">
                        {isLoading ? '创建中...' : '创建卡池'}
                    </motion.button>
                </div>
            </div>
        </Modal>
    );
};

// ─── Add Simple Prize Modal ───────────────────────────────────────────────────
interface AddSimplePrizeModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemId: string;
    poolId: string;
    storeProducts: StoreProduct[];
}
const AddSimplePrizeModal: React.FC<AddSimplePrizeModalProps> = ({ isOpen, onClose, systemId, poolId, storeProducts }) => {
    const [type, setType] = useState<'item' | 'coins'>('item');
    const [productId, setProductId] = useState('');
    const [qty, setQty] = useState(1);
    const [prob, setProb] = useState(0.1);
    const [add, { isLoading }] = useAddSimplePrizeMutation();
    const [triggerList] = useLazyGetSystemListQuery();

    const handle = async () => {
        if (type === 'item' && !productId) return message.error('请选择物品');
        if (prob <= 0 || prob > 1) return message.error('概率需在 0~1 之间');
        try {
            await add({ systemId, poolId, type, productId: type === 'item' ? productId : null, quantity: qty, probability: prob }).unwrap();
            await triggerList().unwrap();
            message.success('奖品已添加');
            onClose();
        } catch (e) {
            message.error((e as { data?: { message?: string } })?.data?.message || '添加失败');
        }
    };

    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="p-6 min-w-[360px] space-y-4 bg-white dark:bg-transparent rounded-2xl">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white tracking-widest">添加奖品</h2>
                <div>
                    <label className={lbl}>奖品类型</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(['item', 'coins'] as const).map(t => (
                            <button key={t} onClick={() => setType(t)}
                                className={`py-2 rounded-lg text-sm font-bold border transition-all ${type === t
                                    ? 'bg-indigo-500 border-indigo-400 text-white'
                                    : 'border-gray-300 dark:border-white/20 text-gray-500 dark:text-white/50 hover:border-indigo-300 dark:hover:border-white/40'
                                }`}>
                                {t === 'item' ? '📦 商店物品' : '🪙 金币'}
                            </button>
                        ))}
                    </div>
                </div>
                {type === 'item' && (
                    <div><label className={lbl}>选择物品</label>
                        <select className={inp} value={productId} onChange={e => setProductId(e.target.value)}>
                            <option value="">请选择</option>
                            {storeProducts.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                        </select>
                    </div>
                )}
                <div><label className={lbl}>数量</label>
                    <input type="number" min={1} className={inp} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} />
                </div>
                <div><label className={lbl}>概率 (0~1)</label>
                    <input type="number" min={0.001} max={1} step={0.001} className={inp} value={prob} onChange={e => setProb(Number(e.target.value))} />
                    <p className="text-xs text-gray-400 dark:text-white/40 mt-1">{(prob * 100).toFixed(2)}%</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-white/20 text-gray-600 dark:text-white/60 text-sm transition-colors">取消</button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={handle} disabled={isLoading}
                        className="flex-1 py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-sm disabled:opacity-50 transition-colors">
                        {isLoading ? '添加中...' : '确认添加'}
                    </motion.button>
                </div>
            </div>
        </Modal>
    );
};

// ─── Add Genshin Tier Item Modal ──────────────────────────────────────────────
interface AddGenshinItemModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemId: string;
    poolId: string;
    tierIndex: number;
    tierLabel: string;
    storeProducts: StoreProduct[];
}
const AddGenshinItemModal: React.FC<AddGenshinItemModalProps> = ({ isOpen, onClose, systemId, poolId, tierIndex, tierLabel, storeProducts }) => {
    const [type, setType] = useState<'item' | 'coins'>('item');
    const [productId, setProductId] = useState('');
    const [qty, setQty] = useState(1);
    const [add, { isLoading }] = useAddGenshinTierItemMutation();
    const [triggerList] = useLazyGetSystemListQuery();

    const handle = async () => {
        if (type === 'item' && !productId) return message.error('请选择物品');
        try {
            await add({ systemId, poolId, tierIndex, type, productId: type === 'item' ? productId : null, quantity: qty }).unwrap();
            await triggerList().unwrap();
            message.success('物品已添加');
            onClose();
        } catch (e) {
            message.error((e as { data?: { message?: string } })?.data?.message || '添加失败');
        }
    };

    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="p-6 min-w-[340px] space-y-4 bg-white dark:bg-transparent rounded-2xl">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white tracking-widest">添加物品 · {tierLabel}</h2>
                <div>
                    <label className={lbl}>类型</label>
                    <div className="grid grid-cols-2 gap-2">
                        {(['item', 'coins'] as const).map(t => (
                            <button key={t} onClick={() => setType(t)}
                                className={`py-2 rounded-lg text-sm font-bold border transition-all ${type === t
                                    ? 'bg-purple-500 border-purple-400 text-white'
                                    : 'border-gray-300 dark:border-white/20 text-gray-500 dark:text-white/50'
                                }`}>
                                {t === 'item' ? '📦 物品' : '🪙 金币'}
                            </button>
                        ))}
                    </div>
                </div>
                {type === 'item' && (
                    <div><label className={lbl}>选择物品</label>
                        <select className={inp} value={productId} onChange={e => setProductId(e.target.value)}>
                            <option value="">请选择</option>
                            {storeProducts.map(p => <option key={p._id} value={p._id}>{p.name}</option>)}
                        </select>
                    </div>
                )}
                <div><label className={lbl}>数量</label>
                    <input type="number" min={1} className={inp} value={qty} onChange={e => setQty(Math.max(1, Number(e.target.value)))} />
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-white/20 text-gray-600 dark:text-white/60 text-sm transition-colors">取消</button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={handle} disabled={isLoading}
                        className="flex-1 py-2 rounded-lg bg-purple-500 hover:bg-purple-400 text-white font-bold text-sm disabled:opacity-50 transition-colors">
                        {isLoading ? '...' : '添加'}
                    </motion.button>
                </div>
            </div>
        </Modal>
    );
};

// ─── Edit Genshin Tier Modal ──────────────────────────────────────────────────
interface EditTierModalProps {
    isOpen: boolean;
    onClose: () => void;
    systemId: string;
    poolId: string;
    tier: GenshinTier;
}
const EditTierModal: React.FC<EditTierModalProps> = ({ isOpen, onClose, systemId, poolId, tier }) => {
    const [form, setForm] = useState({
        name: tier.name, baseRate: tier.baseRate, softPityStart: tier.softPityStart,
        hardPityLimit: tier.hardPityLimit, softPityIncrement: tier.softPityIncrement,
    });
    const [update, { isLoading }] = useUpdateGenshinTierMutation();
    const [triggerList] = useLazyGetSystemListQuery();

    useEffect(() => {
        setForm({ name: tier.name, baseRate: tier.baseRate, softPityStart: tier.softPityStart, hardPityLimit: tier.hardPityLimit, softPityIncrement: tier.softPityIncrement });
    }, [tier]);

    const handle = async () => {
        try {
            await update({ systemId, poolId, tierIndex: tier.tierIndex, ...form }).unwrap();
            await triggerList().unwrap();
            message.success('档位配置已更新');
            onClose();
        } catch (e) {
            message.error((e as { data?: { message?: string } })?.data?.message || '更新失败');
        }
    };

    const isCommon = tier.tierIndex === 2;
    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <div className="p-6 min-w-[380px] space-y-4 bg-white dark:bg-transparent rounded-2xl">
                <h2 className="text-lg font-bold text-gray-800 dark:text-white tracking-widest">编辑档位 · {TIER_META[tier.tierIndex].label}</h2>
                <div><label className={lbl}>档位名称</label>
                    <input className={inp} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                </div>
                {!isCommon && (<>
                    <div className="grid grid-cols-2 gap-3">
                        <div><label className={lbl}>基础概率 (0~1)</label>
                            <input type="number" min={0} max={1} step={0.001} className={inp} value={form.baseRate} onChange={e => setForm({ ...form, baseRate: Number(e.target.value) })} />
                            <p className="text-xs text-gray-400 dark:text-white/30 mt-1">{(form.baseRate * 100).toFixed(3)}%</p>
                        </div>
                        <div><label className={lbl}>软保底每抽增量</label>
                            <input type="number" min={0} step={0.001} className={inp} value={form.softPityIncrement} onChange={e => setForm({ ...form, softPityIncrement: Number(e.target.value) })} />
                            <p className="text-xs text-gray-400 dark:text-white/30 mt-1">{(form.softPityIncrement * 100).toFixed(2)}% / 抽</p>
                        </div>
                        <div><label className={lbl}>软保底起始（抽）</label>
                            <input type="number" min={1} className={inp} value={form.softPityStart} onChange={e => setForm({ ...form, softPityStart: Math.max(1, Number(e.target.value)) })} />
                        </div>
                        <div><label className={lbl}>硬保底（抽）</label>
                            <input type="number" min={1} className={inp} value={form.hardPityLimit} onChange={e => setForm({ ...form, hardPityLimit: Math.max(1, Number(e.target.value)) })} />
                        </div>
                    </div>
                    <div className="text-xs text-purple-700 dark:text-purple-300/60 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800/30 rounded-lg p-3">
                        💡 第 {form.softPityStart} 抽后概率开始提升，第 {form.hardPityLimit} 抽必出。
                        <br />软保底至 {form.hardPityLimit} 抽时概率 ≈ {Math.min(100, (form.baseRate + (form.hardPityLimit - form.softPityStart) * form.softPityIncrement) * 100).toFixed(1)}%
                    </div>
                </>)}
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-gray-300 dark:border-white/20 text-gray-600 dark:text-white/60 text-sm transition-colors">取消</button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={handle} disabled={isLoading}
                        className="flex-1 py-2 rounded-lg bg-purple-500 text-white font-bold text-sm disabled:opacity-50 transition-colors">
                        {isLoading ? '保存中...' : '保存'}
                    </motion.button>
                </div>
            </div>
        </Modal>
    );
};

// ─── Main Panel ────────────────────────────────────────────────────────────────
const LotteryPanel: React.FC<{ systemId: string }> = ({ systemId }) => {
    const systems = useSelector((state: RootState) => state.system.systems);
    const systemData = systems.find(s => s._id === systemId) as (SystemLite & {
        lotteryPools?: LotteryPool[];
        storeProducts?: StoreProduct[];
    }) | undefined;

    const pools = useMemo(() => systemData?.lotteryPools || [], [systemData]);
    const storeProducts = useMemo(() => systemData?.storeProducts || [], [systemData]);

    const [selectedPoolId, setSelectedPoolId] = useState('');
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [addPrizeModal, setAddPrizeModal] = useState(false);
    const [addTierItemModal, setAddTierItemModal] = useState<{ open: boolean; tierIndex: number }>({ open: false, tierIndex: 0 });
    const [editTierModal, setEditTierModal] = useState<{ open: boolean; tierIndex: number }>({ open: false, tierIndex: 0 });
    const [editingDesc, setEditingDesc] = useState(false);
    const [descDraft, setDescDraft] = useState('');

    const [triggerList] = useLazyGetSystemListQuery();
    const [updatePool, { isLoading: isUpdating }] = useUpdateLotteryPoolMutation();
    const [deletePool, { isLoading: isDeleting }] = useDeleteLotteryPoolMutation();
    const [generateDesc, { isLoading: isGenDesc }] = useGeneratePoolDescriptionMutation();
    const [deleteSimplePrize, { isLoading: isDeletingPrize }] = useDeleteSimplePrizeMutation();
    const [deleteGenshinItem, { isLoading: isDeletingItem }] = useDeleteGenshinTierItemMutation();

    useEffect(() => { triggerList(); }, [triggerList]);

    useEffect(() => {
        if (!pools.length) { setSelectedPoolId(''); return; }
        if (!selectedPoolId || !pools.find(p => p._id === selectedPoolId)) {
            setSelectedPoolId(pools[0]._id);
        }
    }, [pools, selectedPoolId]);

    const selectedPool = pools.find(p => p._id === selectedPoolId) || null;

    const handleDeletePool = async () => {
        if (!selectedPool) return;
        if (!window.confirm(`确认删除卡池「${selectedPool.name}」？\n此操作不可撤销，所有成员的保底记录将清空。`)) return;
        await deletePool({ systemId, poolId: selectedPool._id }).unwrap().catch(e => message.error((e as { data?: { message?: string } })?.data?.message || '删除失败'));
        await triggerList().unwrap();
        message.success('卡池已删除');
    };

    const handleToggleCanGetNothing = async () => {
        if (!selectedPool) return;
        await updatePool({ systemId, poolId: selectedPool._id, canGetNothing: !selectedPool.canGetNothing }).unwrap()
            .then(() => triggerList())
            .catch(e => message.error((e as { data?: { message?: string } })?.data?.message || '更新失败'));
    };

    const handleSaveDesc = async () => {
        if (!selectedPool) return;
        await updatePool({ systemId, poolId: selectedPool._id, description: descDraft }).unwrap()
            .then(() => triggerList())
            .catch(e => message.error((e as { data?: { message?: string } })?.data?.message || '保存失败'));
        setEditingDesc(false);
    };

    const handleGenDesc = async () => {
        if (!selectedPool) return;
        const res = await generateDesc({ systemId, poolId: selectedPool._id }).unwrap().catch(e => { message.error((e as { data?: { message?: string } })?.data?.message || '生成失败'); return null; });
        if (res?.description) {
            setDescDraft(res.description);
            setEditingDesc(true);
        }
        await triggerList().unwrap();
    };

    const handleDeleteSimplePrize = async (prizeId: string) => {
        if (!selectedPool) return;
        await deleteSimplePrize({ systemId, poolId: selectedPool._id, prizeId }).unwrap()
            .then(() => triggerList())
            .catch(e => message.error((e as { data?: { message?: string } })?.data?.message || '删除失败'));
    };

    const handleDeleteGenshinItem = async (tierIndex: number, itemId: string) => {
        if (!selectedPool) return;
        await deleteGenshinItem({ systemId, poolId: selectedPool._id, tierIndex, itemId }).unwrap()
            .then(() => triggerList())
            .catch(e => message.error((e as { data?: { message?: string } })?.data?.message || '删除失败'));
    };

    const totalProb = (selectedPool?.prizes || []).reduce((s, p) => s + Number(p.probability || 0), 0);

    // ─── Simple mode right panel ───────────────────────────────────────────────
    const renderSimpleRight = (pool: LotteryPool) => {
        const prizes = (pool.prizes || []) as SimplePrize[];
        return (
            <div className="space-y-4">
                {/* Probability bar */}
                <div className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-bold text-gray-600 dark:text-white/70 tracking-wider">概率分布</p>
                        <span className={`text-xs font-bold ${totalProb > 1.001 ? 'text-red-500 dark:text-red-400' : totalProb > 0.999 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-yellow-400'}`}>
                            {(totalProb * 100).toFixed(1)}% {totalProb > 1.001 ? '⚠️超额' : totalProb > 0.999 ? '✅满额' : '（不足概率为空抽）'}
                        </span>
                    </div>
                    {prizes.length === 0 ? (
                        <p className="text-xs text-gray-400 dark:text-white/30 py-2 text-center">暂无奖品，点击下方添加</p>
                    ) : (
                        <div className="space-y-2">
                            {prizes.map(p => (
                                <div key={p._id} className="flex items-center gap-3">
                                    <p className="text-xs text-gray-600 dark:text-white/70 w-28 truncate">{p.name}</p>
                                    <div className="flex-1 h-2 bg-gray-200 dark:bg-white/10 rounded-full overflow-hidden">
                                        <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full" style={{ width: `${Math.min(100, p.probability * 100)}%` }} />
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-white/50 w-12 text-right">{(p.probability * 100).toFixed(1)}%</span>
                                    <button onClick={() => handleDeleteSimplePrize(p._id)} disabled={isDeletingPrize}
                                        className="text-red-400/60 hover:text-red-500 transition-colors disabled:opacity-30">
                                        <FaTimes className="text-xs" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Prize cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {prizes.map(p => (
                        <div key={p._id} className="bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl p-3 flex flex-col gap-1">
                            <p className="text-sm font-bold text-gray-800 dark:text-white truncate">{p.name}</p>
                            <p className="text-xs text-gray-500 dark:text-white/50">×{p.quantity} · {(p.probability * 100).toFixed(2)}%</p>
                            <p className="text-xs text-gray-400 dark:text-white/30">{p.type === 'coins' ? '🪙 金币' : '📦 物品'}</p>
                        </div>
                    ))}

                    {/* Dashed add card */}
                    <button onClick={() => setAddPrizeModal(true)}
                        className="border-2 border-dashed border-gray-300 dark:border-white/20 hover:border-indigo-400 dark:hover:border-indigo-400/60 rounded-xl p-3 flex flex-col items-center justify-center gap-2 min-h-[80px] text-gray-400 dark:text-white/30 hover:text-indigo-500 dark:hover:text-indigo-400 transition-all">
                        <FaPlus className="text-lg" />
                        <p className="text-xs">添加奖品</p>
                    </button>
                </div>
            </div>
        );
    };

    // ─── Genshin mode right panel ──────────────────────────────────────────────
    const renderGenshinRight = (pool: LotteryPool) => {
        const tiers = [...(pool.genshinTiers || [])].sort((a, b) => a.tierIndex - b.tierIndex) as GenshinTier[];
        return (
            <div className="space-y-4">
                {/* canGetNothing toggle */}
                <div className="flex items-center justify-between bg-gray-50 dark:bg-white/5 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-3">
                    <div>
                        <p className="text-sm font-bold text-gray-800 dark:text-white">允许空抽</p>
                        <p className="text-xs text-gray-500 dark:text-white/40 mt-0.5">开启后，如果普通档位为空，可能抽不到任何东西</p>
                    </div>
                    <button onClick={handleToggleCanGetNothing} disabled={isUpdating} className="text-2xl">
                        {pool.canGetNothing
                            ? <FaToggleOn className="text-purple-500 dark:text-purple-400" />
                            : <FaToggleOff className="text-gray-300 dark:text-white/30" />}
                    </button>
                </div>

                {/* Tier sections */}
                {TIER_META.map(meta => {
                    const tier = tiers.find(t => t.tierIndex === meta.index);
                    if (!tier) return null;
                    const isCommon = meta.index === 2;
                    return (
                        <div key={meta.index} className={`bg-gradient-to-br ${meta.color} border ${meta.border} rounded-2xl p-4 space-y-3`}>
                            {/* Tier header */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    {meta.icon}
                                    <span className="font-bold text-gray-800 dark:text-white tracking-wide">{tier.name || meta.label}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${meta.badge}`}>{meta.label}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-white/50">
                                    {!isCommon && (
                                        <span>基础 {(tier.baseRate * 100).toFixed(2)}% · 软保底 {tier.softPityStart}抽 · 硬保底 {tier.hardPityLimit}抽</span>
                                    )}
                                    <button onClick={() => setEditTierModal({ open: true, tierIndex: meta.index })}
                                        className="p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-400 dark:text-white/50 hover:text-gray-600 dark:hover:text-white">
                                        <FaCog />
                                    </button>
                                </div>
                            </div>

                            {/* Items */}
                            <div className="flex flex-wrap gap-2">
                                {tier.items.map(item => (
                                    <div key={item._id} className="group relative bg-white/60 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 flex items-center gap-2">
                                        <span className="text-xs text-gray-700 dark:text-white">{item.name}</span>
                                        <span className="text-xs text-gray-400 dark:text-white/40">×{item.quantity}</span>
                                        <button onClick={() => handleDeleteGenshinItem(meta.index, item._id)} disabled={isDeletingItem}
                                            className="opacity-0 group-hover:opacity-100 text-red-400/70 hover:text-red-500 transition-all disabled:opacity-0">
                                            <FaTimes className="text-xs" />
                                        </button>
                                    </div>
                                ))}

                                {/* Dashed add button */}
                                <button onClick={() => setAddTierItemModal({ open: true, tierIndex: meta.index })}
                                    className="border border-dashed border-gray-300 dark:border-white/20 hover:border-gray-500 dark:hover:border-white/50 rounded-lg px-3 py-2 text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/70 text-xs flex items-center gap-1 transition-all">
                                    <FaPlus className="text-xs" /> 添加物品
                                </button>
                            </div>

                            {tier.items.length === 0 && (
                                <p className="text-xs text-gray-400 dark:text-white/25 pl-1">
                                    {isCommon ? '空时默认显示"未获得任何奖品"' : '空档位不参与抽取'}
                                </p>
                            )}
                        </div>
                    );
                })}
            </div>
        );
    };

    // ─── Render ────────────────────────────────────────────────────────────────
    return (
        <div className="p-6 overflow-y-auto h-full">
            <div className="max-w-6xl">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-bold tracking-widest text-purple-600 dark:text-purple-300 flex items-center gap-2">
                            <FaDice /> 祈愿卡池管理
                        </h3>
                        <p className="text-xs text-gray-400 dark:text-white/40 mt-1">创建卡池、配置奖品，配置完毕后自动同步给成员</p>
                    </div>
                    <motion.button whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                        onClick={() => setCreateModalOpen(true)}
                        className="flex items-center gap-2 bg-purple-500 hover:bg-purple-400 text-white px-4 py-2 rounded-xl text-sm font-bold tracking-wider shadow-[0_0_16px_rgba(168,85,247,0.3)]">
                        <FaPlus /> 新建卡池
                    </motion.button>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-[260px_1fr] gap-6">
                    {/* ── Left: Pool list ── */}
                    <div className="space-y-2">
                        {pools.length === 0 ? (
                            <button onClick={() => setCreateModalOpen(true)}
                                className="w-full border-2 border-dashed border-gray-300 dark:border-white/20 hover:border-purple-400/50 rounded-2xl p-8 flex flex-col items-center gap-3 text-gray-400 dark:text-white/30 hover:text-purple-500 dark:hover:text-purple-400 transition-all">
                                <FaDice className="text-4xl" />
                                <p className="text-sm">点击创建第一个卡池</p>
                            </button>
                        ) : (
                            pools.map(pool => (
                                <button key={pool._id} onClick={() => setSelectedPoolId(pool._id)}
                                    className={`w-full text-left rounded-xl border overflow-hidden transition-all ${selectedPoolId === pool._id
                                        ? 'border-purple-400/60 shadow-[0_0_16px_rgba(168,85,247,0.15)] dark:shadow-[0_0_16px_rgba(168,85,247,0.2)]'
                                        : 'border-gray-200 dark:border-white/10 hover:border-gray-300 dark:hover:border-white/25'
                                    }`}>
                                    {pool.image && (
                                        <div className="h-20 overflow-hidden relative">
                                            <img src={pool.image} alt="" className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/60" />
                                        </div>
                                    )}
                                    <div className={`px-4 py-3 ${!pool.image ? 'bg-gray-50 dark:bg-white/5' : 'bg-gray-800/80 dark:bg-black/40'}`}>
                                        <p className={`font-bold text-sm truncate ${!pool.image ? 'text-gray-800 dark:text-white' : 'text-white'}`}>{pool.name}</p>
                                        <p className={`text-xs mt-0.5 ${!pool.image ? 'text-gray-500 dark:text-white/40' : 'text-white/60'}`}>
                                            {pool.drawMode === 'genshin' ? '⭐ 原神保底' : '🎲 普通随机'}
                                            {pool.drawMode === 'simple' && ` · ${(pool.prizes || []).length} 个奖品`}
                                        </p>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>

                    {/* ── Right: Pool detail ── */}
                    <div>
                        {!selectedPool ? (
                            <div className="flex items-center justify-center h-64 text-gray-400 dark:text-white/30 border border-dashed border-gray-200 dark:border-white/15 rounded-2xl">
                                <p className="text-sm tracking-widest">选择左侧卡池查看配置</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Pool header card */}
                                <div className="relative rounded-2xl overflow-hidden border border-gray-200 dark:border-white/10 bg-white dark:bg-transparent">
                                    {selectedPool.image && (
                                        <img src={selectedPool.image} alt="" className="absolute inset-0 w-full h-full object-cover opacity-10 dark:opacity-20 pointer-events-none" />
                                    )}
                                    <div className="relative p-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <h4 className="text-xl font-bold text-gray-800 dark:text-white truncate">{selectedPool.name}</h4>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30">
                                                    {selectedPool.drawMode === 'genshin' ? '⭐ 原神保底' : '🎲 普通随机'}
                                                </span>

                                                {/* Description */}
                                                <div className="mt-3">
                                                    {editingDesc ? (
                                                        <div className="flex gap-2">
                                                            <textarea rows={2} className={`flex-1 ${inp} text-xs`} value={descDraft} onChange={e => setDescDraft(e.target.value)} />
                                                            <div className="flex flex-col gap-1">
                                                                <button onClick={handleSaveDesc} disabled={isUpdating} className="px-2 py-1 bg-green-500 hover:bg-green-600 text-white text-xs rounded disabled:opacity-50 transition-colors">保存</button>
                                                                <button onClick={() => setEditingDesc(false)} className="px-2 py-1 bg-gray-100 dark:bg-white/10 text-gray-600 dark:text-white/60 text-xs rounded transition-colors">取消</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-start gap-2">
                                                            <p className="text-sm text-gray-500 dark:text-white/50 flex-1 leading-relaxed">{selectedPool.description || '暂无描述'}</p>
                                                            <button onClick={() => { setDescDraft(selectedPool.description || ''); setEditingDesc(true); }} className="text-gray-400 dark:text-white/30 hover:text-gray-600 dark:hover:text-white/60 text-xs shrink-0 transition-colors">编辑</button>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Action buttons */}
                                            <div className="flex flex-col gap-2 shrink-0">
                                                <button onClick={handleGenDesc} disabled={isGenDesc}
                                                    className="flex items-center gap-1 text-xs bg-amber-50 dark:bg-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-500/30 text-amber-600 dark:text-amber-300 border border-amber-200 dark:border-amber-500/30 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors">
                                                    <FaMagic /> {isGenDesc ? '生成中...' : 'AI描述'}
                                                </button>
                                                <button onClick={handleDeletePool} disabled={isDeleting}
                                                    className="flex items-center gap-1 text-xs bg-red-50 dark:bg-red-500/20 hover:bg-red-100 dark:hover:bg-red-500/30 text-red-500 dark:text-red-400 border border-red-200 dark:border-red-500/30 px-3 py-1.5 rounded-lg disabled:opacity-40 transition-colors">
                                                    <FaTrash /> 删除卡池
                                                </button>
                                            </div>
                                        </div>

                                        {/* Consume info */}
                                        <div className="mt-3 text-xs text-gray-400 dark:text-white/40">
                                            每次消耗：{selectedPool.consume?.type === 'none' ? '免费' : selectedPool.consume?.type === 'coins' ? `${selectedPool.consume.quantity} 金币` : `物品 ×${selectedPool.consume?.quantity}`}
                                        </div>
                                    </div>
                                </div>

                                {/* Prize / tier config */}
                                {selectedPool.drawMode === 'simple'
                                    ? renderSimpleRight(selectedPool)
                                    : renderGenshinRight(selectedPool)}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Modals ── */}
            <CreatePoolModal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)}
                onCreated={id => setSelectedPoolId(id)} systemId={systemId} storeProducts={storeProducts} />

            {selectedPool?.drawMode === 'simple' && (
                <AddSimplePrizeModal isOpen={addPrizeModal} onClose={() => setAddPrizeModal(false)}
                    systemId={systemId} poolId={selectedPool._id} storeProducts={storeProducts} />
            )}

            {selectedPool?.drawMode === 'genshin' && (
                <>
                    <AddGenshinItemModal
                        isOpen={addTierItemModal.open}
                        onClose={() => setAddTierItemModal({ ...addTierItemModal, open: false })}
                        systemId={systemId} poolId={selectedPool._id}
                        tierIndex={addTierItemModal.tierIndex}
                        tierLabel={TIER_META[addTierItemModal.tierIndex]?.label || ''}
                        storeProducts={storeProducts}
                    />
                    {editTierModal.open && (() => {
                        const tier = (selectedPool.genshinTiers || []).find(t => t.tierIndex === editTierModal.tierIndex);
                        if (!tier) return null;
                        return (
                            <EditTierModal
                                isOpen={editTierModal.open}
                                onClose={() => setEditTierModal({ ...editTierModal, open: false })}
                                systemId={systemId} poolId={selectedPool._id} tier={tier}
                            />
                        );
                    })()}
                </>
            )}
        </div>
    );
};

export default LotteryPanel;
