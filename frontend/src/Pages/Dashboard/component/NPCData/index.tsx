import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import type { RootState } from '../../../../Redux/store';
import {
  useLazyGetNpcMemoriesQuery,
  useLazyGetNpcSkillQuery,
  type NpcPersonaSkill,
} from '../../../../api/profileStateRtkApi';
import { NPC_NAME } from '../SystemIdleGame/constants';
import { getDefaultNpcSchedule } from '../SystemIdleGame/systems/NpcScheduleSystem';
import { getNpcKnowledgeSkills } from '../SystemIdleGame/shared/NpcKnowledge';
import { VILLAGE_LAYOUT } from '../SystemIdleGame/world/layouts/villageLayout';
import type {
  NpcDailyActivity,
  NpcMemoryRecord,
  NpcMindState,
} from '../SystemIdleGame/shared/worldStateTypes';

const panelStyle: React.CSSProperties = {
  border: '2px solid var(--px-border)',
  borderRadius: 6,
  background: 'var(--px-surface)',
  boxShadow: '0 4px 0 rgba(0,0,0,0.35)',
};

const chipStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  padding: '4px 8px',
  border: '1px solid var(--px-border)',
  borderRadius: 4,
  background: 'var(--px-surface2)',
  color: 'var(--px-text)',
  fontSize: 12,
  fontWeight: 700,
};

const activityLabel: Record<NpcDailyActivity, string> = {
  sleep: 'Sleep',
  breakfast: 'Breakfast',
  work_farm: 'Farm work',
  lunch: 'Lunch',
  work_forest: 'Forest work',
  dinner: 'Dinner',
  relax: 'Relax',
};

function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60).toString().padStart(2, '0');
  const m = (minute % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatTick(tick?: number): string {
  if (typeof tick !== 'number' || !Number.isFinite(tick)) return '-';
  return tick.toFixed(0);
}

function sortMemories(memories: Record<string, NpcMemoryRecord> | undefined): NpcMemoryRecord[] {
  return Object.values(memories ?? {}).sort((a, b) => b.lastSeenTick - a.lastSeenTick);
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ ...panelStyle, padding: 14 }}>
      <div style={{ color: 'var(--px-muted)', fontSize: 11, fontWeight: 700, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ marginTop: 6, color: 'var(--px-text)', fontSize: 18, fontWeight: 900 }}>
        {value}
      </div>
    </div>
  );
}

function JsonBlock({ value }: { value: unknown }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        maxHeight: 220,
        overflow: 'auto',
        border: '1px solid var(--px-border)',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.22)',
        color: 'var(--px-muted)',
        fontSize: 12,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {JSON.stringify(value ?? {}, null, 2)}
    </pre>
  );
}

function TextBlock({ text, maxHeight = 360 }: { text: string; maxHeight?: number }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        maxHeight,
        overflow: 'auto',
        border: '1px solid var(--px-border)',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.22)',
        color: 'var(--px-muted)',
        fontSize: 12,
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {text}
    </pre>
  );
}

type SkillFile = NonNullable<NpcPersonaSkill['files']>[number];

function splitSkillPath(path: string): { dir: string; name: string } {
  const parts = path.split('/');
  const name = parts.pop() ?? path;
  return {
    dir: parts.join('/') || 'root',
    name,
  };
}

function groupSkillFiles(files: SkillFile[]): Array<{ dir: string; files: SkillFile[] }> {
  const groups = new Map<string, SkillFile[]>();

  files.forEach((file) => {
    const { dir } = splitSkillPath(file.path);
    const group = groups.get(dir) ?? [];
    group.push(file);
    groups.set(dir, group);
  });

  return Array.from(groups.entries()).map(([dir, groupFiles]) => ({
    dir,
    files: [...groupFiles].sort((a, b) => a.path.localeCompare(b.path)),
  }));
}

