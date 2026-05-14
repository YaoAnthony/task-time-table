import type { WorldMetaState, WorldState } from '../shared/worldStateTypes';

export const WORLD_STATE_SCHEMA_VERSION = 1;

function cloneStateValue<T>(value: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value)) as T;
}

function cloneStateRecord<T>(record: Record<string, T> | undefined): Record<string, T> {
  return record ? cloneStateValue(record) : {};
}

export const createInitialWorldState = (
  cols: number,
  rows: number,
  meta: Partial<WorldMetaState> = {},
): WorldState => ({
  grid: { cols, rows },
  entities: {},
  objects: {},
  drops: {},
  crops: {},
  chickens: {},
  trees: {},
  nests: {},
  npcMinds: {},
  meta: {
    tick: 0,
    dayTime: '06:00',
    version: WORLD_STATE_SCHEMA_VERSION,
    ...meta,
  },
});

export const migrateWorldState = (
  input: Partial<WorldState> | null | undefined,
  cols: number,
  rows: number,
): WorldState => {
  const base = createInitialWorldState(cols, rows);
  if (!input) return base;

  return {
    grid: {
      cols: input.grid?.cols ?? cols,
      rows: input.grid?.rows ?? rows,
    },
    entities: cloneStateRecord(input.entities),
    objects: cloneStateRecord(input.objects),
    drops: cloneStateRecord(input.drops),
    crops: cloneStateRecord(input.crops),
    chickens: cloneStateRecord(input.chickens),
    trees: cloneStateRecord(input.trees),
    nests: cloneStateRecord(input.nests),
    npcMinds: cloneStateRecord(input.npcMinds),
    meta: {
      ...base.meta,
      ...cloneStateValue(input.meta ?? {}),
      version: WORLD_STATE_SCHEMA_VERSION,
    },
  };
};
