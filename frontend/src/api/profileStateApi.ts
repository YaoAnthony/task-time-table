import { publicHttp } from './apiClient';

export type RequestOptions = {
    signal?: AbortSignal;
    headers?: Record<string, string | number | boolean>;
};

export type AccessTokenInput = {
    accessToken: string;
};

export type UserAttributeKey =
    | 'stamina'
    | 'strength'
    | 'wisdom'
    | 'discipline'
    | 'charisma'
    | 'luck';

export type CoinOperation = 'add' | 'subtract' | 'set';

export type ProfileAttributePatchPayload = {
    levelDelta?: number;
    expDelta?: number;
    setLevel?: number;
    setExp?: number;
};

export type PurchasePayload = {
    systemId: string;
    productId: string;
    quantity?: number;
};

export type UseInventoryPayload = {
    inventoryKey: string;
    quantity?: number;
};

const authHeaders = (accessToken: string, headers?: RequestOptions['headers']) => ({
    Authorization: `Bearer ${accessToken}`,
    ...headers,
});

export async function getProfileState(
    payload: AccessTokenInput,
    options?: RequestOptions
) {
    const res = await publicHttp.get('/profile/state', {
        signal: options?.signal,
        headers: authHeaders(payload.accessToken, options?.headers),
    });
    return res.data;
}

export async function updateProfileCoins(
    payload: AccessTokenInput & {
        amount: number;
        operation?: CoinOperation;
    },
    options?: RequestOptions
) {
    const { accessToken, ...body } = payload;
    const res = await publicHttp.patch('/profile/state/coins', body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function updateProfileAttribute(
    payload: AccessTokenInput & {
        attributeKey: UserAttributeKey;
    } & ProfileAttributePatchPayload,
    options?: RequestOptions
) {
    const { accessToken, attributeKey, ...body } = payload;
    const res = await publicHttp.patch(`/profile/state/attributes/${attributeKey}`, body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function purchaseFromSystemStore(
    payload: AccessTokenInput & PurchasePayload,
    options?: RequestOptions
) {
    const { accessToken, ...body } = payload;
    const res = await publicHttp.post('/profile/shop/purchase', body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}

export async function useInventoryItem(
    payload: AccessTokenInput & UseInventoryPayload,
    options?: RequestOptions
) {
    const { accessToken, ...body } = payload;
    const res = await publicHttp.post('/profile/inventory/use', body, {
        signal: options?.signal,
        headers: authHeaders(accessToken, options?.headers),
    });
    return res.data;
}
