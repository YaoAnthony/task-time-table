import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Modal, message } from "antd";
import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
    FaArrowRight,
    FaBolt,
    FaCheck,
    FaCoins,
    FaEnvelope,
    FaIdBadge,
    FaLayerGroup,
    FaScroll,
    FaSignOutAlt,
    FaTasks,
    FaUser,
    FaWallet,
} from "react-icons/fa";

import { RootState, AppDispatch } from "../../../../Redux/store";
import { patchWalletCoins } from "../../../../Redux/Features/profileSlice";
import { setSelectedSystemId } from "../../../../Redux/Features/systemSlice";
import { useGetActiveSystemTasksQuery } from "../../../../api/profileApi";
import {
    useCompleteDailyQuestMutation,
    useGetMemberDailyQuestsQuery,
    useLazyGetSystemListQuery,
    useLeaveSystemMutation,
    type UserDailyQuestStatus,
} from "../../../../api/systemRtkApi";
import type { SystemLite } from "../../../../Types/System";
import { getMemberSystems } from "../../utils/systemRelationship";
import "../pixelDashboard.css";

type ActiveSystemTask = {
    systemId: string;
    systemName: string;
    missionListId: string;
    missionListTitle: string;
    nodeId: string;
    nodeTitle: string;
    startedAt: string;
    timeCostMinutes: number;
    requiredSeconds: number;
    elapsedSeconds: number;
    overtimeSeconds: number;
    isOvertime: boolean;
};

const pad = (value: number) => String(Math.max(0, Math.floor(value))).padStart(2, "0");

const formatHMS = (seconds: number) => {
    const safe = Math.max(0, Math.floor(seconds));
    return `${pad(safe / 3600)}:${pad((safe % 3600) / 60)}:${pad(safe % 60)}`;
};

const formatRewardText = (quest: UserDailyQuestStatus) => {
    const coins = Number(quest.rewards?.coins || 0);
    const expCount = quest.rewards?.experience?.length || 0;
    const itemCount = quest.rewards?.items?.length || 0;
    const parts = [];
    if (coins > 0) parts.push(`${coins} 金币`);
    if (expCount > 0) parts.push(`${expCount} 项经验`);
    if (itemCount > 0) parts.push(`${itemCount} 件物品`);
    return parts.length > 0 ? parts.join(" / ") : "无额外奖励";
};

const getRemainingSeconds = (task: ActiveSystemTask, nowMs: number) => {
    const startedAtMs = new Date(task.startedAt).getTime();
    const elapsed = Number.isNaN(startedAtMs)
        ? Math.max(0, task.elapsedSeconds || 0)
        : Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
    const required = Math.max(60, Number(task.requiredSeconds || task.timeCostMinutes * 60 || 60));
    return {
        remaining: Math.max(0, required - elapsed),
        overtime: Math.max(0, elapsed - required),
    };
};

const SectionHeader: React.FC<{
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    count?: number | string;
    action?: React.ReactNode;
}> = ({ icon, title, subtitle, count, action }) => (
    <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-black tracking-widest text-slate-700 dark:text-white/75">
                {icon}
                <span className="truncate">{title}</span>
                {count !== undefined && (
                    <span className="pixel-chip ml-1 shrink-0 px-2 py-0.5 text-xs font-black">
                        {count}
                    </span>
                )}
            </div>
            {subtitle && (
                <p className="mt-1 text-xs font-bold leading-5 text-slate-500 dark:text-white/45">
                    {subtitle}
                </p>
            )}
        </div>
        {action}
    </div>
);

const InfoPill: React.FC<{ icon: React.ReactNode; label: string; value: string | number }> = ({ icon, label, value }) => (
    <div className="pixel-card min-w-0 px-3 py-2.5">
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-widest text-slate-400 dark:text-white/40">
            {icon}
            {label}
        </div>
        <div className="mt-1 truncate text-sm font-black text-slate-800 dark:text-white">{value}</div>
    </div>
);

const getSystemModuleLabels = (system: SystemLite) => {
    const modules = system.modules;
    const labels: string[] = [];
    if (modules?.taskChain) labels.push("系列任务");
    if (modules?.store) labels.push("商城");
    if (modules?.lottery) labels.push("抽奖");
    return labels.length > 0 ? labels : ["基础系统"];
};

