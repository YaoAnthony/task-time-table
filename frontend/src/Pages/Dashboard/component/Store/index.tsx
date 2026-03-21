import React, { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import { FaStore, FaBoxOpen, FaScroll, FaDice } from 'react-icons/fa';
import { message } from 'antd';

import { RootState } from '../../../../Redux/store';
import { setSelectedSystemId } from '../../../../Redux/Features/systemSlice';
import { useLazyGetSystemListQuery, usePurchaseStoreProductMutation } from '../../../../api/systemRtkApi';
import { useLazyGetProfileAndUserQuery } from '../../../../api/profileApi';

const Store: React.FC = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const allSystems = useSelector((state: RootState) => state.system.systems);
    const selectedSystemId = useSelector((state: RootState) => state.system.selectedSystemId);
    const profile = useSelector((state: RootState) => state.profile.profile);

    // Only show systems the user has JOINED (not their own creations)
    const systems = useMemo(
        () => allSystems.filter(s => s.profile !== profile?._id),
        [allSystems, profile]
    );
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [triggerGetProfileAndUser] = useLazyGetProfileAndUserQuery();
    const [purchaseStoreProduct, { isLoading: isPurchasing }] = usePurchaseStoreProductMutation();

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    useEffect(() => {
        if (!selectedSystemId && systems.length > 0) {
            dispatch(setSelectedSystemId(systems[0]._id));
        }
    }, [selectedSystemId, systems, dispatch]);

    const selectedSystem = useMemo(() => {
        if (!systems.length) return null;
        return systems.find((sys) => sys._id === selectedSystemId) || systems[0];
    }, [systems, selectedSystemId]);

    if (!systems.length) {
        return (
            <section className="w-full h-[85vh] flex flex-col rounded-3xl border border-white/60 dark:border-white/10 
            bg-white/40 dark:bg-black/40 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8),_0_8px_32px_rgba(0,0,0,0.05)] 
            dark:shadow-[inset_0_0_15px_rgba(255,255,255,0.02),_0_8px_32px_rgba(0,0,0,0.5)] 
            backdrop-blur-xl overflow-hidden text-neutral-800 dark:text-white font-sans select-none transition-colors duration-300 p-8">
                <div className="flex flex-col items-center justify-center h-full text-neutral-400 dark:text-white/40">
                    <FaStore className="text-7xl mb-6 opacity-40 drop-shadow-md" />
                    <p className="text-2xl font-black tracking-widest mb-2">未加入任何系统</p>
                    <p className="text-sm font-bold tracking-wider opacity-70">请前往「探索法则」搜索并加入他人系统，方可访问其交易馆</p>
                </div>
            </section>
        );
    }

    const isOwner = selectedSystem?.profile === profile?._id;
    const products = selectedSystem?.storeProducts || [];
    const currentCoins = Number(profile?.wallet?.coins || 0);

    const handlePurchase = async (productId: string, productName: string) => {
        if (!selectedSystem?._id) return;

        try {
            const result = await purchaseStoreProduct({
                systemId: selectedSystem._id,
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

    return (
        <section className="w-full h-[85vh] flex flex-col rounded-3xl border border-white/60 dark:border-white/10 
            bg-white/40 dark:bg-black/40 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8),_0_8px_32px_rgba(0,0,0,0.05)] 
            dark:shadow-[inset_0_0_15px_rgba(255,255,255,0.02),_0_8px_32px_rgba(0,0,0,0.5)] 
            backdrop-blur-xl overflow-hidden text-neutral-800 dark:text-white font-sans select-none transition-colors duration-300 relative">
            
            {/* Background Ambient Layers */}
            <div className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20 flex justify-end items-start p-20 z-0">
                <div className="w-96 h-96 bg-amber-300 dark:bg-yellow-600 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen" />
            </div>

            <div className="px-8 py-6 border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-white/50 dark:from-white/5 to-transparent relative z-10 overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-amber-400/20 dark:bg-[#FFC72C]/10 rounded-full blur-3xl -translate-y-1/2 pointer-events-none" />
                
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl shadow-[0_5px_15px_rgba(245,158,11,0.4)] text-white">
                            <FaStore className="text-3xl drop-shadow-md" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-extrabold tracking-widest drop-shadow-sm dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-neutral-800 dark:text-white">高维交易馆</h1>
                            <p className="text-sm font-bold text-neutral-500 dark:text-white/60 tracking-widest uppercase mt-1">Resource Exchange Network</p>
                        </div>
                    </div>

                    {isOwner && selectedSystem && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => navigate(`/dashboard/system/${selectedSystem._id}`)}
                            className="px-6 py-2.5 bg-gradient-to-r from-neutral-800 to-black hover:from-neutral-700 dark:from-[#FFC72C] dark:to-orange-400 text-white dark:text-black rounded-xl text-sm font-black tracking-widest shadow-[0_5px_15px_rgba(0,0,0,0.2)] dark:shadow-[0_0_15px_rgba(255,199,44,0.4)] transition-all border border-black/10 dark:border-transparent flex items-center gap-2"
                        >
                            <FaStore className="text-xs" />
                            管理交易节点
                        </motion.button>
                    )}
                </div>

                <div className="mt-6 flex flex-wrap gap-2 md:gap-3">
                    {systems.map((sys) => (
                        <button
                            key={sys._id}
                            onClick={() => dispatch(setSelectedSystemId(sys._id))}
                            className={`px-4 py-2 rounded-xl text-xs md:text-sm font-black tracking-widest transition-all duration-300 relative overflow-hidden group ${
                                selectedSystem?._id === sys._id
                                    ? 'text-white dark:text-black bg-neutral-800 dark:bg-[#FFC72C] shadow-[0_4px_10px_rgba(0,0,0,0.2)] dark:shadow-[0_0_15px_rgba(255,199,44,0.4)] border border-neutral-700 dark:border-transparent'
                                    : 'text-neutral-500 dark:text-white/60 bg-white/60 dark:bg-white/5 border border-white/80 dark:border-white/15 hover:border-neutral-300 dark:hover:border-white/40 hover:bg-white dark:hover:bg-white/10'
                            }`}
                        >
                            <span className="relative z-10">{sys.name}</span>
                            {selectedSystem?._id === sys._id && (
                                <motion.div layoutId="storeSystemTab" className="absolute inset-0 bg-neutral-800 dark:bg-[#FFC72C]" style={{ zIndex: 0 }} transition={{ type: 'spring', bounce: 0.2, duration: 0.6 }} />
                            )}
                            {selectedSystem?._id === sys._id && (
                                <span className="relative z-10 mix-blend-difference">{sys.name}</span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-thin scrollbar-thumb-black/20 dark:scrollbar-thumb-white/20 scrollbar-track-transparent relative z-10">
                {!selectedSystem?.modules?.store ? (
                    <div className="h-full flex items-center justify-center text-neutral-400 dark:text-white/35">
                        <div className="text-center">
                            <FaStore className="text-7xl mb-6 opacity-30 drop-shadow-md mx-auto" />
                            <p className="text-2xl font-black tracking-widest mb-2">流转中枢未激活</p>
                            <p className="text-sm font-bold tracking-wider opacity-70">请在探索法则(设置)中启用 Store 模块以进行交易</p>
                        </div>
                    </div>
                ) : products.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-neutral-400 dark:text-white/35">
                        <div className="text-center">
                            <FaStore className="text-7xl mb-6 opacity-30 drop-shadow-md mx-auto" />
                            <p className="text-2xl font-black tracking-widest mb-2">节点库存空缺</p>
                            <p className="text-sm font-bold tracking-wider opacity-70">世界主宰尚未在此节点投放资源</p>
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                        {products.map((product) => (
                            <motion.div
                                key={product._id}
                                whileHover={{ scale: 1.05, y: -5 }}
                                className="relative bg-white/60 dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900 
                                    border border-white/80 dark:border-gray-700/50 rounded-2xl p-6 
                                    hover:border-amber-400/50 dark:hover:border-[#FFC72C] 
                                    shadow-[inset_2px_2px_5px_rgba(255,255,255,1),_0_5px_15px_rgba(0,0,0,0.05)]
                                    dark:shadow-[0_0_15px_rgba(0,0,0,0.4)] dark:hover:shadow-[0_0_20px_rgba(255,199,44,0.3)] 
                                    transition-all duration-300 flex flex-col group overflow-hidden"
                            >
                                <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 dark:bg-white/5 rounded-full blur-2xl -mr-16 -mt-16 group-hover:bg-amber-400/20 dark:group-hover:bg-[#FFC72C]/20 transition-colors pointer-events-none" />
                                
                                <div className="flex items-start justify-between mb-4 z-10">
                                    <h3 className="text-xl font-black tracking-wider text-neutral-800 dark:text-white">{product.name}</h3>
                                    <span className={`text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-md border shadow-sm ${
                                        product.rarity === 'legendary' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-300 border-orange-200 dark:border-orange-500/30' :
                                        product.rarity === 'epic' ? 'bg-purple-100 dark:bg-purple-500/20 text-purple-600 dark:text-purple-300 border-purple-200 dark:border-purple-500/30' :
                                        product.rarity === 'rare' ? 'bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-300 border-blue-200 dark:border-blue-500/30' :
                                        'bg-neutral-100 dark:bg-gray-500/20 text-neutral-600 dark:text-gray-300 border-neutral-200 dark:border-gray-500/30'
                                    }`}>
                                        {product.rarity}
                                    </span>
                                </div>

                                {product.image ? (
                                    <img
                                        src={product.image}
                                        alt={product.name}
                                        className="w-full h-36 object-cover rounded-xl border border-black/10 dark:border-white/10 mb-4 z-10"
                                    />
                                ) : (
                                    <div className="w-full h-36 rounded-xl border border-black/10 dark:border-white/10 mb-4 bg-black/5 dark:bg-black/30 flex items-center justify-center text-neutral-500 dark:text-white/60 z-10">
                                        {product.type === 'mission' && <FaScroll className="text-5xl" />}
                                        {product.type === 'item' && <FaBoxOpen className="text-5xl" />}
                                        {product.type === 'lottery_chance' && <FaDice className="text-5xl" />}
                                    </div>
                                )}

                                <p className="text-sm font-medium text-neutral-600 dark:text-white/60 mb-4 flex-1 line-clamp-3 leading-relaxed">
                                    {product.description || '不可名状的物品，充满了未知的能量。'}
                                </p>
                                
                                <div className="flex gap-4 mb-5 text-xs font-bold tracking-widest uppercase opacity-70 z-10 border-t border-black/5 dark:border-white/10 pt-4">
                                    <span className="text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 px-2 py-1 rounded">
                                        类型: {product.type === 'item' ? '道具实体' : product.type === 'mission' ? '任务卷轴' : '概率祈愿盒'}
                                    </span>
                                    {product.stock !== null && (
                                        <span className="text-emerald-600 dark:text-green-400 bg-emerald-50 dark:bg-green-900/30 px-2 py-1 rounded">余量: {product.stock}</span>
                                    )}
                                </div>

                                <div className="flex items-center justify-between pt-4 border-t border-black/5 dark:border-white/10 z-10 gap-4 mt-auto">
                                    <span className="text-amber-600 dark:text-[#FFC72C] text-2xl font-black font-mono tracking-tighter drop-shadow-sm flex items-center gap-1.5">
                                        <FaStore className="text-sm mb-1 opacity-80" />
                                        {product.price} 
                                    </span>
                                    <motion.button
                                        whileHover={!(isPurchasing || product.stock === 0 || currentCoins < product.price) ? { scale: 1.05 } : {}}
                                        whileTap={!(isPurchasing || product.stock === 0 || currentCoins < product.price) ? { scale: 0.95 } : {}}
                                        onClick={() => handlePurchase(product._id, product.name)}
                                        disabled={isPurchasing || product.stock === 0 || currentCoins < product.price}
                                        className={`px-5 py-2.5 rounded-xl text-sm font-black tracking-widest transition-all ${
                                            product.stock === 0 || currentCoins < product.price
                                            ? 'bg-neutral-200 dark:bg-white/10 text-neutral-400 dark:text-white/30 cursor-not-allowed border border-transparent'
                                            : 'bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-300 hover:to-orange-400 dark:from-[#FFC72C] dark:to-orange-400 dark:hover:from-yellow-300 dark:hover:to-orange-300 text-white dark:text-black shadow-[0_5px_15px_rgba(245,158,11,0.3)] dark:shadow-[0_0_15px_rgba(255,199,44,0.4)]'
                                        }`}
                                    >
                                        {product.stock === 0 ? '资源枯竭' : currentCoins < product.price ? '能量不足' : '获取资源'}
                                    </motion.button>
                                </div>
                            </motion.div>
                        ))}
                    </div>
                )}

                {!isOwner && selectedSystem && (
                    <div className="mt-8 bg-white/50 dark:bg-white/5 border border-black/5 dark:border-white/10 rounded-xl p-4 text-xs text-neutral-500 dark:text-white/40 tracking-widest font-bold text-center">
                        <span className="inline-block w-2 h-2 rounded-full bg-blue-500 dark:bg-[#FFC72C] mr-2 shadow-[0_0_5px_currentColor]"></span>
                        &gt;&gt; 节点同步成功: {selectedSystem.name} &lt;&lt;
                    </div>
                )}
            </div>
        </section>
    );
};

export default Store;
