import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { message } from 'antd';
import { FaArrowLeft, FaDice, FaScroll } from 'react-icons/fa';

import { RootState } from '../../../../Redux/store';
import { getEnv } from '../../../../config/env';
import useSSEWithReconnect from '../../../../hook/useSSEWithReconnect';
import {
    useDrawLotteryPoolMutation,
    useGetMemberLotteryHistoryQuery,
    useLazyGetSystemListQuery,
} from '../../../../api/systemRtkApi';
import { useLazyGetProfileAndUserQuery } from '../../../../api/profileApi';

// type
import { LotteryHistoryRecord, LotteryPool } from '../../../../Types/Lottery';

const SystemLottery: React.FC = () => {
    const { systemId } = useParams<{ systemId: string }>();
    const navigate = useNavigate();

    const systems = useSelector((state: RootState) => state.system.systems);
    const accessToken = useSelector((state: RootState) => state.user.accessToken);
    const profile = useSelector((state: RootState) => state.profile.profile);
    const currentSystem = systems.find(sys => sys._id === systemId);

    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [triggerGetProfileAndUser] = useLazyGetProfileAndUserQuery();
    const [drawLotteryPool, { isLoading: isDrawing }] = useDrawLotteryPoolMutation();
    const { data: lotteryHistoryData, refetch: refetchLotteryHistory } = useGetMemberLotteryHistoryQuery(
        { systemId: systemId || '', limit: 30 },
        { skip: !systemId }
    );

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
                    payload.type === 'lottery_pool_created'
                    || payload.type === 'lottery_pool_updated'
                    || payload.type === 'lottery_pool_prizes_updated'
                    || payload.type === 'lottery_pool_prize_deleted'
                    || payload.type === 'lottery_pool_draw_executed'
                ) {
                    triggerGetSystemList();
                    refetchLotteryHistory();
                    message.info('祈愿卡池已更新，已自动同步');
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
                console.error('SystemLottery update SSE parse error:', error);
            }
        },
    });

    if (!currentSystem) {
        return null;
    }

    const products = currentSystem.storeProducts || [];
    const lotteryPools = ((currentSystem as unknown as { lotteryPools?: LotteryPool[] }).lotteryPools || []);
    const currentCoins = Number(profile?.wallet?.coins || 0);
    const lotteryHistory = (lotteryHistoryData?.history || []) as LotteryHistoryRecord[];

    const resolveConsumeItemName = (itemKey?: string | null) => {
        if (!itemKey) return '';
        const matchedProduct = products.find((product) => product._id === itemKey);
        if (matchedProduct) return matchedProduct.name;
        const matchedInventory = (profile?.inventory || []).find((item) => item.inventoryKey === itemKey);
        return matchedInventory?.name || itemKey;
    };

    const hasEnoughConsume = (pool: LotteryPool) => {
        if (pool.consume?.type === 'coins') {
            const needCoins = Math.max(1, Number(pool.consume?.quantity || 1));
            return currentCoins >= needCoins;
        }

        if (pool.consume?.type !== 'item') return true;
        const itemKey = String(pool.consume?.itemKey || '');
        const need = Math.max(1, Number(pool.consume?.quantity || 1));
        const owned = Number((profile?.inventory || []).find((item) => item.inventoryKey === itemKey)?.quantity || 0);
        return owned >= need;
    };

    const handleDrawLottery = async (poolId: string, poolName: string) => {
        if (!systemId) return;
        try {
            const result = await drawLotteryPool({ systemId, poolId }).unwrap();
            if (result?.draw?.won && result?.draw?.reward) {
                message.success(`抽卡成功：${result.draw.reward.productName} x${result.draw.reward.quantity}`);
            } else {
                message.info(`本次祈愿未中奖：${poolName}`);
            }

            await Promise.all([
                triggerGetSystemList().unwrap(),
                triggerGetProfileAndUser().unwrap(),
            ]);
            refetchLotteryHistory();
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || `祈愿失败：${poolName}`);
        }
    };

    return (
        <section className="w-full h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-black/60 shadow-[0_8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md overflow-auto text-white font-sans select-none p-8">
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
                    <FaDice className="text-3xl text-[#FFC72C]" />
                    <div>
                        <h1 className="text-3xl font-bold tracking-widest">祈愿卡池</h1>
                        <p className="text-white/50 text-sm tracking-wider mt-1">{currentSystem.name} - 祈愿与历史</p>
                    </div>
                </div>
            </div>

            <div className="bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border border-yellow-500/30 rounded-xl p-4 mb-6">
                <p className="text-white/70 text-sm tracking-wider mb-1">我的金币</p>
                <p className="text-4xl font-bold text-[#FFC72C] tracking-wider">{typeof profile?.wallet === 'number' ? profile.wallet : profile?.wallet?.coins || 0}</p>
            </div>

            <div className="mt-2">
                <h2 className="text-2xl font-bold tracking-widest mb-4 flex items-center gap-2">
                    <FaDice className="text-[#FFC72C]" /> 祈愿卡池
                </h2>

                {lotteryPools.length === 0 ? (
                    <div className="text-white/40 border border-white/10 rounded-xl p-6 bg-white/5">当前系统暂无可用卡池</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {lotteryPools.map((pool) => {
                            const consumeType = pool.consume?.type === 'item' ? 'item' : (pool.consume?.type === 'coins' ? 'coins' : 'none');
                            const consumeQuantity = Math.max(1, Number(pool.consume?.quantity || 1));
                            const consumeItemName = resolveConsumeItemName(pool.consume?.itemKey);
                            const canDraw = hasEnoughConsume(pool);

                            return (
                                <div key={pool._id} className="bg-gradient-to-br from-purple-900/40 to-indigo-900/30 border border-purple-500/30 rounded-xl p-5">
                                    <h3 className="text-lg font-bold tracking-wider mb-1">{pool.name}</h3>
                                    <p className="text-white/60 text-sm mb-3">{pool.description || '暂无描述'}</p>

                                    <p className="text-xs text-white/70 mb-3">
                                        消耗：{consumeType === 'item'
                                            ? `${consumeItemName || pool.consume?.itemKey} x${consumeQuantity}`
                                            : (consumeType === 'coins' ? `${consumeQuantity} 金币` : '无消耗')}
                                    </p>

                                    <div className="space-y-1 mb-4 max-h-32 overflow-y-auto pr-1">
                                        {(pool.prizes || []).length === 0 ? (
                                            <p className="text-xs text-white/40">空池（暂无奖品）</p>
                                        ) : (
                                            (pool.prizes || []).map((prize) => (
                                                <p key={prize._id} className="text-xs text-white/70">
                                                    {prize.name} x{Math.max(1, Number(prize.quantity || 1))} · 概率 {Number(prize.probability || 0).toFixed(2)}
                                                </p>
                                            ))
                                        )}
                                    </div>

                                    <motion.button
                                        whileHover={{ scale: 1.03 }}
                                        whileTap={{ scale: 0.97 }}
                                        onClick={() => handleDrawLottery(pool._id, pool.name)}
                                        disabled={isDrawing || !canDraw || (pool.prizes || []).length === 0}
                                        className="w-full bg-[#FFC72C] hover:bg-white text-black px-4 py-2 rounded-lg font-bold tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {!canDraw ? '消耗不足' : (pool.prizes || []).length === 0 ? '空池' : (isDrawing ? '祈愿中...' : '祈愿一次')}
                                    </motion.button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            <div className="mt-10">
                <h2 className="text-2xl font-bold tracking-widest mb-4 flex items-center gap-2">
                    <FaScroll className="text-[#FFC72C]" /> 抽卡历史
                </h2>

                {lotteryHistory.length === 0 ? (
                    <div className="text-white/40 border border-white/10 rounded-xl p-6 bg-white/5">暂无抽卡记录</div>
                ) : (
                    <div className="space-y-2">
                        {lotteryHistory.map((record) => (
                            <div key={record._id} className="border border-white/10 bg-white/5 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                                <div>
                                    <p className="text-sm text-white font-semibold">[{record.poolName}] {record.won ? '中奖' : '未中奖'}</p>
                                    <p className="text-xs text-white/60 mt-1">
                                        消耗：{record?.consumed?.type === 'item'
                                            ? `${resolveConsumeItemName(record.consumed.itemKey)} x${Math.max(1, Number(record.consumed.quantity || 1))}`
                                            : (record?.consumed?.type === 'coins'
                                                ? `${Math.max(1, Number(record.consumed.quantity || 1))} 金币`
                                                : '无')}
                                        {' · '}
                                        奖励：{record?.reward?.productName
                                            ? `${record.reward.productName} x${Math.max(1, Number(record.reward.quantity || 1))}`
                                            : '无'}
                                    </p>
                                </div>
                                <div className="text-right text-xs text-white/50">
                                    <p>随机值 {Number(record.randomValue || 0).toFixed(4)}</p>
                                    <p>{new Date(record.createdAt).toLocaleString()}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

export default SystemLottery;
