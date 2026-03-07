import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import { FaDice, FaTrash } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { SystemLite } from '../../../../Redux/Features/systemSlice';
import { LotteryPool } from '../../../../Types/Lottery';
import type { StoreProduct } from '../../../../Types/System';
import {
    useLazyGetSystemListQuery,
    useCreateLotteryPoolMutation,
    useUpdateLotteryPoolMutation,
    useCreateLotteryPrizeMutation,
    useDeleteLotteryPrizeMutation,
} from '../../../../api/systemRtkApi';

const LotteryPanel: React.FC<{ systemId: string }> = ({ systemId }) => {
    const systems = useSelector((state: RootState) => state.system.systems);
    const currentSystemData = systems.find((sys) => sys._id === systemId) as (SystemLite & {
        lotteryPools?: LotteryPool[];
        storeProducts?: StoreProduct[];
    }) | undefined;

    const lotteryPools = useMemo(() => currentSystemData?.lotteryPools || [], [currentSystemData]);
    const storeProducts = useMemo(() => currentSystemData?.storeProducts || [], [currentSystemData]);
    const itemProducts = useMemo(() => storeProducts.filter((product) => product.type === 'item'), [storeProducts]);

    const [poolForm, setPoolForm] = useState({ name: '', description: '', consumeType: 'none' as 'none' | 'item' | 'coins', consumeItemKey: '', consumeQuantity: 1 });
    const [selectedPoolId, setSelectedPoolId] = useState('');
    const [prizeForm, setPrizeForm] = useState({ productId: '', quantity: 1, probability: 0.1 });

    const selectedPool = lotteryPools.find((pool) => pool._id === selectedPoolId) || null;

    const [triggerGetSystemList, { isLoading: isLoadingSystem }] = useLazyGetSystemListQuery();
    const [createLotteryPool, { isLoading: isCreatingPool }] = useCreateLotteryPoolMutation();
    const [updateLotteryPool, { isLoading: isUpdatingPool }] = useUpdateLotteryPoolMutation();
    const [createLotteryPrize, { isLoading: isCreatingPrize }] = useCreateLotteryPrizeMutation();
    const [deleteLotteryPrize, { isLoading: isDeletingPrize }] = useDeleteLotteryPrizeMutation();

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    useEffect(() => {
        if (lotteryPools.length === 0) {
            if (selectedPoolId) setSelectedPoolId('');
            return;
        }

        const exists = lotteryPools.some((pool) => pool._id === selectedPoolId);
        if (!selectedPoolId || !exists) {
            setSelectedPoolId(lotteryPools[0]._id);
        }
    }, [selectedPoolId, lotteryPools]);

    useEffect(() => {
        if (!selectedPool) return;
        setPoolForm({
            name: selectedPool.name || '',
            description: selectedPool.description || '',
            consumeType: selectedPool.consume?.type === 'item' ? 'item' : (selectedPool.consume?.type === 'coins' ? 'coins' : 'none'),
            consumeItemKey: selectedPool.consume?.itemKey || '',
            consumeQuantity: Math.max(1, Number(selectedPool.consume?.quantity || 1)),
        });
    }, [selectedPool]);

    const handleCreatePool = async () => {
        if (!poolForm.name.trim()) return message.error('请填写卡池名称');
        if (poolForm.consumeType === 'item' && !poolForm.consumeItemKey) return message.error('请选择消耗物品');
        try {
            const createResult = await createLotteryPool({
                systemId,
                name: poolForm.name.trim(),
                description: poolForm.description.trim(),
                consume: poolForm.consumeType === 'item'
                    ? { type: 'item', itemKey: poolForm.consumeItemKey, quantity: Math.max(1, poolForm.consumeQuantity) }
                    : (poolForm.consumeType === 'coins'
                        ? { type: 'coins', quantity: Math.max(1, poolForm.consumeQuantity) }
                        : { type: 'none' }),
            }).unwrap();
            message.success('卡池创建成功');
            const createdPoolList = (createResult as { lotteryPools?: Array<{ _id: string }> })?.lotteryPools || [];
            const lastCreated = createdPoolList[createdPoolList.length - 1];
            if (lastCreated?._id) {
                setSelectedPoolId(lastCreated._id);
            }
            await triggerGetSystemList().unwrap();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '创建卡池失败');
        }
    };

    const handleUpdatePool = async () => {
        if (!selectedPool) return message.warning('请先选择卡池');
        if (!poolForm.name.trim()) return message.error('请填写卡池名称');
        if (poolForm.consumeType === 'item' && !poolForm.consumeItemKey) return message.error('请选择消耗物品');
        try {
            await updateLotteryPool({
                systemId,
                poolId: selectedPool._id,
                name: poolForm.name.trim(),
                description: poolForm.description.trim(),
                consume: poolForm.consumeType === 'item'
                    ? { type: 'item', itemKey: poolForm.consumeItemKey, quantity: Math.max(1, poolForm.consumeQuantity) }
                    : (poolForm.consumeType === 'coins'
                        ? { type: 'coins', quantity: Math.max(1, poolForm.consumeQuantity) }
                        : { type: 'none' }),
            }).unwrap();
            message.success('卡池配置已更新');
            await triggerGetSystemList().unwrap();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '更新卡池失败');
        }
    };

    const handleAddOrUpdatePrize = async () => {
        if (!selectedPool) return message.warning('请先选择卡池');
        if (!prizeForm.productId) return message.error('请选择要加入卡池的商品');
        const normalizedProbability = Number(prizeForm.probability);
        if (!Number.isFinite(normalizedProbability) || normalizedProbability < 0 || normalizedProbability > 1) {
            return message.error('概率必须在 0 到 1 之间');
        }
        try {
            await createLotteryPrize({
                systemId,
                poolId: selectedPool._id,
                productId: prizeForm.productId,
                quantity: Math.max(1, prizeForm.quantity),
                probability: normalizedProbability,
            }).unwrap();
            message.success('奖品配置已保存');
            await triggerGetSystemList().unwrap();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '保存奖品失败');
        }
    };

    const handleDeletePrize = async (poolId: string, prizeId: string) => {
        try {
            await deleteLotteryPrize({ systemId, poolId, prizeId }).unwrap();
            message.success('奖品已移除');
            await triggerGetSystemList().unwrap();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '移除奖品失败');
        }
    };

    const totalProbability = (selectedPool?.prizes || []).reduce((sum, prize) => sum + Number(prize.probability || 0), 0);

    return (
        <div className="p-8 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
            <div className="max-w-6xl space-y-6">
                <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 shadow-sm dark:shadow-none">
                    <h3 className="text-lg font-bold tracking-widest mb-2 text-purple-600 dark:text-purple-300">祈愿抽卡池管理</h3>
                    <p className="text-sm text-gray-500 dark:text-white/50">创建卡池，配置消耗项，并将商城商品加入奖池（数量 + 概率）</p>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                    <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 shadow-sm dark:shadow-none space-y-4">
                        <h4 className="text-md font-bold tracking-widest text-purple-600 dark:text-purple-200">卡池配置</h4>
                        <input value={poolForm.name} onChange={(e) => setPoolForm({ ...poolForm, name: e.target.value })} placeholder="卡池名称" className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-4 py-2 text-gray-800 dark:text-white" />
                        <textarea rows={3} value={poolForm.description} onChange={(e) => setPoolForm({ ...poolForm, description: e.target.value })} placeholder="描述" className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-4 py-2 text-gray-800 dark:text-white" />
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                            <select value={poolForm.consumeType} onChange={(e) => setPoolForm({ ...poolForm, consumeType: e.target.value as 'none' | 'item' | 'coins' })} className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white">
                                <option value="none">无消耗</option>
                                <option value="item">消耗物品</option>
                                <option value="coins">消耗金币</option>
                            </select>
                            <select value={poolForm.consumeItemKey} onChange={(e) => setPoolForm({ ...poolForm, consumeItemKey: e.target.value })} disabled={poolForm.consumeType !== 'item'} className="md:col-span-2 w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white disabled:opacity-50">
                                <option value="">请选择物品</option>
                                {itemProducts.map((product) => (<option key={product._id} value={product._id}>{product.name}</option>))}
                            </select>
                        </div>
                        {(poolForm.consumeType === 'item' || poolForm.consumeType === 'coins') && (
                            <input type="number" min={1} value={poolForm.consumeQuantity} onChange={(e) => setPoolForm({ ...poolForm, consumeQuantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-4 py-2 text-gray-800 dark:text-white" />
                        )}
                        <div className="flex gap-3">
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleCreatePool} disabled={isCreatingPool} className="bg-purple-500 hover:bg-purple-600 text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-colors disabled:opacity-50">{isCreatingPool ? '创建中...' : '+ 创建卡池'}</motion.button>
                            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleUpdatePool} disabled={!selectedPool || isUpdatingPool} className="bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-700 dark:text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-colors disabled:opacity-50">{isUpdatingPool ? '保存中...' : '保存当前卡池'}</motion.button>
                        </div>
                    </div>

                    <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 shadow-sm dark:shadow-none space-y-4">
                        <h4 className="text-md font-bold tracking-widest text-purple-600 dark:text-purple-200">卡池奖品配置</h4>
                        {lotteryPools.length > 0 ? (
                            <>
                                <select value={selectedPoolId} onChange={(e) => setSelectedPoolId(e.target.value)} className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white">
                                    {lotteryPools.map((pool) => (<option key={pool._id} value={pool._id}>{pool.name}</option>))}
                                </select>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <select value={prizeForm.productId} onChange={(e) => setPrizeForm({ ...prizeForm, productId: e.target.value })} className="md:col-span-2 w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white">
                                        <option value="">请选择商品</option>
                                        {storeProducts.map((product) => (
                                            <option key={product._id} value={product._id}>{product.name} ({product.type})</option>
                                        ))}
                                    </select>
                                    <input type="number" min={1} value={prizeForm.quantity} onChange={(e) => setPrizeForm({ ...prizeForm, quantity: Math.max(1, parseInt(e.target.value, 10) || 1) })} className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white" />
                                </div>
                                <input type="number" min={0} max={1} step={0.01} value={prizeForm.probability} onChange={(e) => setPrizeForm({ ...prizeForm, probability: Number(e.target.value) })} className="w-full bg-white dark:bg-black/40 border border-gray-300 dark:border-white/10 rounded-lg px-3 py-2 text-gray-800 dark:text-white" />
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleAddOrUpdatePrize} disabled={isCreatingPrize} className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2 rounded-lg font-bold tracking-widest transition-colors disabled:opacity-50">{isCreatingPrize ? '保存中...' : '+ 添加/更新奖品'}</motion.button>
                                <div className="text-xs text-gray-500 dark:text-white/50">当前卡池总概率: {totalProbability.toFixed(2)}</div>
                                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                                    {(selectedPool?.prizes || []).length === 0 ? (
                                        <p className="text-sm text-gray-400 dark:text-white/40">该卡池暂无奖品，默认为空池</p>
                                    ) : (
                                        (selectedPool?.prizes || []).map((prize) => (
                                            <div key={prize._id} className="bg-white/60 dark:bg-black/30 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
                                                <div>
                                                    <p className="text-sm text-gray-800 dark:text-white">{prize.name}</p>
                                                    <p className="text-xs text-gray-500 dark:text-white/50">数量: {Math.max(1, Number(prize.quantity || 1))} · 概率: {Number(prize.probability || 0).toFixed(2)}</p>
                                                </div>
                                                <button onClick={() => selectedPool && handleDeletePrize(selectedPool._id, prize._id)} disabled={isDeletingPrize} className="text-red-500 hover:text-red-600 dark:text-red-300 dark:hover:text-red-200 transition-colors disabled:opacity-50"><FaTrash /></button>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="text-center py-12 text-gray-400 dark:text-white/30 bg-white/30 dark:bg-transparent rounded-xl border border-dashed border-gray-300 dark:border-white/10">
                                <FaDice className="text-5xl mb-4 opacity-30 mx-auto" />
                                <p className="tracking-widest">还没有卡池，先创建一个</p>
                            </div>
                        )}
                    </div>
                </div>

                {isLoadingSystem && (
                    <p className="text-xs text-gray-500 dark:text-white/40">系统数据同步中...</p>
                )}
            </div>
        </div>
    );
};

export default LotteryPanel;
