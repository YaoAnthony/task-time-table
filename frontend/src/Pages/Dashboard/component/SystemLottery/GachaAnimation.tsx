import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import * as THREE from 'three';
import { FaStar, FaGem, FaTimes } from 'react-icons/fa';
import { DrawResult } from '../../../../Types/Lottery';

// ─── Card styling by result type ────────────────────────────────────────────
interface CardStyle {
    bgClass: string;
    borderClass: string;
    glowClass: string;
    labelClass: string;
    starColor: string;
    tagLabel: string;
}

const getCardStyle = (draw: DrawResult): CardStyle => {
    if (draw.isFeatured) {
        return {
            bgClass: 'from-yellow-700/80 via-amber-500/60 to-yellow-400/40',
            borderClass: 'border-yellow-400',
            glowClass: 'shadow-[0_0_40px_rgba(255,193,44,0.85)]',
            labelClass: 'text-yellow-200',
            starColor: '#FFC72C',
            tagLabel: 'UP ★',
        };
    }
    if (draw.won) {
        return {
            bgClass: 'from-indigo-700/80 via-purple-500/60 to-indigo-400/40',
            borderClass: 'border-indigo-400',
            glowClass: 'shadow-[0_0_25px_rgba(99,102,241,0.75)]',
            labelClass: 'text-indigo-200',
            starColor: '#818CF8',
            tagLabel: '中奖',
        };
    }
    return {
        bgClass: 'from-gray-700/80 to-gray-600/50',
        borderClass: 'border-gray-500/60',
        glowClass: '',
        labelClass: 'text-gray-400',
        starColor: '#6B7280',
        tagLabel: '',
    };
};

// ─── Single card with flip animation ─────────────────────────────────────────
const GachaCard: React.FC<{
    draw: DrawResult;
    delayMs: number;
    isLarge?: boolean;
}> = ({ draw, delayMs, isLarge }) => {
    const [flipped, setFlipped] = useState(false);
    const style = getCardStyle(draw);

    useEffect(() => {
        const t = setTimeout(() => setFlipped(true), delayMs);
        return () => clearTimeout(t);
    }, [delayMs]);

    const w = isLarge ? 'w-48' : 'w-28';
    const h = isLarge ? 'h-64' : 'h-40';

    return (
        <div className={`${w} ${h} relative`} style={{ perspective: '900px' }}>
            {/* ── Face-down ── */}
            <motion.div
                className="absolute inset-0 rounded-2xl border-2 border-purple-500/50 overflow-hidden flex items-center justify-center"
                style={{
                    background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)',
                    backfaceVisibility: 'hidden',
                }}
                initial={{ rotateY: 0 }}
                animate={{ rotateY: flipped ? 90 : 0 }}
                transition={{ duration: 0.28, ease: 'easeIn' }}
            >
                {/* decorative pattern */}
                <div
                    className="absolute inset-0 opacity-15"
                    style={{
                        backgroundImage:
                            'repeating-linear-gradient(45deg,#7c3aed 0,#7c3aed 1px,transparent 0,transparent 50%)',
                        backgroundSize: '12px 12px',
                    }}
                />
                <FaStar className="text-4xl text-purple-300/60 relative z-10" />
            </motion.div>

            {/* ── Face-up ── */}
            <motion.div
                className={`absolute inset-0 rounded-2xl border-2 ${style.borderClass} ${style.glowClass} bg-gradient-to-br ${style.bgClass} overflow-hidden flex flex-col items-center justify-center gap-1 px-2 py-3`}
                style={{ backfaceVisibility: 'hidden' }}
                initial={{ rotateY: -90 }}
                animate={{ rotateY: flipped ? 0 : -90 }}
                transition={{ duration: 0.28, ease: 'easeOut', delay: 0.28 }}
            >
                {/* shimmer overlay */}
                <div
                    className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{
                        background:
                            'linear-gradient(135deg,rgba(255,255,255,0.3) 0%,transparent 50%,rgba(255,255,255,0.1) 100%)',
                    }}
                />
                <FaGem
                    className="relative z-10 text-2xl mb-1"
                    style={{ color: style.starColor }}
                />
                <p
                    className={`relative z-10 text-center font-bold leading-tight ${style.labelClass} ${isLarge ? 'text-sm' : 'text-xs'}`}
                >
                    {draw.won && draw.reward ? draw.reward.productName : '未中奖'}
                </p>
                {draw.won && draw.reward && (
                    <p className="relative z-10 text-white/50 text-xs">
                        ×{draw.reward.quantity}
                    </p>
                )}
                {style.tagLabel && (
                    <span
                        className="relative z-10 mt-1 px-2 py-0.5 rounded-full text-xs font-bold"
                        style={{
                            background: draw.isFeatured
                                ? 'rgba(255,193,44,0.25)'
                                : 'rgba(99,102,241,0.25)',
                            color: style.starColor,
                            border: `1px solid ${style.starColor}55`,
                        }}
                    >
                        {style.tagLabel}
                    </span>
                )}
            </motion.div>
        </div>
    );
};

