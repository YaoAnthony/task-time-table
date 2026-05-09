import type { WorldMetaState, WorldState } from '../shared/worldStateTypes';

export const WORLD_STATE_SCHEMA_VERSION = 1;

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
    entities: input.entities ?? {},
    objects: input.objects ?? {},
    drops: input.drops ?? {},
    crops: input.crops ?? {},
    chickens: input.chickens ?? {},
    trees: input.trees ?? {},
    nests: input.nests ?? {},
    npcMinds: input.npcMinds ?? {},
    meta: {
      ...base.meta,
      ...(input.meta ?? {}),
      version: WORLD_STATE_SCHEMA_VERSION,
    },
  };
};
