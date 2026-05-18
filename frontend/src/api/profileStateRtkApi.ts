import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from '../Redux/store';
import { getEnv } from '../config/env';
import { setToken, logout } from '../Redux/Features/userSlice';
import { setProfile } from '../Redux/Features/profileSlice';
import {
    setInventory,
    setProfileState,
    setProfileStateError,
    setProfileStateLoading,
    setWalletCoins,
    type InventoryItem,
    type UserAttributeKey,
    type UserAttributeValue,
} from '../Redux/Features/profileStateSlice';
import type { CoinOperation, ProfileAttributePatchPayload } from './profileStateApi';
import type { IdleGameState, GameChest } from '../Types/Profile';
import type { NpcMemoryEntry, NpcChatResponse } from '../Pages/Dashboard/component/SystemIdleGame/types';
import type { GameInventoryItem, FarmTile, CreatureState } from '../Redux/Features/gameSlice';
import { setGameInventory, setFarmTiles, upsertFarmTile } from '../Redux/Features/gameSlice';
import type { GameSaveV1 } from '../Pages/Dashboard/component/SystemIdleGame/persistence/save/GameSaveTypes';
import type { HouseContractSave, HouseInstanceSave } from '../Pages/Dashboard/component/SystemIdleGame/housing/HouseTypes';
import type { StorageChestSave, StorageChestSlotItem } from '../Pages/Dashboard/component/SystemIdleGame/storage/StorageChestTypes';

const { backendUrl } = getEnv();

export type RuntimeStorylinePackage = {
    id: string;
    title: string;
    status: string;
    version: number;
    summary: string;
    tags: string[];
    updatedAt: string;
    schemaVersion: number;
    startState: string;
    states: string[];
    triggers: unknown[];
    events: Record<string, unknown[]>;
};