function SkillFiles({ skill }: { skill: NpcPersonaSkill }) {
  const files = skill.files ?? [];
  const fileSignature = files.map((file) => file.path).join('|');
  const [selectedPath, setSelectedPath] = useState(files[0]?.path ?? '');

  useEffect(() => {
    setSelectedPath(files[0]?.path ?? '');
  }, [fileSignature, skill.mode, skill.npcName, skill.slug]);

  if (skill.entryType !== 'package' || files.length <= 1) {
    return <TextBlock text={skill.content} maxHeight={420} />;
  }

  const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0];
  const groups = groupSkillFiles(files);

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '260px minmax(0, 1fr)',
        gap: 12,
        minHeight: 500,
      }}
    >
      <div
        style={{
          border: '1px solid var(--px-border)',
          borderRadius: 4,
          background: 'rgba(0,0,0,0.16)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            padding: '9px 12px',
            borderBottom: '1px solid var(--px-border)',
            background: 'var(--px-surface2)',
            color: 'var(--px-muted)',
            fontSize: 11,
            fontWeight: 900,
            textTransform: 'uppercase',
          }}
        >
          Package files
        </div>
        <div style={{ display: 'grid', gap: 6, maxHeight: 500, overflow: 'auto', padding: 8 }}>
          {groups.map((group) => (
            <div key={group.dir} style={{ display: 'grid', gap: 4 }}>
              <div
                title={group.dir}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'auto minmax(0, 1fr)',
                  gap: 7,
                  alignItems: 'center',
                  padding: '6px 7px',
                  color: 'var(--px-gold)',
                  fontSize: 12,
                  fontWeight: 900,
                }}
              >
                <span>[dir]</span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {group.dir}
                </span>
              </div>
              {group.files.map((file) => {
                const { name } = splitSkillPath(file.path);
                const selected = file.path === selectedFile.path;
                return (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setSelectedPath(file.path)}
                    title={file.path}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto minmax(0, 1fr)',
                      gap: 7,
                      alignItems: 'center',
                      width: '100%',
                      padding: '7px 8px 7px 18px',
                      border: `1px solid ${selected ? 'var(--px-gold)' : 'transparent'}`,
                      borderRadius: 4,
                      background: selected ? 'rgba(255,214,10,0.12)' : 'transparent',
                      color: selected ? 'var(--px-text)' : 'var(--px-muted)',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: 12,
                      fontWeight: selected ? 900 : 700,
                      textAlign: 'left',
                    }}
                  >
                    <span>[file]</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            padding: '9px 12px',
            border: '1px solid var(--px-border)',
            borderBottom: 0,
            borderRadius: '4px 4px 0 0',
            background: 'var(--px-surface2)',
          }}
        >
          <span
            title={selectedFile.path}
            style={{
              color: 'var(--px-gold)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontWeight: 900,
            }}
          >
            {selectedFile.path}
          </span>
          {selectedFile.kind ? (
            <span style={{ ...chipStyle, padding: '2px 6px', fontSize: 10 }}>
              {selectedFile.kind}
            </span>
          ) : null}
        </div>
        <TextBlock text={selectedFile.content} maxHeight={456} />
      </div>
    </div>
  );
}

