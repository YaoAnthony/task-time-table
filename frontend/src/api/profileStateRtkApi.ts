import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from '../Redux/store';
import { getEnv } from '../config/env';
import { setToken, logout } from '../Redux/Features/userSlice';
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

const { backendUrl } = getEnv();

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
                /** NPC's current inventory — so LLM knows what NPC has. */
                npcInventory?:  Record<string, number>;
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

        /** Fetch all unopened treasure chests for the current user. */
        getGameChests: builder.query<{ chests: GameChest[] }, void>({
            query: () => '/profile/game/chests',
        }),

        /** Open a chest: backend applies rewards and returns updated wallet + inventory. */
        openChest: builder.mutation<
            { success: boolean; rewards: GameChest['rewards']; wallet: { coins: number }; inventory: InventoryItem[] },
            { chestId: string }
        >({
            query: ({ chestId }) => ({
                url:    `/profile/game/chests/${chestId}/open`,
                method: 'POST',
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
    useNpcChatMutation,
    useNpcDispatchReturnMutation,
    useLazyGetNpcMemoriesQuery,
    useLazyGetGameChestsQuery,
    useOpenChestMutation,
    // Game inventory
    usePickupGameItemMutation,
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
