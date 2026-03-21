import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { message } from 'antd';
import { FaStore, FaArrowLeft, FaBoxOpen, FaScroll, FaDice } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { patchSystemProducts } from '../../../../Redux/Features/systemSlice';
import { getEnv } from '../../../../config/env';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import { RARITY_COLORS } from '../../../../Constant';
import {
    useLazyGetSystemListQuery,
    usePurchaseStoreProductMutation,
} from '../../../../api/systemRtkApi';
import type { StoreProduct } from '../../../../Types/System';
import { useLazyGetProfileAndUserQuery } from '../../../../api/profileApi';

const TYPE_LABELS: Record<string, string> = {
    mission: '任务',
    item: '道具',
    lottery_chance: '抽奖次数',
};

const SystemStore: React.FC = () => {
    const { systemId } = useParams<{ systemId: string }>();
    const navigate = useNavigate();
    const dispatch = useDispatch();

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

                if (payload.type === 'store_products_updated' && payload.systemId === systemId) {
                    // Surgical update — only storeProducts of this system, no full refetch
                    dispatch(patchSystemProducts({
                        systemId: payload.systemId as string,
                        storeProducts: payload.storeProducts as StoreProduct[],
                    }));
                } else if (payload.type === 'system_deleted') {
                    message.info('系统已删除，正在返回首页');
                    triggerGetSystemList();
                    navigate('/dashboard/home');
                }
            } catch (error) {
                console.error('SystemStore SSE parse error:', error);
            }
        },
    });

    const handlePurchase = async (productId: string, productName: string) => {
        if (!systemId) return;
        try {
            const result = await purchaseStoreProduct({ systemId, productId, quantity: 1 }).unwrap();
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

    if (!currentSystem) return null;

    const products = (currentSystem.storeProducts || []).filter(p => p.isListed !== false);
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
                        <p className="text-white/50 text-sm tracking-wider mt-1">{currentSystem.name}</p>
                    </div>
                </div>
            </div>

            {/* Products Grid */}
            {products.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-white/30">
                    <FaStore className="text-6xl mb-4 opacity-50" />
                    <p className="text-xl tracking-widest">商城暂无商品</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {products.map((product) => {
                        const rarityConfig = RARITY_COLORS[product.rarity as keyof typeof RARITY_COLORS] ?? RARITY_COLORS.common;
                        const outOfStock = product.stock === 0;
                        const cantAfford = currentCoins < product.price;

                        return (
                            <motion.div
                                key={product._id}
                                whileHover={{ scale: 1.02, y: -2 }}
                                className="relative rounded-xl overflow-hidden border-2 transition-all"
                                style={{ borderColor: rarityConfig.color + '60' }}
                            >
                                {/* Rarity glow top bar */}
                                <div className="h-1 w-full" style={{ background: rarityConfig.color }} />

                                <div className="bg-gradient-to-br from-gray-800/90 to-gray-900/90 p-5 h-full flex flex-col">
                                    {/* Name + rarity */}
                                    <div className="flex items-start justify-between mb-3">
                                        <h3 className="text-base font-bold tracking-wider leading-tight pr-2">{product.name}</h3>
                                        <span
                                            className="text-xs px-2 py-0.5 rounded-full font-semibold whitespace-nowrap shrink-0"
                                            style={{ color: rarityConfig.color, border: `1px solid ${rarityConfig.color}50`, background: `${rarityConfig.color}18` }}
                                        >
                                            {rarityConfig.name}
                                        </span>
                                    </div>

                                    {/* Image */}
                                    {product.image ? (
                                        <img
                                            src={product.image}
                                            alt={product.name}
                                            className="w-full h-32 object-cover rounded-lg border border-white/10 mb-3"
                                        />
                                    ) : (
                                        <div className="w-full h-32 rounded-lg border border-white/10 mb-3 bg-black/30 flex items-center justify-center"
                                            style={{ color: rarityConfig.color + '80' }}>
                                            {product.type === 'mission' && <FaScroll className="text-4xl" />}
                                            {product.type === 'item' && <FaBoxOpen className="text-4xl" />}
                                            {product.type === 'lottery_chance' && <FaDice className="text-4xl" />}
                                        </div>
                                    )}

                                    <p className="text-white/60 text-sm mb-2 flex-1">{product.description || '暂无描述'}</p>

                                    <p className="text-white/40 text-xs mb-1">
                                        类型: {TYPE_LABELS[product.type] ?? product.type}
                                    </p>

                                    {product.stock !== null && (
                                        <p className={`text-xs mb-3 ${outOfStock ? 'text-red-400' : 'text-white/50'}`}>
                                            库存: {outOfStock ? '已售罄' : product.stock}
                                        </p>
                                    )}

                                    {/* Buy row */}
                                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/10">
                                        <span
                                            className="font-bold text-xl"
                                            style={{ color: '#FFC72C' }}
                                        >
                                            {product.price} 币
                                        </span>
                                        <motion.button
                                            whileHover={{ scale: outOfStock || cantAfford ? 1 : 1.05 }}
                                            whileTap={{ scale: outOfStock || cantAfford ? 1 : 0.95 }}
                                            className="px-4 py-2 rounded-lg font-bold tracking-wider transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                            style={
                                                outOfStock || cantAfford
                                                    ? undefined
                                                    : { background: rarityConfig.color, color: '#000' }
                                            }
                                            onClick={() => handlePurchase(product._id, product.name)}
                                            disabled={isPurchasing || outOfStock || cantAfford}
                                        >
                                            {outOfStock ? '已售罄' : cantAfford ? '金币不足' : '购买'}
                                        </motion.button>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

export default SystemStore;
