//icons
import {
    BarChartOutlined,
    ShoppingOutlined,
    ShopOutlined,
    UnorderedListOutlined,
    SettingOutlined,
    PlaySquareOutlined,
} from '@ant-design/icons';

export const inventoryTabs: { id: string; label: string }[] = [
    { id: 'game', label: '🌾 农场物品' },
    { id: 'all', label: '全部' },
    { id: 'item', label: '道具' },
    { id: 'consumable', label: '消耗品' },
    { id: 'mission', label: '任务书' },
    { id: 'lottery_chance', label: '祈愿' },
];

export const sidebarItems = [
    { label: "主界面",   path: "/dashboard/home",         icon: <BarChartOutlined /> },
    { label: "背包",     path: "/dashboard/backpack",      icon: <ShoppingOutlined /> },
    { label: "系列任务", path: "/dashboard/tasks",         icon: <UnorderedListOutlined /> },
    { label: "每日任务", path: "/dashboard/daily-quests",  icon: <PlaySquareOutlined /> },
    { label: "商城",     path: "/dashboard/store",         icon: <ShopOutlined /> },
    { label: "挂机培养", path: "/dashboard/idle-game",     icon: <PlaySquareOutlined /> },
    { label: "探索法则", path: "/dashboard/setting",       icon: <SettingOutlined /> },
];
