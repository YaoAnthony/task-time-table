import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import type { BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query';
import type { RootState } from '../Redux/store';
import { getEnv } from '../config/env';
import { setToken, logout } from '../Redux/Features/userSlice';
import { setProfile } from '../Redux/Features/profileSlice';
import {
    addSystem,
    removeSystem,
    setCurrentSystem,
    setSelectedSystemId,
    setSystemError,
    setSystemLoading,
    setSystems,
    type SystemLite,
} from '../Redux/Features/systemSlice';
import type {
    AddSystemAttributePayload,
    AddSystemItemPayload,
    CreateLotteryPoolPayload,
    CreateLotteryPrizePayload,
    CreateMissionListPayload,
    CreateMissionNodePayload,
    CreateStoreProductPayload,
    CreateSystemPayload,
    UpdateLotteryPoolPayload,
    UserAttributeCategory,
} from './systemApi';

import { Mission } from '../Types/System';

const normalizeStoreType = (value: CreateStoreProductPayload['type']) => {
    if (value === 'consumables') return 'item';
    if (value === 'cache chance') return 'lottery_chance';
    return value;
};

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
        const refreshResult = await rawBaseQuery('/auth/refresh', api, extraOptions);
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

export const systemRtkApi = createApi({
    reducerPath: 'systemRtkApi',
    baseQuery: baseQueryWithReauth,
    tagTypes: ['System', 'SystemList'],
    endpoints: (builder) => ({
        createSystem: builder.mutation<{ success: boolean; system: Record<string, unknown> }, CreateSystemPayload>({
            query: (body) => ({
                url: '/system/create',
                method: 'POST',
                body,
            }),
            invalidatesTags: ['SystemList'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setSystemLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    const system = data.system as unknown as SystemLite;
                    dispatch(addSystem(system));
                    dispatch(setCurrentSystem(data.system));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to create system';
                    dispatch(setSystemError(message));
                }
            },
        }),

        getSystemList: builder.query<{ systems: SystemLite[] }, void>({
            query: () => '/system/list',
            providesTags: ['SystemList'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                dispatch(setSystemLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setSystems(data.systems || []));
                    if (data.systems?.[0]?._id) {
                        dispatch(setSelectedSystemId(data.systems[0]._id));
                    }
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to load systems';
                    dispatch(setSystemError(message));
                }
            },
        }),

        getSystemDetail: builder.query<{ system: Record<string, unknown> }, { systemId: string }>({
            query: ({ systemId }) => `/system/${systemId}`,
            providesTags: (_result, _error, arg) => [{ type: 'System', id: arg.systemId }],
            async onQueryStarted(arg, { dispatch, queryFulfilled }) {
                dispatch(setSystemLoading(true));
                try {
                    const { data } = await queryFulfilled;
                    dispatch(setSelectedSystemId(arg.systemId));
                    dispatch(setCurrentSystem(data.system));
                } catch (err) {
                    const e = err as { error: FetchBaseQueryError };
                    const message = (e.error?.data as { message?: string })?.message || 'Failed to load system detail';
                    dispatch(setSystemError(message));
                }
            },
        }),

        searchSystem: builder.query<{ system: SystemLite }, { systemId: string }>({
            query: ({ systemId }) => `/system/search/${systemId}`,
            async onQueryStarted(_arg, { queryFulfilled }) {
                try {
                    await queryFulfilled;
                } catch (err) {
                    console.error('Search system error:', err);
                }
            },
        }),
        joinSystem: builder.mutation<{ success: boolean; system: Record<string, unknown> }, { systemId: string }>({
            query: ({ systemId }) => ({
                url: `/system/${systemId}/join`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: ['SystemList'],
            async onQueryStarted(_, { dispatch, queryFulfilled }) {
                try {
                    const { data } = await queryFulfilled;
                    if (data?.system) {
                        dispatch(addSystem(data.system as unknown as SystemLite));
                    }
                } catch (err) {
                    console.error('Join system error:', err);
                }
            },
        }),
        leaveSystem: builder.mutation<{ success: boolean; systemId: string }, { systemId: string }>({
            query: ({ systemId }) => ({
                url: `/system/${systemId}/leave`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: ['SystemList'],
            async onQueryStarted({ systemId }, { dispatch, getState, queryFulfilled }) {
                try {
                    await queryFulfilled;
                    dispatch(removeSystem(systemId));

                    const state = getState() as RootState;
                    const currentProfile = state.profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            systems: (currentProfile.systems || []).filter((item) => item._id !== systemId),
                            inventory: (currentProfile.inventory || []).filter(
                                (entry) => String(entry.sourceSystem || '') !== String(systemId)
                            ),
                        }));
                    }
                } catch (err) {
                    console.error('Leave system error:', err);
                }
            },
        }),
        deleteSystem: builder.mutation<{ success: boolean; systemId: string }, { systemId: string }>({
            query: ({ systemId }) => ({
                url: `/system/${systemId}`,
                method: 'DELETE',
            }),
            invalidatesTags: ['SystemList'],
            async onQueryStarted({ systemId }, { dispatch, getState, queryFulfilled }) {
                try {
                    await queryFulfilled;
                    dispatch(removeSystem(systemId));

                    const state = getState() as RootState;
                    const currentProfile = state.profile.profile;
                    if (currentProfile) {
                        dispatch(setProfile({
                            ...currentProfile,
                            systems: (currentProfile.systems || []).filter((item) => item._id !== systemId),
                            inventory: (currentProfile.inventory || []).filter(
                                (entry) => String(entry.sourceSystem || '') !== String(systemId)
                            ),
                        }));
                    }
                } catch (err) {
                    console.error('Delete system error:', err);
                }
            },
        }),
        initSixAttributeBoards: builder.mutation<{ success: boolean }, { systemId: string }>({
            query: ({ systemId }) => ({
                url: `/system/${systemId}/attributes/init-six-boards`,
                method: 'POST',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        addSystemAttribute: builder.mutation<
            { success: boolean },
            { systemId: string } & AddSystemAttributePayload
        >({
            query: ({ systemId, ...body }) => ({
                url: `/system/${systemId}/attributes`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        markSystemAttributeUsed: builder.mutation<
            { success: boolean },
            { systemId: string; category: UserAttributeCategory; attributeName: string; used?: boolean }
        >({
            query: ({ systemId, category, attributeName, used = true }) => ({
                url: `/system/${systemId}/attributes/${category}/${encodeURIComponent(attributeName)}/mark-used`,
                method: 'PATCH',
                body: { used },
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        deleteSystemAttribute: builder.mutation<
            { success: boolean },
            { systemId: string; category: UserAttributeCategory; attributeName: string }
        >({
            query: ({ systemId, category, attributeName }) => ({
                url: `/system/${systemId}/attributes/${category}/${encodeURIComponent(attributeName)}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        addSystemItem: builder.mutation<{ success: boolean }, { systemId: string } & AddSystemItemPayload>({
            query: ({ systemId, ...body }) => ({
                url: `/system/${systemId}/items`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        createMissionList: builder.mutation<
            { success: boolean },
            { systemId: string } & CreateMissionListPayload
        >({
            query: ({ systemId, ...body }) => ({
                url: `/system/${systemId}/mission-lists`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        updateMissionList: builder.mutation<
            { success: boolean },
            { systemId: string; missionListId: string } & CreateMissionListPayload
        >({
            query: ({ systemId, missionListId, ...body }) => ({
                url: `/system/${systemId}/mission-lists/${missionListId}`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        deleteMissionList: builder.mutation<
            { success: boolean },
            { systemId: string; missionListId: string }
        >({
            query: ({ systemId, missionListId }) => ({
                url: `/system/${systemId}/mission-lists/${missionListId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        createMissionNode: builder.mutation<
            { success: boolean },
            { systemId: string; missionListId: string } & CreateMissionNodePayload
        >({
            query: ({ systemId, missionListId, ...body }) => ({
                url: `/system/${systemId}/mission-lists/${missionListId}/nodes`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        getMemberTaskCenter: builder.query<
            {
                success: boolean;
                missionLists: Array<Mission>;
                activeTask: {
                    missionListId: string;
                    nodeId: string;
                    startedAt: string;
                } | null;
                history: Array<{
                    _id: string;
                    eventType: string;
                    missionListId: string;
                    nodeId?: string | null;
                    taskTitle?: string;
                    timestamp: string;
                }>;
                completedCount: number;
            },
            { systemId: string }
        >({
            query: ({ systemId }) => `/system/${systemId}/member/tasks`,
        }),

        acceptMissionList: builder.mutation<
            { success: boolean; missionListId: string },
            { systemId: string; missionListId: string }
        >({
            query: ({ systemId, missionListId }) => ({
                url: `/system/${systemId}/member/mission-lists/${missionListId}/accept`,
                method: 'POST',
                body: {},
            }),
        }),

        startMemberTask: builder.mutation<
            { success: boolean },
            { systemId: string; missionListId: string; nodeId: string }
        >({
            query: ({ systemId, missionListId, nodeId }) => ({
                url: `/system/${systemId}/member/mission-lists/${missionListId}/nodes/${encodeURIComponent(nodeId)}/start`,
                method: 'POST',
                body: {},
            }),
        }),

        completeMemberTask: builder.mutation<
            {
                success: boolean;
                rewards?: {
                    experience?: Array<{ name: string; value: number }>;
                    coins?: number;
                    items?: Array<{ itemKey: string; quantity: number }>;
                };
                completedNodeId?: string;
                missionListCompleted?: boolean;
            },
            { systemId: string; missionListId: string; nodeId: string }
        >({
            query: ({ systemId, missionListId, nodeId }) => ({
                url: `/system/${systemId}/member/mission-lists/${missionListId}/nodes/${encodeURIComponent(nodeId)}/complete`,
                method: 'POST',
                body: {},
            }),
        }),

        failMemberTask: builder.mutation<
            { success: boolean; failedNodeId: string },
            { systemId: string; missionListId: string; nodeId: string }
        >({
            query: ({ systemId, missionListId, nodeId }) => ({
                url: `/system/${systemId}/member/mission-lists/${missionListId}/nodes/${encodeURIComponent(nodeId)}/fail`,
                method: 'POST',
                body: {},
            }),
        }),

        restartMemberTask: builder.mutation<
            { success: boolean },
            { systemId: string; missionListId: string; nodeId: string }
        >({
            query: ({ systemId, missionListId, nodeId }) => ({
                url: `/system/${systemId}/member/mission-lists/${missionListId}/nodes/${encodeURIComponent(nodeId)}/restart`,
                method: 'POST',
                body: {},
            }),
        }),

        getMemberCurrentTask: builder.query<
            {
                success: boolean;
                activeTask: {
                    missionListId: string;
                    missionListTitle: string;
                    nodeId: string;
                    nodeTitle: string;
                    description?: string;
                    timeCostMinutes?: number;
                    startedAt: string;
                } | null;
            },
            { systemId: string }
        >({
            query: ({ systemId }) => `/system/${systemId}/member/tasks/current`,
        }),

        getMemberTaskHistory: builder.query<
            {
                success: boolean;
                history: Array<{
                    _id: string;
                    eventType: string;
                    missionListId: string;
                    nodeId?: string | null;
                    taskTitle?: string;
                    timestamp: string;
                }>;
            },
            { systemId: string }
        >({
            query: ({ systemId }) => `/system/${systemId}/member/tasks/history`,
        }),

        createStoreProduct: builder.mutation<
            { success: boolean; storeProducts: unknown[] },
            { systemId: string } & CreateStoreProductPayload
        >({
            query: ({ systemId, type, ...body }) => ({
                url: `/system/${systemId}/store-products`,
                method: 'POST',
                body: {
                    ...body,
                    type: normalizeStoreType(type),
                },
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        updateStoreProduct: builder.mutation<
            { success: boolean; storeProducts: unknown[] },
            { systemId: string; productId: string } & Partial<CreateStoreProductPayload>
        >({
            query: ({ systemId, productId, type, ...body }) => ({
                url: `/system/${systemId}/store-products/${productId}`,
                method: 'PATCH',
                body: {
                    ...body,
                    ...(type && { type: normalizeStoreType(type) }),
                },
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        deleteStoreProduct: builder.mutation<
            { success: boolean; storeProducts: unknown[] },
            { systemId: string; productId: string }
        >({
            query: ({ systemId, productId }) => ({
                url: `/system/${systemId}/store-products/${productId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        purchaseStoreProduct: builder.mutation<
            {
                success: boolean;
                message: string;
                purchase: {
                    productId: string;
                    productName: string;
                    quantity: number;
                    unitPrice: number;
                    totalCost: number;
                    remainingCoins: number;
                };
            },
            { systemId: string; productId: string; quantity?: number }
        >({
            query: ({ systemId, productId, quantity = 1 }) => ({
                url: `/system/${systemId}/member/store-products/${productId}/purchase`,
                method: 'POST',
                body: { quantity },
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        createLotteryPool: builder.mutation<
            { success: boolean },
            { systemId: string } & CreateLotteryPoolPayload
        >({
            query: ({ systemId, ...body }) => ({
                url: `/system/${systemId}/lottery-pools`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        createLotteryPrize: builder.mutation<
            { success: boolean },
            { systemId: string; poolId: string } & CreateLotteryPrizePayload
        >({
            query: ({ systemId, poolId, ...body }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}/prizes`,
                method: 'POST',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }],
        }),

        updateLotteryPool: builder.mutation<
            { success: boolean },
            { systemId: string; poolId: string } & UpdateLotteryPoolPayload
        >({
            query: ({ systemId, poolId, ...body }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}`,
                method: 'PATCH',
                body,
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        deleteLotteryPrize: builder.mutation<
            { success: boolean },
            { systemId: string; poolId: string; prizeId: string }
        >({
            query: ({ systemId, poolId, prizeId }) => ({
                url: `/system/${systemId}/lottery-pools/${poolId}/prizes/${prizeId}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        drawLotteryPool: builder.mutation<
            {
                success: boolean;
                message: string;
                draw: {
                    poolId: string;
                    poolName: string;
                    consumed?: {
                        type: 'item';
                        itemKey: string;
                        quantity: number;
                    } | null;
                    reward?: {
                        productId: string;
                        productName: string;
                        productType: 'mission' | 'item' | 'lottery_chance';
                        quantity: number;
                    } | null;
                    won: boolean;
                    randomValue: number;
                };
            },
            { systemId: string; poolId: string }
        >({
            query: ({ systemId, poolId }) => ({
                url: `/system/${systemId}/member/lottery-pools/${poolId}/draw`,
                method: 'POST',
                body: {},
            }),
            invalidatesTags: (_res, _err, arg) => [{ type: 'System', id: arg.systemId }, 'SystemList'],
        }),

        getMemberLotteryHistory: builder.query<
            {
                success: boolean;
                history: Array<{
                    _id: string;
                    poolId: string;
                    poolName: string;
                    consumed?: {
                        type?: 'none' | 'item' | 'coins';
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
                }>;
            },
            { systemId: string; limit?: number }
        >({
            query: ({ systemId, limit = 30 }) => `/system/${systemId}/member/lottery/history?limit=${limit}`,
        }),
    }),
});

export const {
    useCreateSystemMutation,
    useGetSystemListQuery,
    useGetSystemDetailQuery,
    useLazyGetSystemListQuery,
    useLazyGetSystemDetailQuery,
    useLazySearchSystemQuery,
    useJoinSystemMutation,
    useLeaveSystemMutation,
    useDeleteSystemMutation,
    useInitSixAttributeBoardsMutation,
    useAddSystemAttributeMutation,
    useMarkSystemAttributeUsedMutation,
    useDeleteSystemAttributeMutation,
    useAddSystemItemMutation,
    useCreateMissionListMutation,
    useUpdateMissionListMutation,
    useDeleteMissionListMutation,
    useCreateMissionNodeMutation,
    useGetMemberTaskCenterQuery,
    useLazyGetMemberTaskCenterQuery,
    useAcceptMissionListMutation,
    useStartMemberTaskMutation,
    useCompleteMemberTaskMutation,
    useFailMemberTaskMutation,
    useRestartMemberTaskMutation,
    useGetMemberCurrentTaskQuery,
    useLazyGetMemberCurrentTaskQuery,
    useGetMemberTaskHistoryQuery,
    useLazyGetMemberTaskHistoryQuery,
    useCreateStoreProductMutation,
    useUpdateStoreProductMutation,
    useDeleteStoreProductMutation,
    usePurchaseStoreProductMutation,
    useCreateLotteryPoolMutation,
    useCreateLotteryPrizeMutation,
    useUpdateLotteryPoolMutation,
    useDeleteLotteryPrizeMutation,
    useDrawLotteryPoolMutation,
    useGetMemberLotteryHistoryQuery,
    useLazyGetMemberLotteryHistoryQuery,
} = systemRtkApi;
