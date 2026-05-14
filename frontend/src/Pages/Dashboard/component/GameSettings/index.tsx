import React, { useCallback } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate } from 'react-router-dom';
import type { RootState } from '../../../../Redux/store';
import { useSaveGameSaveMutation } from '../../../../api/profileStateRtkApi';
import {
  setGameAgentBrainEnabled,
  setGamePathLineEnabled,
  setGamePhysicsDebug,
  setGameSettings,
  setGameSleepThreshold,
  setGameTimeMinute,
  setGameWeather,
  type GameSettingsState,
  type GameWeatherSetting,
} from '../../../../Redux/Features/gameSlice';
import { GAME_MINS_PER_SEC, MINS_PER_DAY } from '../SystemIdleGame/constants';

const SECS_PER_GAME_DAY = MINS_PER_DAY / GAME_MINS_PER_SEC;

const quickTimes = [
  { label: '清晨', minute: 360 },
  { label: '上午', minute: 540 },
  { label: '中午', minute: 720 },
  { label: '傍晚', minute: 1080 },
  { label: '深夜', minute: 1320 },
];

function formatMinute(minute: number) {
  const hour = Math.floor(minute / 60).toString().padStart(2, '0');
  const min = (minute % 60).toString().padStart(2, '0');
  return `${hour}:${min}`;
}

function tickWithMinuteOfDay(currentTick: number, minute: number): number {
  const day = Math.floor(Math.max(0, currentTick) / SECS_PER_GAME_DAY);
  const normalizedMinute = Math.max(0, Math.min(MINS_PER_DAY - 1, Math.round(minute)));
  return day * SECS_PER_GAME_DAY + normalizedMinute / GAME_MINS_PER_SEC;
}

const panelStyle: React.CSSProperties = {
  border: '2px solid var(--px-border)',
  borderRadius: 6,
  background: 'var(--px-surface)',
  boxShadow: '0 4px 0 rgba(0,0,0,0.35)',
};

