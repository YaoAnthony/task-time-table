import { User } from "./User";
import type { SystemLite } from "./System";


export type AttributeKey =
    | "stamina"
    | "strength"
    | "wisdom"
    | "discipline"
    | "charisma"
    | "luck";

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


export interface Profile {
    _id: string; // MongoDB 的 ObjectId 通常在前端是 string 类型
    user: User; // 关联的 User ID（或你也可以拓展为 user 对象）
    paymentMethods?: PaymentMethod[];
    systems?: SystemLite[];
    wallet?: {
        coins: number;
    };
    attributes?: Record<AttributeKey, AttributeValue>;
    inventory?: InventoryItem[];
}

