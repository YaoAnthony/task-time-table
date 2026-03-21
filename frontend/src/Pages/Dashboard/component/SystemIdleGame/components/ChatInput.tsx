/**
 * ChatInput — Floating pixel-art text input for NPC conversation.
 * Appears above the hotbar when the player interacts with an NPC.
 * Enter = send, Escape = cancel.
 * Stops key events from propagating to the game while open.
 */
import React, { useRef, useEffect } from 'react';

interface ChatInputProps {
  npcName:  string;
  onSend:   (text: string) => void;
  onCancel: () => void;
}

export const ChatInput: React.FC<ChatInputProps> = ({ npcName, onSend, onCancel }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount so the player can type immediately
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Prevent game keys (WASD, arrows, space, E) from reaching Phaser
    e.stopPropagation();

    if (e.key === 'Enter') {
      const text = (inputRef.current?.value ?? '').trim();
      if (text) {
        onSend(text);
        if (inputRef.current) inputRef.current.value = '';
      }
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div
      style={{
        position:  'absolute',
        bottom:    80,
        left:      '50%',
        transform: 'translateX(-50%)',
        width:     'clamp(280px, 55%, 500px)',
        zIndex:    999,
        display:   'flex',
        flexDirection: 'column',
        gap:       6,
        fontFamily: '"Courier New", monospace',
        // Shadow so it's visible regardless of background
        filter:    'drop-shadow(0 4px 12px rgba(0,0,0,0.7))',
      }}
    >
      {/* "Speaking to" label */}
      <div style={{
        background:    '#4a3500',
        color:         '#fffde8',
        fontSize:      10,
        padding:       '3px 10px',
        borderRadius:  3,
        alignSelf:     'center',
        letterSpacing: 1,
      }}>
        ▶ 对 {npcName} 说话…
      </div>

      {/* Input row */}
      <div style={{
        background:   '#fffde8',
        border:       '3px solid #4a3500',
        borderRadius: 4,
        boxShadow:    '0 0 0 1px #c8a850, 4px 4px 0 #4a3500',
        padding:      '6px 10px',
        display:      'flex',
        gap:          8,
        alignItems:   'center',
      }}>
        <input
          ref={inputRef}
          type="text"
          placeholder="输入消息，回车发送…"
          maxLength={80}
          onKeyDown={handleKeyDown}
          style={{
            flex:       1,
            background: 'transparent',
            border:     'none',
            outline:    'none',
            fontSize:   13,
            color:      '#3a2000',
            fontFamily: '"Courier New", monospace',
          }}
        />
        <span style={{ fontSize: 9, color: '#888', whiteSpace: 'nowrap' }}>
          ESC 取消
        </span>
      </div>

      {/* Hint text */}
      <style>{`
        @keyframes blink { 50% { opacity: 0 } }
      `}</style>
    </div>
  );
};
