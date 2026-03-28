import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { motion, AnimatePresence } from 'framer-motion';
import { RootState } from '../../../../Redux/store';
import { InventoryItem, setInventory } from '../../../../Redux/Features/profileStateSlice';
import { moveSlot, type SlotItem, type SlotZone } from '../../../../Redux/Features/gameSlice';
import { useUseInventoryItemMutation } from '../../../../api/profileStateRtkApi';
import { message } from 'antd';
import { FaBox, FaScroll, FaDice, FaFlask, FaSeedling } from 'react-icons/fa';
import { GAME_ITEMS } from '../SystemIdleGame/shared/gameItems';
import { TOOL_ICON_SIZE } from '../SystemIdleGame/constants';

// @ts-ignore
import toolsUrl from '../../../../assets/Sprout-Lands/Objects/Basic tools and meterials.png';

// constant
import { inventoryTabs } from '../../constants';

// ── Rarity colour map ─────────────────────────────────────────────────────────
const RARITY_BORDER: Record<string, string> = {
    common:    '2px solid #9ca3af',   // gray-400
    rare:      '2px solid #3b82f6',   // blue-500
    epic:      '2px solid #a855f7',   // purple-500
    legendary: '2px solid #f97316',   // orange-500
    mythic:    '2px solid #ec4899',   // pink-500
};
const RARITY_GLOW: Record<string, string> = {
    common:    'none',
    rare:      '0 0 8px rgba(59,130,246,0.5)',
    epic:      '0 0 8px rgba(168,85,247,0.5)',
    legendary: '0 0 12px rgba(249,115,22,0.6)',
    mythic:    '0 0 14px rgba(236,72,153,0.7)',
};
const RARITY_LABEL_COLOR: Record<string, string> = {
    common:    '#9ca3af',
    rare:      '#60a5fa',
    epic:      '#c084fc',
    legendary: '#fb923c',
    mythic:    '#f472b6',
};

const RARITY_LABEL: Record<string, string> = {
    common:    '普通',
    rare:      '稀有',
    epic:      '史诗',
    legendary: '传说',
    mythic:    '神话',
};

// ── Icon fallback ─────────────────────────────────────────────────────────────
const getIconForType = (type: string) => {
    switch (type) {
        case 'mission':        return <FaScroll   className="text-blue-500 dark:text-blue-400" />;
        case 'lottery_chance': return <FaDice     className="text-purple-500 dark:text-purple-400" />;
        case 'consumable':     return <FaFlask    className="text-emerald-500 dark:text-green-400" />;
        case 'seed':
        case 'crop':           return <FaSeedling className="text-green-500 dark:text-green-400" />;
        case 'item':
        default:               return <FaBox      className="text-neutral-500 dark:text-gray-300" />;
    }
};

// ── Game item rendering helpers ───────────────────────────────────────────────
const TOOL_SPRITE: Record<string, { x: number; y: number }> = {
    watering_can: { x: 0,  y: 0 },
    axe:          { x: 16, y: 0 },
    scythe:       { x: 32, y: 0 },
};
const ITEM_EMOJI: Record<string, string> = {
    egg:         '🥚',
    fruit:       '🍑',
    wheat_seed:  '🌱',
    wheat:       '🌾',
    animal_feed: '🐾',
};

let _toolsImg: HTMLImageElement | null = null;
let _toolsReady = false;
function getToolsImg() {
    if (!_toolsImg) {
        _toolsImg = new Image();
        _toolsImg.src = toolsUrl;
        _toolsImg.onload = () => { _toolsReady = true; };
    }
    return _toolsImg;
}

