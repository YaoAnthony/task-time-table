import { GAME_MINS_PER_SEC, MINS_PER_DAY, NPC_AUTONOMOUS_PAUSE_SECONDS, NPC_AUTONOMOUS_THINK_INTERVAL } from '../constants';
import type { NpcAction } from '../types';
import type { Npc } from '../entities/Npc';
import { WorldStateManager } from '../shared/WorldStateManager';
import type { NpcIntentState, NpcMemoryRecord, NpcMindState } from '../shared/worldStateTypes';
import { ActionExecutor } from './ActionExecutor';
import { NpcMemorySystem } from './NpcMemorySystem';
import type { PerceptionResult } from './WorldPerceptionSystem';
import { PerceptionSystem } from './WorldPerceptionSystem';
import { canRunFreeThink, canRunScheduleDrivenThink } from './NpcBehaviorPolicy';
import type { AgentWorldContext, AgentWorldModel } from './AgentWorldModel';

interface NpcRegistration {
  id: string;
  npc: Npc;
}

interface NpcThinkOutcome {
  intent: Omit<NpcIntentState, 'updatedAtTick'>;
  actions: NpcAction[];
}

export interface NpcThinkSystemOptions {
  worldStateManager: WorldStateManager;
  perceptionSystem: PerceptionSystem;
  memorySystem: NpcMemorySystem;
  actionExecutor: ActionExecutor;
  agentWorldModel?: AgentWorldModel;
  getNpcRegistrations: () => NpcRegistration[];
  getChatOpen?: () => boolean;
  thinkIntervalSeconds?: number;
}

/**
 * Lightweight autonomous NPC think loop.
 *
 * This intentionally stays rule-based for now:
 * perceive -> structured memory update -> choose simple intent -> enqueue
 * existing NpcActions through the current ActionExecutor.
 */
export class NpcThinkSystem {
  private readonly worldStateManager: WorldStateManager;
  private readonly perceptionSystem: PerceptionSystem;
  private readonly memorySystem: NpcMemorySystem;
  private readonly actionExecutor: ActionExecutor;
  private readonly agentWorldModel?: AgentWorldModel;
  private readonly getNpcRegistrations: () => NpcRegistration[];
  private readonly getChatOpen: () => boolean;
  private readonly thinkIntervalSeconds: number;
  private readonly cooldowns = new Map<string, number>();

  constructor(options: NpcThinkSystemOptions) {
    this.worldStateManager = options.worldStateManager;
    this.perceptionSystem = options.perceptionSystem;
    this.memorySystem = options.memorySystem;
    this.actionExecutor = options.actionExecutor;
    this.agentWorldModel = options.agentWorldModel;
    this.getNpcRegistrations = options.getNpcRegistrations;
    this.getChatOpen = options.getChatOpen ?? (() => false);
    this.thinkIntervalSeconds = options.thinkIntervalSeconds ?? NPC_AUTONOMOUS_THINK_INTERVAL;
  }

  update(dtSeconds: number, gameTick: number): void {
    const registrations = this.getNpcRegistrations();
    registrations.forEach(({ id }) => {
      const cooldown = (this.cooldowns.get(id) ?? this.thinkIntervalSeconds) - dtSeconds;
      this.cooldowns.set(id, cooldown);
      this.memorySystem.ensureNpcMindState(id, gameTick);
      if (cooldown > 0) return;
      this.cooldowns.set(id, this.thinkIntervalSeconds);
      this.thinkNpc(id, gameTick, registrations);
    });
  }

  pauseNpc(npcId: string, gameTick: number, seconds = NPC_AUTONOMOUS_PAUSE_SECONDS, reason = 'conversation_pause'): void {
    const pauseTicks = Math.max(1, Math.round(seconds * GAME_MINS_PER_SEC));
    this.memorySystem.pauseNpc(npcId, gameTick + pauseTicks, reason);
  }

  getMindState(npcId: string): NpcMindState | null {
    return this.worldStateManager.getNpcMindState(npcId);
  }

