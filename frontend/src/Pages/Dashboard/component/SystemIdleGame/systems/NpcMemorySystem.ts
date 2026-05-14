import { NPC_MEMORY_RETENTION_TICKS } from '../constants';
import { WorldStateManager } from '../shared/WorldStateManager';
import type {
  NpcIntentState,
  NpcMemoryRecord,
  NpcMindState,
  NpcRelationshipEntry,
} from '../shared/worldStateTypes';
import type {
  PerceivedCrop,
  PerceivedDrop,
  PerceivedEntity,
  PerceivedLandmark,
  PerceivedObject,
  PerceivedWater,
  PerceptionResult,
} from './WorldPerceptionSystem';

function createDefaultIntent(gameTick: number): NpcIntentState {
  return {
    kind: 'idle',
    updatedAtTick: gameTick,
    reason: 'initial_state',
  };
}

function createDefaultMindState(npcId: string, gameTick: number): NpcMindState {
  return {
    npcId,
    lastPerceivedTick: gameTick,
    lastThoughtTick: 0,
    lastPlannedTick: 0,
    pausedUntilTick: 0,
    currentIntent: createDefaultIntent(gameTick),
    recentMemories: {},
    knownLandmarks: {},
    meta: {},
  };
}

/**
 * Structured NPC memory layer.
 *
 * This system persists short-term observations in world state so perception
 * can feed local planning without relying on prompt text caches.
 */
export class NpcMemorySystem {
  constructor(
    private readonly worldStateManager: WorldStateManager,
    private readonly retentionTicks = NPC_MEMORY_RETENTION_TICKS,
  ) {}

  ensureNpcMindState(npcId: string, gameTick: number): NpcMindState {
    const existing = this.worldStateManager.getNpcMindState(npcId);
    if (existing) return existing;
    const created = createDefaultMindState(npcId, gameTick);
    this.worldStateManager.registerNpcMindState(created);
    return created;
  }

  updateFromPerception(npcId: string, perception: PerceptionResult, gameTick: number): NpcMindState {
    const current = this.ensureNpcMindState(npcId, gameTick);
    const recentMemories = { ...current.recentMemories };
    const knownLandmarks = { ...current.knownLandmarks };

    this.upsertRecords(recentMemories, perception.visibleObjects.map((entry) => this.fromObject(entry, gameTick)));
    this.upsertRecords(recentMemories, perception.visibleDrops.map((entry) => this.fromDrop(entry, gameTick)));
    this.upsertRecords(recentMemories, perception.visibleEntities.map((entry) => this.fromEntity(entry, gameTick)));
    this.upsertRecords(recentMemories, perception.visibleCrops.map((entry) => this.fromCrop(entry, gameTick)));

    const landmarkRecords = perception.landmarks.map((entry) => this.fromLandmark(entry, gameTick));
    this.upsertRecords(recentMemories, landmarkRecords);
    this.upsertRecords(knownLandmarks, landmarkRecords);

    if (perception.nearest.water) {
      const waterRecord = this.fromWater(perception.nearest.water, gameTick);
      recentMemories[waterRecord.key] = waterRecord;
      knownLandmarks[waterRecord.key] = waterRecord;
    }

    this.pruneRecords(recentMemories, gameTick);

    const next: NpcMindState = {
      ...current,
      lastPerceivedTick: gameTick,
      recentMemories,
      knownLandmarks,
    };
    this.worldStateManager.registerNpcMindState(next);
    return next;
  }

  setIntent(
    npcId: string,
    gameTick: number,
    patch: Omit<NpcIntentState, 'updatedAtTick'> & Partial<Pick<NpcIntentState, 'updatedAtTick'>>,
  ): NpcMindState {
    const current = this.ensureNpcMindState(npcId, gameTick);
    const next: NpcMindState = {
      ...current,
      currentIntent: {
        ...patch,
        updatedAtTick: patch.updatedAtTick ?? gameTick,
      },
      lastThoughtTick: gameTick,
    };
    this.worldStateManager.registerNpcMindState(next);
    return next;
  }

  /**
   * Increment relationship counters when the player chats with this NPC.
   * Familiarity grows fast in the early game then slows (sub-linear).
   */
  recordPlayerChat(npcId: string, gameTick: number, actorId = 'player'): NpcRelationshipEntry {
    const current = this.ensureNpcMindState(npcId, gameTick);
    const relationships = { ...(current.relationships ?? {}) };
    const prev = relationships[actorId] ?? { familiarity: 0, lastChatTick: 0, chatCount: 0 };
    // Sub-linear growth: +1 per chat at first, slower as familiarity climbs.
    const gain = prev.familiarity < 30 ? 2.5 : prev.familiarity < 60 ? 1.5 : 0.7;
    const next: NpcRelationshipEntry = {
      familiarity:  Math.min(100, prev.familiarity + gain),
      lastChatTick: gameTick,
      chatCount:    prev.chatCount + 1,
    };
    relationships[actorId] = next;
    this.worldStateManager.patchNpcMindState(npcId, { relationships });
    return next;
  }

