import React from 'react';
import type { GameSettingsState, GameWeatherSetting } from '../../../../../Redux/Features/gameSlice';

interface GameSettingsModalProps {
  open: boolean;
  settings: GameSettingsState;
  onChange: (patch: Partial<GameSettingsState>) => void;
  onClose: () => void;
}

const quickTimes = [
  { label: '清晨', minute: 360 },
  { label: '上午', minute: 540 },
  { label: '中午', minute: 720 },
  { label: '傍晚', minute: 1080 },
  { label: '深夜', minute: 1320 },
];

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

const sectionStyle: React.CSSProperties = {
  border: '2px solid var(--px-border)',
  borderRadius: 8,
  background: 'rgba(255,255,255,0.04)',
  padding: 14,
};

function formatMinute(minute: number) {
  const safeMinute = Math.max(0, Math.min(1439, Math.round(minute)));
  const hour = Math.floor(safeMinute / 60).toString().padStart(2, '0');
  const min = (safeMinute % 60).toString().padStart(2, '0');
  return `${hour}:${min}`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function ToggleRow({
  title,
  hint,
  checked,
  onChange,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      style={{
        ...sectionStyle,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 14,
      }}
    >
      <span>
        <strong style={{ color: 'var(--px-gold)' }}>{title}</strong>
        <span style={{ display: 'block', color: 'var(--px-muted)', fontSize: 12, lineHeight: 1.45, marginTop: 4 }}>
          {hint}
        </span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        style={{ width: 22, height: 22, flexShrink: 0 }}
      />
    </label>
  );
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
    <div style={sectionStyle}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
        <div>
          <strong style={{ color: 'var(--px-gold)' }}>{title}</strong>
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
            color: enabled ? 'var(--px-gold)' : 'var(--px-muted)',
            borderColor: enabled ? 'var(--px-border-gold)' : 'var(--px-border)',
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
          onChange={(event) => onVolume(clamp01(Number(event.target.value)))}
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
    </div>
  );
}

