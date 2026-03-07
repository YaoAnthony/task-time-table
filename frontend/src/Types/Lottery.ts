export type LotteryConsumeType = 'none' | 'item' | 'coins';

export type LotteryPrizeType = 'mission' | 'item' | 'retry' | 'empty';

export type LotteryPrize = {
    _id: string;
    type?: LotteryPrizeType;
    name: string;
    itemKey?: string | null;
    productId?: string | null;
    probability: number;
    quantity?: number;
};

export type LotteryPool = {
    _id: string;
    name: string;
    description?: string;
    consume?: {
        type?: LotteryConsumeType;
        itemKey?: string | null;
        quantity?: number;
    };
    prizes?: LotteryPrize[];
};

export type LotteryHistoryRecord = {
    _id: string;
    poolId: string;
    poolName: string;
    consumed?: {
        type?: LotteryConsumeType;
        itemKey?: string | null;
        quantity?: number;
    };
    reward?: {
        productId?: string | null;
        productName?: string;
        productType?: 'mission' | 'item' | 'lottery_chance' | null;
        quantity?: number;
    };
    won: boolean;
    randomValue: number;
    createdAt: string;
};