// ─── Main animation overlay ───────────────────────────────────────────────────
interface GachaAnimationProps {
    draws: DrawResult[];
    onClose: () => void;
}

const GachaAnimation: React.FC<GachaAnimationProps> = ({ draws, onClose }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
    const frameRef = useRef<number>(0);
    const clockRef = useRef(new THREE.Clock());

    const [phase, setPhase] = useState<'summoning' | 'revealing'>('summoning');
    const [allRevealed, setAllRevealed] = useState(false);

    const is10Pull = draws.length >= 10;
    const SUMMON_MS = 1800;
    // last card flip completes at: (n-1)*400 + 560ms
    const REVEAL_COMPLETE_MS = (draws.length - 1) * 400 + 560;

    // ── Three.js particle + ring setup ──────────────────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const W = window.innerWidth;
        const H = window.innerHeight;

        const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(W, H);
        rendererRef.current = renderer;

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 500);
        camera.position.z = 6;

        // ── Particles ──────────────────────────────────────────────────────
        const N = 280;
        const pos = new Float32Array(N * 3);
        const col = new Float32Array(N * 3);
        const vel = new Float32Array(N);          // y-velocity per particle

        const palette = [
            new THREE.Color(0xffc72c), // gold
            new THREE.Color(0x818cf8), // indigo
            new THREE.Color(0xa78bfa), // violet
            new THREE.Color(0xffffff), // white
        ];
        for (let i = 0; i < N; i++) {
            pos[i * 3]     = (Math.random() - 0.5) * 20;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 12;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 6;
            vel[i]          = 0.003 + Math.random() * 0.005;
            const c = palette[Math.floor(Math.random() * palette.length)];
            col[i * 3]     = c.r;
            col[i * 3 + 1] = c.g;
            col[i * 3 + 2] = c.b;
        }
        const pGeo = new THREE.BufferGeometry();
        pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        pGeo.setAttribute('color',    new THREE.BufferAttribute(col, 3));
        const pMat = new THREE.PointsMaterial({
            size: 0.07, vertexColors: true, transparent: true, opacity: 0.85,
        });
        const points = new THREE.Points(pGeo, pMat);
        scene.add(points);

        // ── Vortex rings ──────────────────────────────────────────────────
        const makeRing = (radius: number, tube: number, color: number, opacity: number) => {
            const geo = new THREE.TorusGeometry(radius, tube, 10, 90);
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity });
            return new THREE.Mesh(geo, mat);
        };
        const ring1 = makeRing(1.8, 0.04, 0xffc72c, 0.7);
        const ring2 = makeRing(1.2, 0.025, 0x818cf8, 0.55);
        const ring3 = makeRing(0.7, 0.015, 0xffffff, 0.4);
        scene.add(ring1, ring2, ring3);

        // ── Animate ──────────────────────────────────────────────────────
        const tick = () => {
            frameRef.current = requestAnimationFrame(tick);
            const t = clockRef.current.getElapsedTime();

            // drift particles upward
            const arr = pGeo.attributes.position.array as Float32Array;
            for (let i = 0; i < N; i++) {
                arr[i * 3 + 1] += vel[i];
                if (arr[i * 3 + 1] > 6) arr[i * 3 + 1] = -6;
            }
            pGeo.attributes.position.needsUpdate = true;

            // spin rings
            ring1.rotation.z =  t * 1.1;
            ring1.rotation.x =  Math.sin(t * 0.6) * 0.5;
            ring2.rotation.z = -t * 1.7;
            ring2.rotation.x =  Math.cos(t * 0.6) * 0.4;
            ring3.rotation.z =  t * 2.5;
            ring3.rotation.y =  Math.sin(t * 0.8) * 0.6;

            renderer.render(scene, camera);
        };
        tick();

        // ── Resize ──────────────────────────────────────────────────────
        const onResize = () => {
            const w = window.innerWidth;
            const h = window.innerHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        };
        window.addEventListener('resize', onResize);

        return () => {
            cancelAnimationFrame(frameRef.current);
            window.removeEventListener('resize', onResize);
            pGeo.dispose();
            pMat.dispose();
            renderer.dispose();
        };
    }, []);

    // ── Phase transition ────────────────────────────────────────────────────
    useEffect(() => {
        const t = setTimeout(() => setPhase('revealing'), SUMMON_MS);
        return () => clearTimeout(t);
    }, [SUMMON_MS]);

    // ── Detect all-revealed ─────────────────────────────────────────────────
    useEffect(() => {
        if (phase !== 'revealing') return;
        const t = setTimeout(() => setAllRevealed(true), REVEAL_COMPLETE_MS);
        return () => clearTimeout(t);
    }, [phase, REVEAL_COMPLETE_MS]);

    // ── Keyboard close ──────────────────────────────────────────────────────
    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && allRevealed) onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [allRevealed, onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden select-none">
            {/* Dark vignette backdrop */}
            <div className="absolute inset-0 bg-black/85" />

            {/* Three.js background canvas */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0"
                style={{ pointerEvents: 'none' }}
            />

            {/* ── Summoning phase ── */}
            <AnimatePresence>
                {phase === 'summoning' && (
                    <motion.div
                        key="summoning"
                        className="relative z-10 flex flex-col items-center gap-6"
                        initial={{ opacity: 0, scale: 0.75 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 1.15 }}
                        transition={{ duration: 0.5 }}
                    >
                        {/* Outer spinning ring */}
                        <div className="relative flex items-center justify-center">
                            <motion.div
                                className="w-36 h-36 rounded-full border-4 border-yellow-400/70"
                                style={{
                                    background:
                                        'radial-gradient(circle at 40% 40%, rgba(255,193,44,0.25), rgba(124,58,237,0.3))',
                                    boxShadow: '0 0 60px rgba(255,193,44,0.5), inset 0 0 30px rgba(124,58,237,0.3)',
                                }}
                                animate={{ rotate: 360 }}
                                transition={{ duration: 1.4, repeat: Infinity, ease: 'linear' }}
                            />
                            {/* Inner counter-spinning ring */}
                            <motion.div
                                className="absolute w-24 h-24 rounded-full border-2 border-indigo-400/50"
                                animate={{ rotate: -360 }}
                                transition={{ duration: 1.0, repeat: Infinity, ease: 'linear' }}
                            />
                            {/* Center star */}
                            <motion.div
                                className="absolute"
                                animate={{ scale: [1, 1.2, 1], opacity: [0.7, 1, 0.7] }}
                                transition={{ duration: 1.0, repeat: Infinity }}
                            >
                                <FaStar className="text-5xl text-yellow-300" />
                            </motion.div>
                        </div>

                        {/* Text */}
                        <motion.p
                            className="text-2xl font-bold tracking-[0.35em] text-yellow-100"
                            animate={{ opacity: [0.5, 1, 0.5] }}
                            transition={{ duration: 1.1, repeat: Infinity }}
                        >
                            召唤中...
                        </motion.p>

                        <p className="text-white/40 text-sm tracking-[0.2em]">
                            {draws.length === 1 ? '单次祈愿' : `${draws.length}连祈愿`}
                        </p>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Revealing phase ── */}
            <AnimatePresence>
                {phase === 'revealing' && (
                    <motion.div
                        key="revealing"
                        className="relative z-10 flex flex-col items-center gap-6 px-4"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.45 }}
                    >
                        {/* Cards */}
                        {is10Pull ? (
                            <div className="grid grid-cols-5 gap-3">
                                {draws.map((draw, i) => (
                                    <GachaCard key={i} draw={draw} delayMs={i * 400} />
                                ))}
                            </div>
                        ) : (
                            <GachaCard draw={draws[0]} delayMs={0} isLarge />
                        )}

                        {/* Claim button */}
                        <AnimatePresence>
                            {allRevealed && (
                                <motion.button
                                    key="claim-btn"
                                    initial={{ opacity: 0, y: 18 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.4 }}
                                    onClick={onClose}
                                    className="mt-1 px-12 py-3 rounded-xl font-bold text-lg tracking-widest text-black transition-colors"
                                    style={{
                                        background: 'linear-gradient(90deg,#FFC72C,#FFE08C)',
                                        boxShadow: '0 0 30px rgba(255,193,44,0.6)',
                                    }}
                                    onMouseEnter={e =>
                                        ((e.currentTarget as HTMLButtonElement).style.background =
                                            'linear-gradient(90deg,#fff,#ffe08c)')
                                    }
                                    onMouseLeave={e =>
                                        ((e.currentTarget as HTMLButtonElement).style.background =
                                            'linear-gradient(90deg,#FFC72C,#FFE08C)')
                                    }
                                >
                                    收取
                                </motion.button>
                            )}
                        </AnimatePresence>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* ── Skip button (before all revealed) ── */}
            {phase === 'revealing' && !allRevealed && (
                <button
                    onClick={() => setAllRevealed(true)}
                    className="absolute bottom-8 right-8 z-20 text-white/35 hover:text-white/65 text-sm tracking-widest transition-colors"
                >
                    跳过动画
                </button>
            )}

            {/* ── Close X (after all revealed) ── */}
            {allRevealed && (
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 z-20 text-white/40 hover:text-white/80 transition-colors"
                    aria-label="关闭"
                >
                    <FaTimes className="text-2xl" />
                </button>
            )}
        </div>
    );
};

export default GachaAnimation;
