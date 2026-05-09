// ── Pixel Game Gold Coin Counter ──────────────────────────────────────────────
// Shows in the HUD top bar. Pixel-border box with gold coin emoji + count.
// ─────────────────────────────────────────────────────────────────────────────

import { RootState } from '../Redux/store';
import { useSelector } from 'react-redux';

const ShowIcon = () => {
    const profile = useSelector((state: RootState) => state.profile.profile);
    const coins = profile?.wallet?.coins ?? 0;

    if (!profile) return null;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'var(--px-surface2)',
                border: '2px solid var(--px-border-gold)',
                padding: '4px 10px',
                boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.05)',
            }}
        >
            <span style={{ fontSize: '14px', lineHeight: 1 }}>🪙</span>
            <span
                style={{
                    color: 'var(--px-gold)',
                    fontWeight: 800,
                    fontSize: '13px',
                    fontFamily: 'monospace',
                    letterSpacing: '0.05em',
                    minWidth: '36px',
                    textAlign: 'right',
                }}
            >
                {coins.toLocaleString()}
            </span>
        </div>
    );
};

export default ShowIcon;
