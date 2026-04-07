/**
 * Hotbar — 10-slot dynamic equipment bar.
 *
 * Supports three sprite sheets:
 *   'tools'     — Basic tools and meterials.png
 *   'plants'    — Basic_Plants.png
 *   'furniture' — Basic_Furniture.png
 *   'egg-nest'  — Egg_And_Nest.png
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { TOOL_ICON_SIZE } from '../constants';
import type { SlotItem } from '../../../../../Redux/Features/gameSlice';
import { ALL_ITEM_DEFS } from '../entities/DropItem';

// @ts-ignore
import toolsUrl       from '../../../../../assets/Sprout-Lands/Objects/Basic tools and meterials.png';
// @ts-ignore
import basicPlantsUrl from '../../../../../assets/Sprout-Lands/Objects/Basic_Plants.png';
// @ts-ignore
import furnitureUrl   from '../../../../../assets/Sprout-Lands/Objects/Basic_Furniture.png';
// @ts-ignore
import eggNestUrl     from '../../../../../assets/Sprout-Lands/Characters/Egg_And_Nest.png';
// @ts-ignore
import appleRipeUrl      from '../../../../../assets/Sprout-Lands/items/apple/apple_ripe.png';
// @ts-ignore
import raspberryRipeUrl  from '../../../../../assets/Sprout-Lands/items/raspberry/raspberry_ripe.png';

// ── Sheet type ────────────────────────────────────────────────────────────────
type Sheet = 'tools' | 'plants' | 'furniture' | 'egg-nest';

// ── Spritesheet coordinates per itemId ───────────────────────────────────────
const SPRITE_MAP: Record<string, { sheet: Sheet; x: number; y: number }> = {
  // ── Tools (Basic tools and meterials.png, 16px cells) ──────────────────────
  watering_can:          { sheet: 'tools',     x:  0, y:  0 },
  axe:                   { sheet: 'tools',     x: 16, y:  0 },
  scythe:                { sheet: 'tools',     x: 32, y:  0 },

  // ── Plants (Basic_Plants.png, 16px cells) ──────────────────────────────────
  wheat_seed:            { sheet: 'plants',    x:  0, y:  0 },
  tomato_seed:           { sheet: 'plants',    x:  0, y: 16 },
  wheat:                 { sheet: 'plants',    x: 80, y:  0 },
  tomato:                { sheet: 'plants',    x: 80, y: 16 },

  // ── Furniture (Basic_Furniture.png, 16px cells) ────────────────────────────
  // Beds (row 2: col 0-2 normal, col 4-6 flipped)
  bed_green:             { sheet: 'furniture', x:  0, y: 32 },
  bed_blue:              { sheet: 'furniture', x: 16, y: 32 },
  bed_pink:              { sheet: 'furniture', x: 32, y: 32 },
  bed_green_flipped:     { sheet: 'furniture', x:  0, y: 64 },
  bed_blue_flipped:      { sheet: 'furniture', x: 16, y: 64 },
  bed_pink_flipped:      { sheet: 'furniture', x: 32, y: 64 },
  // Paintings (row 0, col 0-2)
  painting_0:            { sheet: 'furniture', x:  0, y:  0 },
  painting_1:            { sheet: 'furniture', x: 16, y:  0 },
  painting_2:            { sheet: 'furniture', x: 32, y:  0 },
  // Flower pots (row 0, col 3-5)
  flower_pot_0:          { sheet: 'furniture', x: 48, y:  0 },
  flower_pot_1:          { sheet: 'furniture', x: 64, y:  0 },
  flower_pot_2:          { sheet: 'furniture', x: 80, y:  0 },
  // Lamps (row 1, col 0-2)
  lamp_green:            { sheet: 'furniture', x:  0, y: 16 },
  lamp_blue:             { sheet: 'furniture', x: 16, y: 16 },
  lamp_pink:             { sheet: 'furniture', x: 32, y: 16 },
  // Cabinet / chairs / table
  cabinet:               { sheet: 'furniture', x: 48, y: 32 },
  chair_right:           { sheet: 'furniture', x: 64, y: 32 },
  chair_left:            { sheet: 'furniture', x: 80, y: 32 },
  chair_down:            { sheet: 'furniture', x: 96, y: 32 },
  chair_up:              { sheet: 'furniture', x:112, y: 32 },
  table_large:           { sheet: 'furniture', x: 48, y: 48 },
  table_small:           { sheet: 'furniture', x: 64, y: 48 },
  clock_bunny:           { sheet: 'furniture', x: 48, y: 64 },
  clock_normal:          { sheet: 'furniture', x: 64, y: 64 },
  clock_small:           { sheet: 'furniture', x: 80, y: 64 },
  // Rugs
  rug_small_green:       { sheet: 'furniture', x:  0, y: 80 },
  rug_small_blue:        { sheet: 'furniture', x: 16, y: 80 },
  rug_small_pink:        { sheet: 'furniture', x: 32, y: 80 },
  rug_large_green:       { sheet: 'furniture', x: 48, y: 80 },
  rug_large_blue:        { sheet: 'furniture', x: 64, y: 80 },
  rug_large_pink:        { sheet: 'furniture', x: 80, y: 80 },

  // ── Egg + Nest (Egg_And_Nest.png, 16px cells horizontal strip) ───────────
  egg:                   { sheet: 'egg-nest',  x:  0, y: 0 },   // frame 0: single egg
  chicken_nest:          { sheet: 'egg-nest',  x: 48, y: 0 },   // frame 3: empty nest
};

// ── Standalone PNG icons (full-image, no crop needed) ────────────────────────
const STANDALONE_IMG: Record<string, string> = {
  fruit:     appleRipeUrl,
  raspberry: raspberryRipeUrl,
};

// ── Tint fallback map (for items with iconX < 0, e.g. log / stone / egg) ──────
const TINT_MAP = new Map(
  ALL_ITEM_DEFS
    .filter(d => d.iconX < 0 && d.tint != null)
    .map(d => [d.itemId, d.tint!]),
);

// ── Image loader singletons ───────────────────────────────────────────────────
function makeLoader(src: string) {
  let img: HTMLImageElement | null = null;
  let done = false;
  return {
    get(): HTMLImageElement {
      if (!img) { img = new Image(); img.src = src; img.onload = () => { done = true; }; }
      return img;
    },
    ready() { return done; },
  };
}
const loaders: Record<Sheet, ReturnType<typeof makeLoader>> = {
  'tools':     makeLoader(toolsUrl),
  'plants':    makeLoader(basicPlantsUrl),
  'furniture': makeLoader(furnitureUrl),
  'egg-nest':  makeLoader(eggNestUrl),
};

// ── Canvas icon for sprite-sheet items ────────────────────────────────────────
const SpriteCanvas: React.FC<{ sheet: Sheet; x: number; y: number; size: number }> = ({ sheet, x, y, size }) => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx    = canvas.getContext('2d')!;
    const loader = loaders[sheet];
    const draw   = () => {
      ctx.clearRect(0, 0, size, size);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(loader.get(), x, y, TOOL_ICON_SIZE, TOOL_ICON_SIZE, 0, 0, size, size);
    };
    const img = loader.get();
    if (loader.ready()) draw();
    else img.addEventListener('load', draw, { once: true });
  }, [sheet, x, y, size]);

  return <canvas ref={ref} width={size} height={size} style={{ imageRendering: 'pixelated' }} />;
};

// ── Single slot content ───────────────────────────────────────────────────────
const SlotContent: React.FC<{ item: SlotItem; iconSize: number }> = ({ item, iconSize }) => {
  const sprite = SPRITE_MAP[item.itemId];
  if (sprite) return <SpriteCanvas sheet={sprite.sheet} x={sprite.x} y={sprite.y} size={iconSize} />;

  // Standalone PNG icons (fruit, raspberry, …)
  const imgUrl = STANDALONE_IMG[item.itemId];
  if (imgUrl) return (
    <img src={imgUrl} width={iconSize} height={iconSize}
      style={{ imageRendering: 'pixelated', display: 'block' }} />
  );

  // Tint circle fallback for materials (log, stone, berry, egg…)
  const tint = TINT_MAP.get(item.itemId);
  if (tint != null) {
    const r = (tint >> 16) & 0xff;
    const g = (tint >>  8) & 0xff;
    const b =  tint        & 0xff;
    return (
      <div style={{
        width:        iconSize * 0.75,
        height:       iconSize * 0.75,
        borderRadius: '50%',
        background:   `rgb(${r},${g},${b})`,
        border:       '1px solid rgba(255,255,255,0.35)',
        flexShrink:   0,
      }} />
    );
  }

  // Unknown item — show question mark
  return <span style={{ fontSize: iconSize * 0.72, lineHeight: 1 }}>{'❓'}</span>;
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface HotbarProps {
  selected:    number;
  onChange:    (slot: number) => void;
  hotbarSlots: (SlotItem | null)[];
}

// ── Hotbar component ──────────────────────────────────────────────────────────
export const Hotbar: React.FC<HotbarProps> = ({ selected, onChange, hotbarSlots }) => {
  const SLOT_SIZE  = 50;
  const ICON_SIZE  = 30;

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    const k = e.key;
    if (k >= '1' && k <= '9') onChange(parseInt(k, 10) - 1);
    else if (k === '0')       onChange(9);
  }, [onChange]);

  useEffect(() => {
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  return (
    <div style={{
      position:     'absolute',
      bottom:       10,
      left:         '50%',
      transform:    'translateX(-50%)',
      display:      'flex',
      gap:          3,
      background:   'rgba(0,0,0,0.60)',
      border:       '2px solid #555',
      borderRadius: 8,
      padding:      '4px 6px',
      zIndex:       100,
      userSelect:   'none',
    }}>
      {hotbarSlots.map((slot, i) => {
        const isActive = i === selected;
        const item     = slot;
        return (
          <div
            key={i}
            onClick={() => onChange(i)}
            title={item ? `${item.itemId} ×${item.quantity}` : `格 ${i === 9 ? '0' : i + 1}`}
            style={{
              width:          SLOT_SIZE,
              height:         SLOT_SIZE,
              background:     isActive ? 'rgba(180,150,60,0.35)' : 'rgba(30,30,30,0.7)',
              border:         isActive ? '2px solid #ffd700' : '2px solid #333',
              borderRadius:   4,
              display:        'flex',
              flexDirection:  'column',
              alignItems:     'center',
              justifyContent: 'center',
              cursor:         'pointer',
              position:       'relative',
              boxSizing:      'border-box',
              transition:     'background 0.1s, border-color 0.1s',
            }}
          >
            {/* Item icon */}
            {item && <SlotContent item={item} iconSize={ICON_SIZE} />}

            {/* Quantity badge */}
            {item && item.quantity > 1 && (
              <div style={{
                position:   'absolute',
                bottom:     1,
                right:      3,
                fontSize:   9,
                color:      '#fff',
                fontFamily: '"Courier New", monospace',
                fontWeight: 'bold',
                lineHeight: 1,
                textShadow: '0 0 3px #000',
              }}>
                {item.quantity}
              </div>
            )}

            {/* Slot number badge */}
            <div style={{
              position:   'absolute',
              top:        1,
              right:      3,
              fontSize:   8,
              color:      isActive ? '#ffd700' : '#555',
              fontFamily: '"Courier New", monospace',
              lineHeight: 1,
            }}>
              {i === 9 ? '0' : String(i + 1)}
            </div>

            {/* Active glow */}
            {isActive && (
              <div style={{
                position:      'absolute',
                inset:         0,
                borderRadius:  3,
                boxShadow:     'inset 0 0 6px rgba(255,215,0,0.3)',
                pointerEvents: 'none',
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
};
