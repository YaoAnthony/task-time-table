// icons
import {
    BarChartOutlined,
    ShopOutlined,
    UnorderedListOutlined,
    PlaySquareOutlined,
    DatabaseOutlined,
    HighlightOutlined,
} from '@ant-design/icons';

export const inventoryTabs: { id: string; label: string }[] = [
    { id: 'game', label: '游戏背包' },
    { id: 'all', label: '现实背包' },
    { id: 'item', label: '现实道具' },
    { id: 'consumable', label: '消耗品' },
    { id: 'mission', label: '任务书' },
    { id: 'lottery_chance', label: '祈愿' },
];

export const sidebarItems = [
    { label: '主界面', path: '/dashboard/home', icon: <BarChartOutlined /> },
    { label: '系列任务', path: '/dashboard/tasks', icon: <UnorderedListOutlined /> },
    { label: '商城', path: '/dashboard/store', icon: <ShopOutlined /> },
    { label: '挂机培养', path: '/dashboard/idle-game', icon: <PlaySquareOutlined /> },
    { label: '剧情编辑器', path: '/dashboard/storyline-editor', icon: <HighlightOutlined /> },
    { label: 'NPC data', path: '/dashboard/npc-data', icon: <DatabaseOutlined /> },
];
