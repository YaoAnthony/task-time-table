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
            invalidatesTags: ['ProfileState'],
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
    }),
});

export const {
    useLazyGetProfileStateQuery,
    useUpdateProfileCoinsMutation,
    useUpdateProfileAttributeMutation,
    usePurchaseFromSystemStoreMutation,
    useUseInventoryItemMutation,
} = profileStateRtkApi;