const GameSettings: React.FC = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const rawSettings = useSelector((state: RootState) => state.game.settings);
  const settings: GameSettingsState = {
    ...rawSettings,
    pathLineEnabled: Boolean(rawSettings.pathLineEnabled),
    agentBrainEnabled: rawSettings.agentBrainEnabled !== false,
  };
  const savedGameSave = useSelector((state: RootState) => state.profile.profile?.gameSave ?? null);
  const [saveGameSave] = useSaveGameSaveMutation();

  const persistSettings = useCallback((next: GameSettingsState, patch: Partial<GameSettingsState> = {}) => {
    if (!savedGameSave) return;
    const gameSave = structuredClone(savedGameSave);
    gameSave.worldStatus.settings = {
      ...gameSave.worldStatus.settings,
      ...next,
    };
    if (typeof patch.timeMinute === 'number') {
      gameSave.worldStatus.gameTick = tickWithMinuteOfDay(gameSave.worldStatus.gameTick ?? 0, patch.timeMinute);
    }
    saveGameSave({ gameSave, roomId: gameSave.worldStatus.roomId }).catch(() => {});
  }, [saveGameSave, savedGameSave]);

  const updateSettings = useCallback((patch: Partial<GameSettingsState>) => {
    const next: GameSettingsState = {
      ...settings,
      ...patch,
    };
    dispatch(setGameSettings(next));
    persistSettings(next, patch);
  }, [dispatch, persistSettings, settings]);

  const commandPreview = [
    `/time set ${settings.timeMinute}`,
    `/weather ${settings.weather}`,
    `/debug ${settings.physicsDebug ? 'on' : 'off'}`,
    `/pathline ${settings.pathLineEnabled ? 'on' : 'off'}`,
    `/sleep threshold ${settings.sleepThreshold.toFixed(2)}`,
    `/agent brain ${settings.agentBrainEnabled ? 'on' : 'off'}`,
  ];

  const setWeather = (weather: GameWeatherSetting) => {
    dispatch(setGameWeather(weather));
    persistSettings({ ...settings, weather }, { weather });
  };

  return (
    <div
      style={{
        minHeight: '100%',
        padding: 24,
        color: 'var(--px-text)',
        fontFamily: '"Courier New", monospace',
      }}
    >
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, color: 'var(--px-gold)', letterSpacing: 0 }}>
              游戏设置
            </h1>
            <p style={{ margin: '6px 0 0', color: 'var(--px-muted)', fontSize: 13 }}>
              这些选项会通过游戏里的 command system 应用到挂机培养场景。
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/dashboard/idle-game')}
            style={{
              border: '2px solid var(--px-border-gold)',
              borderRadius: 4,
              background: 'var(--px-surface2)',
              color: 'var(--px-gold)',
              padding: '9px 14px',
              fontWeight: 700,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            进入挂机培养
          </button>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(280px, 0.65fr)', gap: 16 }}>
          <section style={{ ...panelStyle, padding: 18 }}>
            <h2 style={{ margin: '0 0 14px', fontSize: 16 }}>世界控制</h2>

            <div style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <label htmlFor="game-time" style={{ fontWeight: 700 }}>时间</label>
                <span style={{ color: 'var(--px-gold)', fontWeight: 700 }}>{formatMinute(settings.timeMinute)}</span>
              </div>
              <input
                id="game-time"
                type="range"
                min={0}
                max={1439}
                step={15}
                value={settings.timeMinute}
                onChange={(event) => {
                  const timeMinute = Number(event.target.value);
                  dispatch(setGameTimeMinute(timeMinute));
                  updateSettings({ timeMinute });
                }}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                {quickTimes.map(item => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      dispatch(setGameTimeMinute(item.minute));
                      updateSettings({ timeMinute: item.minute });
                    }}
                    style={{
                      border: '1px solid var(--px-border)',
                      borderRadius: 4,
                      background: settings.timeMinute === item.minute ? 'rgba(255,215,0,0.14)' : 'var(--px-surface2)',
                      color: settings.timeMinute === item.minute ? 'var(--px-gold)' : 'var(--px-text)',
                      padding: '7px 10px',
                      cursor: 'pointer',
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: 22 }}>
              <div style={{ marginBottom: 10, fontWeight: 700 }}>天气</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {(['clear', 'rain'] as GameWeatherSetting[]).map(weather => (
                  <button
                    key={weather}
                    type="button"
                    onClick={() => setWeather(weather)}
                    style={{
                      minHeight: 44,
                      border: `2px solid ${settings.weather === weather ? 'var(--px-border-gold)' : 'var(--px-border)'}`,
                      borderRadius: 4,
                      background: settings.weather === weather ? 'rgba(255,215,0,0.12)' : 'var(--px-surface2)',
                      color: settings.weather === weather ? 'var(--px-gold)' : 'var(--px-text)',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {weather === 'clear' ? '晴天' : '下雨'}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: 12,
                  border: '1px solid var(--px-border)',
                  borderRadius: 4,
                  background: 'var(--px-surface2)',
                }}
              >
                <span>
                  <strong>Physics Debug</strong>
                  <span style={{ display: 'block', color: 'var(--px-muted)', fontSize: 12, marginTop: 3 }}>
                    对应 /debug on | off，显示碰撞体调试线。
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.physicsDebug}
                  onChange={(event) => {
                    const physicsDebug = event.target.checked;
                    dispatch(setGamePhysicsDebug(physicsDebug));
                    updateSettings({ physicsDebug });
                  }}
                  style={{ width: 22, height: 22 }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: 12,
                  border: '1px solid var(--px-border)',
                  borderRadius: 4,
                  background: 'var(--px-surface2)',
                }}
              >
                <span>
                  <strong>Path Lines</strong>
                  <span style={{ display: 'block', color: 'var(--px-muted)', fontSize: 12, marginTop: 3 }}>
                    对应 /pathline on | off，显示 NPC 当前寻路路线。
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.pathLineEnabled}
                  onChange={(event) => {
                    const pathLineEnabled = event.target.checked;
                    dispatch(setGamePathLineEnabled(pathLineEnabled));
                    updateSettings({ pathLineEnabled });
                  }}
                  style={{ width: 22, height: 22 }}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 14,
                  padding: 12,
                  border: '1px solid var(--px-border)',
                  borderRadius: 4,
                  background: 'var(--px-surface2)',
                }}
              >
                <span>
                  <strong>Agent Brain</strong>
                  <span style={{ display: 'block', color: 'var(--px-muted)', fontSize: 12, marginTop: 3 }}>
                    对应 /agent brain on | off，控制 NPC 自主思考、日程和需求驱动。
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={settings.agentBrainEnabled}
                  onChange={(event) => {
                    const agentBrainEnabled = event.target.checked;
                    dispatch(setGameAgentBrainEnabled(agentBrainEnabled));
                    updateSettings({ agentBrainEnabled });
                  }}
                  style={{ width: 22, height: 22 }}
                />
              </label>

              <div style={{ padding: 12, border: '1px solid var(--px-border)', borderRadius: 4, background: 'var(--px-surface2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <strong>睡眠跳过比例</strong>
                  <span style={{ color: 'var(--px-gold)' }}>{Math.round(settings.sleepThreshold * 100)}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={settings.sleepThreshold}
                  onChange={(event) => {
                    const sleepThreshold = Number(event.target.value);
                    dispatch(setGameSleepThreshold(sleepThreshold));
                    updateSettings({ sleepThreshold });
                  }}
                  style={{ width: '100%' }}
                />
              </div>
            </div>
          </section>

          <aside style={{ ...panelStyle, padding: 18 }}>
            <h2 style={{ margin: '0 0 12px', fontSize: 16 }}>Command Preview</h2>
            <div style={{ display: 'grid', gap: 8 }}>
              {commandPreview.map(command => (
                <code
                  key={command}
                  style={{
                    display: 'block',
                    padding: '9px 10px',
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
            <p style={{ color: 'var(--px-muted)', fontSize: 12, lineHeight: 1.6, marginTop: 14 }}>
              设置会保存在当前前端会话里。进入挂机培养后，场景 ready 时会自动执行这些命令。
            </p>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default GameSettings;
