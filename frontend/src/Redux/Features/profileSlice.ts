// store/profileSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { Profile } from "../../Types/Profile";
import type { RootState } from "../store"; // 👈 引入 RootState 类型

export type AuthStatus =
    | "checking"
    | "authenticated"
    | "unauthenticated"
    | "error";

export interface ProfileState {
    status: AuthStatus;
    profile: Profile | null;
    error?: string;
}

const initialState: ProfileState = {
    status: "checking", // 初始为 checking
    profile: null,
};

const profileSlice = createSlice({
    name: "profile",
    initialState,
    reducers: {
        setProfile(state, action: PayloadAction<Profile | null>) {
            state.profile = action.payload;
            state.status = action.payload ? "authenticated" : "unauthenticated";
            state.error = undefined;
        },
        setStatus(state, action: PayloadAction<AuthStatus>) {
            state.status = action.payload;
        },
        setError(state, action: PayloadAction<string | undefined>) {
            state.error = action.payload;
            state.status = "error";
        },
        clearProfile(state) {
            state.profile = null;
            state.status = "unauthenticated";
            state.error = undefined;
        },
    },
});

export const { 
    setProfile, 
    setStatus, 
    setError, 
    clearProfile 
} = profileSlice.actions;

export const selectAuthStatus = (state: RootState): AuthStatus =>
    state.profile.status;

export const selectProfile = (state: RootState): Profile | null =>
    state.profile.profile;

export const selectAuthError = (state: RootState): string | undefined =>
    state.profile.error;

export default profileSlice.reducer;
