import React from 'react';

export interface StorylineChoiceView {
  requestId: string;
  npcName: string;
  prompt: string;
  choices: Array<{ id: string; label: string }>;
}

interface StorylineChoiceModalProps {
  choice: StorylineChoiceView;
  onSelect: (choiceId: string) => void;
}

export const StorylineChoiceModal: React.FC<StorylineChoiceModalProps> = ({ choice, onSelect }) => (
  <div style={{
    position: 'absolute',
    inset: 0,
    zIndex: 330,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
    background: 'rgba(16, 18, 22, 0.22)',
  }}>
    <div style={{
      width: 'min(520px, calc(100vw - 32px))',
      background: '#fffde8',
      border: '3px solid #4a3500',
      borderRadius: 6,
      boxShadow: '0 0 0 1px #c8a850, 6px 6px 0 #4a3500',
      padding: '14px 16px 16px',
      fontFamily: '"Courier New", monospace',
      color: '#321d00',
    }}>
      <div style={{
        display: 'inline-block',
        marginBottom: 10,
        padding: '3px 9px',
        background: '#4a3500',
        color: '#fffde8',
        fontSize: 12,
        fontWeight: 700,
        borderRadius: 2,
      }}>
        {choice.npcName}
      </div>
      <div style={{
        fontSize: 14,
        lineHeight: 1.7,
        marginBottom: 14,
        whiteSpace: 'pre-wrap',
      }}>
        {choice.prompt}
      </div>
      <div style={{ display: 'grid', gap: 8 }}>
        {choice.choices.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onSelect(option.id)}
            style={{
              width: '100%',
              textAlign: 'left',
              border: '2px solid #c18a20',
              background: '#fff6c8',
              color: '#3a2000',
              borderRadius: 5,
              padding: '9px 12px',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontSize: 13,
              lineHeight: 1.45,
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  </div>
);