const NPCData: React.FC = () => {
  const [selectedNpc, setSelectedNpc] = useState(NPC_NAME);
  const worldState = useSelector((state: RootState) => state.profile.profile?.idleGame?.worldState ?? null);
  const npcInventories = useSelector((state: RootState) => state.game.npcInventories);
  const settings = useSelector((state: RootState) => state.game.settings);
  const [fetchNpcMemories, npcMemoryResult] = useLazyGetNpcMemoriesQuery();
  const [fetchNpcSkill, npcSkillResult] = useLazyGetNpcSkillQuery();

  const npcMinds = worldState?.npcMinds ?? {};
  const npcNames = useMemo(() => {
    return [
      NPC_NAME,
      ...VILLAGE_LAYOUT.extraNpcs.map((npc) => npc.name),
    ];
  }, []);

  useEffect(() => {
    if (!npcNames.includes(selectedNpc)) {
      setSelectedNpc(npcNames[0] ?? NPC_NAME);
    }
  }, [npcNames, selectedNpc]);

  useEffect(() => {
    if (selectedNpc) fetchNpcMemories(selectedNpc);
  }, [fetchNpcMemories, selectedNpc]);

  useEffect(() => {
    if (selectedNpc) fetchNpcSkill(selectedNpc);
  }, [fetchNpcSkill, selectedNpc]);

  const mind: NpcMindState | null = npcMinds[selectedNpc] ?? null;
  const recentMemories = sortMemories(mind?.recentMemories);
  const landmarks = sortMemories(mind?.knownLandmarks);
  const agentWorld = (mind?.meta?.agentWorld ?? null) as {
    currentPlace?: { id?: string; name?: string; type?: string; source?: string };
    position?: unknown;
    nearbyPlaces?: unknown;
    visibleObjects?: unknown;
    availableActions?: unknown;
    activeGoal?: unknown;
    recentFailures?: unknown;
  } | null;
  const inventory = npcInventories[selectedNpc] ?? {};
  const persistentMemories = npcMemoryResult.data?.memories ?? [];
  const personaSkill = npcSkillResult.data?.skill ?? null;
  const schedule = getDefaultNpcSchedule(selectedNpc);
  const knowledgeSkills = getNpcKnowledgeSkills();

  return (
    <div
      style={{
        minHeight: '100%',
        padding: 24,
        color: 'var(--px-text)',
        fontFamily: '"Courier New", monospace',
        background: 'linear-gradient(180deg, var(--px-bg), rgba(0,0,0,0.18))',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ color: 'var(--px-gold)', fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
            AGENT OBSERVABILITY
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 28, lineHeight: 1.1 }}>NPC data</h1>
        </div>
        <div style={{ ...chipStyle, color: settings.agentBrainEnabled === false ? '#ff9f9f' : '#9ff3b2' }}>
          Brain {settings.agentBrainEnabled === false ? 'OFF' : 'ON'}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 18, marginTop: 22 }}>
        <aside style={{ ...panelStyle, padding: 10, alignSelf: 'start' }}>
          <div style={{ padding: '8px 8px 12px', color: 'var(--px-muted)', fontSize: 12, fontWeight: 900 }}>
            NPC LIST
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {npcNames.map((name) => {
              const active = name === selectedNpc;
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => setSelectedNpc(name)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    textAlign: 'left',
                    border: active ? '2px solid var(--px-gold)' : '1px solid var(--px-border)',
                    borderRadius: 4,
                    background: active ? 'rgba(255,215,0,0.1)' : 'var(--px-surface2)',
                    color: active ? 'var(--px-gold)' : 'var(--px-text)',
                    fontWeight: 900,
                    cursor: 'pointer',
                  }}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </aside>

        <main style={{ display: 'grid', gap: 18, minWidth: 0 }}>
          <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }}>
            <Stat label="Intent" value={mind?.currentIntent?.kind ?? 'unknown'} />
            <Stat label="Activity" value={mind?.schedule?.currentActivity ?? 'free roam'} />
            <Stat label="Place" value={agentWorld?.currentPlace?.id ?? 'unknown'} />
            <Stat label="Server Memories" value={npcMemoryResult.isFetching ? '...' : persistentMemories.length} />
          </section>

          <section style={{ ...panelStyle, padding: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Agent State</h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 14, marginTop: 14 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <span style={chipStyle}>Last perceived: {formatTick(mind?.lastPerceivedTick)}</span>
                  <span style={chipStyle}>Last thought: {formatTick(mind?.lastThoughtTick)}</span>
                  <span style={chipStyle}>Last planned: {formatTick(mind?.lastPlannedTick)}</span>
                  <span style={chipStyle}>Paused until: {formatTick(mind?.pausedUntilTick)}</span>
                </div>
                <JsonBlock value={mind?.currentIntent ?? null} />
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ color: 'var(--px-muted)', fontSize: 12, fontWeight: 900 }}>Needs</div>
                <JsonBlock value={mind?.needs ?? null} />
              </div>
            </div>
          </section>

          <section style={{ ...panelStyle, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>World Cognition</h2>
              <span style={chipStyle}>
                {agentWorld?.currentPlace?.name ?? 'no generated map context'}
              </span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              <span style={chipStyle}>place: {agentWorld?.currentPlace?.id ?? '-'}</span>
              <span style={chipStyle}>type: {agentWorld?.currentPlace?.type ?? '-'}</span>
              <span style={chipStyle}>source: {agentWorld?.currentPlace?.source ?? '-'}</span>
              <span style={chipStyle}>local memories: {recentMemories.length}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ color: 'var(--px-muted)', fontSize: 12, fontWeight: 900 }}>Position + Goal</div>
                <JsonBlock value={{ position: agentWorld?.position ?? null, activeGoal: agentWorld?.activeGoal ?? null }} />
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ color: 'var(--px-muted)', fontSize: 12, fontWeight: 900 }}>Available Actions</div>
                <JsonBlock value={agentWorld?.availableActions ?? []} />
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ color: 'var(--px-muted)', fontSize: 12, fontWeight: 900 }}>Nearby Places</div>
                <JsonBlock value={agentWorld?.nearbyPlaces ?? []} />
              </div>
              <div style={{ display: 'grid', gap: 10 }}>
                <div style={{ color: 'var(--px-muted)', fontSize: 12, fontWeight: 900 }}>Visible Objects + Failures</div>
                <JsonBlock value={{
                  visibleObjects: agentWorld?.visibleObjects ?? [],
                  recentFailures: agentWorld?.recentFailures ?? [],
                }} />
              </div>
            </div>
          </section>

          <section style={{ ...panelStyle, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Persona Skill</h2>
              {personaSkill && (
                <span style={chipStyle}>
                  {personaSkill.metadata.name ?? personaSkill.slug} / {personaSkill.metadata.version ?? 'v1'}
                </span>
              )}
            </div>
            <div style={{ marginTop: 12 }}>
              {npcSkillResult.isFetching ? (
                <span style={{ color: 'var(--px-muted)' }}>Loading skill...</span>
              ) : !personaSkill ? (
                <span style={{ color: 'var(--px-muted)' }}>No backend persona skill found.</span>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: '260px minmax(0, 1fr)', gap: 12 }}>
                  <JsonBlock value={personaSkill.metadata} />
                  <SkillFiles skill={personaSkill} />
                </div>
              )}
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div style={{ ...panelStyle, padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Inventory</h2>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                {Object.keys(inventory).length === 0 ? (
                  <span style={{ color: 'var(--px-muted)' }}>Empty</span>
                ) : (
                  Object.entries(inventory).map(([itemId, qty]) => (
                    <span key={itemId} style={chipStyle}>{itemId} x{qty}</span>
                  ))
                )}
              </div>
            </div>

            <div style={{ ...panelStyle, padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Relationships</h2>
              <JsonBlock value={mind?.relationships ?? {}} />
            </div>
          </section>

          <section style={{ ...panelStyle, padding: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Daily Schedule</h2>
            {schedule.length === 0 ? (
              <div style={{ marginTop: 12, color: 'var(--px-muted)' }}>No fixed schedule registered for this NPC.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                {schedule.map((slot) => {
                  const active = mind?.schedule?.currentActivity === slot.activity;
                  return (
                    <div
                      key={`${slot.startMin}-${slot.activity}`}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '120px 140px 120px 1fr',
                        gap: 10,
                        padding: '10px 12px',
                        border: active ? '2px solid var(--px-gold)' : '1px solid var(--px-border)',
                        borderRadius: 4,
                        background: active ? 'rgba(255,215,0,0.08)' : 'var(--px-surface2)',
                        alignItems: 'center',
                      }}
                    >
                      <strong>{formatMinute(slot.startMin)}-{formatMinute(slot.endMin)}</strong>
                      <span>{activityLabel[slot.activity]}</span>
                      <span style={{ color: 'var(--px-muted)' }}>{slot.locationId ?? '-'}</span>
                      <span style={{ color: 'var(--px-muted)' }}>{slot.line ?? ''}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section style={{ ...panelStyle, padding: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Knowledge Skills</h2>
            <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
              {knowledgeSkills.map((skill) => (
                <div
                  key={skill.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '180px 110px 1fr',
                    gap: 10,
                    padding: '10px 12px',
                    border: '1px solid var(--px-border)',
                    borderRadius: 4,
                    background: 'var(--px-surface2)',
                    alignItems: 'start',
                  }}
                >
                  <strong>{skill.label}</strong>
                  <span style={{ ...chipStyle, justifyContent: 'center' }}>{skill.id}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ color: 'var(--px-muted)' }}>{skill.description}</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                      <span style={chipStyle}>time: {skill.requiredTime ?? 'any'}</span>
                      {skill.steps.map((step, index) => (
                        <span key={`${skill.id}-${index}`} style={chipStyle}>
                          {step.kind === 'move_to'
                            ? `move:${step.target.kind === 'named' ? step.target.place : `${step.target.x},${step.target.y}`}`
                            : `${step.action}:${step.itemId ?? 'any'}`}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div style={{ ...panelStyle, padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Structured Memories</h2>
              <div style={{ display: 'grid', gap: 8, marginTop: 12, maxHeight: 420, overflow: 'auto' }}>
                {recentMemories.length === 0 ? (
                  <span style={{ color: 'var(--px-muted)' }}>No saved structured memories yet.</span>
                ) : recentMemories.map((memory) => (
                  <div key={memory.key} style={{ padding: 10, border: '1px solid var(--px-border)', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <strong>{memory.label ?? memory.type}</strong>
                      <span style={{ color: 'var(--px-muted)' }}>tick {formatTick(memory.lastSeenTick)}</span>
                    </div>
                    <div style={{ color: 'var(--px-muted)', fontSize: 12, marginTop: 4 }}>
                      {memory.kind} / {memory.type} @ {Math.round(memory.x)}, {Math.round(memory.y)}
                    </div>
                    {memory.meta && <JsonBlock value={memory.meta} />}
                  </div>
                ))}
              </div>
            </div>

            <div style={{ ...panelStyle, padding: 16 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>Backend Conversation Memory</h2>
              <div style={{ display: 'grid', gap: 8, marginTop: 12, maxHeight: 420, overflow: 'auto' }}>
                {npcMemoryResult.isFetching ? (
                  <span style={{ color: 'var(--px-muted)' }}>Loading...</span>
                ) : persistentMemories.length === 0 ? (
                  <span style={{ color: 'var(--px-muted)' }}>No backend memories saved for this NPC.</span>
                ) : persistentMemories.slice().reverse().map((memory) => (
                  <div key={memory.id} style={{ padding: 10, border: '1px solid var(--px-border)', borderRadius: 4 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <strong>{memory.source}</strong>
                      <span style={{ color: 'var(--px-muted)' }}>tick {formatTick(memory.gameTick)}</span>
                    </div>
                    <div style={{ marginTop: 6 }}>{memory.text}</div>
                    <div style={{ color: 'var(--px-muted)', fontSize: 12, marginTop: 6 }}>
                      importance {memory.importance} / {memory.keywords?.join(', ') || 'no keywords'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section style={{ ...panelStyle, padding: 16 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Known Landmarks</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
              {landmarks.length === 0 ? (
                <span style={{ color: 'var(--px-muted)' }}>No landmarks recorded yet.</span>
              ) : landmarks.map((landmark) => (
                <span key={landmark.key} style={chipStyle}>
                  {landmark.label ?? landmark.type} ({Math.round(landmark.x)}, {Math.round(landmark.y)})
                </span>
              ))}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default NPCData;
