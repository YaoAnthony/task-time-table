import React, { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../../Redux/store";

// component
import Navbar from "../../Component/Navigation/Navbar";

// login
import { useAuthModal } from "../../Features/Authentication/component/ModalAuthContext";
import { useAuthGate } from "../../hook/useAuthGate";

import SideBar from "./component/SideBar";

const Dashboard: React.FC = () => {

    const { profile } = useSelector((state: RootState) => state.profile);
    const { authReady, isLoggedIn } = useAuthGate();


    // 防止重复弹出登录框
    const openedRef = React.useRef(false);

    const { showAuthModal } = useAuthModal();

    useEffect(() => {
        if (authReady && !isLoggedIn && !openedRef.current) {
        showAuthModal();
        openedRef.current = true;
        }
    }, [authReady, isLoggedIn, showAuthModal]);

    useEffect(() => {
        if (profile) {
            openedRef.current = false;
        }
    }, [profile]);

    const renderContent = (children: React.ReactNode) => (
        // Entire App Background: Light mode gets airy radial gradients, Dark mode gets deep space gradients
        <div className="flex flex-col min-h-screen bg-slate-50 dark:bg-neutral-950 text-neutral-800 dark:text-neutral-200 overflow-hidden relative selection:bg-blue-300/50 dark:selection:bg-[#FFC72C]/30">
            {/* Global Ambient Ambient Orbs / Particles */}
            <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
                {/* Top Center Glow */}
                <div className="absolute top-[-10%] left-1/2 -translate-x-1/2 w-[80vw] h-[50vh] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(59,130,246,0.15),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(255,199,44,0.08),transparent_70%)] blur-3xl opacity-70 animate-pulse-slow" />
                
                {/* Bottom Left Teal Glow */}
                <div className="absolute bottom-[-10%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(45,212,191,0.1),transparent_70%)] dark:bg-[radial-gradient(ellipse_at_center,rgba(0,243,255,0.05),transparent_70%)] blur-3xl opacity-60" />
                
                {/* Tech Grid Pattern Layer (subtle) */}
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJyZ2JhKDAsMCwwLDAuMDMpIi8+Cjwvc3ZnPg==')] dark:bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSJyZ2JhKDI1NSwyNTUsMjU1LDAuMDIpIi8+Cjwvc3ZnPg==')] opacity-50 z-0" />
            </div>

            <div className="z-20 w-full">
                <Navbar />
            </div>
            
            <main className="screen-max-width w-full h-[100vh] flex pt-24 pb-8 md:pt-28 gap-8 relative z-10 px-4">
                {children}
            </main>
        </div>
    );

    // 鉴权未就绪 → 骨架屏或空白占位，避免闪烁/误弹窗
    if (!authReady) {
        return renderContent(
            <>
                <div className="hidden md:block">
                    <div className="w-[240px] h-[85vh] rounded-2xl bg-white/20 dark:bg-black/20 backdrop-blur-md border border-white/50 dark:border-white/5 p-6 shadow-xl">
                        {/* Sidebar Skeleton */}
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-12 bg-white/40 dark:bg-white/5 rounded-xl mb-4 animate-pulse relative overflow-hidden">
                                <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/20 dark:via-white/10 to-transparent" />
                            </div>
                        ))}
                    </div>
                </div>
                <div className="flex-1 w-full relative">
                    {/* Content Skeleton */}
                    <div className="w-full h-[85vh] bg-white/20 dark:bg-black/20 backdrop-blur-md rounded-2xl border border-white/50 dark:border-white/5 animate-pulse flex flex-col p-8 gap-6 shadow-xl">
                         <div className="h-10 w-1/3 bg-white/40 dark:bg-white/5 rounded-lg" />
                         <div className="flex-1 rounded-xl bg-white/30 dark:bg-white/[0.02]" />
                    </div>
                </div>
            </>
        );
    }

    if (!isLoggedIn) {
        return renderContent(
            <div className="w-full h-[85vh] flex items-center justify-center relative">
                <div className="text-center p-12 rounded-3xl bg-white/40 dark:bg-black/40 backdrop-blur-xl border border-white/60 dark:border-white/10 shadow-2xl relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-blue-500 dark:via-[#FFC72C] to-transparent" />
                    <h2 className="text-3xl font-bold tracking-widest text-neutral-800 dark:text-neutral-100 drop-shadow-sm mb-4">系统法则终端</h2>
                    <p className="text-neutral-500 dark:text-neutral-400 font-medium tracking-wide">请确立你的身份 (Sign in) 以接入控制台。</p>
                </div>
            </div>
        );
    }

    return renderContent(
        <>
            <div className="hidden md:block">
                <SideBar />
            </div>
            <div className="flex-1 w-full h-[85vh] relative">
                <Outlet />
            </div>
        </>
    );
};

export default Dashboard;