const rawBaseQuery = fetchBaseQuery({
    baseUrl: backendUrl,
    credentials: 'include',
    prepareHeaders: (headers, { getState }) => {
        const token = (getState() as RootState).user.accessToken;
        if (token) headers.set('Authorization', `Bearer ${token}`);
        return headers;
    },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
    args,
    api,
    extraOptions
) => {
    let result = await rawBaseQuery(args, api, extraOptions);

    if (result.error?.status === 401 || result.error?.status === 403) {
        const refreshResult = await rawBaseQuery({ url: '/auth/refresh', method: 'POST' }, api, extraOptions);
        if (refreshResult.data) {
            const { accessToken, expiresAt } = refreshResult.data as { accessToken: string; expiresAt: number };
            api.dispatch(setToken({ accessToken, expiresAt }));
            result = await rawBaseQuery(args, api, extraOptions);
        } else {
            api.dispatch(logout());
        }
    }

    return result;
};

type ProfileStateResponse = {
    wallet: { coins: number };
    attributes: Record<UserAttributeKey, UserAttributeValue>;
    inventory: InventoryItem[];
};

export type NpcPersonaSkill = {
    npcName: string;
    slug: string;
    filename: string;
    entryType?: 'file' | 'package';
    mode?: string;
    metadata: Record<string, string | number | boolean | string[]>;
    manifest?: Record<string, unknown>;
    content: string;
    body: string;
    files?: Array<{ path: string; content: string; kind?: string }>;
};

export type GameNpcShopItem = {
    id: string;
    name: string;
    role: string;
    title: string;
    description: string;
    price: number;
    owned: boolean;
    pendingArrival?: boolean;
    ownedByDefault?: boolean;
};

export type GameHouseShopItem = {
    id: string;
    name: string;
    nameZh: string;
    blueprintItemId: string;
    price: number;
    rentPerDay: number;
    ownedBlueprintQuantity?: number;
};

export type GameShopItem = {
    shopItemId: string;
    category: 'npc' | 'house' | 'storage' | 'tool' | 'pet';
    id: string;
    itemId?: string;
    name?: string;
    nameZh?: string;
    title?: string;
    role?: string;
    description?: string;
    price: number;
    owned?: boolean;
    pendingArrival?: boolean;
    ownedByDefault?: boolean;
    blueprintItemId?: string;
    rentPerDay?: number;
    capacity?: number;
    ownedQuantity?: number;
    ownedBlueprintQuantity?: number;
    petId?: string;
    ownerNpcId?: string;
    canSpeak?: boolean;
};

export type StorageChestTransferRef =
    | { container: 'player'; item: StorageChestSlotItem }
    | { container: 'chest'; index: number };

export const profileStateRtkApi = createApi({
    reducerPath: 'profileStateRtkApi',
    baseQuery: baseQueryWithReauth,
    tagTypes: ['ProfileState'],
    endpoints: (builder) => ({
        getProfileState: builder.query<ProfileStateResponse, void>({
            query: () => '/profile/state',
            providesTags: ['ProfileState'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setProfileStateLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setProfileState(data));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to load profile state';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        updateProfileCoins: builder.mutation<
            { success: boolean; wallet: { coins: number } },
            { amount: number; operation?: CoinOperation }
        >({
            query: (body) => ({
                url: '/profile/state/coins',
                method: 'PATCH',
                body,
            }),
            invalidatesTags: ['ProfileState'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setProfileStateLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    dispatch(setProfileStateLoading(false));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to update coins';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        updateProfileAttribute: builder.mutation<
            { success: boolean; attributes: Record<UserAttributeKey, UserAttributeValue> },
            { attributeKey: UserAttributeKey } & ProfileAttributePatchPayload
        >({
            query: ({ attributeKey, ...body }) => ({
                url: `/profile/state/attributes/${attributeKey}`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: ['ProfileState'],
        }),

        purchaseFromSystemStore: builder.mutation<
            {
                success: boolean;
                wallet: { coins: number };
                inventory: InventoryItem[];
            },
            { systemId: string; productId: string; quantity?: number }
        >({
            query: (body) => ({
                url: '/profile/shop/purchase',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['ProfileState'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setProfileStateLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    dispatch(setInventory(data.inventory));
                    dispatch(setProfileStateLoading(false));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to purchase product';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        useInventoryItem: builder.mutation<
            { success: boolean; inventory: InventoryItem[] },
            { inventoryKey: string; quantity?: number }
        >({
            query: (body) => ({
                url: '/profile/inventory/use',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setProfileStateLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setInventory(data.inventory));
                    dispatch(setProfileStateLoading(false));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to use inventory item';
                    dispatch(setProfileStateError(message));
                }
            },
        }),

        saveIdleGame: builder.mutation<
            { success: boolean; idleGame: IdleGameState },
            Partial<IdleGameState>
        >({
            query: (body) => ({
                url: '/profile/state/idle-game',
                method: 'PATCH',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            idleGame: data.idleGame,
                        }));
                    }
                } catch (_) {}
            },
        }),

        getGameSave: builder.query<{ success: boolean; gameSave: GameSaveV1; storylines?: RuntimeStorylinePackage[] }, string | void>({
            query: (roomId) => roomId ? `/profile/game/save?roomId=${encodeURIComponent(roomId)}` : '/profile/game/save',
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            gameSave: data.gameSave,
                        }));
                    }
                } catch (_) {}
            },
        }),

        saveGameSave: builder.mutation<
            { success: boolean; gameSave: GameSaveV1; storylines?: RuntimeStorylinePackage[] },
            { gameSave: GameSaveV1; roomId?: string | null }
        >({
            query: ({ gameSave, roomId }) => ({
                url: '/profile/game/save',
                method: 'PUT',
                body: { gameSave, roomId },
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            gameSave: data.gameSave,
                        }));
                    }
                } catch (_) {}
            },
        }),

        deleteGameSave: builder.mutation<
            { success: boolean; gameSave: GameSaveV1; wallet: { coins: number }; inventory: InventoryItem[] },
            { roomId?: string | null } | void
        >({
            query: (arg) => ({
                url: '/profile/game/save',
                method: 'DELETE',
                body: arg?.roomId ? { roomId: arg.roomId } : undefined,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...(currentProfile as any),
                            gameSave: data.gameSave,
                            gameInventory: [],
                            gameChests: [],
                            npcMemories: {},
                        } as any));
                    }
                    dispatch(setGameInventory([]));
                    dispatch(setWalletCoins(data.wallet.coins));
                    dispatch(setInventory(data.inventory));
                } catch (_) {}
            },
        }),

        getGameNpcShop: builder.query<
            {
                success: boolean;
                wallet: { coins: number };
                unlockedNpcs: string[];
                pendingNpcArrivals?: string[];
                npcs: GameNpcShopItem[];
                gameSave: GameSaveV1;
            },
            string | void
        >({
            query: (roomId) => roomId ? `/profile/game/npc-shop?roomId=${encodeURIComponent(roomId)}` : '/profile/game/npc-shop',
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            wallet: data.wallet,
                            gameSave: data.gameSave,
                        }));
                    }
                } catch (_) {}
            },
        }),

        purchaseGameNpc: builder.mutation<
            {
                success: boolean;
                alreadyOwned?: boolean;
                pendingArrival?: boolean;
                event?: unknown;
                npc: GameNpcShopItem;
                wallet: { coins: number };
                unlockedNpcs: string[];
                pendingNpcArrivals?: string[];
                gameSave: GameSaveV1;
            },
            { npcId: string; roomId?: string | null }
        >({
            query: (body) => ({
                url: '/profile/game/npc-shop/purchase',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            wallet: data.wallet,
                            gameSave: data.gameSave,
                        }));
                    }
                } catch (_) {}
            },
        }),

        getGameHouseShop: builder.query<
            { success: boolean; wallet: { coins: number }; items: GameHouseShopItem[] },
            string | void
        >({
            query: (roomId) => roomId ? `/profile/game/house-shop?roomId=${encodeURIComponent(roomId)}` : '/profile/game/house-shop',
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                } catch (_) {}
            },
        }),

        purchaseGameHouse: builder.mutation<
            { success: boolean; wallet: { coins: number }; gameInventory: GameInventoryItem[]; gameSave: GameSaveV1 },
            { houseDefinitionId: string; quantity?: number; roomId?: string | null }
        >({
            query: (body) => ({
                url: '/profile/game/house-shop/purchase',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    dispatch(setGameInventory(data.gameInventory));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, wallet: data.wallet, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        getGameShop: builder.query<
            {
                success: boolean;
                wallet: { coins: number };
                items: GameShopItem[];
                unlockedNpcs: string[];
                pendingNpcArrivals: string[];
                gameSave: GameSaveV1;
            },
            string | void
        >({
            query: (roomId) => roomId ? `/profile/game/shop?roomId=${encodeURIComponent(roomId)}` : '/profile/game/shop',
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                } catch (_) {}
            },
        }),

        purchaseGameShopItem: builder.mutation<
            {
                success: boolean;
                purchase: unknown;
                wallet: { coins: number };
                gameInventory: GameInventoryItem[];
                items: GameShopItem[];
                unlockedNpcs: string[];
                pendingNpcArrivals: string[];
                gameSave: GameSaveV1;
            },
            { shopItemId: string; quantity?: number; roomId?: string | null }
        >({
            query: (body) => ({
                url: '/profile/game/shop/purchase',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setWalletCoins(data.wallet.coins));
                    dispatch(setGameInventory(data.gameInventory));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, wallet: data.wallet, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        getGameHouses: builder.query<
            { success: boolean; houses: HouseInstanceSave[]; gameSave: GameSaveV1 },
            string | void
        >({
            query: (roomId) => roomId ? `/profile/game/houses?roomId=${encodeURIComponent(roomId)}` : '/profile/game/houses',
        }),

        placeGameHouse: builder.mutation<
            { success: boolean; house: HouseInstanceSave; houses: HouseInstanceSave[]; gameInventory: GameInventoryItem[]; gameSave: GameSaveV1 },
            {
                roomId?: string | null;
                blueprintItemId: string;
                definitionId: string;
                x: number;
                y: number;
                placementProof: { requestedAtTick: number; footprint: { x: number; y: number; w: number; h: number } };
            }
        >({
            query: (body) => ({
                url: '/profile/game/houses/place',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        completeHouseConstruction: builder.mutation<
            { success: boolean; house: HouseInstanceSave; houses: HouseInstanceSave[]; gameInventory: GameInventoryItem[]; gameSave: GameSaveV1 },
            { houseId: string; gameTick: number; roomId?: string | null }
        >({
            query: ({ houseId, ...body }) => ({
                url: `/profile/game/houses/${encodeURIComponent(houseId)}/construction/complete`,
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        openGameHouse: builder.mutation<
            { success: boolean; house: HouseInstanceSave; houses: HouseInstanceSave[]; gameSave: GameSaveV1 },
            { houseId: string; roomId?: string | null }
        >({
            query: ({ houseId, ...body }) => ({
                url: `/profile/game/houses/${encodeURIComponent(houseId)}/open`,
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        getGameHouseContracts: builder.query<
            { success: boolean; contracts: HouseContractSave[]; houses: HouseInstanceSave[]; gameSave: GameSaveV1 },
            string | void
        >({
            query: (roomId) => roomId ? `/profile/game/house-contracts?roomId=${encodeURIComponent(roomId)}` : '/profile/game/house-contracts',
        }),

        createGameHouseContract: builder.mutation<
            { success: boolean; contract: HouseContractSave; house: HouseInstanceSave; contracts: HouseContractSave[]; houses: HouseInstanceSave[]; gameSave: GameSaveV1 },
            { houseId: string; npcId: string; npcName: string; rentPerDay?: number; gameTick?: number; roomId?: string | null }
        >({
            query: (body) => ({
                url: '/profile/game/house-contracts',
                method: 'POST',
                body,
            }),
        }),

        signGameHouseContract: builder.mutation<
            { success: boolean; contract: HouseContractSave; house: HouseInstanceSave; contracts: HouseContractSave[]; houses: HouseInstanceSave[]; gameSave: GameSaveV1 },
            { contractId: string; gameTick?: number; roomId?: string | null }
        >({
            query: ({ contractId, ...body }) => ({
                url: `/profile/game/house-contracts/${encodeURIComponent(contractId)}/sign`,
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        getStorageChests: builder.query<
            { success: boolean; storageChests: StorageChestSave[]; gameSave: GameSaveV1 },
            string | void
        >({
            query: (roomId) => roomId ? `/profile/game/storage-chests?roomId=${encodeURIComponent(roomId)}` : '/profile/game/storage-chests',
        }),

        placeStorageChest: builder.mutation<
            { success: boolean; storageChest: StorageChestSave; storageChests: StorageChestSave[]; gameInventory: GameInventoryItem[]; gameSave: GameSaveV1 },
            {
                roomId?: string | null;
                itemId: string;
                x: number;
                y: number;
                placementProof: { requestedAtTick: number; footprint: { x: number; y: number; w: number; h: number } };
            }
        >({
            query: (body) => ({
                url: '/profile/game/storage-chests/place',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        transferStorageChestItem: builder.mutation<
            { success: boolean; storageChest: StorageChestSave; storageChests: StorageChestSave[]; gameInventory: GameInventoryItem[]; gameSave: GameSaveV1 },
            {
                chestId: string;
                roomId?: string | null;
                from: StorageChestTransferRef;
                to: StorageChestTransferRef | { container: 'player' };
                quantity?: number;
                gameTick?: number;
            }
        >({
            query: ({ chestId, ...body }) => ({
                url: `/profile/game/storage-chests/${encodeURIComponent(chestId)}/transfer`,
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, getState, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                    const currentProfile = (getState() as RootState).profile.profile;
                    if (currentProfile) dispatch(setProfile({ ...currentProfile, gameSave: data.gameSave }));
                } catch (_) {}
            },
        }),

        /**
         * Send a player message to an NPC and receive a short GPT reply.
         * Memory is now owned entirely by the backend — no need to send it.
         */
        npcChat: builder.mutation<
            NpcChatResponse,
            {
                npcName:        string;
                playerMessage:  string;
                gameTick:       number;
                playerX?:       number;
                playerY?:       number;
                /** NPC's current view of the world — passed as LLM context. */
                perception?:    string;
                perceptionContext?: Record<string, unknown> | null;
                /** NPC's current inventory — so LLM knows what NPC has. */
                npcInventory?:  Record<string, number>;
                /** Familiarity score (0-100) — feeds LLM prompt so tone evolves with relationship. */
                familiarity?:   number;
                /** Total chat count between player + NPC. */
                chatCount?:     number;
                /** When false, backend must not run LLM/MCP tools. */
                agentBrainEnabled?: boolean;
            }
        >({
            query: (body) => ({
                url:    '/profile/npc/chat',
                method: 'POST',
                body,
            }),
        }),

        /**
         * NPC returned from a dispatch mission — backend generates
         * a story + list of items the NPC brought back.
         */
        npcDispatchReturn: builder.mutation<
            { story: string; items: Array<{ itemId: string; qty: number }> },
            { npcName: string; carriedItems: Record<string, number>; gameTick?: number }
        >({
            query: (body) => ({
                url:    '/profile/npc/dispatch-return',
                method: 'POST',
                body,
            }),
        }),

        /** Fetch the full persistent memory array for a named NPC. */
        getNpcMemories: builder.query<
            { memories: NpcMemoryEntry[] },
            string   // npcName
        >({
            query: (npcName) => `/profile/npc/memories/${encodeURIComponent(npcName)}`,
        }),

        /** Fetch the backend persona skill that drives a named NPC. */
        getNpcSkill: builder.query<
            { skill: NpcPersonaSkill },
            string
        >({
            query: (npcName) => `/profile/npc/skills/${encodeURIComponent(npcName)}`,
        }),

        /** Fetch all unopened treasure chests for the current user. */
        getGameChests: builder.query<{ chests: GameChest[] }, string | void>({
            query: (roomId) => roomId ? `/profile/game/chests?roomId=${encodeURIComponent(roomId)}` : '/profile/game/chests',
        }),

        /** Open a chest: backend applies rewards and returns updated wallet + inventory. */
        openChest: builder.mutation<
            { success: boolean; rewards: GameChest['rewards']; wallet: { coins: number }; inventory: InventoryItem[] },
            { chestId: string; roomId?: string | null; localChest?: GameChest | null }
        >({
            query: ({ chestId, roomId, localChest }) => ({
                url:    `/profile/game/chests/${chestId}/open`,
                method: 'POST',
                body:   roomId || localChest ? { roomId, localChest } : undefined,
            }),
        }),

        // ── Game Inventory ───────────────────────────────────────────────────

        /** Persist a world item pickup (egg, fruit, crop) to the database. */
        pickupGameItem: builder.mutation<
            { success: boolean; gameInventory: GameInventoryItem[] },
            { itemId: string; quantity: number }
        >({
            query: (body) => ({
                url:    '/profile/game/inventory/pickup',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                } catch (_) {}
            },
        }),

        /** Persist local game item consumption such as Q-drop or placing furniture. */
        consumeGameItem: builder.mutation<
            { success: boolean; gameInventory: GameInventoryItem[] },
            { itemId: string; quantity?: number }
        >({
            query: (body) => ({
                url:    '/profile/game/inventory/consume',
                method: 'POST',
                body,
            }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                } catch (_) {}
            },
        }),

        /** Load game inventory from server (called on game ready). */
        getGameInventory: builder.query<{ gameInventory: GameInventoryItem[] }, void>({
            query: () => '/profile/game/inventory',
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setGameInventory(data.gameInventory));
                } catch (_) {}
            },
        }),

        // ── Farm ─────────────────────────────────────────────────────────────

        /** Convert a grass tile to tilled farmland. */
        tillFarmTile: builder.mutation<
            { success: boolean; farmTile: FarmTile; droppedSeed: { itemId: string; quantity: number } | null; gameInventory: GameInventoryItem[] },
            { tx: number; ty: number; itemId?: string; roomId?: string }
        >({
            query: (body) => ({ url: '/profile/game/farm/till', method: 'POST', body }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.farmTile) dispatch(upsertFarmTile(data.farmTile));
                    if (data.gameInventory) dispatch(setGameInventory(data.gameInventory));
                } catch (_) {}
            },
        }),

        /** Water a farm tile. */
        waterFarmTile: builder.mutation<
            { success: boolean; farmTile: FarmTile; farmTiles: FarmTile[] },
            { tx: number; ty: number; gameTick: number; itemId?: string; roomId?: string }
        >({
            query: (body) => ({ url: '/profile/game/farm/water', method: 'POST', body }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.farmTile) dispatch(upsertFarmTile(data.farmTile));
                } catch (_) {}
            },
        }),

        /** Plant a seed on a tilled/watered tile. */
        plantCrop: builder.mutation<
            { success: boolean; farmTiles: FarmTile[]; gameInventory: GameInventoryItem[] },
            { tx: number; ty: number; itemId: string; gameTick: number; roomId?: string }
        >({
            query: (body) => ({ url: '/profile/game/farm/plant', method: 'POST', body }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.farmTiles)    dispatch(setFarmTiles(data.farmTiles));
                    if (data.gameInventory) dispatch(setGameInventory(data.gameInventory));
                } catch (_) {}
            },
        }),

        /** Harvest a ready crop. */
        harvestCrop: builder.mutation<
            { success: boolean; farmTiles: FarmTile[]; dropItems: { itemId: string; quantity: number }[] },
            { tx: number; ty: number; gameTick?: number; roomId?: string }
        >({
            query: (body) => ({ url: '/profile/game/farm/harvest', method: 'POST', body }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.farmTiles) dispatch(setFarmTiles(data.farmTiles));
                    // No inventory update here — player must physically pick up spawned WorldItems
                } catch (_) {}
            },
        }),

        /** Load all farm tiles (called on game ready). */
        getFarmTiles: builder.query<{ farmTiles: FarmTile[] }, string | void>({
            query: (roomId) => roomId ? `/profile/game/farm?roomId=${roomId}` : '/profile/game/farm',
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setFarmTiles(data.farmTiles));
                } catch (_) {}
            },
        }),

        /** Advance crop timers server-side. Call every ~30 s alongside auto-save. */
        tickFarm: builder.mutation<
            { updated: number; farmTiles: FarmTile[] },
            { gameTick: number; roomId?: string }
        >({
            query: (body) => ({ url: '/profile/game/farm/tick', method: 'POST', body }),
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data.updated > 0) dispatch(setFarmTiles(data.farmTiles));
                } catch (_) {}
            },
        }),

        // ── Creatures ────────────────────────────────────────────────────────

        /** Batch save creature states (chickens etc.) every ~30 s. */
        saveCreatures: builder.mutation<{ success: boolean }, { creatures: CreatureState[]; roomId?: string }>({
            query: (body) => ({ url: '/profile/game/creatures', method: 'PATCH', body }),
        }),

        /** Load creature states on game ready. */
        getCreatures: builder.query<{ creatures: CreatureState[] }, string | void>({
            query: (roomId) => roomId ? `/profile/game/creatures?roomId=${roomId}` : '/profile/game/creatures',
        }),

        // ── AI Utilities ─────────────────────────────────────────────────────

        /** AI fills empty task fields from what the user has already typed. */
        aiFillTask: builder.mutation<
            { title: string; description: string; content: string; notice: string },
            { title?: string; description?: string; content?: string; notice?: string; systemContext?: string }
        >({
            query: (body) => ({ url: '/profile/ai/fill-task', method: 'POST', body }),
        }),
    }),
});

export const {
    useLazyGetProfileStateQuery,
    useUpdateProfileCoinsMutation,
    useUpdateProfileAttributeMutation,
    usePurchaseFromSystemStoreMutation,
    useUseInventoryItemMutation,
    useSaveIdleGameMutation,
    useLazyGetGameSaveQuery,
    useSaveGameSaveMutation,
    useDeleteGameSaveMutation,
    useGetGameNpcShopQuery,
    usePurchaseGameNpcMutation,
    useGetGameHouseShopQuery,
    usePurchaseGameHouseMutation,
    useGetGameShopQuery,
    usePurchaseGameShopItemMutation,
    useLazyGetGameHousesQuery,
    usePlaceGameHouseMutation,
    useCompleteHouseConstructionMutation,
    useOpenGameHouseMutation,
    useGetGameHouseContractsQuery,
    useCreateGameHouseContractMutation,
    useSignGameHouseContractMutation,
    useGetStorageChestsQuery,
    usePlaceStorageChestMutation,
    useTransferStorageChestItemMutation,
    useNpcChatMutation,
    useNpcDispatchReturnMutation,
    useLazyGetNpcMemoriesQuery,
    useLazyGetNpcSkillQuery,
    useLazyGetGameChestsQuery,
    useOpenChestMutation,
    // Game inventory
    usePickupGameItemMutation,
    useConsumeGameItemMutation,
    useLazyGetGameInventoryQuery,
    // Farm
    useTillFarmTileMutation,
    useWaterFarmTileMutation,
    usePlantCropMutation,
    useHarvestCropMutation,
    useLazyGetFarmTilesQuery,
    useTickFarmMutation,
    // Creatures
    useSaveCreaturesMutation,
    useLazyGetCreaturesQuery,
    // AI
    useAiFillTaskMutation,
} = profileStateRtkApi;
