/**
 * Hotbar — Minecraft-style 10-slot tool bar.
 * Draws item icons by cropping the tools spritesheet via <canvas>.
 */
import React, { useRef, useEffect, useCallback } from 'react';
import { HOTBAR_DEFS } from '../types';
import { TOOL_ICON_SIZE } from '../constants';

// @ts-ignore
import toolsUrl from '../../../../../assets/Sprout-Lands/Objects/Basic tools and meterials.png';

interface HotbarProps {
  selected: number;
  onChange: (slot: number) => void;
}

// Pre-load the tools image once
let toolsImg: HTMLImageElement | null = null;
let toolsImgReady = false;
function getToolsImg(): HTMLImageElement {
  if (!toolsImg) {
    toolsImg = new Image();
    toolsImg.src = toolsUrl;
    toolsImg.onload = () => { toolsImgReady = true; };
  }
  return toolsImg;
}

// ── Single slot icon canvas ──────────────────────────────────────────────────
const SlotIcon: React.FC<{ iconX: number; iconY: number; display: number }> = ({
  iconX, iconY, display,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (iconX < 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const draw = () => {
      ctx.clearRect(0, 0, display, display);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(toolsImg!, iconX, iconY, TOOL_ICON_SIZE, TOOL_ICON_SIZE, 0, 0, display, display);
    };

    const img = getToolsImg();
    if (toolsImgReady) {
      draw();
    } else {
      img.addEventListener('load', draw, { once: true });
    }
  }, [iconX, iconY, display]);

  if (iconX < 0) return null;
  return (
    <canvas
      ref={canvasRef}
      width={display}
      height={display}
      style={{ imageRendering: 'pixelated' }}
    />
  );
};

// ── Hotbar component ──────────────────────────────────────────────────────────
export const Hotbar: React.FC<HotbarProps> = ({ selected, onChange }) => {
  const SLOT_SIZE    = 46;
  const ICON_DISPLAY = 28;

  // Keyboard 1–9 → slots 0–8 ; 0 → slot 9
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
      position:       'absolute',
      bottom:         10,
      left:           '50%',
      transform:      'translateX(-50%)',
      display:        'flex',
      gap:            3,
      background:     'rgba(0,0,0,0.55)',
      border:         '2px solid #555',
      borderRadius:   8,
      padding:        '4px 6px',
      zIndex:         100,
      userSelect:     'none',
    }}>
      {HOTBAR_DEFS.map((def: (typeof HOTBAR_DEFS)[number], i: number) => (
        <div
          key={i}
          onClick={() => onChange(i)}
          title={def.label || `格${i + 1}`}
          style={{
            width:        SLOT_SIZE,
            height:       SLOT_SIZE,
            background:   i === selected ? '#888' : '#3a3a3a',
            border:       i === selected
              ? '2px solid #ffd700'
              : '2px solid #222',
            borderRadius: 4,
            display:      'flex',
            flexDirection:'column',
            alignItems:   'center',
            justifyContent: 'center',
            cursor:       'pointer',
            position:     'relative',
            boxSizing:    'border-box',
            transition:   'background 0.1s',
          }}
        >
          <SlotIcon iconX={def.iconX} iconY={def.iconY} display={ICON_DISPLAY} />

          {/* Tool label */}
          {def.label && (
            <div style={{
              fontSize:    9,
              color:       i === selected ? '#ffd700' : '#aaa',
              fontFamily:  '"Courier New", monospace',
              marginTop:   2,
              lineHeight:  1,
            }}>
              {def.label}
            </div>
          )}

          {/* Slot number badge */}
          <div style={{
            position:   'absolute',
            top:        1,
            right:      3,
            fontSize:   8,
            color:      '#666',
            fontFamily: '"Courier New", monospace',
            lineHeight: 1,
          }}>
            {i === 9 ? '0' : String(i + 1)}
          </div>
        </div>
      ))}
    </div>
  );
};
