import React, { useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../../Redux/store";

// component
import Navbar from "../../Component/Navigation/Navbar";
import { useAuthModal } from "../../Features/Authentication/component/ModalAuthContext";
import { useAuthGate } from "../../hook/useAuthGate";
import SideBar from "./component/SideBar";

const Dashboard: React.FC = () => {
    const { profile } = useSelector((state: RootState) => state.profile);
    const { authReady, isLoggedIn } = useAuthGate();
    const navigate = useNavigate();
    const location = useLocation();

    const openedRef = React.useRef(false);
    const { showAuthModal } = useAuthModal();

    useEffect(() => {
        if (authReady && !isLoggedIn && !openedRef.current) {
            showAuthModal();
            openedRef.current = true;
        }
    }, [authReady, isLoggedIn, showAuthModal]);

    useEffect(() => {
        if (profile) openedRef.current = false;
    }, [profile]);

    useEffect(() => {
        if (!authReady || !isLoggedIn) return;

        const isEditableTarget = (target: EventTarget | null) => {
            if (!(target instanceof HTMLElement)) return false;
            const tagName = target.tagName.toLowerCase();
            return (
                tagName === 'input'
                || tagName === 'textarea'
                || tagName === 'select'
                || target.isContentEditable
            );
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (isEditableTarget(event.target)) return;

            if (event.key.toLowerCase() === 'b') {
                event.preventDefault();
                if (location.pathname !== '/dashboard/backpack') {
                    navigate('/dashboard/backpack');
                }
                return;
            }

            if (event.key === 'Escape') {
                event.preventDefault();
                if (location.pathname !== '/dashboard/idle-game') {
                    navigate('/dashboard/idle-game');
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [authReady, isLoggedIn, location.pathname, navigate]);

    // ── Full-screen pixel game shell ──────────────────────────────────────────
    const renderContent = (children: React.ReactNode) => (
        <div
            className="flex flex-col w-screen h-screen overflow-hidden px-grid-bg"
            style={{ background: 'var(--px-bg)', color: 'var(--px-text)' }}
        >
            {/* ── Top HUD bar (static, not fixed) ── */}
            <div
                className="shrink-0 z-50"
                style={{
                    height: '52px',
                    background: 'var(--px-surface)',
                    borderBottom: '2px solid var(--px-border-gold)',
                    boxShadow: '0 2px 0 rgba(0,0,0,0.5)',
                }}
            >
                <Navbar />
            </div>

            {/* ── Sidebar + Main content ── */}
            <main className="flex flex-1 overflow-hidden">
                {children}
            </main>
        </div>
    );

    // Loading skeleton
    if (!authReady) {
        return renderContent(
            <>
                <div
                    className="hidden md:flex flex-col shrink-0"
                    style={{
                        width: '200px',
                        background: 'var(--px-surface)',
                        borderRight: '2px solid var(--px-border)',
                    }}
                >
                    {[...Array(6)].map((_, i) => (
                        <div
                            key={i}
                            className="mx-3 mt-3 h-10 animate-pulse"
                            style={{ background: 'var(--px-surface2)' }}
                        />
                    ))}
                </div>
                <div className="flex-1" style={{ background: 'var(--px-bg)' }} />
            </>
        );
    }

    // Not logged in
    if (!isLoggedIn) {
        return renderContent(
            <div className="flex flex-1 items-center justify-center">
                <div
                    className="px-panel p-10 text-center"
                    style={{ borderColor: 'var(--px-border-gold)' }}
                >
                    <div
                        className="text-xl font-bold mb-3"
                        style={{ color: 'var(--px-gold)', fontFamily: '"Press Start 2P", monospace', fontSize: '14px' }}
                    >
                        幻星纪元
                    </div>
                    <p style={{ color: 'var(--px-muted)' }}>请登入以接入控制台</p>
                </div>
            </div>
        );
    }

    return renderContent(
        <>
            <div className="hidden md:block">
                <SideBar />
            </div>
            <div
                id="px-content"
                className="flex-1 overflow-auto"
                style={{ background: 'var(--px-bg)' }}
            >
                <Outlet />
            </div>
        </>
    );
};

export default Dashboard;
