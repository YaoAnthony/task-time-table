import type { GameSaveV1 } from '../persistence/save/GameSaveTypes';

export const NPC_CATALOG_VERSION = 2;
export const STARTER_NPC_ID = 'laoli';

export interface GameNpcDefinition {
  id: string;
  name: string;
  role: 'starter' | 'farmer' | 'carpenter' | 'merchant' | 'scholar' | 'rancher';
  title: string;
  description: string;
  price: number;
  ownedByDefault?: boolean;
  spawn: { x: number; y: number };
  tint: number;
}

export const GAME_NPC_CATALOG: GameNpcDefinition[] = [
  {
    id: 'laoli',
    name: '老李',
    role: 'starter',
    title: '村口老手',
    description: '最早陪玩家熟悉村子的老朋友。',
    price: 0,
    ownedByDefault: true,
    spawn: { x: 384, y: 760 },
    tint: 0x88ffaa,
  },
  {
    id: 'farmer_tian_xiaohe',
    name: '田小禾',
    role: 'farmer',
    title: '农夫',
    description: '会种田、浇水、收菜。',
    price: 450,
    spawn: { x: 340, y: 500 },
    tint: 0x91d76f,
  },
  {
    id: 'carpenter_liang_musheng',
    name: '梁木生',
    role: 'carpenter',
    title: '木匠',
    description: '会砍树、修家具、造桥。',
    price: 650,
    spawn: { x: 520, y: 520 },
    tint: 0xc8915f,
  },
  {
    id: 'merchant_su_ling',
    name: '苏铃',
    role: 'merchant',
    title: '商人',
    description: '会定时刷新商品和处理交易。',
    price: 800,
    spawn: { x: 760, y: 430 },
    tint: 0xffc85a,
  },
  {
    id: 'scholar_ji_wenqiu',
    name: '纪闻秋',
    role: 'scholar',
    title: '学者',
    description: '会总结记忆、任务和世界事件。',
    price: 900,
    spawn: { x: 900, y: 520 },
    tint: 0x9bb7ff,
  },
  {
    id: 'rancher_mu_aqing',
    name: '牧阿青',
    role: 'rancher',
    title: '牧场工',
    description: '会照顾鸡、捡蛋、喂水。',
    price: 700,
    spawn: { x: 1240, y: 820 },
    tint: 0xffb3c7,
  },
];

export function getDefaultUnlockedNpcIds(): string[] {
  return GAME_NPC_CATALOG.filter(npc => npc.ownedByDefault).map(npc => npc.id);
}

export function normalizeUnlockedNpcIds(input?: string[] | null): string[] {
  const known = new Set(GAME_NPC_CATALOG.map(npc => npc.id));
  const result = new Set(getDefaultUnlockedNpcIds());
  if (Array.isArray(input)) {
    input.forEach(id => {
      if (known.has(id)) result.add(id);
    });
  }
  return [...result];
}

export function getNpcDefinitionById(id: string): GameNpcDefinition | null {
  return GAME_NPC_CATALOG.find(npc => npc.id === id) ?? null;
}

export function getNpcDefinitionsForSave(save?: GameSaveV1 | null): GameNpcDefinition[] {
  const unlocked = normalizeUnlockedNpcIds(save?.worldStatus?.unlockedNpcs);
  return unlocked
    .map(getNpcDefinitionById)
    .filter((npc): npc is GameNpcDefinition => Boolean(npc));
}
