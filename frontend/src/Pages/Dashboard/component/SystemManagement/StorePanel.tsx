import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import { FaStore, FaScroll, FaBoxOpen, FaDice } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { SystemLite } from '../../../../Redux/Features/systemSlice';
import type { Rarity, StoreProductType, StoreProduct } from '../../../../Types/System';
import {
    useLazyGetSystemListQuery,
    useCreateStoreProductMutation,
    useUpdateStoreProductMutation,
    useDeleteStoreProductMutation,
} from '../../../../api/systemRtkApi';

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
                message.success('商品上架成功');
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
        try {
            await deleteProduct({ systemId, productId }).unwrap();
            message.success('商品已下架');
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || '删除失败');
        }
    };

    const typeLabels = {
        mission: '任务',
        item: '道具',
        lottery_chance: '抽卡机会',
    };

    return (
        <div className="p-8 overflow-y-auto h-full scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
            <div className="max-w-6xl">
                <div className="bg-white/50 dark:bg-white/5 border border-gray-200/50 dark:border-white/10 rounded-xl p-6 mb-6 flex justify-between items-center shadow-sm dark:shadow-none">
                    <div>
                        <h3 className="text-lg font-bold tracking-widest mb-2 text-yellow-600 dark:text-yellow-300">商城管理</h3>
                        <p className="text-sm text-gray-500 dark:text-white/50">上架商品（任务、道具、抽卡机会等），设置价格和库存</p>
                    </div>
                    <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => {
                            resetForm();
                            setIsFormVisible(true);
                        }}
                        className="bg-yellow-400 hover:bg-yellow-500 text-yellow-900 px-6 py-2 rounded-lg font-bold tracking-widest transition-colors flex items-center gap-2 shadow-sm"
                    >
                        <FaStore /> 上架新商品
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
                        <p className="tracking-widest">商城空空如也，快去上架商品吧</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {products.map((product) => (
                            <motion.div
                                key={product._id}
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="bg-white/60 dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900 border border-gray-200 dark:border-gray-700/50 rounded-xl p-5 hover:border-yellow-400 dark:hover:border-yellow-500/50 transition-all shadow-sm dark:shadow-none relative overflow-hidden group"
                            >
                                <div className="flex justify-between items-start mb-3 relative z-10">
                                    <h4 className="text-lg font-bold text-gray-800 dark:text-white group-hover:text-yellow-600 dark:group-hover:text-yellow-400 transition-colors">{product.name}</h4>
                                </div>

                                {product.image ? (
                                    <img
                                        src={product.image}
                                        alt={product.name}
                                        className="w-full h-32 object-cover rounded-lg border border-gray-200 dark:border-white/10 mb-3 relative z-10 shadow-inner dark:shadow-none"
                                    />
                                ) : (
                                    <div className="w-full h-32 rounded-lg border border-gray-200 dark:border-white/10 mb-3 bg-gray-50 dark:bg-black/30 flex items-center justify-center text-gray-400 dark:text-white/60 relative z-10 shadow-inner dark:shadow-none">
                                        {product.type === 'mission' && <FaScroll className="text-4xl" />}
                                        {product.type === 'item' && <FaBoxOpen className="text-4xl" />}
                                        {product.type === 'lottery_chance' && <FaDice className="text-4xl" />}
                                    </div>
                                )}

                                <p className="text-sm text-gray-500 dark:text-white/60 mb-3 min-h-[40px] relative z-10 line-clamp-2">
                                    {product.description || '无描述'}
                                </p>

                                <div className="flex items-center gap-2 mb-3 text-sm relative z-10">
                                    <span className="bg-gray-200 dark:bg-white/10 px-2 py-1 rounded text-gray-600 dark:text-white/80">
                                        {typeLabels[product.type as keyof typeof typeLabels]}
                                    </span>
                                    {product.stock !== null && (
                                        <span className="bg-gray-200 dark:bg-white/10 px-2 py-1 rounded text-gray-600 dark:text-white/80">
                                            库存: {product.stock}
                                        </span>
                                    )}
                                </div>

                                <div className="flex justify-between items-center pt-3 border-t border-gray-200 dark:border-white/10 relative z-10">
                                    <span className="text-yellow-600 dark:text-[#FFC72C] font-black text-lg">{product.price} 金币</span>
                                    <div className="flex gap-2">
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleEdit(product)}
                                            className="bg-blue-500/20 hover:bg-blue-500/40 text-blue-300 px-3 py-1 rounded text-sm transition-colors"
                                        >
                                            编辑
                                        </motion.button>
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => {
                                                if (confirm('确定要下架此商品吗？')) {
                                                    handleDelete(product._id);
                                                }
                                            }}
                                            className="bg-red-500/20 hover:bg-red-500/40 text-red-300 px-3 py-1 rounded text-sm transition-colors"
                                        >
                                            下架
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}
            </div>

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
                            <div className="p-6 border-b-2 border-yellow-400 dark:border-yellow-500 flex justify-between items-center bg-yellow-50 dark:bg-yellow-500/10 relative">
                                <h3 className="text-xl font-black tracking-widest text-yellow-600 dark:text-yellow-400">{editingProduct ? '编辑商品' : '上架商品'}</h3>
                                <button onClick={() => setIsFormVisible(false)} className="text-gray-400 dark:text-white/50 hover:text-red-500 dark:hover:text-red-400 transition-colors z-10 p-2">X</button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin scrollbar-thumb-yellow-200 dark:scrollbar-thumb-yellow-500/30 scrollbar-track-transparent">
                                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white" placeholder="商品名称" />
                                <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as StoreProductType })} className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white" disabled={!!editingProduct}>
                                    <option value="mission">任务</option>
                                    <option value="item">道具</option>
                                    <option value="lottery_chance">抽卡机会</option>
                                </select>
                                <input value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })} placeholder="图片URL" className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white" />
                                <select value={form.rarity} onChange={(e) => setForm({ ...form, rarity: e.target.value as Rarity })} className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white">
                                    <option value="common">普通</option>
                                    <option value="rare">稀有</option>
                                    <option value="epic">史诗</option>
                                    <option value="legendary">传说</option>
                                    <option value="mythic">神话</option>
                                </select>
                                <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: parseInt(e.target.value, 10) || 0 })} className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white" placeholder="价格" />
                                <input type="number" min="0" value={form.stock === null ? '' : form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value ? parseInt(e.target.value, 10) : null })} className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white" placeholder="库存" />
                                {form.type === 'mission' && (
                                    <input value={form.missionId} onChange={(e) => setForm({ ...form, missionId: e.target.value })} className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white" placeholder="任务ID" />
                                )}
                                <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="w-full bg-white dark:bg-black/60 border border-yellow-200 dark:border-yellow-500/30 px-4 py-3 text-gray-800 dark:text-white" placeholder="描述" />
                            </div>

                            <div className="p-6 border-t-2 border-yellow-400 dark:border-yellow-500 bg-white dark:bg-black shrink-0 relative flex gap-4">
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSubmit} disabled={isCreating || isUpdating} className="flex-1 bg-yellow-400 hover:bg-yellow-500 text-yellow-900 py-4 font-black tracking-[0.2em] transition-all disabled:opacity-50 uppercase">{isCreating || isUpdating ? '保存中...' : (editingProduct ? '更新商品' : '上架商品')}</motion.button>
                                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={resetForm} className="px-6 bg-neutral-200 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/20 text-neutral-800 dark:text-white py-4 font-black tracking-widest transition-all uppercase">取消</motion.button>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </div>
    );
};

export default StorePanel;
