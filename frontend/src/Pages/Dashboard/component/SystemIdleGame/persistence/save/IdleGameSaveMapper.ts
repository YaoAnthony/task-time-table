import type { BedSaveState, GameWorldState, NestSaveState } from '../../types';
import type { NpcMindState, NestState } from '../../shared/worldStateTypes';

export function serializeNpcMindsForSave(
  minds: NpcMindState[],
  activeNpcIds: Set<string>,
): Record<string, NpcMindState> {
  const result: Record<string, NpcMindState> = {};
  for (const mind of minds) {
    if (!activeNpcIds.has(mind.npcId)) continue;
    result[mind.npcId] = {
      ...mind,
      recentMemories: Object.fromEntries(Object.entries(mind.recentMemories ?? {}).slice(-80)),
      knownLandmarks: Object.fromEntries(Object.entries(mind.knownLandmarks ?? {}).slice(-40)),
    };
  }
  return result;
}

export function serializeWorldForSave(input: {
  beds: BedSaveState[];
  nests: NestState[];
  npcMinds: Record<string, NpcMindState>;
}): GameWorldState {
  return {
    schemaVersion: 1,
    beds: input.beds,
    nests: input.nests
      .filter((nest) => !nest.removed)
      .map<NestSaveState>((nest) => ({
        x: nest.x,
        y: nest.y,
        state: nest.state === 'has_egg' ? 'has_egg' : 'empty',
      })),
    npcMinds: input.npcMinds,
  };
}

export function normalizeGameWorldState(ws: GameWorldState | null | undefined): GameWorldState | null {
  if (!ws) return null;
  return {
    schemaVersion: 1,
    beds: Array.isArray(ws.beds) ? ws.beds : [],
    nests: Array.isArray(ws.nests) ? ws.nests : [],
    npcMinds: ws.npcMinds && typeof ws.npcMinds === 'object' ? ws.npcMinds : {},
    settings: ws.settings,
  };
}

export function restoreNpcMindsFromSave(
  ws: GameWorldState | null,
  activeNpcIds: Set<string>,
  registerMind: (mind: NpcMindState) => void,
): void {
  if (!ws?.npcMinds || typeof ws.npcMinds !== 'object') return;
  Object.values(ws.npcMinds).forEach((mind) => {
    if (mind?.npcId && activeNpcIds.has(mind.npcId)) {
      registerMind(mind);
    }
  });
}
