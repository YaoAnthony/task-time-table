//icons
import { 
    BarChartOutlined,
    ShoppingOutlined,
    ShopOutlined,
    UnorderedListOutlined,
    SettingOutlined,
    
} from '@ant-design/icons';

export const inventoryTabs: { id: string; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'item', label: '道具' },
    { id: 'consumable', label: '消耗品' },
    { id: 'mission', label: '任务书' },
    { id: 'lottery_chance', label: '祈愿' },
];

export const sidebarItems = [
    { label: "主界面", path: "/dashboard/home", icon: <BarChartOutlined /> },
    { label: "背包", path: "/dashboard/backpack", icon: <ShoppingOutlined /> },
    { label: "任务", path: "/dashboard/tasks", icon: <UnorderedListOutlined /> },
    { label: "商城", path: "/dashboard/store", icon: <ShopOutlined /> },
    { label: "探索法则", path: "/dashboard/setting", icon: <SettingOutlined /> }, // 更具游戏感的命名
];