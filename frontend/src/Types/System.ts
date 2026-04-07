import type { LotteryConsumeType } from './Lottery';
import type { LotteryPool } from './Lottery';
// ==================== Basic Types ====================

export type UserAttributeCategory =
    | 'stamina'
    | 'strength'
    | 'wisdom'
    | 'discipline'
    | 'charisma'
    | 'luck';

export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export type StoreProductType = 'mission' | 'item' | 'lottery_chance';
export type StoreProductInputType = StoreProductType | 'consumables' | 'cache chance';

export type MissionListType = 'mainline' | 'urgent';

// ==================== Request Options ====================

export interface RequestOptions {
    signal?: AbortSignal;
    headers?: Record<string, string | number | boolean>;
}

export interface AccessTokenInput {
    accessToken: string;
}

// ==================== Mission Related ====================

export interface UnlockCondition {
    type?: 'direct' | 'attributeLevel';
    attributeName?: string | null;
    minLevel?: number;
}

export interface PointPenalty {
    attributeName: string;
    value: number;
}

export interface ItemPenalty {
    itemKey: string;
    quantity: number;
}

export interface FailureMechanism {
    enabled?: boolean;
    pointPenalty?: PointPenalty[];
    itemPenalty?: ItemPenalty[];
}

export interface RewardExperience {
    name: string;
    value: number;
}

export interface RewardItem {
    itemKey: string;
    quantity: number;
}

export interface UnlockMissionReward {
    missionId: string;
    title: string;
    description?: string;
}

export interface TaskNodeReward {
    experience?: RewardExperience[];
    coins?: number;
    items?: RewardItem[];
    unlockMissions?: UnlockMissionReward[];
}

export interface Mission {
    _id: string;
    listType: MissionListType;
    title: string;
    image?: string | null;
    description?: string;
    accepted: boolean;
    hasFailed: boolean;
    completedAt?: string | null;
    nodes: Array<{
        nodeId: string;
        parentNodeId: string | null;
        prerequisiteNodeIds?: string[];
        title: string;
        description?: string;
        content?: string;
        notice?: string;
        timeCostMinutes: number;
        completed: boolean;
        failed: boolean;
        isActive: boolean;
        canStart: boolean;
        canRestart: boolean;
        isLocked?: boolean;
        blockedByNodeIds?: string[];
        blockedByTitles?: string[];
        rewards?: {
            experience?: Array<{ name: string; value: number }>;
            coins?: number;
            items?: Array<{ itemKey: string; quantity: number }>;
        };
    }>;
}

export interface StoreProduct {
    _id: string;
    name: string;
    type: StoreProductType;
    image?: string | null;
    description?: string;
    rarity: Rarity;
    price: number;
    stock: number | null;
    missionId?: string;
    isListed: boolean;
}


export interface MissionList {
    _id: string;
    listType: MissionListType;
    title: string;
    image?: string | null;
    description?: string;
    unlockCondition?: {
        type?: 'direct' | 'attributeLevel';
        attributeName?: string | null;
        minLevel?: number;
    };
    failureMechanism?: {
        enabled?: boolean;
        pointPenalty?: Array<{ attributeName: string; value: number }>;
        itemPenalty?: Array<{ itemKey: string; quantity: number }>;
    };
    hasFailed?: boolean;
    restartAllowed?: boolean;
    rootNodeId?: string | null;
    taskTree: MissionNode[];
}

interface MissionNodeReward {
    experience?: Array<{ name: string; value: number }>;
    coins?: number;
    items?: Array<{ itemKey: string; quantity: number }>;
    unlockMissions?: Array<{ missionId: string; title: string; description?: string }>;
}

interface MissionNode {
    nodeId: string;
    parentNodeId: string | null;
    prerequisiteNodeIds?: string[];
    title: string;
    description?: string;
    content?: string;
    notice?: string;
    timeCostMinutes: number;
    canInterrupt?: boolean;
    rewards?: MissionNodeReward;
    childrenNodeIds: string[];
    status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface SystemLite {
    _id: string;
    name: string;
    image?: string | null;
    description?: string;
    profile?: string;
    modules?: {
        taskChain?: boolean;
        store?: boolean;
        lottery?: boolean;
    };
    storeProducts?: StoreProduct[];
    obtainableItems?: Array<{
        itemKey: string;
        name: string;
        image?: string | null;
        description?: string;
        rarity?: Rarity;
    }>;
    lotteryPools?: LotteryPool[];
    missionLists?: MissionList[];
    createdAt?: string;
    updatedAt?: string;
}


export type SystemWithMission = SystemLite;

// ==================== Payload Interfaces ====================

export interface CreateSystemPayload {
    name: string;
    image?: string | null;
    description?: string;
    modules?: {
        taskChain?: boolean;
        store?: boolean;
        lottery?: boolean;
    };
    attributeBoard?: Array<{
        category: UserAttributeCategory;
        displayName: string;
        attributes?: Array<{ name: string; level?: number; used?: boolean }>;
    }>;
    obtainableItems?: Array<{
        itemKey: string;
        name: string;
        image?: string | null;
        description?: string;
        rarity?: Rarity;
    }>;
    missionLists?: unknown[];
    storeProducts?: unknown[];
    lotteryPools?: unknown[];
}

export interface CreateMissionListPayload {
    listType: MissionListType;
    title: string;
    image?: string | null;
    description?: string;
    unlockCondition?: UnlockCondition;
    failureMechanism?: FailureMechanism;
}

export interface CreateMissionNodePayload {
    nodeId?: string;
    parentNodeId?: string | null;
    prerequisiteNodeIds?: string[];
    title: string;
    description?: string;
    content?: string;
    notice?: string;
    timeCostMinutes: number;
    canInterrupt?: boolean;
    rewards?: TaskNodeReward;
}

export interface CreateStoreProductPayload {
    name: string;
    type: StoreProductInputType;
    image?: string | null;
    description?: string;
    rarity?: Rarity;
    price: number;
    stock?: number | null;
}

export interface CreateLotteryPoolPayload {
    name: string;
    description?: string;
    consume?: {
        type?: LotteryConsumeType;
        itemKey?: string | null;
        quantity?: number;
    };
}

export interface CreateLotteryPrizePayload {
    productId: string;
    quantity?: number;
    probability: number;
}

export interface UpdateLotteryPoolPayload {
    name?: string;
    description?: string;
    consume?: {
        type?: LotteryConsumeType;
        itemKey?: string | null;
        quantity?: number;
    };
}

export interface AddSystemAttributePayload {
    category: UserAttributeCategory;
    displayName?: string;
    name: string;
    level?: number;
}

export interface AddSystemItemPayload {
    itemKey: string;
    name: string;
    image?: string;
    description?: string;
    rarity?: Rarity;
}