/** Canvas icon for tool items */
const ToolCanvas: React.FC<{ x: number; y: number; size: number }> = ({ x, y, size }) => {
    const ref = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        const canvas = ref.current; if (!canvas) return;
        const ctx = canvas.getContext('2d')!;
        const draw = () => {
            ctx.clearRect(0, 0, size, size);
            ctx.imageSmoothingEnabled = false;
            ctx.drawImage(_toolsImg!, x, y, TOOL_ICON_SIZE, TOOL_ICON_SIZE, 0, 0, size, size);
        };
        const img = getToolsImg();
        if (_toolsReady) draw(); else img.addEventListener('load', draw, { once: true });
    }, [x, y, size]);
    return <canvas ref={ref} width={size} height={size} style={{ imageRendering: 'pixelated' }} />;
};

/** Renders icon + quantity for any game item slot */
const GameSlotContent: React.FC<{ item: SlotItem; iconSize?: number }> = ({ item, iconSize = 30 }) => {
    const def  = GAME_ITEMS[item.itemId];
    const tool = TOOL_SPRITE[item.itemId];
    return (
        <div className="flex flex-col items-center justify-center w-full h-full relative">
            {tool
                ? <ToolCanvas x={tool.x} y={tool.y} size={iconSize} />
                : <span style={{ fontSize: iconSize * 0.75, lineHeight: 1 }}>{ITEM_EMOJI[item.itemId] ?? '📦'}</span>
            }
            {item.quantity > 1 && (
                <div className="absolute bottom-0.5 right-1 text-[9px] font-bold font-mono text-white"
                     style={{ textShadow: '0 0 3px #000' }}>
                    {item.quantity}
                </div>
            )}
            {def && (
                <div className="absolute bottom-0.5 left-1 text-[7px] text-white/50 font-mono leading-none">
                    {def.nameZh}
                </div>
            )}
        </div>
    );
};

// ── Item thumbnail: real image if available, icon otherwise ───────────────────
const ItemThumbnail = ({ item, large = false }: { item: InventoryItem; large?: boolean }) => {
    const imgUrl = item.metadata?.image as string | undefined;
    const size   = large ? 80 : 32;

    if (imgUrl) {
        return (
            <img
                src={imgUrl}
                alt={item.name}
                style={{
                    width:           size,
                    height:          size,
                    objectFit:       'contain',
                    imageRendering:  'pixelated',
                    filter:          'drop-shadow(0 2px 4px rgba(0,0,0,0.3))',
                }}
            />
        );
    }
    return (
        <span style={{ fontSize: large ? 80 : 28 }}>
            {getIconForType(item.type)}
        </span>
    );
};


// ── Drag state type ────────────────────────────────────────────────────────────
interface DragRef { zone: SlotZone; index: number }