  private thinkNpc(npcId: string, gameTick: number, registrations: NpcRegistration[]): void {
    const registration = registrations.find((entry) => entry.id === npcId);
    if (!registration) return;

    const { npc } = registration;
    const currentMind = this.memorySystem.ensureNpcMindState(npcId, gameTick);
    if (!this.canThink(npc, currentMind, gameTick)) return;

    const perception = this.perceptionSystem.perceiveEntity(npcId);
    const memory = this.memorySystem.updateFromPerception(npcId, perception, gameTick);
    const agentWorld = this.agentWorldModel?.buildContext(npcId, memory) ?? null;
    const outcome = this.buildOutcome(npcId, npc, perception, memory, gameTick, agentWorld);

    this.memorySystem.setIntent(npcId, gameTick, outcome.intent);
    this.worldStateManager.patchNpcMindState(npcId, {
      lastThoughtTick: gameTick,
      lastPlannedTick: outcome.actions.length > 0 ? gameTick : memory.lastPlannedTick,
      meta: {
        ...(memory.meta ?? {}),
        lastPerceptionSummary: perception.summary,
        agentWorld,
      },
    });

    if (outcome.actions.length > 0) {
      this.actionExecutor.execute(npc, outcome.actions, gameTick);
    }
  }

  private canThink(npc: Npc, mind: NpcMindState, gameTick: number): boolean {
    if (this.getChatOpen()) return false;
    if (mind.pausedUntilTick > gameTick) return false;
    if (npc.isOnDispatch()) return false;
    if (npc.isAwaitingConfirm()) return false;
    if (npc.isConversationLocked()) return false;
    if (npc.isThinking()) return false;
    if (npc.hasPlannedActions()) return false;
    if (npc.isNavigating()) return false;
    const activity = mind.schedule?.currentActivity ?? null;
    if (!canRunFreeThink(activity) && !canRunScheduleDrivenThink(activity)) return false;
    return true;
  }