const SystemIntroCard: React.FC<{
    system: SystemLite;
    isLeaving: boolean;
    onOpen: (system: SystemLite) => void;
    onLeave: (system: SystemLite) => void;
}> = ({ system, isLeaving, onOpen, onLeave }) => {
    const moduleLabels = getSystemModuleLabels(system);
    const missionCount = system.missionLists?.length || 0;
    const itemCount = system.obtainableItems?.length || 0;
    const productCount = system.storeProducts?.length || 0;
    const description = system.description?.trim()
        || "这个系统还没有简介。可以在系统管理里补一段世界观、目标或规则说明，让成员一眼知道它要培养什么。";

    return (
        <motion.article
            whileHover={{ y: -2 }}
            className="pixel-card flex h-full min-h-[220px] flex-col overflow-hidden p-3"
        >
            <div className="flex items-start gap-3">
                <img
                    src={system.image || "https://www.svgrepo.com/show/475407/castle.svg"}
                    alt={system.name}
                    className="pixel-item-frame h-14 w-14 shrink-0 object-cover"
                />
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px] font-black tracking-widest text-amber-700 dark:text-amber-300">
                        <FaLayerGroup />
                        系统简介
                    </div>
                    <h3 className="mt-1 truncate text-lg font-black text-slate-900 dark:text-white">
                        {system.name}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {moduleLabels.map((label) => (
                            <span key={label} className="pixel-chip px-2 py-1 text-[10px] font-black">
                                {label}
                            </span>
                        ))}
                    </div>
                </div>
            </div>

            <p className="mt-3 line-clamp-2 min-h-[40px] text-sm font-bold leading-5 text-slate-700 dark:text-white/70">
                {description}
            </p>

            <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-black">
                <div className="pixel-chip px-2 py-1.5">
                    <div className="text-base">{missionCount}</div>
                    <div>任务链</div>
                </div>
                <div className="pixel-chip px-2 py-1.5">
                    <div className="text-base">{productCount}</div>
                    <div>商品</div>
                </div>
                <div className="pixel-chip px-2 py-1.5">
                    <div className="text-base">{itemCount}</div>
                    <div>道具</div>
                </div>
            </div>

            <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <button
                    type="button"
                    onClick={() => onOpen(system)}
                    className="pixel-button pixel-button-primary inline-flex flex-1 items-center justify-center gap-2 px-3 py-2 text-xs font-black tracking-widest"
                >
                    进入任务 <FaArrowRight />
                </button>
                <button
                    type="button"
                    disabled={isLeaving}
                    onClick={() => onLeave(system)}
                    className="pixel-button pixel-button-danger inline-flex flex-1 items-center justify-center gap-2 px-3 py-2 text-xs font-black tracking-widest"
                >
                    <FaSignOutAlt />
                    {isLeaving ? "退出中..." : "退出系统"}
                </button>
            </div>
        </motion.article>
    );
};