// ─────────────────────────────────────────────────────────────────────────────
const Backpack = () => {
    // ✅ Read from profileState (updated instantly by setInventory dispatch)
    const inventory      = useSelector((state: RootState) => state.profileState.inventory);
    const backpackSlots  = useSelector((state: RootState) => state.game.backpackSlots);
    const hotbarSlots    = useSelector((state: RootState) => state.game.hotbarSlots);

    const dispatch = useDispatch();
    const [useInventoryItem] = useUseInventoryItemMutation();

    const [activeTab,    setActiveTab   ] = useState<string>('game');
    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);

    // ── Drag & drop state ─────────────────────────────────────────────────────
    const dragFromRef = useRef<DragRef | null>(null);
    const [dragOver, setDragOver] = useState<DragRef | null>(null);

    const handleDragStart = useCallback((zone: SlotZone, index: number, item: SlotItem | null) => {
        if (!item) return;
        dragFromRef.current = { zone, index };
    }, []);

    const handleDrop = useCallback((toZone: SlotZone, toIndex: number) => {
        const from = dragFromRef.current;
        if (!from) return;
        dispatch(moveSlot({ from: { zone: from.zone, index: from.index }, to: { zone: toZone, index: toIndex } }));
        dragFromRef.current = null;
        setDragOver(null);
    }, [dispatch]);

    const handleDragEnd = useCallback(() => {
        dragFromRef.current = null;
        setDragOver(null);
    }, []);

    // Profile inventory filter
    const isGameTab = activeTab === 'game';
    const filteredInventory = isGameTab
        ? []
        : inventory.filter(item => activeTab === 'all' ? true : item.type === activeTab);

    // Fill profile grid to multiple of 10, min 40
    const COLS = 10;
    const totalSlots = Math.max(COLS * 4, Math.ceil(filteredInventory.length / COLS) * COLS);
    const slots = Array.from({ length: totalSlots });

    const handleUseItem = async (item: InventoryItem) => {
        // ── Optimistic update: decrement / remove immediately ──────────────
        const newInventory = inventory
            .map(i => i.inventoryKey === item.inventoryKey
                ? { ...i, quantity: i.quantity - 1 }
                : i
            )
            .filter(i => i.quantity > 0);
        dispatch(setInventory(newInventory));

        // If this item is depleted, deselect it
        if (item.quantity <= 1) setSelectedItem(null);
        else setSelectedItem({ ...item, quantity: item.quantity - 1 });

        try {
            await useInventoryItem({ inventoryKey: item.inventoryKey, quantity: 1 }).unwrap();
            message.success(`使用了: ${item.name}`);
        } catch (err: any) {
            // Rollback on error
            dispatch(setInventory(inventory));
            setSelectedItem(item);
            message.error(err?.data?.message || '使用失败');
        }
    };

    const Title = () => (
        <div className="flex justify-between items-center px-8 py-5 border-b border-black/5 dark:border-white/10 bg-gradient-to-r from-white/40 dark:from-white/5 to-transparent relative overflow-hidden">
            <div className="absolute top-0 left-0 w-64 h-64 bg-amber-400/20 dark:bg-[#FFC72C]/10 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/2 pointer-events-none" />
            <h1 className="text-3xl font-extrabold tracking-widest drop-shadow-sm dark:drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] flex items-center gap-3">
                <span className="w-2 h-8 rounded-full bg-amber-500 dark:bg-[#FFC72C] shadow-[0_0_10px_rgba(245,158,11,0.5)] dark:shadow-[0_0_10px_rgba(255,199,44,0.5)]" />
                空间行囊
            </h1>
        </div>
    );

    return (
        <section className="w-full h-[85vh] flex flex-col rounded-3xl border border-white/60 dark:border-white/10
            bg-white/40 dark:bg-black/40 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8),_0_8px_32px_rgba(0,0,0,0.05)]
            dark:shadow-[inset_0_0_15px_rgba(255,255,255,0.02),_0_8px_32px_rgba(0,0,0,0.5)]
            backdrop-blur-xl overflow-hidden text-neutral-800 dark:text-white font-sans select-none transition-colors duration-300">
            <Title />

            <div className="flex flex-1 overflow-hidden relative">
                {/* Ambient background */}
                <div className="absolute inset-0 pointer-events-none opacity-40 dark:opacity-20 flex justify-end items-end p-20 z-0">
                    <div className="w-96 h-96 bg-blue-300 dark:bg-purple-600 rounded-full blur-[100px] mix-blend-multiply dark:mix-blend-screen" />
                </div>

                {/* Left: Grid + Tabs + Equipment Bar */}
                <div className="flex-1 flex flex-col border-r border-black/5 dark:border-white/10 relative z-10 w-full overflow-hidden">
                    {/* Tabs */}
                    <div className="flex gap-2 sm:gap-4 px-4 sm:px-6 py-3 border-b border-black/5 dark:border-white/5 overflow-x-auto scrollbar-hide">
                        {inventoryTabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => { setActiveTab(tab.id); setSelectedItem(null); }}
                                className={`relative px-3 py-1.5 text-sm rounded-xl tracking-widest transition-all duration-300 font-bold whitespace-nowrap overflow-hidden
                                    ${activeTab === tab.id
                                        ? 'text-blue-700 dark:text-[#FFC72C] bg-white/80 dark:bg-white/10 shadow-[inset_1px_1px_3px_rgba(0,0,0,0.05),_0_2px_5px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_0_10px_rgba(255,199,44,0.1)] border border-blue-200 dark:border-[#FFC72C]/30'
                                        : 'text-neutral-500 dark:text-white/60 hover:text-blue-500 dark:hover:text-white hover:bg-white/40 dark:hover:bg-white/5 border border-transparent'
                                    }`}
                            >
                                <span className="relative z-10">{tab.label}</span>
                                {activeTab === tab.id && (
                                    <motion.div
                                        layoutId="activeTabIndicatorBackpack"
                                        className="absolute bottom-0 left-1/4 right-1/4 h-[3px] rounded-t-full bg-blue-500 dark:bg-[#FFC72C] shadow-[0_0_8px_rgba(59,130,246,0.6)] dark:shadow-[0_0_8px_rgba(255,199,44,0.6)]"
                                        initial={false}
                                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                                    />
                                )}
                            </button>
                        ))}
                    </div>

                    {/* ── Grid ─────────────────────────────────────────────── */}
                    <div className="flex-1 overflow-y-auto p-3 sm:p-5 scrollbar-thin scrollbar-thumb-black/20 dark:scrollbar-thumb-white/20 scrollbar-track-transparent">
                        <div className="grid grid-cols-10 gap-1.5 sm:gap-2">
                            {isGameTab
                                /* ── Game inventory (drag & drop) ── */
                                ? backpackSlots.map((slot, index) => {
                                    const isOver = dragOver?.zone === 'backpack' && dragOver.index === index;
                                    return (
                                        <div
                                            key={index}
                                            draggable={!!slot}
                                            onDragStart={() => handleDragStart('backpack', index, slot)}
                                            onDragEnd={handleDragEnd}
                                            onDragOver={e => { e.preventDefault(); setDragOver({ zone: 'backpack', index }); }}
                                            onDragLeave={() => setDragOver(null)}
                                            onDrop={() => handleDrop('backpack', index)}
                                            className={`relative aspect-square rounded-xl flex items-center justify-center
                                                cursor-${slot ? 'grab' : 'default'} transition-all duration-150
                                                ${slot
                                                    ? 'bg-white/60 dark:bg-white/8 shadow-[inset_2px_2px_5px_rgba(255,255,255,0.8),0_2px_6px_rgba(0,0,0,0.08)] dark:shadow-[inset_0_0_10px_rgba(0,0,0,0.5)]'
                                                    : 'bg-black/5 dark:bg-black/40 border border-black/5 dark:border-white/5'
                                                }
                                                ${isOver ? 'ring-2 ring-amber-400 dark:ring-[#FFC72C] scale-105' : ''}
                                                border border-black/5 dark:border-white/5`}
                                        >
                                            {slot && <GameSlotContent item={slot} iconSize={28} />}
                                            <div className="absolute top-0.5 right-1 text-[8px] text-neutral-300 dark:text-white/15 font-mono leading-none pointer-events-none">
                                                {index + 1}
                                            </div>
                                        </div>
                                    );
                                })
                                /* ── Profile inventory (existing behaviour) ── */
                                : slots.map((_, index) => {
                                    const item       = filteredInventory[index];
                                    const isSelected = selectedItem?.inventoryKey === item?.inventoryKey;
                                    const rarity     = item?.metadata?.rarity as string | undefined;
                                    return (
                                        <motion.div
                                            key={index}
                                            onClick={() => item && setSelectedItem(item)}
                                            whileHover={item ? { scale: 1.05 } : {}}
                                            whileTap={item ? { scale: 0.95 } : {}}
                                            style={item && rarity ? {
                                                border:    RARITY_BORDER[rarity] ?? RARITY_BORDER.common,
                                                boxShadow: isSelected ? RARITY_GLOW[rarity] ?? 'none' : undefined,
                                            } : undefined}
                                            className={`relative aspect-square rounded-2xl flex items-center justify-center transition-all duration-300
                                                ${item
                                                    ? 'bg-white/60 dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900 cursor-pointer shadow-[inset_2px_2px_5px_rgba(255,255,255,1),0_4px_10px_rgba(0,0,0,0.05)] dark:shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]'
                                                    : 'bg-black/5 dark:bg-black/40 border border-black/5 dark:border-white/5 shadow-[inset_2px_2px_5px_rgba(0,0,0,0.05),inset_-2px_-2px_5px_rgba(255,255,255,0.5)] dark:shadow-[inset_2px_2px_10px_rgba(0,0,0,0.8)]'
                                                }
                                                ${isSelected ? 'ring-2 ring-offset-2 ring-offset-slate-50 dark:ring-offset-neutral-900 ring-blue-500 dark:ring-[#FFC72C]' : ''}`}
                                        >
                                            {item && (
                                                <>
                                                    <motion.div className="flex items-center justify-center"
                                                        animate={isSelected ? { y: [-2, 2, -2] } : {}}
                                                        transition={isSelected ? { repeat: Infinity, duration: 2, ease: 'easeInOut' } : {}}>
                                                        <ItemThumbnail item={item} />
                                                    </motion.div>
                                                    <div className="absolute bottom-1 right-1 text-[10px] font-black font-mono bg-white dark:bg-black px-1.5 py-0.5 rounded-md text-neutral-800 dark:text-white/90 border border-neutral-200 dark:border-white/10 shadow-sm z-10">
                                                        x{item.quantity}
                                                    </div>
                                                    {rarity && rarity !== 'common' && (
                                                        <div className="absolute top-1 left-1 w-2 h-2 rounded-full z-10"
                                                             style={{ background: RARITY_LABEL_COLOR[rarity] ?? '#9ca3af' }} />
                                                    )}
                                                </>
                                            )}
                                        </motion.div>
                                    );
                                })
                            }
                        </div>
                    </div>

                    {/* ── Hotbar / Equipment bar (always visible, fully draggable) ── */}
                    <div className="border-t border-black/5 dark:border-white/10 px-3 sm:px-5 py-3 bg-black/5 dark:bg-black/30 flex-shrink-0">
                        <div className="text-[10px] font-bold tracking-widest text-neutral-400 dark:text-white/30 uppercase mb-2">
                            装备栏 — 拖入道具后按 1-0 使用
                        </div>
                        <div className="grid grid-cols-10 gap-1.5">
                            {hotbarSlots.map((slot, i) => {
                                const isOver = dragOver?.zone === 'hotbar' && dragOver.index === i;
                                return (
                                    <div
                                        key={i}
                                        draggable={!!slot}
                                        onDragStart={() => handleDragStart('hotbar', i, slot)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={e => { e.preventDefault(); setDragOver({ zone: 'hotbar', index: i }); }}
                                        onDragLeave={() => setDragOver(null)}
                                        onDrop={() => handleDrop('hotbar', i)}
                                        title={slot ? `${GAME_ITEMS[slot.itemId]?.nameZh ?? slot.itemId} ×${slot.quantity}` : `装备槽 ${i === 9 ? '0' : i + 1}`}
                                        className={`relative aspect-square rounded-lg flex items-center justify-center
                                            border transition-all duration-150
                                            cursor-${slot ? 'grab' : 'default'}
                                            ${slot
                                                ? 'bg-white/70 dark:bg-white/10 border-amber-400/50 dark:border-[#FFC72C]/40 shadow-[0_0_6px_rgba(245,158,11,0.2)]'
                                                : 'bg-black/5 dark:bg-black/50 border-black/10 dark:border-white/8 border-dashed'
                                            }
                                            ${isOver ? 'ring-2 ring-amber-400 dark:ring-[#FFC72C] scale-105 bg-amber-50/50 dark:bg-amber-400/10' : ''}`}
                                    >
                                        {slot && <GameSlotContent item={slot} iconSize={24} />}
                                        <div className="absolute top-0.5 right-1 text-[7px] text-neutral-400 dark:text-white/20 font-mono leading-none pointer-events-none">
                                            {i === 9 ? '0' : i + 1}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right: Item Details */}
                <div className="w-[340px] bg-white/30 dark:bg-black/20 flex-col relative shrink-0 hidden lg:flex z-10 border-l border-white/40 dark:border-white/5 backdrop-blur-md">
                    <AnimatePresence mode="wait">
                        {selectedItem ? (
                            <motion.div
                                key={selectedItem.inventoryKey}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 20 }}
                                className="flex flex-col h-full p-8 relative overflow-hidden"
                            >
                                {/* Ambient */}
                                <div className="absolute top-0 right-0 w-full h-1/2 bg-gradient-to-b from-blue-300/20 dark:from-[#FFC72C]/10 to-transparent pointer-events-none" />

                                {/* Large item image */}
                                <div className="h-48 w-full mb-6 relative flex items-center justify-center
                                    bg-white/60 dark:bg-gradient-to-b dark:from-white/10 dark:to-transparent
                                    rounded-3xl border border-white/80 dark:border-white/10
                                    shadow-[inset_2px_2px_10px_rgba(255,255,255,1),_0_10px_30px_rgba(0,0,0,0.05)]
                                    dark:shadow-[inset_0_2px_20px_rgba(255,255,255,0.05),_0_10px_30px_rgba(0,0,0,0.5)] z-10"
                                    style={((r) => ({
                                        border:    r ? RARITY_BORDER[r] : undefined,
                                        boxShadow: r ? RARITY_GLOW[r]   : undefined,
                                    }))(selectedItem.metadata?.rarity as string | undefined)}
                                >
                                    <motion.div
                                        animate={{ y: [-5, 5, -5], rotate: [-2, 2, -2] }}
                                        transition={{ repeat: Infinity, duration: 4, ease: 'easeInOut' }}
                                    >
                                        <ItemThumbnail item={selectedItem} large />
                                    </motion.div>
                                </div>

                                {/* Info */}
                                {(() => {
                                    const selRarity = selectedItem.metadata?.rarity as string | undefined;
                                    const selDesc   = selectedItem.metadata?.description as string | undefined;
                                    return (
                                    <div className="flex-1 flex flex-col z-10">
                                        <h2 className="text-2xl font-black text-blue-700 dark:text-[#FFC72C] tracking-wider mb-1 drop-shadow-sm">
                                            {selectedItem.name}
                                        </h2>

                                        {/* Rarity label */}
                                        {selRarity && (
                                            <div
                                                className="text-xs font-bold uppercase tracking-widest mb-3"
                                                style={{ color: RARITY_LABEL_COLOR[selRarity] ?? '#9ca3af' }}
                                            >
                                                ◆ {RARITY_LABEL[selRarity] ?? selRarity}
                                            </div>
                                        )}

                                    <div className="flex justify-between items-center mb-4 text-xs font-bold uppercase tracking-widest text-neutral-500 dark:text-white/50 border-b border-black/5 dark:border-white/10 pb-4">
                                        <span className="bg-white/50 dark:bg-black/30 px-3 py-1.5 rounded-lg border border-black/5 dark:border-white/5">
                                            类别: {inventoryTabs.find(t => t.id === selectedItem.type)?.label || selectedItem.type}
                                        </span>
                                        <span className="bg-white/50 dark:bg-black/30 px-3 py-1.5 rounded-lg border border-black/5 dark:border-white/5">
                                            拥有: {selectedItem.quantity}
                                        </span>
                                    </div>

                                    <div className="bg-white/40 dark:bg-black/30 p-5 rounded-2xl border border-white/60 dark:border-white/5 shadow-inner">
                                        <p className="text-neutral-700 dark:text-white/80 leading-relaxed text-sm tracking-wide font-medium">
                                            {selDesc || '这是一个由虚空物质铸造而成的神秘结构体，其内部流淌着不可预知的能量数据流。'}
                                        </p>
                                    </div>
                                    </div>
                                    );
                                })()}

                                {/* Action button */}
                                <div className="mt-6 pt-6 flex justify-end z-10">
                                    {(selectedItem.metadata as Record<string, unknown>)?.category === 'game' ? (
                                        <div className="w-full bg-black/10 dark:bg-white/5 border border-black/10 dark:border-white/10
                                            text-neutral-400 dark:text-white/30 py-4 rounded-xl text-sm font-bold tracking-widest text-center">
                                            在游戏中使用此物品
                                        </div>
                                    ) : (
                                        <motion.button
                                            whileHover={{ scale: 1.05 }}
                                            whileTap={{ scale: 0.95 }}
                                            onClick={() => handleUseItem(selectedItem)}
                                            className="w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-400 hover:to-cyan-400 dark:from-[#FFC72C] dark:to-orange-400 dark:hover:from-yellow-300 dark:hover:to-orange-300
                                            text-white dark:text-black py-4 rounded-xl text-lg font-black tracking-[0.3em]
                                            shadow-[0_10px_20px_rgba(59,130,246,0.3)] dark:shadow-[0_0_20px_rgba(255,199,44,0.4)] transition-all"
                                        >
                                            提取能量 (使用)
                                        </motion.button>
                                    )}
                                </div>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex flex-col h-full items-center justify-center text-neutral-400 dark:text-white/20 p-8 text-center"
                            >
                                <FaBox className="text-7xl mb-6 opacity-30 dark:opacity-50 drop-shadow-md" />
                                <h3 className="text-xl font-bold tracking-widest text-neutral-500 dark:text-white/40 mb-2">未选中物质</h3>
                                <p className="tracking-widest text-sm font-medium">在左侧矩阵中选择一个物品以解析其详细构造和用途。</p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Mobile selected item summary */}
            {selectedItem && (
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    className="lg:hidden z-20 absolute bottom-0 left-0 right-0 flex items-center justify-between p-5
                    bg-white/90 dark:bg-gray-900/90 backdrop-blur-xl border-t border-black/10 dark:border-white/10
                    shadow-[0_-10px_30px_rgba(0,0,0,0.1)] dark:shadow-[0_-5px_20px_rgba(0,0,0,0.5)] rounded-t-3xl"
                >
                    <div className="flex items-center gap-4">
                        <div className="text-4xl bg-white/50 dark:bg-black/50 p-2 rounded-xl shadow-inner border border-black/5 dark:border-white/5">
                            <ItemThumbnail item={selectedItem} />
                        </div>
                        <div>
                            <div className="font-black text-blue-700 dark:text-[#FFC72C] text-lg tracking-wider drop-shadow-sm">{selectedItem.name}</div>
                            <div className="text-xs text-neutral-500 dark:text-white/50 font-bold uppercase tracking-widest">库存持有: x{selectedItem.quantity}</div>
                        </div>
                    </div>
                    {(selectedItem.metadata as Record<string, unknown>)?.category !== 'game' && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleUseItem(selectedItem)}
                            className="bg-gradient-to-r from-blue-500 to-cyan-500 dark:from-[#FFE066] dark:to-orange-400 text-white dark:text-black px-8 py-3 rounded-xl text-sm font-black tracking-widest shadow-[0_5px_15px_rgba(59,130,246,0.3)] dark:shadow-[0_0_15px_rgba(255,199,44,0.4)]"
                        >
                            使用
                        </motion.button>
                    )}
                </motion.div>
            )}
        </section>
    );
};

export default Backpack;
