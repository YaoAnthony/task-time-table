import React, { useEffect, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import 'github-markdown-css/github-markdown-light.css';
import type { RootState } from '../../../../Redux/store';
import {
  useLazyGetNpcMemoriesQuery,
  useLazyGetNpcSkillQuery,
  type NpcPersonaSkill,
} from '../../../../api/profileStateRtkApi';
import {
  GAME_NPC_CATALOG,
  STARTER_NPC_ID,
  getNpcDefinitionsForSave,
} from '../SystemIdleGame/shared/GameNpcCatalog';
import { getDefaultNpcSchedule } from '../SystemIdleGame/systems/NpcScheduleSystem';
import { getNpcKnowledgeSkills, type NpcKnowledgeSkill } from '../SystemIdleGame/shared/NpcKnowledge';
import type {
  NpcDailyActivity,
  NpcMemoryRecord,
  NpcMindState,
} from '../SystemIdleGame/shared/worldStateTypes';

type TabId = 'overview' | 'memory' | 'persona' | 'work' | 'navigation' | 'debug';

const STARTER_NPC_NAME = GAME_NPC_CATALOG.find((npc) => npc.id === STARTER_NPC_ID)?.name ?? '老李';

const activityLabel: Record<NpcDailyActivity, string> = {
  sleep: 'Sleep',
  breakfast: 'Breakfast',
  work_farm: 'Farm work',
  lunch: 'Lunch',
  work_forest: 'Forest work',
  dinner: 'Dinner',
  relax: 'Relax',
};

const roleLabel: Record<string, string> = {
  starter: '初始伙伴',
  farmer: '农夫',
  carpenter: '木匠',
  merchant: '商人',
  scholar: '学者',
  rancher: '牧场工',
};

const roleWork: Record<string, string[]> = {
  starter: ['聊天', '基础协作', '村庄引导'],
  farmer: ['种田', '浇水', '收菜'],
  carpenter: ['砍树', '修家具', '造桥'],
  merchant: ['刷新商品', '交易', '记价格'],
  scholar: ['总结记忆', '整理任务', '记录事件'],
  rancher: ['照顾鸡', '捡蛋', '喂水'],
};

const roleWorkSkillAllowList: Record<string, (skill: NpcKnowledgeSkill) => boolean> = {
  starter: () => true,
  farmer: (skill) => skill.id.startsWith('farm_'),
  rancher: (skill) => skill.id === 'farm_water_day' || skill.id === 'farm_harvest_day',
};

const tabs: Array<{ id: TabId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'memory', label: 'Memory' },
  { id: 'persona', label: '设定' },
  { id: 'work', label: 'Work Skill' },
  { id: 'navigation', label: 'Navigation' },
  { id: 'debug', label: 'Debug' },
];

const panelStyle: React.CSSProperties = {
  border: '1px solid var(--px-border)',
  borderRadius: 6,
  background: 'var(--px-surface)',
  boxShadow: '0 3px 0 rgba(0,0,0,0.22)',
};

const subtlePanelStyle: React.CSSProperties = {
  border: '1px solid var(--px-border)',
  borderRadius: 4,
  background: 'var(--px-surface2)',
};

function formatTick(tick?: number): string {
  if (typeof tick !== 'number' || !Number.isFinite(tick)) return '-';
  return tick.toFixed(0);
}

function formatMinute(minute: number): string {
  const h = Math.floor(minute / 60).toString().padStart(2, '0');
  const m = (minute % 60).toString().padStart(2, '0');
  return `${h}:${m}`;
}

function sortMemories(memories: Record<string, NpcMemoryRecord> | undefined): NpcMemoryRecord[] {
  return Object.values(memories ?? {}).sort((a, b) => b.lastSeenTick - a.lastSeenTick);
}

function compactCount(value: unknown): number {
  if (Array.isArray(value)) return value.length;
  if (value && typeof value === 'object') return Object.keys(value).length;
  return 0;
}

