import React from 'react';
import type { GameSettingsState } from '../../../../../Redux/Features/gameSlice';

type AudioSettingsPatch = Pick<
  GameSettingsState,
  'audioEnabled' | 'audioVolume' | 'musicEnabled' | 'musicVolume'
>;

interface AudioSettingsModalProps {
  open: boolean;
  settings: GameSettingsState;
  onChange: (patch: Partial<AudioSettingsPatch>) => void;
  onClose: () => void;
}

const buttonStyle: React.CSSProperties = {
  border: '2px solid var(--px-border)',
  borderRadius: 6,
  background: 'var(--px-surface2)',
  color: 'var(--px-text)',
  padding: '7px 12px',
  fontFamily: '"Courier New", monospace',
  fontWeight: 900,
  cursor: 'pointer',
};

function clampVolume(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function VolumeRow({
  title,
  hint,
  enabled,
  volume,
  onToggle,
  onVolume,
}: {
  title: string;
  hint: string;
  enabled: boolean;
  volume: number;
  onToggle: (enabled: boolean) => void;
  onVolume: (volume: number) => void;
}) {
  return (
    <section
      style={{
        border: '1px solid var(--px-border)',
        borderRadius: 6,
        background: 'rgba(255,255,255,0.04)',
        padding: 12,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ color: 'var(--px-gold)', fontSize: 14, fontWeight: 900 }}>{title}</div>
          <div style={{ marginTop: 4, color: 'var(--px-muted)', fontSize: 12, lineHeight: 1.45 }}>
            {hint}
          </div>
        </div>
        <button
          type="button"
          onClick={() => onToggle(!enabled)}
          style={{
            ...buttonStyle,
            minWidth: 72,
            borderColor: enabled ? 'var(--px-border-gold)' : 'var(--px-border)',
            color: enabled ? 'var(--px-gold)' : 'var(--px-muted)',
          }}
        >
          {enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          disabled={!enabled}
          onChange={(event) => onVolume(clampVolume(Number(event.target.value)))}
          style={{ flex: 1 }}
        />
        <span
          style={{
            width: 48,
            textAlign: 'right',
            color: enabled ? 'var(--px-gold)' : 'var(--px-muted)',
            fontWeight: 900,
          }}
        >
          {Math.round(volume * 100)}%
        </span>
      </div>
    </section>
  );
}

export function AudioSettingsModal({
  open,
  settings,
  onChange,
  onClose,
}: AudioSettingsModalProps) {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="声音设置"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 420,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0,0,0,0.38)',
        fontFamily: '"Courier New", monospace',
        color: 'var(--px-text)',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(430px, calc(100vw - 32px))',
          border: '3px solid var(--px-border-gold)',
          borderRadius: 8,
          background: 'var(--px-surface)',
          boxShadow: '0 8px 0 rgba(0,0,0,0.35), 0 20px 48px rgba(0,0,0,0.45)',
          padding: 16,
        }}
      >
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, color: 'var(--px-gold)', letterSpacing: 0 }}>
              声音设置
            </h2>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--px-muted)' }}>
              音效和音乐分开控制，设置会跟随游戏存档保存。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭声音设置"
            style={{
              ...buttonStyle,
              width: 36,
              height: 34,
              padding: 0,
              fontSize: 18,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </header>

        <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
          <VolumeRow
            title="Audio"
            hint="雨声、环境声、UI、对话、车辆和交互音效。"
            enabled={settings.audioEnabled !== false}
            volume={typeof settings.audioVolume === 'number' ? settings.audioVolume : 0.8}
            onToggle={(audioEnabled) => onChange({ audioEnabled })}
            onVolume={(audioVolume) => onChange({ audioVolume })}
          />
          <VolumeRow
            title="Music"
            hint="纯背景音乐，不影响雨声和其他音效。"
            enabled={settings.musicEnabled !== false}
            volume={typeof settings.musicVolume === 'number' ? settings.musicVolume : 0.6}
            onToggle={(musicEnabled) => onChange({ musicEnabled })}
            onVolume={(musicVolume) => onChange({ musicVolume })}
          />
        </div>

        <footer style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              ...buttonStyle,
              borderColor: 'var(--px-border-gold)',
              color: 'var(--px-gold)',
            }}
          >
            完成
          </button>
        </footer>
      </div>
    </div>
  );
}