  private buildOutcome(
    npcId: string,
    npc: Npc,
    perception: PerceptionResult,
    memory: NpcMindState,
    gameTick: number,
    agentWorld: AgentWorldContext | null,
  ): NpcThinkOutcome {
    if (npc.isFollowingPlayer()) {
      return {
        intent: {
          kind: 'follow_player',
          reason: 'follow_mode_enabled',
          targetId: 'player',
          targetType: 'player',
        },
        actions: [],
      };
    }

    const currentMinute = Math.floor(gameTick * GAME_MINS_PER_SEC) % MINS_PER_DAY;
    const isDaylight = currentMinute >= 480 && currentMinute < 1080;
    const hasFarmAction = agentWorld?.availableActions.some((action) => (
      action.feasible
      && ['harvest_crop', 'plant_crop', 'water_tile', 'till_tile'].includes(action.action)
    )) ?? true;
    if (isDaylight && memory.schedule?.currentActivity === 'work_farm' && hasFarmAction) {
      return {
        intent: {
          kind: 'perform_skill',
          reason: 'scheduled_farm_work',
          targetKey: 'skill:farm_sow_wheat_day',
          targetId: 'farm_sow_wheat_day',
          targetType: 'knowledge_skill',
        },
        actions: [
          {
            type: 'use_skill',
            skillId: 'farm_sow_wheat_day',
          },
        ],
      };
    }

    if (!canRunFreeThink(memory.schedule?.currentActivity ?? null)) {
      return {
        intent: {
          kind: 'wait',
          reason: `scheduled_${memory.schedule?.currentActivity ?? 'busy'}`,
        },
        actions: [],
      };
    }

    const visibleDrop = perception.visibleDrops[0];
    if (visibleDrop) {
      return {
        intent: {
          kind: 'seek_drop',
          reason: 'visible_drop_detected',
          targetKey: `drop:${visibleDrop.id}`,
          targetId: visibleDrop.id,
          targetType: visibleDrop.itemId,
          targetX: visibleDrop.x,
          targetY: visibleDrop.y,
        },
        actions: [
          {
            type: 'pickup_item',
            itemId: visibleDrop.itemId,
            target: { kind: 'coords', x: visibleDrop.x, y: visibleDrop.y },
          },
        ],
      };
    }

    const rememberedDrop = this.findFreshMemory(memory, 'drop', gameTick);
    if (rememberedDrop && !this.hasRecentFailureForTarget(memory, rememberedDrop.x, rememberedDrop.y, gameTick)) {
      return {
        intent: {
          kind: 'seek_drop',
          reason: 'remembered_drop_target',
          targetKey: rememberedDrop.key,
          targetId: rememberedDrop.sourceId,
          targetType: rememberedDrop.type,
          targetX: rememberedDrop.x,
          targetY: rememberedDrop.y,
        },
        actions: [
          {
            type: 'move',
            target: { kind: 'coords', x: rememberedDrop.x, y: rememberedDrop.y },
          },
        ],
      };
    }

    const rememberedLandmark = this.pickExploreLandmark(memory, gameTick);
    if (rememberedLandmark && !this.hasRecentFailureForTarget(memory, rememberedLandmark.x, rememberedLandmark.y, gameTick)) {
      return {
        intent: {
          kind: 'move_to_landmark',
          reason: 'known_landmark_explore',
          targetKey: rememberedLandmark.key,
          targetType: rememberedLandmark.type,
          targetX: rememberedLandmark.x,
          targetY: rememberedLandmark.y,
        },
        actions: [
          {
            type: 'move',
            target: { kind: 'coords', x: rememberedLandmark.x, y: rememberedLandmark.y },
          },
        ],
      };
    }

    const exploreTarget = this.buildExploreTarget(npcId, gameTick, perception.self.x, perception.self.y);
    return {
      intent: {
        kind: 'explore',
        reason: 'fallback_explore',
        targetX: exploreTarget.x,
        targetY: exploreTarget.y,
      },
      actions: [
        {
          type: 'move',
          target: { kind: 'coords', x: exploreTarget.x, y: exploreTarget.y },
        },
      ],
    };
  }

  private findFreshMemory(mind: NpcMindState, kind: NpcMemoryRecord['kind'], gameTick: number): NpcMemoryRecord | null {
    return Object.values(mind.recentMemories)
      .filter((record) => record.kind === kind && gameTick - record.lastSeenTick <= 120)
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))[0] ?? null;
  }

  private pickExploreLandmark(mind: NpcMindState, gameTick: number): NpcMemoryRecord | null {
    const candidates = Object.values(mind.knownLandmarks)
      .filter((record) => gameTick - record.lastSeenTick <= 600);
    if (candidates.length === 0) return null;
    return candidates[gameTick % candidates.length];
  }

  private hasRecentFailureForTarget(mind: NpcMindState, x: number, y: number, gameTick: number): boolean {
    return Object.values(mind.recentMemories).some((record) => {
      if (record.kind !== 'action' || record.meta?.status !== 'failed') return false;
      if (gameTick - record.lastSeenTick > 120) return false;
      const targetX = Number(record.meta?.targetX);
      const targetY = Number(record.meta?.targetY);
      if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) return false;
      return Math.hypot(targetX - x, targetY - y) < 48;
    });
  }

  private buildExploreTarget(npcId: string, gameTick: number, x: number, y: number): { x: number; y: number } {
    const seed = this.hash(`${npcId}:${gameTick}`);
    const angle = (seed % 360) * (Math.PI / 180);
    const radius = 48 + (seed % 72);
    return {
      x: x + Math.cos(angle) * radius,
      y: y + Math.sin(angle) * radius,
    };
  }

  private hash(input: string): number {
    let value = 0;
    for (let i = 0; i < input.length; i += 1) {
      value = ((value << 5) - value) + input.charCodeAt(i);
      value |= 0;
    }
    return Math.abs(value);
  }
}