function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
  const color = tone === 'good' ? '#4f9f65' : tone === 'warn' ? '#b57614' : 'var(--px-muted)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        minHeight: 24,
        padding: '3px 8px',
        border: '1px solid var(--px-border)',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.48)',
        color,
        fontSize: 12,
        fontWeight: 800,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ ...subtlePanelStyle, padding: 12, minWidth: 0 }}>
      <div style={{ color: 'var(--px-muted)', fontSize: 11, fontWeight: 900, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div
        style={{
          marginTop: 6,
          color: 'var(--px-text)',
          fontSize: 17,
          fontWeight: 900,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={typeof value === 'string' ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section style={{ ...panelStyle, padding: 16, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: 16, lineHeight: 1.2 }}>{title}</h2>
        {action}
      </div>
      <div style={{ marginTop: 12 }}>{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div
      style={{
        padding: '16px 14px',
        border: '1px dashed var(--px-border)',
        borderRadius: 4,
        color: 'var(--px-muted)',
        background: 'rgba(255,255,255,0.36)',
      }}
    >
      {text}
    </div>
  );
}

function JsonBlock({ value, maxHeight = 220 }: { value: unknown; maxHeight?: number }) {
  return (
    <pre
      style={{
        margin: 0,
        padding: 12,
        maxHeight,
        overflow: 'auto',
        border: '1px solid var(--px-border)',
        borderRadius: 4,
        background: 'rgba(0,0,0,0.08)',
        color: 'var(--px-muted)',
        fontSize: 12,
        lineHeight: 1.45,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
      }}
    >
      {JSON.stringify(value ?? null, null, 2)}
    </pre>
  );
}

function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '').trimStart();
}

function MarkdownBlock({ text, maxHeight = 520 }: { text: string; maxHeight?: number }) {
  return (
    <article
      className="markdown-body"
      style={{
        padding: 18,
        maxHeight,
        overflow: 'auto',
        border: '1px solid var(--px-border)',
        borderRadius: 4,
        background: 'rgba(255,255,255,0.72)',
        color: 'var(--px-text)',
        fontFamily: '"Courier New", monospace',
        fontSize: 13,
        lineHeight: 1.55,
        boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.45)',
      }}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
        {text}
      </ReactMarkdown>
    </article>
  );
}

function splitSkillPath(path: string): { dir: string; name: string } {
  const parts = path.split('/');
  const name = parts.pop() ?? path;
  return { dir: parts.join('/') || 'root', name };
}

function SkillFiles({ skill }: { skill: NpcPersonaSkill }) {
  const files = skill.files ?? [];
  const fileSignature = files.map((file) => file.path).join('|');
  const [selectedPath, setSelectedPath] = useState(files[0]?.path ?? '');

  useEffect(() => {
    setSelectedPath(files[0]?.path ?? '');
  }, [fileSignature, skill.mode, skill.npcName, skill.slug]);

  if (skill.entryType !== 'package' || files.length <= 1) {
    return <MarkdownBlock text={skill.body || stripFrontmatter(skill.content)} maxHeight={520} />;
  }

  const selectedFile = files.find((file) => file.path === selectedPath) ?? files[0];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 12, minWidth: 0 }}>
      <div style={{ ...subtlePanelStyle, padding: 8, display: 'grid', gap: 6, alignSelf: 'start' }}>
        {files.map((file) => {
          const { name } = splitSkillPath(file.path);
          const selected = file.path === selectedFile.path;
          return (
            <button
              key={file.path}
              type="button"
              onClick={() => setSelectedPath(file.path)}
              title={file.path}
              style={{
                display: 'block',
                width: '100%',
                padding: '8px 9px',
                border: selected ? '1px solid var(--px-gold)' : '1px solid transparent',
                borderRadius: 4,
                background: selected ? 'rgba(255,214,10,0.12)' : 'transparent',
                color: selected ? 'var(--px-gold)' : 'var(--px-text)',
                cursor: 'pointer',
                fontFamily: 'inherit',
                fontWeight: 900,
                textAlign: 'left',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            marginBottom: 8,
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            color: 'var(--px-muted)',
            fontSize: 12,
            fontWeight: 900,
          }}
        >
          <span>{selectedFile.path}</span>
          {selectedFile.kind ? <Chip>{selectedFile.kind}</Chip> : null}
        </div>
        <MarkdownBlock text={stripFrontmatter(selectedFile.content)} maxHeight={520} />
      </div>
    </div>
  );
}

function isNavigationSkill(skill: NpcKnowledgeSkill): boolean {
  return skill.steps.length > 0 && skill.steps.every((step) => step.kind === 'move_to');
}

function KnowledgeSkillList({
  skills,
  emptyText,
  showSteps = true,
}: {
  skills: NpcKnowledgeSkill[];
  emptyText: string;
  showSteps?: boolean;
}) {
  if (skills.length === 0) return <Empty text={emptyText} />;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {skills.map((skill) => (
        <div key={skill.id} style={{ ...subtlePanelStyle, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
            <strong>{skill.label}</strong>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 6 }}>
              <Chip>{skill.id}</Chip>
              <Chip>{skill.requiredTime ?? 'any'}</Chip>
            </div>
          </div>
          <div style={{ marginTop: 6, color: 'var(--px-muted)', lineHeight: 1.45 }}>
            {skill.description}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
            {skill.triggers.map((trigger) => <Chip key={trigger}>{trigger}</Chip>)}
          </div>
          {showSteps ? (
            <div style={{ marginTop: 8 }}>
              <JsonBlock value={skill.steps} maxHeight={150} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function MemoryList({ memories }: { memories: NpcMemoryRecord[] }) {
  if (memories.length === 0) return <Empty text="这个 NPC 还没有结构化记忆。" />;

  return (
    <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto', paddingRight: 4 }}>
      {memories.map((memory) => (
        <article key={memory.key} style={{ ...subtlePanelStyle, padding: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <strong style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {memory.label ?? memory.type}
            </strong>
            <span style={{ color: 'var(--px-muted)', whiteSpace: 'nowrap' }}>tick {formatTick(memory.lastSeenTick)}</span>
          </div>
          <div style={{ color: 'var(--px-muted)', fontSize: 12, marginTop: 4 }}>
            {memory.kind} / {memory.type} @ {Math.round(memory.x)}, {Math.round(memory.y)}
          </div>
          {memory.meta ? <div style={{ marginTop: 8 }}><JsonBlock value={memory.meta} maxHeight={120} /></div> : null}
        </article>
      ))}
    </div>
  );
}

function ScheduleList({
  schedule,
  currentActivity,
}: {
  schedule: ReturnType<typeof getDefaultNpcSchedule>;
  currentActivity?: NpcDailyActivity | null;
}) {
  if (schedule.length === 0) return <Empty text="这个 NPC 暂时没有固定日程。" />;

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {schedule.map((slot) => {
        const active = currentActivity === slot.activity;
        return (
          <div
            key={`${slot.startMin}-${slot.activity}`}
            style={{
              display: 'grid',
              gridTemplateColumns: '96px 120px minmax(0, 1fr)',
              gap: 10,
              alignItems: 'center',
              padding: '9px 10px',
              border: active ? '1px solid var(--px-gold)' : '1px solid var(--px-border)',
              borderRadius: 4,
              background: active ? 'rgba(255,214,10,0.12)' : 'var(--px-surface2)',
            }}
          >
            <strong>{formatMinute(slot.startMin)}</strong>
            <span>{activityLabel[slot.activity]}</span>
            <span style={{ color: 'var(--px-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {slot.locationId ?? '-'}{slot.line ? ` · ${slot.line}` : ''}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const NPCData: React.FC = () => {
  const [selectedNpc, setSelectedNpc] = useState(STARTER_NPC_NAME);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const profile = useSelector((state: RootState) => state.profile.profile);
  const savedGameSave = profile?.gameSave ?? null;
  const worldState =
    savedGameSave?.worldStatus?.entities?.worldState
    ?? profile?.idleGame?.worldState
    ?? null;
  const npcInventories = useSelector((state: RootState) => state.game.npcInventories);
  const settings = useSelector((state: RootState) => state.game.settings);
  const [fetchNpcMemories, npcMemoryResult] = useLazyGetNpcMemoriesQuery();
  const [fetchNpcSkill, npcSkillResult] = useLazyGetNpcSkillQuery();

  const unlockedNpcDefinitions = useMemo(() => getNpcDefinitionsForSave(savedGameSave), [savedGameSave]);
  const unlockedNpcNames = useMemo(() => unlockedNpcDefinitions.map((npc) => npc.name), [unlockedNpcDefinitions]);
  const lockedCount = Math.max(0, GAME_NPC_CATALOG.length - unlockedNpcDefinitions.length);

  useEffect(() => {
    if (!unlockedNpcNames.includes(selectedNpc)) {
      setSelectedNpc(unlockedNpcNames[0] ?? STARTER_NPC_NAME);
    }
  }, [selectedNpc, unlockedNpcNames]);

  useEffect(() => {
    if (!unlockedNpcNames.includes(selectedNpc)) return;
    fetchNpcMemories(selectedNpc);
    fetchNpcSkill(selectedNpc);
  }, [fetchNpcMemories, fetchNpcSkill, selectedNpc, unlockedNpcNames]);

  const selectedDefinition = unlockedNpcDefinitions.find((npc) => npc.name === selectedNpc) ?? unlockedNpcDefinitions[0] ?? null;
  const selectedName = selectedDefinition?.name ?? selectedNpc;
  const savedNpc = savedGameSave?.worldStatus?.npcs?.[selectedName] ?? null;
  const npcMinds = worldState?.npcMinds ?? {};
  const mind: NpcMindState | null = savedNpc?.mind ?? npcMinds[selectedName] ?? null;
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
  const inventory = savedNpc?.inventory ?? npcInventories[selectedName] ?? {};
  const persistentMemories = npcMemoryResult.data?.memories ?? [];
  const personaSkill = npcSkillResult.data?.skill ?? null;
  const schedule = getDefaultNpcSchedule(selectedName);
  const allKnowledgeSkills = getNpcKnowledgeSkills();
  const workSkillFilter = selectedDefinition ? roleWorkSkillAllowList[selectedDefinition.role] : null;
  const navigationSkills = allKnowledgeSkills.filter(isNavigationSkill);
  const workSkills = allKnowledgeSkills
    .filter((skill) => !isNavigationSkill(skill))
    .filter((skill) => workSkillFilter?.(skill) ?? false);
  const activePlace = agentWorld?.currentPlace?.name ?? agentWorld?.currentPlace?.id ?? '未知';
  const currentIntent = mind?.currentIntent?.kind ?? 'idle';
  const currentActivity = mind?.schedule?.currentActivity ?? null;

  if (!selectedDefinition) {
    return (
      <div style={{ minHeight: '100%', padding: 24, fontFamily: '"Courier New", monospace' }}>
        <Section title="NPC data">
          <Empty text="还没有已解锁 NPC。在游戏里的 NPC 商店招募后，这里才会显示数据。" />
        </Section>
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: '100%',
        padding: 24,
        color: 'var(--px-text)',
        fontFamily: '"Courier New", monospace',
        background: 'linear-gradient(180deg, var(--px-bg), rgba(0,0,0,0.08))',
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16 }}>
        <div>
          <div style={{ color: 'var(--px-gold)', fontSize: 12, fontWeight: 900, letterSpacing: 1 }}>
            AGENT OBSERVABILITY
          </div>
          <h1 style={{ margin: '6px 0 0', fontSize: 26, lineHeight: 1.1 }}>NPC data</h1>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
          <Chip tone={settings.agentBrainEnabled === false ? 'warn' : 'good'}>
            Brain {settings.agentBrainEnabled === false ? 'OFF' : 'ON'}
          </Chip>
          <Chip>{unlockedNpcDefinitions.length} unlocked</Chip>
          {lockedCount > 0 ? <Chip tone="warn">{lockedCount} locked</Chip> : null}
        </div>
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '260px minmax(0, 1fr)',
          gap: 18,
          marginTop: 22,
          alignItems: 'start',
        }}
      >
        <aside style={{ ...panelStyle, padding: 12, position: 'sticky', top: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
            <strong style={{ fontSize: 13 }}>已解锁 NPC</strong>
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {unlockedNpcDefinitions.map((npc) => {
              const active = npc.name === selectedName;
              const npcMind = savedGameSave?.worldStatus?.npcs?.[npc.name]?.mind ?? npcMinds[npc.name] ?? null;
              return (
                <button
                  key={npc.id}
                  type="button"
                  onClick={() => setSelectedNpc(npc.name)}
                  style={{
                    display: 'grid',
                    gap: 4,
                    width: '100%',
                    padding: '11px 12px',
                    textAlign: 'left',
                    border: active ? '2px solid var(--px-gold)' : '1px solid var(--px-border)',
                    borderRadius: 4,
                    background: active ? 'rgba(255,214,10,0.13)' : 'var(--px-surface2)',
                    color: active ? 'var(--px-gold)' : 'var(--px-text)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <strong style={{ fontSize: 14 }}>{npc.name}</strong>
                  <span style={{ color: 'var(--px-muted)', fontSize: 12 }}>
                    {roleLabel[npc.role] ?? npc.title} · {npcMind?.schedule?.currentActivity ?? 'no activity'}
                  </span>
                </button>
              );
            })}
          </div>
          {lockedCount > 0 ? (
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--px-border)' }}>
              <div style={{ color: 'var(--px-muted)', fontSize: 12, lineHeight: 1.5 }}>
                未解锁 NPC 不在这里暴露 memory、skill 或 debug data。
              </div>
            </div>
          ) : null}
        </aside>

        <main style={{ display: 'grid', gap: 14, minWidth: 0 }}>
          <section style={{ ...panelStyle, padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', gap: 16 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <h2 style={{ margin: 0, fontSize: 24, lineHeight: 1.15 }}>{selectedName}</h2>
                  <Chip>{roleLabel[selectedDefinition.role] ?? selectedDefinition.title}</Chip>
                </div>
                <p style={{ margin: '10px 0 0', color: 'var(--px-muted)', lineHeight: 1.55 }}>
                  {selectedDefinition.description}
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                  {(roleWork[selectedDefinition.role] ?? []).map((item) => <Chip key={item}>{item}</Chip>)}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 148px)', gap: 8 }}>
                <Metric label="Intent" value={currentIntent} />
                <Metric label="Activity" value={currentActivity ?? 'free'} />
                <Metric label="Place" value={activePlace} />
                <Metric label="Memory" value={npcMemoryResult.isFetching ? '...' : persistentMemories.length} />
              </div>
            </div>
          </section>

          <nav
            style={{
              display: 'flex',
              gap: 8,
              padding: 6,
              border: '1px solid var(--px-border)',
              borderRadius: 6,
              background: 'var(--px-surface)',
              overflowX: 'auto',
            }}
          >
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    minWidth: 104,
                    padding: '9px 12px',
                    border: active ? '1px solid var(--px-gold)' : '1px solid transparent',
                    borderRadius: 4,
                    background: active ? 'rgba(255,214,10,0.12)' : 'transparent',
                    color: active ? 'var(--px-gold)' : 'var(--px-text)',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    fontWeight: 900,
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>

          {activeTab === 'overview' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Section title="Current State">
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Chip>last perceived: {formatTick(mind?.lastPerceivedTick)}</Chip>
                    <Chip>last thought: {formatTick(mind?.lastThoughtTick)}</Chip>
                    <Chip>last planned: {formatTick(mind?.lastPlannedTick)}</Chip>
                    <Chip>paused: {formatTick(mind?.pausedUntilTick)}</Chip>
                  </div>
                  <div style={{ ...subtlePanelStyle, padding: 12 }}>
                    <div style={{ color: 'var(--px-muted)', fontSize: 12, fontWeight: 900 }}>Current intent</div>
                    <div style={{ marginTop: 6, fontWeight: 900 }}>{currentIntent}</div>
                    <div style={{ marginTop: 6, color: 'var(--px-muted)' }}>
                      {typeof mind?.currentIntent?.reason === 'string' ? mind.currentIntent.reason : 'no reason recorded'}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                    <Metric label="Energy" value={Math.round(mind?.needs?.energy ?? 0)} />
                    <Metric label="Hunger" value={Math.round(mind?.needs?.hunger ?? 0)} />
                    <Metric label="Social" value={Math.round(mind?.needs?.social ?? 0)} />
                  </div>
                </div>
              </Section>

              <Section title="World Awareness">
                <div style={{ display: 'grid', gap: 10 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <Metric label="Visible Objects" value={compactCount(agentWorld?.visibleObjects)} />
                    <Metric label="Nearby Places" value={compactCount(agentWorld?.nearbyPlaces)} />
                    <Metric label="Actions" value={compactCount(agentWorld?.availableActions)} />
                    <Metric label="Failures" value={compactCount(agentWorld?.recentFailures)} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Chip>place: {agentWorld?.currentPlace?.id ?? '-'}</Chip>
                    <Chip>type: {agentWorld?.currentPlace?.type ?? '-'}</Chip>
                    <Chip>source: {agentWorld?.currentPlace?.source ?? '-'}</Chip>
                  </div>
                </div>
              </Section>

              <Section title="Inventory">
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.keys(inventory).length === 0 ? (
                    <Empty text="背包为空。" />
                  ) : (
                    Object.entries(inventory).map(([itemId, qty]) => (
                      <Chip key={itemId}>{itemId} x{qty}</Chip>
                    ))
                  )}
                </div>
              </Section>

              <Section title="Daily Schedule">
                <ScheduleList schedule={schedule} currentActivity={currentActivity} />
              </Section>
            </div>
          ) : null}

          {activeTab === 'memory' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Section title="Structured Memories" action={<Chip>{recentMemories.length}</Chip>}>
                <MemoryList memories={recentMemories} />
              </Section>
              <Section title="Backend Conversation Memory" action={<Chip>{persistentMemories.length}</Chip>}>
                {npcMemoryResult.isFetching ? (
                  <Empty text="正在读取后端记忆..." />
                ) : persistentMemories.length === 0 ? (
                  <Empty text="这个 NPC 还没有对话记忆。" />
                ) : (
                  <div style={{ display: 'grid', gap: 8, maxHeight: 420, overflow: 'auto', paddingRight: 4 }}>
                    {persistentMemories.slice().reverse().map((memory) => (
                      <article key={memory.id} style={{ ...subtlePanelStyle, padding: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                          <strong>{memory.source}</strong>
                          <span style={{ color: 'var(--px-muted)' }}>tick {formatTick(memory.gameTick)}</span>
                        </div>
                        <div style={{ marginTop: 6, lineHeight: 1.45 }}>{memory.text}</div>
                        <div style={{ color: 'var(--px-muted)', fontSize: 12, marginTop: 6 }}>
                          importance {memory.importance} / {memory.keywords?.join(', ') || 'no keywords'}
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </Section>
              <Section title="Known Landmarks" action={<Chip>{landmarks.length}</Chip>}>
                {landmarks.length === 0 ? (
                  <Empty text="还没有地标记忆。" />
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {landmarks.map((landmark) => (
                      <Chip key={landmark.key}>
                        {landmark.label ?? landmark.type} ({Math.round(landmark.x)}, {Math.round(landmark.y)})
                      </Chip>
                    ))}
                  </div>
                )}
              </Section>
              <Section title="Relationships">
                <JsonBlock value={mind?.relationships ?? {}} maxHeight={220} />
              </Section>
            </div>
          ) : null}

          {activeTab === 'persona' ? (
            <div style={{ display: 'grid', gap: 14 }}>
              <Section
                title="设定"
                action={personaSkill ? <Chip>{personaSkill.metadata.version ?? 'v1'}</Chip> : undefined}
              >
                {npcSkillResult.isFetching ? (
                  <Empty text="正在读取 NPC 设定..." />
                ) : !personaSkill ? (
                  <Empty text="后端没有返回这个 NPC 的设定文件。" />
                ) : (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      <Chip>name: {personaSkill.metadata.name ?? personaSkill.npcName}</Chip>
                      <Chip>role: {personaSkill.metadata.role ?? selectedDefinition.role}</Chip>
                      <Chip>entry: {personaSkill.filename}</Chip>
                    </div>
                    <SkillFiles skill={personaSkill} />
                  </div>
                )}
              </Section>
            </div>
          ) : null}

          {activeTab === 'work' ? (
            <Section title="Work Skill" action={<Chip>{workSkills.length}</Chip>}>
              <KnowledgeSkillList
                skills={workSkills}
                emptyText="这个职业暂时没有接入可执行的工作 skill。"
              />
            </Section>
          ) : null}

          {activeTab === 'navigation' ? (
            <Section title="Navigation" action={<Chip>{navigationSkills.length}</Chip>}>
              <KnowledgeSkillList
                skills={navigationSkills}
                emptyText="暂时没有接入导航 skill。"
              />
            </Section>
          ) : null}

          {activeTab === 'debug' ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Section title="Saved NPC">
                <JsonBlock value={savedNpc} maxHeight={360} />
              </Section>
              <Section title="Mind">
                <JsonBlock value={mind} maxHeight={360} />
              </Section>
              <Section title="Agent World">
                <JsonBlock value={agentWorld} maxHeight={360} />
              </Section>
              <Section title="Inventory Raw">
                <JsonBlock value={inventory} maxHeight={360} />
              </Section>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
};

export default NPCData;
