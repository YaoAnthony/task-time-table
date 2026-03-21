/**
 * ChatInput — Floating pixel-art text input.
 *
 * Two modes (detected automatically):
 *   • Normal  — text sent to NPC when it does NOT start with "/"
 *   • Command — text executed as a game command when it starts with "/"
 *
 * Enter = send/execute, Escape = cancel.
 * Key events are stopped from propagating to the game while open.
 */
import React, { useRef, useEffect, useState } from 'react';

interface ChatInputProps {
  npcName:      string;
  onSend:       (text: string) => void;
  onCancel:     () => void;
  /** Pre-fill the input (e.g. "/" when opened via slash key). */
  initialValue?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({ npcName, onSend, onCancel, initialValue = '' }) => {
  const inputRef  = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  const isCommand = value.startsWith('/');

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    // Move cursor to end of any pre-filled text
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      const text = value.trim();
      if (text) { onSend(text); setValue(''); }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  const labelBg    = isCommand ? '#0d2a0d' : '#4a3500';
  const labelColor = isCommand ? '#88ff88' : '#fffde8';
  const borderClr  = isCommand ? '#44aa44' : '#4a3500';
  const shadowClr  = isCommand ? '#44aa44' : '#c8a850';
  const labelText  = isCommand
    ? '⌨ 命令模式 — Enter 执行'
    : `▶ 对 ${npcName} 说话…`;

  return (
    <div
      style={{
        position:      'absolute',
        bottom:        80,
        left:          '50%',
        transform:     'translateX(-50%)',
        width:         'clamp(280px, 55%, 500px)',
        zIndex:        999,
        display:       'flex',
        flexDirection: 'column',
        gap:           6,
        fontFamily:    '"Courier New", monospace',
        filter:        'drop-shadow(0 4px 12px rgba(0,0,0,0.7))',
      }}
    >
      {/* Mode label */}
      <div style={{
        background:    labelBg,
        color:         labelColor,
        fontSize:      10,
        padding:       '3px 10px',
        borderRadius:  3,
        alignSelf:     'center',
        letterSpacing: 1,
        transition:    'background 0.15s, color 0.15s',
      }}>
        {labelText}
      </div>

      {/* Input row */}
      <div style={{
        background:   '#fffde8',
        border:       `3px solid ${borderClr}`,
        borderRadius: 4,
        boxShadow:    `0 0 0 1px ${shadowClr}, 4px 4px 0 ${borderClr}`,
        padding:      '6px 10px',
        display:      'flex',
        gap:          8,
        alignItems:   'center',
        transition:   'border-color 0.15s, box-shadow 0.15s',
      }}>
        <input
          ref={inputRef}
          type="text"
          placeholder={isCommand ? '/weather rain   /time set 480   /help' : '输入消息，回车发送…'}
          value={value}
          onChange={e => setValue(e.target.value)}
          maxLength={120}
          onKeyDown={handleKeyDown}
          style={{
            flex:       1,
            background: 'transparent',
            border:     'none',
            outline:    'none',
            fontSize:   13,
            color:      isCommand ? '#1a5c1a' : '#3a2000',
            fontFamily: '"Courier New", monospace',
          }}
        />
        <span style={{ fontSize: 9, color: '#888', whiteSpace: 'nowrap' }}>
          ESC 取消
        </span>
      </div>
    </div>
  );
};
