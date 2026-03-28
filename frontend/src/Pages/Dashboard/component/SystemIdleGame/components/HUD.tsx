/** HUD — clock, save button, controls hint. */
import React from 'react';

interface HUDProps {
  timeStr:  string;
  isSaving: boolean;
  username: string;
  onSave:   () => void;
}

export const HUD: React.FC<HUDProps> = ({ timeStr, isSaving, username, onSave }) => (
  <>
    {/* ── Clock ── */}
    <div style={{
      position:      'absolute',
      top:           10,
      left:          '50%',
      transform:     'translateX(-50%)',
      background:    'rgba(0,0,0,0.65)',
      color:         '#fff',
      padding:       '4px 18px',
      borderRadius:  8,
      fontFamily:    '"Courier New", monospace',
      fontSize:      15,
      letterSpacing: 2,
      pointerEvents: 'none',
      userSelect:    'none',
      whiteSpace:    'nowrap',
      zIndex:        10,
    }}>
      🕐 {timeStr}
    </div>

    {/* ── Save ── */}
    <div style={{ position: 'absolute', top: 10, right: 12, zIndex: 10 }}>
      <button
        onClick={onSave}
        disabled={isSaving}
        style={{
          background:   isSaving ? '#444' : '#2a5c2a',
          color:        '#cfc',
          border:       '1px solid #4a8a4a',
          borderRadius: 6,
          padding:      '4px 12px',
          fontSize:     12,
          cursor:       isSaving ? 'wait' : 'pointer',
          fontFamily:   '"Courier New", monospace',
        }}
      >
        {isSaving ? '保存中…' : '💾 保存'}
      </button>
    </div>

    {/* ── Controls hint ── */}
    <div style={{
      position:      'absolute',
      bottom:        68,   // above the hotbar
      left:          12,
      background:    'rgba(0,0,0,0.45)',
      color:         '#aaa',
      padding:       '3px 10px',
      borderRadius:  6,
      fontSize:      11,
      fontFamily:    '"Courier New", monospace',
      pointerEvents: 'none',
      userSelect:    'none',
      zIndex:        10,
    }}>
      WASD / ↑↓←→ 移动 · Space 使用工具 · F 交互/捡起 · Enter 和NPC对话 · 1–0 换工具
    </div>

    {/* ── Player name ── */}
    {username && (
      <div style={{
        position:      'absolute',
        bottom:        68,
        right:         12,
        background:    'rgba(0,0,0,0.45)',
        color:         '#cfc',
        padding:       '3px 10px',
        borderRadius:  6,
        fontSize:      11,
        fontFamily:    '"Courier New", monospace',
        pointerEvents: 'none',
        userSelect:    'none',
        zIndex:        10,
      }}>
        {username}
      </div>
    )}
  </>
);
