// ── Pixel Game HUD — Desktop Top Navigation ───────────────────────────────────
// Fills the 52px HUD bar. Logo left, controls right.
// No DarkLightSwitch (game forces dark mode).
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useSelector } from "react-redux";
import { Tooltip } from "antd";
import { FaUserCircle } from 'react-icons/fa';

import { RootState } from "../../../Redux/store";
import { useAuthModal } from "../../../Features/Authentication/component/ModalAuthContext";
import DropDownBar from "./DropDownBar";
import ShowIcon from "../../ShowIcon";

const DeskTopNav = () => {
    const [isOpen, setIsOpen] = useState(false);
    const isAuthenticated = useSelector((state: RootState) => state.user.isLoggedIn);
    const { user } = useSelector((state: RootState) => state.user);
    const { showAuthModal } = useAuthModal();

    return (
        <nav
            className="hidden md:flex w-full h-full items-center justify-between"
            style={{ padding: '0 20px' }}
        >
            {/* ── Logo ── */}
            <NavLink
                to="/"
                style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
                <span
                    style={{
                        fontFamily: '"Press Start 2P", monospace',
                        fontSize: '13px',
                        color: '#e6edf3',
                        textShadow: '2px 2px 0 rgba(0,0,0,0.8)',
                        letterSpacing: '0.05em',
                    }}
                >
                    幻星<span style={{ color: '#ffd700' }}>纪元</span>
                </span>
            </NavLink>

            {/* ── Right HUD: coins + avatar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {/* Coin display */}
                <ShowIcon />

                {/* Avatar / Login */}
                {isAuthenticated ? (
                    <Tooltip
                        placement="bottomRight"
                        color="#161b22"
                        onOpenChange={() => setIsOpen(false)}
                        fresh={true}
                        title={<DropDownBar />}
                        styles={{ root: { whiteSpace: "normal", maxWidth: "none", padding: 0 } }}
                    >
                        <div
                            onClick={() => setIsOpen(!isOpen)}
                            onMouseEnter={() => setIsOpen(true)}
                            style={{ cursor: 'pointer' }}
                        >
                            <img
                                src={user?.image_url || 'https://placehold.co/40x40/161b22/ffd700.png?text=U'}
                                alt="avatar"
                                style={{
                                    width: '36px',
                                    height: '36px',
                                    border: '2px solid var(--px-border-gold)',
                                    imageRendering: 'pixelated',
                                    display: 'block',
                                }}
                            />
                        </div>
                    </Tooltip>
                ) : (
                    <button
                        onClick={() => showAuthModal()}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'var(--px-surface2)',
                            border: '2px solid var(--px-border-gold)',
                            color: 'var(--px-gold)',
                            padding: '4px 12px',
                            fontSize: '12px',
                            fontWeight: 700,
                            cursor: 'pointer',
                            letterSpacing: '0.05em',
                        }}
                    >
                        <FaUserCircle />
                        登入
                    </button>
                )}
            </div>
        </nav>
    );
};

export default DeskTopNav;
