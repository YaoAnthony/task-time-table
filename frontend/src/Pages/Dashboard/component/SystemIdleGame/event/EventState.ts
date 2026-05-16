import type { GameEventInstance, GameEventSaveState } from './EventTypes';

const HISTORY_LIMIT = 80;

export function createDefaultEventSaveState(): GameEventSaveState {
  return {
    schemaVersion: 1,
    queued: [],
    active: [],
    cooldowns: {},
    flags: {},
    history: [],
  };
}

export function normalizeEventSaveState(input: unknown): GameEventSaveState {
  const raw = input && typeof input === 'object' ? input as Partial<GameEventSaveState> : {};
  const normalizeInstances = (items: unknown): GameEventInstance[] => (
    Array.isArray(items)
      ? items
          .filter((entry): entry is GameEventInstance => (
            Boolean(entry)
            && typeof entry === 'object'
            && typeof (entry as GameEventInstance).instanceId === 'string'
            && typeof (entry as GameEventInstance).definitionId === 'string'
          ))
          .map((entry) => ({
            ...entry,
            status: entry.status === 'active' ? 'queued' : entry.status,
            triggerTick: Number.isFinite(Number(entry.triggerTick)) ? Number(entry.triggerTick) : 0,
            createdAtTick: Number.isFinite(Number(entry.createdAtTick)) ? Number(entry.createdAtTick) : 0,
            payload: entry.payload && typeof entry.payload === 'object' ? entry.payload : {},
          }))
      : []
  );

  return {
    schemaVersion: 1,
    queued: normalizeInstances(raw.queued),
    active: normalizeInstances(raw.active),
    cooldowns: raw.cooldowns && typeof raw.cooldowns === 'object' ? { ...raw.cooldowns } as Record<string, number> : {},
    flags: raw.flags && typeof raw.flags === 'object' ? { ...raw.flags } : {},
    history: Array.isArray(raw.history) ? raw.history.slice(-HISTORY_LIMIT) : [],
  };
}

export function hasPendingEvent(
  state: GameEventSaveState,
  definitionId: string,
  predicate: (event: GameEventInstance) => boolean,
): boolean {
  return [...state.queued, ...state.active].some((event) => (
    event.definitionId === definitionId && predicate(event)
  ));
}