const ActiveTaskCard: React.FC<{
    task: ActiveSystemTask;
    onOpen: (task: ActiveSystemTask) => void;
}> = ({ task, onOpen }) => {
    const [nowMs, setNowMs] = useState(Date.now());

    useEffect(() => {
        const id = window.setInterval(() => setNowMs(Date.now()), 1000);
        return () => window.clearInterval(id);
    }, []);

    const { remaining, overtime } = getRemainingSeconds(task, nowMs);
    const isOvertime = overtime > 0;

    return (
        <motion.button
            type="button"
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onOpen(task)}
            className={`pixel-card w-full p-4 text-left transition-all ${
                isOvertime
                    ? "pixel-card-urgent text-rose-950 dark:text-rose-50"
                    : "text-emerald-950 dark:text-emerald-50"
            }`}
        >
            <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-2 text-xs font-black tracking-widest">
                        <FaBolt className={isOvertime ? "text-rose-500" : "text-emerald-500"} />
                        正在进行
                    </div>
                    <h3 className="mt-2 truncate text-lg font-black">{task.nodeTitle || task.nodeId}</h3>
                    <p className="mt-1 truncate text-xs font-bold opacity-70">
                        {task.systemName} / {task.missionListTitle}
                    </p>
                </div>
                <div className="shrink-0 text-right">
                    <div className={`font-mono text-xl font-black ${isOvertime ? "text-rose-600 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>
                        {isOvertime ? `+${formatHMS(overtime)}` : formatHMS(remaining)}
                    </div>
                    <div className="mt-1 text-[10px] font-bold tracking-widest opacity-60">
                        {isOvertime ? "已超时" : "剩余"}
                    </div>
                </div>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-current/10 pt-3 text-xs font-black tracking-widest">
                <span>预计 {task.timeCostMinutes || 0} 分钟</span>
                <span className="inline-flex items-center gap-2">
                    去处理 <FaArrowRight />
                </span>
            </div>
        </motion.button>
    );
};

const BountyQuestCard: React.FC<{
    quest: UserDailyQuestStatus;
    systemId: string;
    systemName: string;
    onCompleted: (coins: number) => void;
}> = ({ quest, systemId, systemName, onCompleted }) => {
    const [completeDailyQuest, { isLoading }] = useCompleteDailyQuestMutation();

    const done = quest.completed && !quest.isUnlimited;
    const canComplete = !done;

    const handleComplete = async () => {
        if (!canComplete) return;
        try {
            const result = await completeDailyQuest({ systemId, questId: quest.questId }).unwrap();
            const rewards = result.rewards as { coins?: number };
            onCompleted(Number(rewards?.coins || 0));
            message.success("悬赏已完成");
        } catch (error) {
            const err = error as { data?: { message?: string } };
            message.error(err?.data?.message || "完成悬赏失败");
        }
    };

    return (
        <div className={`pixel-card relative overflow-hidden p-3 ${
            done
                ? "opacity-60"
                : ""
        }`}>
            <div className="absolute right-0 top-0 border-b border-l border-inherit bg-white/70 px-3 py-1 text-[10px] font-black tracking-widest text-slate-500 dark:bg-black/30 dark:text-white/50">
                {systemName}
            </div>
            <div className="pr-24">
                <div className="flex items-center gap-2 text-[11px] font-black tracking-widest text-amber-700 dark:text-amber-300">
                    <FaScroll />
                    每日悬赏
                </div>
                <h3 className="mt-2 text-base font-black text-slate-900 dark:text-white">{quest.title}</h3>
                <p className="mt-2 line-clamp-2 min-h-[36px] text-sm leading-5 text-slate-600 dark:text-white/65">
                    {quest.description || "完成这张悬赏即可领取奖励。"}
                </p>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="pixel-chip px-2 py-1 font-bold">
                    {formatRewardText(quest)}
                </span>
                {quest.isUnlimited ? (
                    <span className="pixel-chip px-2 py-1 font-bold">
                        可重复 x{quest.completedCount}
                    </span>
                ) : (
                    <span className="pixel-chip px-2 py-1 font-bold">
                        {quest.completedCount}/{quest.maxCompletions}
                    </span>
                )}
            </div>

            <button
                type="button"
                disabled={!canComplete || isLoading}
                onClick={handleComplete}
                className={`pixel-button mt-4 inline-flex w-full items-center justify-center gap-2 px-4 py-2 text-sm font-black tracking-widest transition-colors ${
                    canComplete
                        ? "pixel-button-primary"
                        : ""
                }`}
            >
                <FaCheck />
                {done ? "已完成" : isLoading ? "提交中..." : "完成悬赏"}
            </button>
        </div>
    );
};

const SystemBounties: React.FC<{
    system: SystemLite;
    currentCoins: number;
    onCoinsChange: (nextCoins: number) => void;
}> = ({ system, currentCoins, onCoinsChange }) => {
    const { data, isLoading, refetch, isError } = useGetMemberDailyQuestsQuery({ systemId: system._id });
    const quests = data?.quests || [];

    const handleCompleted = (coins: number) => {
        if (coins > 0) onCoinsChange(currentCoins + coins);
        refetch();
    };

    if (isLoading) {
        return (
            <div className="pixel-empty p-4 text-sm font-bold">
                正在同步 {system.name} 的悬赏...
            </div>
        );
    }

    if (isError || data?.message || quests.length === 0) {
        return null;
    }

    return (
        <>
            {quests.map((quest) => (
                <BountyQuestCard
                    key={`${system._id}-${quest.questId}`}
                    quest={quest}
                    systemId={system._id}
                    systemName={system.name}
                    onCompleted={handleCompleted}
                />
            ))}
        </>
    );
};

const Overview: React.FC = () => {
    const dispatch = useDispatch<AppDispatch>();
    const navigate = useNavigate();
    const { profile } = useSelector((state: RootState) => state.profile);
    const systems = useSelector((state: RootState) => state.system.systems);
    const isSystemLoading = useSelector((state: RootState) => state.system.loading);
    const [triggerGetSystemList] = useLazyGetSystemListQuery();
    const [leaveSystem] = useLeaveSystemMutation();
    const [leavingSystemId, setLeavingSystemId] = useState<string | null>(null);
    const walletCoins = profile?.wallet?.coins ?? 0;

    const { data: activeTasksData } = useGetActiveSystemTasksQuery(undefined, {
        pollingInterval: 5000,
        refetchOnFocus: true,
        refetchOnMountOrArgChange: true,
        skip: !profile,
    });

    useEffect(() => {
        triggerGetSystemList();
    }, [triggerGetSystemList]);

    const memberSystems = useMemo(
        () => getMemberSystems(systems, profile?._id),
        [systems, profile?._id]
    );

    const activeTasks = useMemo(() => activeTasksData?.activeTasks || [], [activeTasksData?.activeTasks]);
    const inventoryCount = profile?.inventory?.reduce((sum, item) => sum + Number(item.quantity || 0), 0) || 0;
    const user = profile?.user;
    const subscriptionLevel = user?.subscription?.level || "free";

    const openActiveTask = (task: ActiveSystemTask) => {
        dispatch(setSelectedSystemId(task.systemId));
        navigate(`/dashboard/tasks?systemId=${encodeURIComponent(task.systemId)}&missionListId=${encodeURIComponent(task.missionListId)}&nodeId=${encodeURIComponent(task.nodeId)}`);
    };

    const openSystemTasks = (system: SystemLite) => {
        dispatch(setSelectedSystemId(system._id));
        navigate(`/dashboard/tasks?systemId=${encodeURIComponent(system._id)}`);
    };

    const confirmLeaveSystem = (system: SystemLite) => {
        Modal.confirm({
            title: "确认退出系统？",
            content: (
                <div className="space-y-2 text-sm">
                    <p>你将退出「{system.name}」。</p>
                    <p>退出后，这个系统的任务、商城和相关背包物品会从当前账号中移除。</p>
                </div>
            ),
            okText: "退出系统",
            cancelText: "取消",
            okType: "danger",
            centered: true,
            onOk: async () => {
                try {
                    setLeavingSystemId(system._id);
                    await leaveSystem({ systemId: system._id }).unwrap();
                    await triggerGetSystemList().unwrap();
                    message.success(`已退出系统：${system.name}`);
                } catch (error) {
                    console.error("Leave system error:", error);
                    const err = error as { data?: { message?: string } };
                    message.error(err?.data?.message || "退出系统失败");
                } finally {
                    setLeavingSystemId(null);
                }
            },
        });
    };

    if (!profile) {
        return (
            <section className="pixel-page-shell flex min-h-[85vh] items-center justify-center">
                请先登录。
            </section>
        );
    }

    return (
        <section className="pixel-page-shell h-[85vh] w-full overflow-hidden">
            <div className="flex h-full flex-col">
                <header className="pixel-page-header shrink-0 px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <img
                                src={user?.image_url || "https://www.svgrepo.com/show/452030/avatar-default.svg"}
                                alt={user?.username || "avatar"}
                                className="pixel-item-frame h-12 w-12 object-cover"
                            />
                            <div>
                                <h1 className="pixel-page-title text-2xl font-black">主界面</h1>
                                <p className="pixel-page-subtitle mt-1 text-sm font-bold">
                                    {user?.username || "未命名用户"} 的任务工作台
                                </p>
                            </div>
                        </div>
                        <div className="pixel-icon-tile flex items-center gap-3 px-4 py-2">
                            <FaWallet />
                            <span className="text-sm font-black">{walletCoins.toLocaleString()} 金币</span>
                        </div>
                    </div>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 xl:overflow-hidden xl:p-5">
                    <div className="grid min-h-full grid-cols-1 gap-4 xl:h-full xl:grid-cols-[360px_minmax(0,1fr)]">
                        <aside className="grid min-h-0 gap-4 xl:grid-rows-[minmax(230px,0.95fr)_minmax(250px,1.05fr)]">
                            <section className="pixel-section flex min-h-[230px] flex-col overflow-hidden p-4">
                                <SectionHeader
                                    icon={<FaBolt className="text-emerald-500" />}
                                    title="正在进行的系列任务"
                                    subtitle="正在计时的任务会固定在这里。"
                                    count={activeTasks.length}
                                />
                                {activeTasks.length === 0 ? (
                                    <div className="pixel-empty flex flex-1 items-center justify-center p-5 text-center text-sm font-bold">
                                        暂无正在进行的系列任务。
                                    </div>
                                ) : (
                                    <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                                        {activeTasks.map((task) => (
                                            <ActiveTaskCard
                                                key={`${task.systemId}-${task.missionListId}-${task.nodeId}`}
                                                task={task as ActiveSystemTask}
                                                onOpen={openActiveTask}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="pixel-section flex min-h-[250px] flex-col overflow-hidden p-4">
                                <SectionHeader
                                    icon={<FaUser className="text-blue-500" />}
                                    title="个人信息"
                                    subtitle="基础身份和资源状态。"
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <InfoPill icon={<FaIdBadge />} label="用户" value={user?.username || "未命名"} />
                                    <InfoPill icon={<FaEnvelope />} label="邮箱" value={user?.email || "未绑定"} />
                                    <InfoPill icon={<FaCoins />} label="金币" value={walletCoins.toLocaleString()} />
                                    <InfoPill icon={<FaLayerGroup />} label="系统" value={memberSystems.length} />
                                    <InfoPill icon={<FaTasks />} label="背包物品" value={inventoryCount} />
                                    <InfoPill icon={<FaBolt />} label="订阅" value={subscriptionLevel} />
                                </div>
                            </section>
                        </aside>

                        <main className="grid min-h-0 min-w-0 gap-4 xl:grid-rows-[minmax(285px,1.1fr)_minmax(245px,0.9fr)]">
                            <section className="pixel-section flex min-h-[285px] flex-col overflow-hidden p-4">
                                <SectionHeader
                                    icon={<FaLayerGroup className="text-yellow-600" />}
                                    title="已加入系统"
                                    subtitle="系统入口、模块资源和退出操作集中在这里。"
                                    count={memberSystems.length}
                                    action={(
                                        <button
                                            type="button"
                                            onClick={() => triggerGetSystemList()}
                                            className="pixel-button shrink-0 px-3 py-2 text-xs font-black tracking-widest"
                                        >
                                            刷新系统
                                        </button>
                                    )}
                                />

                                {isSystemLoading ? (
                                    <div className="pixel-empty flex flex-1 items-center justify-center p-10 text-center text-sm font-bold">
                                        正在加载系统...
                                    </div>
                                ) : memberSystems.length === 0 ? (
                                    <div className="pixel-empty flex flex-1 items-center justify-center p-10 text-center text-sm font-bold">
                                        你还没有加入任何系统。
                                    </div>
                                ) : (
                                    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-2 2xl:grid-cols-3">
                                        {memberSystems.map((system) => (
                                            <SystemIntroCard
                                                key={system._id}
                                                system={system}
                                                isLeaving={leavingSystemId === system._id}
                                                onOpen={openSystemTasks}
                                                onLeave={confirmLeaveSystem}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>

                            <section className="pixel-section flex min-h-[245px] flex-col overflow-hidden p-4">
                                <SectionHeader
                                    icon={<FaScroll className="text-amber-500" />}
                                    title="每日悬赏"
                                    subtitle="每天从系统悬赏池抽取任务，可在这里直接完成。"
                                    action={(
                                        <button
                                        type="button"
                                        onClick={() => triggerGetSystemList()}
                                            className="pixel-button shrink-0 px-3 py-2 text-xs font-black tracking-widest"
                                        >
                                            刷新系统
                                        </button>
                                    )}
                                />

                                {isSystemLoading ? (
                                    <div className="pixel-empty flex flex-1 items-center justify-center p-10 text-center text-sm font-bold">
                                        正在加载系统...
                                    </div>
                                ) : memberSystems.length === 0 ? (
                                    <div className="pixel-empty flex flex-1 items-center justify-center p-10 text-center text-sm font-bold">
                                        你还没有加入任何系统。
                                    </div>
                                ) : (
                                    <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto pr-1 lg:grid-cols-2 2xl:grid-cols-3">
                                        {memberSystems.map((system) => (
                                            <SystemBounties
                                                key={system._id}
                                                system={system}
                                                currentCoins={walletCoins}
                                                onCoinsChange={(nextCoins) => dispatch(patchWalletCoins(nextCoins))}
                                            />
                                        ))}
                                    </div>
                                )}
                            </section>
                        </main>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default Overview;
