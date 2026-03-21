import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import { FaStore, FaScroll, FaBoxOpen, FaDice, FaEye, FaEyeSlash, FaTrash, FaPlus } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { SystemLite } from '../../../../Redux/Features/systemSlice';
import type { Rarity, StoreProductType, StoreProduct } from '../../../../Types/System';
import { RARITY_COLORS } from '../../../../Constant';
import {
    useLazyGetSystemListQuery,
    useCreateStoreProductMutation,
    useUpdateStoreProductMutation,
    useDeleteStoreProductMutation,
    useToggleStoreProductListingMutation,
} from '../../../../api/systemRtkApi';

const RARITY_LABELS: Record<string, string> = {
    common: '普通',
    uncommon: '罕见',
    rare: '稀有',
    epic: '史诗',
    legendary: '传奇',
    mythic: '神话',
};

const TYPE_LABELS: Record<string, string> = {
    mission: '任务',
    item: '道具',
    lottery_chance: '抽卡机会',
};

const StorePanel: React.FC<{ systemId: string }> = ({ systemId }) => {
    const systems = useSelector((state: RootState) => state.system.systems);
    const currentSystemData = systems.find(sys => sys._id === systemId) as (SystemLite & { storeProducts?: StoreProduct[] }) | undefined;

    const [isFormVisible, setIsFormVisible] = useState(false);
    const [editingProduct, setEditingProduct] = useState<StoreProduct | null>(null);
    const [form, setForm] = useState({
        name: '',
        type: 'item' as StoreProductType,
        image: '',
        description: '',
        rarity: 'common' as Rarity,
        price: 100,
        stock: null as number | null,
        missionId: '',
    });

    const [triggerGetSystemList, { isLoading }] = useLazyGetSystemListQuery();
    const [createProduct, { isLoading: isCreating }] = useCreateStoreProductMutation();
    const [updateProduct, { isLoading: isUpdating }] = useUpdateStoreProductMutation();
    const [deleteProduct] = useDeleteStoreProductMutation();
    const [toggleListing] = useToggleStoreProductListingMutation();

    const products = currentSystemData?.storeProducts || [];

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    const resetForm = () => {
        setForm({
            name: '',
            type: 'item' as StoreProductType,
            image: '',
            description: '',
            rarity: 'common' as Rarity,
            price: 100,
            stock: null,
            missionId: '',
        });
        setEditingProduct(null);
        setIsFormVisible(false);
    };

    const handleSubmit = async () => {
        if (!form.name.trim() || form.price < 0) {
            message.error('请填写商品名称和有效价格');
            return;
        }
        if ((form.type === 'item' || form.type === 'lottery_chance') && (form.stock === null || form.stock < 0)) {
            message.error('道具和抽卡机会需要设置库存');
            return;
        }
        try {
            const payload = {
                systemId,
                name: form.name.trim(),
                type: form.type,
                image: form.image.trim() || null,
                description: form.description.trim(),
                rarity: form.rarity,
                price: form.price,
                stock: form.type === 'mission' ? null : form.stock,
                missionId: form.type === 'mission' ? form.missionId.trim() : undefined,
            };
            if (editingProduct) {
                await updateProduct({ ...payload, productId: editingProduct._id }).unwrap();
                message.success('商品更新成功');
            } else {
                await createProduct(payload).unwrap();
                message.success('商品创建成功');
            }
            resetForm();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '操作失败');
        }
    };

    const handleEdit = (product: StoreProduct) => {
        setEditingProduct(product);
        setForm({
            name: product.name,
            type: product.type as StoreProductType,
            image: product.image || '',
            description: product.description || '',
            rarity: product.rarity as Rarity,
            price: product.price,
            stock: product.stock,
            missionId: product.missionId || '',
        });
        setIsFormVisible(true);
    };

    const handleDelete = async (productId: string) => {
        if (!confirm('确定要删除此商品吗？此操作不可撤销。')) return;
        try {
            await deleteProduct({ systemId, productId }).unwrap();
            message.success('商品已删除');
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '删除失败');
        }
    };

    const handleToggleListing = async (productId: string, currentListed: boolean) => {
        try {
            await toggleListing({ systemId, productId }).unwrap();
            message.success(currentListed ? '商品已下架（用户不可见）' : '商品已上架');
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '操作失败');
        }
    };

    return (
        <div className="p-8 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
            <div className="max-w-6xl">
                {/* Header */}
                <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 mb-6 flex justify-between items-center shadow-sm dark:shadow-none">
                    <div>
                        <h3 className="text-lg font-bold tracking-widest mb-1 text-yellow-600 dark:text-yellow-300">商城管理</h3>
                        <p className="text-sm text-gray-500 dark:text-white/50">创建商品并设置上下架状态，仅上架商品对用户可见</p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => { resetForm(); setIsFormVisible(true); }}
                        className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 px-5 py-2 rounded-lg font-bold tracking-wider transition-colors flex items-center gap-2 shadow-sm"
                    >
                        <FaPlus /> 创建新商品
                    </motion.button>
                </div>

                {isLoading ? (
                    <div className="text-center py-12 text-gray-400 dark:text-white/30 bg-white/30 dark:bg-transparent rounded-xl border border-dashed border-gray-300 dark:border-white/10">
                        <FaStore className="text-5xl mb-4 opacity-30 mx-auto animate-pulse" />
                        <p className="tracking-widest">加载中...</p>
                    </div>
                ) : products.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 dark:text-white/30 bg-white/30 dark:bg-transparent rounded-xl border border-dashed border-gray-300 dark:border-white/10">
                        <FaStore className="text-5xl mb-4 opacity-30 mx-auto" />
                        <p className="tracking-widest">商城空空如也，点击「创建新商品」开始添加</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {products.map((product) => {
                            const rarityConfig = RARITY_COLORS[product.rarity as keyof typeof RARITY_COLORS] ?? RARITY_COLORS.common;
                            const isListed = product.isListed !== false;
                            return (
                                <motion.div
                                    key={product._id}
                                    initial={{ opacity: 0, scale: 0.95 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    className={`relative rounded-xl overflow-hidden border-2 shadow-sm transition-all ${rarityConfig.border} ${isListed ? '' : 'opacity-60 grayscale'}`}
                                    style={{ boxShadow: isListed ? `0 0 12px color-mix(in srgb, ${rarityConfig.glow.replace('shadow-', '').replace('/30', '')} 20%, transparent)` : undefined }}
                                >
                                    {/* Rarity accent top bar */}
                                    <div
                                        className="h-1 w-full"
                                        style={{ background: rarityConfig.color }}
                                    />

                                    <div className={`p-5 ${rarityConfig.bg}`}>
                                        {/* Unlisted badge */}
                                        {!isListed && (
                                            <div className="absolute top-3 right-3 z-10 bg-gray-500/80 text-white text-xs px-2 py-0.5 rounded font-bold tracking-wider">
                                                已下架
                                            </div>
                                        )}

                                        {/* Name + rarity badge */}
                                        <div className="flex justify-between items-start mb-3">
                                            <h4 className="text-base font-bold text-gray-800 dark:text-white leading-tight pr-2">{product.name}</h4>
                                            <span
                                                className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0"
                                                style={{ color: rarityConfig.color, border: `1px solid ${rarityConfig.color}40`, background: `${rarityConfig.color}15` }}
                                            >
                                                {RARITY_LABELS[product.rarity] ?? product.rarity}
                                            </span>
                                        </div>

                                        {/* Image */}
                                        {product.image ? (
                                            <img
                                                src={product.image}
                                                alt={product.name}
                                                className="w-full h-28 object-cover rounded-lg border border-gray-200 dark:border-white/10 mb-3"
                                            />
                                        ) : (
                                            <div className="w-full h-28 rounded-lg border border-gray-200/60 dark:border-white/10 mb-3 bg-gray-100/60 dark:bg-black/20 flex items-center justify-center text-gray-400 dark:text-white/40">
                                                {product.type === 'mission' && <FaScroll className="text-3xl" />}
                                                {product.type === 'item' && <FaBoxOpen className="text-3xl" />}
                                                {product.type === 'lottery_chance' && <FaDice className="text-3xl" />}
                                            </div>
                                        )}

                                        <p className="text-xs text-gray-500 dark:text-white/50 mb-3 min-h-[32px] line-clamp-2">
                                            {product.description || '无描述'}
                                        </p>

                                        <div className="flex items-center gap-2 mb-3 text-xs">
                                            <span className="bg-gray-100 dark:bg-white/10 px-2 py-1 rounded text-gray-600 dark:text-white/70">
                                                {TYPE_LABELS[product.type] ?? product.type}
                                            </span>
                                            {product.stock !== null && (
                                                <span className="bg-gray-100 dark:bg-white/10 px-2 py-1 rounded text-gray-600 dark:text-white/70">
                                                    库存: {product.stock}
                                                </span>
                                            )}
                                        </div>

                                        {/* Footer */}
                                        <div className="flex justify-between items-center pt-3 border-t border-gray-200/60 dark:border-white/10">
                                            <span className="text-yellow-600 dark:text-yellow-400 font-black text-base">{product.price} 金币</span>
                                            <div className="flex gap-1.5">
                                                {/* Edit */}
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleEdit(product)}
                                                    className="text-xs px-2.5 py-1 rounded bg-gray-100 dark:bg-white/10 hover:bg-blue-100 dark:hover:bg-blue-500/20 text-gray-600 dark:text-white/70 hover:text-blue-600 dark:hover:text-blue-300 transition-colors"
                                                >
                                                    编辑
                                                </motion.button>
                                                {/* Toggle listing */}
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleToggleListing(product._id, isListed)}
                                                    title={isListed ? '下架（用户不可见）' : '上架'}
                                                    className={`text-xs px-2.5 py-1 rounded transition-colors flex items-center gap-1 ${
                                                        isListed
                                                            ? 'bg-green-100 dark:bg-green-500/15 text-green-700 dark:text-green-400 hover:bg-orange-100 dark:hover:bg-orange-500/15 hover:text-orange-600 dark:hover:text-orange-400'
                                                            : 'bg-gray-100 dark:bg-white/10 text-gray-500 dark:text-white/40 hover:bg-green-100 dark:hover:bg-green-500/15 hover:text-green-600 dark:hover:text-green-400'
                                                    }`}
                                                >
                                                    {isListed ? <FaEye /> : <FaEyeSlash />}
                                                    {isListed ? '上架中' : '已下架'}
                                                </motion.button>
                                                {/* Delete */}
                                                <motion.button
                                                    whileHover={{ scale: 1.05 }}
                                                    whileTap={{ scale: 0.95 }}
                                                    onClick={() => handleDelete(product._id)}
                                                    title="删除商品"
                                                    className="text-xs px-2.5 py-1 rounded bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/25 text-red-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                                                >
                                                    <FaTrash />
                                                </motion.button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Slide-in form */}
            <AnimatePresence>
                {isFormVisible && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => resetForm()}
                            className="fixed inset-0 bg-white/40 dark:bg-black/50 backdrop-blur-sm z-40"
                        />
                        <motion.div
                            initial={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
                            animate={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, -20% 100%)' }}
                            exit={{ clipPath: 'polygon(100% 0, 100% 0, 100% 100%, 100% 100%)' }}
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            className="fixed right-0 top-0 h-full w-full md:w-[450px] bg-white dark:bg-[#0a0a0a] border-l-4 border-yellow-400 dark:border-yellow-500 z-50 flex flex-col shadow-2xl"
                        >
                            <div className="p-6 border-b-2 border-yellow-400 dark:border-yellow-500 flex justify-between items-center bg-yellow-50 dark:bg-yellow-500/10">
                                <h3 className="text-xl font-black tracking-widest text-yellow-600 dark:text-yellow-400">
                                    {editingProduct ? '编辑商品' : '创建新商品'}
                                </h3>
                                <button onClick={() => setIsFormVisible(false)} className="text-gray-400 dark:text-white/50 hover:text-red-500 transition-colors p-2">✕</button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-yellow-200 dark:scrollbar-thumb-yellow-500/30 scrollbar-track-transparent">
                                <div>
                                    <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block tracking-wider">商品名称</label>
                                    <input
                                        value={form.name}
                                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                                        className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white rounded"
                                        placeholder="输入商品名称"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block tracking-wider">类型</label>
                                    <select
                                        value={form.type}
                                        onChange={(e) => setForm({ ...form, type: e.target.value as StoreProductType })}
                                        disabled={!!editingProduct}
                                        className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white rounded disabled:opacity-50"
                                    >
                                        <option value="mission">任务</option>
                                        <option value="item">道具</option>
                                        <option value="lottery_chance">抽卡机会</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block tracking-wider">图片 URL</label>
                                    <input
                                        value={form.image}
                                        onChange={(e) => setForm({ ...form, image: e.target.value })}
                                        placeholder="https://..."
                                        className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white rounded"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block tracking-wider">稀有度</label>
                                    <select
                                        value={form.rarity}
                                        onChange={(e) => setForm({ ...form, rarity: e.target.value as Rarity })}
                                        className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white rounded"
                                    >
                                        {Object.entries(RARITY_LABELS).map(([val, label]) => (
                                            <option key={val} value={val}>{label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block tracking-wider">价格（金币）</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.price}
                                        onChange={(e) => setForm({ ...form, price: parseInt(e.target.value, 10) || 0 })}
                                        className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white rounded"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block tracking-wider">库存（留空=无限）</label>
                                    <input
                                        type="number"
                                        min="0"
                                        value={form.stock === null ? '' : form.stock}
                                        onChange={(e) => setForm({ ...form, stock: e.target.value ? parseInt(e.target.value, 10) : null })}
                                        className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white rounded"
                                        placeholder="留空表示无限库存"
                                    />
                                </div>
                                {form.type === 'mission' && (
                                    <div>
                                        <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block tracking-wider">任务 ID</label>
                                        <input
                                            value={form.missionId}
                                            onChange={(e) => setForm({ ...form, missionId: e.target.value })}
                                            className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white rounded"
                                            placeholder="对应任务的ID"
                                        />
                                    </div>
                                )}
                                <div>
                                    <label className="text-xs text-gray-500 dark:text-white/50 mb-1 block tracking-wider">描述</label>
                                    <textarea
                                        rows={3}
                                        value={form.description}
                                        onChange={(e) => setForm({ ...form, description: e.target.value })}
                                        className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white rounded"
                                        placeholder="商品描述"
                                    />
                                </div>
                            </div>

                            <div className="p-6 border-t-2 border-yellow-400 dark:border-yellow-500 bg-white dark:bg-black shrink-0 flex gap-4">
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={handleSubmit}
                                    disabled={isCreating || isUpdating}
                                    className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 py-4 font-black tracking-[0.2em] transition-all disabled:opacity-50"
                                >
                                    {isCreating || isUpdating ? '保存中...' : (editingProduct ? '更新商品' : '创建商品')}
                                </motion.button>
                                <motion.button
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                    onClick={resetForm}
                                    className="px-6 bg-neutral-100 dark:bg-white/10 hover:bg-neutral-200 dark:hover:bg-white/20 text-neutral-700 dark:text-white py-4 font-black tracking-widest transition-all"
                                >
                                    取消
                                </motion.button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StorePanel;