  /** Read relationship for any actor (defaults to 'player'). */
  getRelationship(npcId: string, actorId = 'player'): NpcRelationshipEntry | null {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    return mind?.relationships?.[actorId] ?? null;
  }

  pauseNpc(npcId: string, untilTick: number, reason?: string): NpcMindState {
    const current = this.ensureNpcMindState(npcId, untilTick);
    const next: NpcMindState = {
      ...current,
      pausedUntilTick: Math.max(current.pausedUntilTick, untilTick),
      currentIntent: {
        ...current.currentIntent,
        kind: 'wait',
        reason: reason ?? current.currentIntent.reason,
        updatedAtTick: untilTick,
      },
    };
    this.worldStateManager.registerNpcMindState(next);
    return next;
  }

  recordActionResult(
    npcId: string,
    gameTick: number,
    input: {
      status: 'success' | 'failed';
      actionType: string;
      reason?: string;
      targetX?: number;
      targetY?: number;
      x?: number;
      y?: number;
    },
  ): NpcMindState {
    const current = this.ensureNpcMindState(npcId, gameTick);
    const key = `action:${input.actionType}:${input.status}:${gameTick}`;
    const recentMemories = {
      ...current.recentMemories,
      [key]: {
        key,
        kind: 'action' as const,
        type: input.actionType,
        label: `${input.actionType}_${input.status}`,
        x: input.targetX ?? input.x ?? 0,
        y: input.targetY ?? input.y ?? 0,
        lastSeenTick: gameTick,
        meta: {
          status: input.status,
          reason: input.reason,
          actorX: input.x,
          actorY: input.y,
          targetX: input.targetX,
          targetY: input.targetY,
        },
      },
    };
    this.pruneRecords(recentMemories, gameTick);

    const next: NpcMindState = {
      ...current,
      recentMemories,
      currentIntent: input.status === 'failed'
        ? {
            kind: 'recover',
            reason: input.reason ?? `${input.actionType}_failed`,
            targetX: input.targetX,
            targetY: input.targetY,
            updatedAtTick: gameTick,
          }
        : current.currentIntent,
      lastThoughtTick: gameTick,
    };
    this.worldStateManager.registerNpcMindState(next);
    return next;
  }

  private upsertRecords(store: Record<string, NpcMemoryRecord>, records: NpcMemoryRecord[]): void {
    records.forEach((record) => {
      store[record.key] = record;
    });
  }

  private pruneRecords(store: Record<string, NpcMemoryRecord>, gameTick: number): void {
    Object.keys(store).forEach((key) => {
      if (gameTick - store[key].lastSeenTick > this.retentionTicks) {
        delete store[key];
      }
    });
  }

  private fromObject(entry: PerceivedObject, gameTick: number): NpcMemoryRecord {
    return {
      key: `object:${entry.id}`,
      sourceId: entry.id,
      kind: 'object',
      type: entry.type,
      label: entry.type,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenTick: gameTick,
      meta: entry.meta,
    };
  }

  private fromDrop(entry: PerceivedDrop, gameTick: number): NpcMemoryRecord {
    return {
      key: `drop:${entry.id}`,
      sourceId: entry.id,
      kind: 'drop',
      type: entry.itemId,
      label: entry.itemId,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenTick: gameTick,
      meta: entry.meta,
    };
  }

  private fromEntity(entry: PerceivedEntity, gameTick: number): NpcMemoryRecord {
    return {
      key: `entity:${entry.id}`,
      sourceId: entry.id,
      kind: 'entity',
      type: entry.type,
      label: entry.displayName ?? entry.type,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenTick: gameTick,
      meta: entry.meta,
    };
  }

  private fromCrop(entry: PerceivedCrop, gameTick: number): NpcMemoryRecord {
    return {
      key: `crop:${entry.id}`,
      sourceId: entry.id,
      kind: 'crop',
      type: entry.cropId,
      label: entry.cropId,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenTick: gameTick,
      meta: {
        ...(entry.meta ?? {}),
        state: entry.state,
      },
    };
  }

  private fromLandmark(entry: PerceivedLandmark, gameTick: number): NpcMemoryRecord {
    return {
      key: `landmark:${entry.kind}:${entry.id ?? entry.label}`,
      sourceId: entry.id,
      kind: 'landmark',
      type: entry.kind,
      label: entry.label,
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenTick: gameTick,
    };
  }

  private fromWater(entry: PerceivedWater, gameTick: number): NpcMemoryRecord {
    return {
      key: `water:${entry.col}:${entry.row}`,
      kind: 'water',
      type: 'water',
      label: 'water',
      x: entry.x,
      y: entry.y,
      distance: entry.distance,
      lastSeenTick: gameTick,
      meta: {
        col: entry.col,
        row: entry.row,
      },
    };
  }
}