export function GameSettingsModal({
  open,
  settings,
  onChange,
  onClose,
}: GameSettingsModalProps) {
  if (!open) return null;

  const commandPreview = [
    `/time set ${settings.timeMinute}`,
    `/weather ${settings.weather}`,
    `/audio ${settings.audioEnabled ? 'on' : 'off'}`,
    `/audio volume ${settings.audioVolume.toFixed(2)}`,
    `/music ${settings.musicEnabled ? 'on' : 'off'}`,
    `/music volume ${settings.musicVolume.toFixed(2)}`,
    `/debug ${settings.physicsDebug ? 'on' : 'off'}`,
    `/pathline ${settings.pathLineEnabled ? 'on' : 'off'}`,
    `/sleep threshold ${settings.sleepThreshold.toFixed(2)}`,
    `/agent brain ${settings.agentBrainEnabled ? 'on' : 'off'}`,
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="游戏设置"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 430,
        display: 'grid',
        placeItems: 'center',
        background: 'rgba(0,0,0,0.42)',
        fontFamily: '"Courier New", monospace',
        color: 'var(--px-text)',
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: 'min(940px, calc(100vw - 28px))',
          maxHeight: 'min(88vh, 820px)',
          border: '4px solid var(--px-border-gold)',
          borderRadius: 8,
          background: 'var(--px-surface)',
          boxShadow: '0 0 0 3px #23150e, 0 18px 0 rgba(0,0,0,0.45), 0 32px 70px rgba(0,0,0,0.58)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          imageRendering: 'pixelated',
        }}
      >
        <header
          style={{
            borderBottom: '3px solid var(--px-border-gold)',
            background: 'var(--px-surface2)',
            padding: '14px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: 'var(--px-gold)', letterSpacing: 0 }}>
              游戏设置
            </h2>
            <p style={{ margin: '5px 0 0', fontSize: 12, color: 'var(--px-muted)' }}>
              这些设置会立即应用到挂机培养场景，并跟随游戏存档保存。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭游戏设置"
            style={{
              ...buttonStyle,
              width: 36,
              height: 34,
              padding: 0,
              fontSize: 18,
              lineHeight: 1,
              borderColor: 'var(--px-border-gold)',
              color: 'var(--px-gold)',
            }}
          >
            ×
          </button>
        </header>

        <div
          style={{
            overflow: 'auto',
            padding: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 14,
          }}
        >
          <section style={{ ...sectionStyle, display: 'grid', gap: 14 }}>
            <h3 style={{ margin: 0, color: 'var(--px-gold)', fontSize: 15 }}>世界控制</h3>

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10, fontWeight: 900 }}>
                <span>时间</span>
                <span style={{ color: 'var(--px-gold)' }}>{formatMinute(settings.timeMinute)}</span>
              </div>
              <input
                type="range"
                min={0}
                max={1439}
                step={15}
                value={settings.timeMinute}
                onChange={(event) => onChange({ timeMinute: Number(event.target.value) })}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {quickTimes.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => onChange({ timeMinute: item.minute })}
                    style={{
                      ...buttonStyle,
                      padding: '6px 9px',
                      borderColor: settings.timeMinute === item.minute ? 'var(--px-border-gold)' : 'var(--px-border)',
                      color: settings.timeMinute === item.minute ? 'var(--px-gold)' : 'var(--px-text)',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div style={{ marginBottom: 10, fontWeight: 900 }}>天气</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['clear', 'rain'] as GameWeatherSetting[]).map((weather) => (
                  <button
                    key={weather}
                    type="button"
                    onClick={() => onChange({ weather })}
                    style={{
                      ...buttonStyle,
                      minHeight: 42,
                      borderColor: settings.weather === weather ? 'var(--px-border-gold)' : 'var(--px-border)',
                      color: settings.weather === weather ? 'var(--px-gold)' : 'var(--px-text)',
                    }}
                  >
                    {weather === 'clear' ? '晴天' : '下雨'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 12 }}>
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
          </section>

          <section style={{ ...sectionStyle, display: 'grid', gap: 12, alignContent: 'start' }}>
            <h3 style={{ margin: 0, color: 'var(--px-gold)', fontSize: 15 }}>调试与 Agent</h3>
            <ToggleRow
              title="Physics Debug"
              hint="显示碰撞体调试线。"
              checked={settings.physicsDebug}
              onChange={(physicsDebug) => onChange({ physicsDebug })}
            />
            <ToggleRow
              title="Path Lines"
              hint="显示 NPC 当前寻路路线。"
              checked={settings.pathLineEnabled}
              onChange={(pathLineEnabled) => onChange({ pathLineEnabled })}
            />
            <ToggleRow
              title="Agent Brain"
              hint="控制 NPC 自主思考、日程和需求驱动。"
              checked={settings.agentBrainEnabled !== false}
              onChange={(agentBrainEnabled) => onChange({ agentBrainEnabled })}
            />

            <div style={sectionStyle}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8, fontWeight: 900 }}>
                <span>睡眠跳过比例</span>
                <span style={{ color: 'var(--px-gold)' }}>{Math.round(settings.sleepThreshold * 100)}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.sleepThreshold}
                onChange={(event) => onChange({ sleepThreshold: Number(event.target.value) })}
                style={{ width: '100%' }}
              />
            </div>

            <div style={sectionStyle}>
              <h3 style={{ margin: '0 0 10px', color: 'var(--px-gold)', fontSize: 14 }}>Command Preview</h3>
              <div style={{ display: 'grid', gap: 7 }}>
                {commandPreview.map((command) => (
                  <code
                    key={command}
                    style={{
                      display: 'block',
                      padding: '7px 8px',
                      border: '1px solid var(--px-border)',
                      borderRadius: 4,
                      background: '#0d1117',
                      color: '#d7f7a8',
                      fontSize: 12,
                      whiteSpace: 'nowrap',
                      overflow: 'auto',
                    }}
                  >
                    {command}
                  </code>
                ))}
              </div>
            </div>
          </section>
        </div>

        <footer
          style={{
            borderTop: '3px solid var(--px-border)',
            padding: 12,
            display: 'flex',
            justifyContent: 'flex-end',
            background: 'var(--px-surface2)',
          }}
        >
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
