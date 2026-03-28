import { User } from "./User";
import type { SystemLite } from "./System";
import type { GameWorldState } from '../Pages/Dashboard/component/SystemIdleGame/types';


export type AttributeKey =
    | "stamina"
    | "strength"
    | "wisdom"
    | "discipline"
    | "charisma"
    | "luck"
    | "vitality";

export interface AttributeValue {
    level: number;
    exp: number;
}

export interface InventoryItem {
    inventoryKey: string;
    name: string;
    type: "item" | "mission" | "lottery_chance" | "consumable";
    quantity: number;
    sourceSystem?: string | null;
    metadata?: Record<string, unknown>;
}

export interface PaymentMethod {
    cardNumber: string;
    cardHolderName: string;
    expiryDate: string;
    billingAddress: string;
}

export type FacingDirection = 'up' | 'down' | 'left' | 'right';

export interface ChestRewardItem {
    inventoryKey: string;
    name:         string;
    description:  string;
    rarity:       'common' | 'rare' | 'epic' | 'legendary' | 'mythic';
    imageUrl:     string;
    quantity:     number;
}

export interface GameChest {
    id:        string;
    x:         number;
    y:         number;
    rewards: {
        coins: number;
        items: ChestRewardItem[];
    };
    opened:    boolean;
    createdAt: number;
}

export interface TreeSaveState {
    id:       string;
    stage:    'A' | 'B' | 'C' | 'chopA' | 'chopBC';
    hasFruit: boolean;
}

export interface IdleGameState {
    x:          number;
    y:          number;
    gameTick:   number;
    facing:     FacingDirection;
    trees?:     TreeSaveState[];
    /** Generic world-entity blob: beds, nest states, future furniture. */
    worldState?: GameWorldState;
}

export interface Profile {
    _id: string;
    user: User;
    paymentMethods?: PaymentMethod[];
    systems?: SystemLite[];
    wallet?: {
        coins: number;
    };
    attributes?: Record<AttributeKey, AttributeValue>;
    inventory?: InventoryItem[];
    idleGame?: IdleGameState;
}
