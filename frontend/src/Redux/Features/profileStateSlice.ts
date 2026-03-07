import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type UserAttributeKey = 'stamina' | 'strength' | 'wisdom' | 'discipline' | 'charisma' | 'luck';

export interface UserAttributeValue {
    level: number;
    exp: number;
}

export interface InventoryItem {
    inventoryKey: string;
    name: string;
    type: 'item' | 'mission' | 'lottery_chance' | 'consumable';
    quantity: number;
    sourceSystem?: string | null;
    metadata?: Record<string, unknown>;
}

export interface ProfileRuntimeState {
    wallet: {
        coins: number;
    };
    attributes: Record<UserAttributeKey, UserAttributeValue>;
    inventory: InventoryItem[];
    loading: boolean;
    error?: string;
}

const initialAttributes: Record<UserAttributeKey, UserAttributeValue> = {
    stamina: { level: 0, exp: 0 },
    strength: { level: 0, exp: 0 },
    wisdom: { level: 0, exp: 0 },
    discipline: { level: 0, exp: 0 },
    charisma: { level: 0, exp: 0 },
    luck: { level: 0, exp: 0 },
};

const initialState: ProfileRuntimeState = {
    wallet: { coins: 0 },
    attributes: initialAttributes,
    inventory: [],
    loading: false,
    error: undefined,
};

const profileStateSlice = createSlice({
    name: 'profileState',
    initialState,
    reducers: {
        setProfileState(
            state,
            action: PayloadAction<{
                wallet: { coins: number };
                attributes: Record<UserAttributeKey, UserAttributeValue>;
                inventory: InventoryItem[];
            }>
        ) {
            state.wallet = action.payload.wallet;
            state.attributes = action.payload.attributes;
            state.inventory = action.payload.inventory;
            state.loading = false;
            state.error = undefined;
        },
        setProfileStateLoading(state, action: PayloadAction<boolean>) {
            state.loading = action.payload;
        },
        setProfileStateError(state, action: PayloadAction<string | undefined>) {
            state.error = action.payload;
            state.loading = false;
        },
        setWalletCoins(state, action: PayloadAction<number>) {
            state.wallet.coins = Math.max(0, action.payload);
        },
        setInventory(state, action: PayloadAction<InventoryItem[]>) {
            state.inventory = action.payload;
        },
        clearProfileState(state) {
            state.wallet = { coins: 0 };
            state.attributes = initialAttributes;
            state.inventory = [];
            state.loading = false;
            state.error = undefined;
        },
    },
});

export const {
    setProfileState,
    setProfileStateLoading,
    setProfileStateError,
    setWalletCoins,
    setInventory,
    clearProfileState,
} = profileStateSlice.actions;

export default profileStateSlice.reducer;
