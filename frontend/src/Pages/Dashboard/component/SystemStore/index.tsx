import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import { FaStore, FaArrowLeft, FaBoxOpen, FaScroll, FaDice } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { getEnv } from '../../../../config/env';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import {
    useLazyGetSystemListQuery,
    usePurchaseStoreProductMutation,
} from '../../../../api/systemRtkApi';
import { useLazyGetProfileAndUserQuery } from '../../../../api/profileApi';

/**
 * SystemStore - 系统商城页面
 * 显示该系统的所有上架商品，成员可以购买
 */
const SystemStore: React.FC = () => {
    const { systemId } = useParams<{ systemId: string }>();
    const navigate = useNavigate();
    
    const systems = useSelector((state: RootState) => state.system.systems);
    const accessToken = useSelector((state: RootState) => state.user.accessToken);
    const profile = useSelector((state: RootState) => state.profile.profile);
    const currentSystem = systems.find(sys => sys._id === systemId);
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [triggerGetProfileAndUser] = useLazyGetProfileAndUserQuery();
    const [purchaseStoreProduct, { isLoading: isPurchasing }] = usePurchaseStoreProductMutation();

    useEffect(() => {
        if (systems.length === 0) {
            triggerGetSystemList();
        }
    }, [systems.length, triggerGetSystemList]);

    const { backendUrl } = getEnv();
    const updateSseUrl = systemId && accessToken
        ? `${backendUrl}/system/${systemId}/updates/events?token=${encodeURIComponent(accessToken)}`
        : null;

    useSSEWithReconnect({
        url: updateSseUrl,
        enabled: Boolean(systemId && accessToken),
        onMessage: (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (!payload?.type || payload.type === 'connected') return;

                if (
                    payload.type === 'store_product_created'
                    || payload.type === 'store_product_updated'
                    || payload.type === 'store_product_deleted'
                    || payload.type === 'store_product_purchased'
                ) {
                    triggerGetSystemList();
                    message.info('系统商城已更新，已自动同步');
                } else if (payload.type === 'system_deletion_started') {
                    message.warning(`系统即将删除：${payload.systemName || payload.systemId}`);
                } else if (payload.type === 'system_deletion_cleaning_profiles_started') {
                    message.info('系统删除中：正在清理成员数据');
                } else if (payload.type === 'system_deletion_cleaning_profiles_completed') {
                    message.info('系统删除中：成员数据清理完成');
                } else if (payload.type === 'system_deletion_deleting_system') {
                    message.info('系统删除中：正在删除系统');
                } else if (payload.type === 'system_deleted') {
                    message.info('系统已删除，正在返回首页');
                    triggerGetSystemList();
                    navigate('/dashboard/home');
                }
            } catch (error) {
                console.error('SystemStore update SSE parse error:', error);
            }
        },
    });

    const handlePurchase = async (productId: string, productName: string) => {
        if (!systemId) return;

        try {
            const result = await purchaseStoreProduct({
                systemId,
                productId,
                quantity: 1,
            }).unwrap();

            message.success(`购买成功：${result.purchase.productName}（- ${result.purchase.totalCost} 金币）`);
            await Promise.all([
                triggerGetSystemList().unwrap(),
                triggerGetProfileAndUser().unwrap(),
            ]);
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || `购买失败：${productName}`);
        }
    };

    if (!currentSystem) {
        return null;
    }

    const products = currentSystem.storeProducts || [];
    const currentCoins = Number(profile?.wallet?.coins || 0);

    return (
        <section className="w-full h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-auto text-white font-sans select-none p-8">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => navigate(`/dashboard/system/${systemId}`)}
                    className="text-white/70 hover:text-[#FFC72C] transition-colors"
                >
                    <FaArrowLeft className="text-xl" />
                </motion.button>
                <div className="flex items-center gap-3">
                    <FaStore className="text-3xl text-[#FFC72C]" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-widest">系统商城</h1>
                        <p className="text-white/50 text-sm tracking-wider mt-1">
                            {currentSystem.name} - 商品列表
                        </p>
                    </div>
                </div>
            </div>

            {/* Wallet Display */}
            <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl p-4 mb-6">
                <p className="text-white/70 text-sm tracking-wider mb-1">我的金币</p>
                <p className="text-4xl font-bold text-[#FFC72C] tracking-wider">
                    {typeof profile?.wallet === 'number' ? profile.wallet : profile?.wallet?.coins || 0}
                </p>
            </div>

            {/* Products Grid */}
            {products.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-white/30">
                    <FaStore className="text-6xl mb-4 opacity-50" />
                    <p className="text-xl tracking-widest">商城暂无商品</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map((product) => (
                        <motion.div
                            key={product._id}
                            whileHover={{ scale: 1.02 }}
                            className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700/50 rounded-xl p-6 hover:border-[#FFC72C] transition-all"
                        >
                            <div className="flex items-start justify-between mb-3">
                                <h3 className="text-lg font-bold tracking-wider">{product.name}</h3>
                                <span className={`text-xs px-2 py-1 rounded ${
                                    product.rarity === 'legendary' ? 'bg-orange-500/30 text-orange-300' :
                                    product.rarity === 'epic' ? 'bg-purple-500/30 text-purple-300' :
                                    product.rarity === 'rare' ? 'bg-blue-500/30 text-blue-300' :
                                    'bg-gray-500/30 text-gray-300'
                                }`}>
                                    {product.rarity}
                                </span>
                            </div>

                            {product.image ? (
                                <img
                                    src={product.image}
                                    alt={product.name}
                                    className="w-full h-32 object-cover rounded-lg border border-white/10 mb-3"
                                />
                            ) : (
                                <div className="w-full h-32 rounded-lg border border-white/10 mb-3 bg-black/30 flex items-center justify-center text-white/60">
                                    {product.type === 'mission' && <FaScroll className="text-4xl" />}
                                    {product.type === 'item' && <FaBoxOpen className="text-4xl" />}
                                    {product.type === 'lottery_chance' && <FaDice className="text-4xl" />}
                                </div>
                            )}
                            
                            <p className="text-white/60 text-sm mb-2">{product.description || '暂无描述'}</p>
                            <p className="text-white/40 text-xs mb-4">
                                类型: {product.type === 'item' ? '物品' : product.type === 'mission' ? '任务' : '抽奖次数'}
                            </p>
                            
                            {product.stock !== null && (
                                <p className="text-white/50 text-xs mb-4">
                                    库存: {product.stock > 0 ? product.stock : '已售罄'}
                                </p>
                            )}

                            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                                <span className="text-[#FFC72C] font-bold text-xl">{product.price} 币</span>
                                <motion.button
                                    whileHover={{ scale: 1.05 }}
                                    whileTap={{ scale: 0.95 }}
                                    className="bg-[#FFC72C] hover:bg-white text-black px-4 py-2 rounded-lg font-bold tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    onClick={() => handlePurchase(product._id, product.name)}
                                    disabled={isPurchasing || product.stock === 0 || currentCoins < product.price}
                                >
                                    {product.stock === 0 ? '已售罄' : currentCoins < product.price ? '金币不足' : '购买'}
                                </motion.button>
                            </div>
                        </motion.div>
                    ))}
                </div>
            )}

        </section>
    );
};

export default SystemStore;
