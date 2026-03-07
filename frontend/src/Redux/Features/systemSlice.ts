import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { SystemLite } from '../../Types/System';
import { logout } from './userSlice';
export type { SystemLite } from '../../Types/System';

export interface SystemState {
    systems: SystemLite[];
    selectedSystemId: string | null;
    currentSystem: Record<string, unknown> | null;
    loading: boolean;
    error?: string;
}

const initialState: SystemState = {
    systems: [],
    selectedSystemId: null,
    currentSystem: null,
    loading: false,
    error: undefined,
};

const systemSlice = createSlice({
    name: 'system',
    initialState,
    reducers: {
        setSystems(state, action: PayloadAction<SystemLite[]>) {
            state.systems = action.payload;
            state.loading = false;
            state.error = undefined;
        },
        addSystem(state, action: PayloadAction<SystemLite>) {
            state.systems = [action.payload, ...state.systems.filter((item) => item._id !== action.payload._id)];
            state.selectedSystemId = action.payload._id;
            state.error = undefined;
        },
        removeSystem(state, action: PayloadAction<string>) {
            const removedSystemId = action.payload;
            state.systems = state.systems.filter((item) => item._id !== removedSystemId);

            if (state.selectedSystemId === removedSystemId) {
                state.selectedSystemId = state.systems[0]?._id || null;
            }

            const currentSystemId = (state.currentSystem as { _id?: string } | null)?._id;
            if (currentSystemId === removedSystemId) {
                state.currentSystem = null;
            }

            state.error = undefined;
        },
        setSelectedSystemId(state, action: PayloadAction<string | null>) {
            state.selectedSystemId = action.payload;
        },
        setCurrentSystem(state, action: PayloadAction<Record<string, unknown> | null>) {
            state.currentSystem = action.payload;
            state.loading = false;
            state.error = undefined;
        },
        setSystemLoading(state, action: PayloadAction<boolean>) {
            state.loading = action.payload;
        },
        setSystemError(state, action: PayloadAction<string | undefined>) {
            state.error = action.payload;
            state.loading = false;
        },
        clearSystemState(state) {
            state.systems = [];
            state.selectedSystemId = null;
            state.currentSystem = null;
            state.loading = false;
            state.error = undefined;
        },
    },
    extraReducers: (builder) => {
        builder.addCase(logout, (state) => {
            state.systems = [];
            state.selectedSystemId = null;
            state.currentSystem = null;
            state.loading = false;
            state.error = undefined;
        });
    },
});

export const {
    setSystems,
    addSystem,
    removeSystem,
    setSelectedSystemId,
    setCurrentSystem,
    setSystemLoading,
    setSystemError,
    clearSystemState,
} = systemSlice.actions;

export default systemSlice.reducer;
