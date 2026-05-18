import Phaser from 'phaser';
import { gameBus } from '../shared/EventBus';
import type { NpcMindState } from '../shared/worldStateTypes';
import type { WorldStateManager } from '../shared/WorldStateManager';
import type { Npc } from '../entities/Npc';
import type { Player } from '../entities/Player';
import type { Pathfinder } from './Pathfinder';
import type { ActionExecutor, WorldContext } from './ActionExecutor';
import type { PerceptionSystem } from './WorldPerceptionSystem';
import type { AgentWorldModel } from './AgentWorldModel';
import type { DayCycle } from './DayCycle';
import { NpcMemorySystem } from './NpcMemorySystem';
import { NpcThinkSystem } from './NpcThinkSystem';
import { NpcScheduleSystem } from './NpcScheduleSystem';
import { NpcNeedsSystem } from './NpcNeedsSystem';
import { NpcGossipSystem } from './NpcGossipSystem';
import { NpcDirectorSystem } from '../ai/director/NpcDirectorSystem';
import { NpcAgentWorldContextSyncSystem } from '../ai/world/NpcAgentWorldContextSyncSystem';
import { IdleGameSystemRunner } from '../runtime/systems/IdleGameSystemRunner';

export interface NPCSystemInitOptions {
  scene: Phaser.Scene;
  primaryNpc: Npc;
  extraNpcs: Npc[];
  player: Player;
  pathfinder: Pathfinder;
  worldContext: WorldContext;
  worldStateManager: WorldStateManager;
  dayCycle: DayCycle;
  perceptionSystem: PerceptionSystem;
  actionExecutor: ActionExecutor;
  agentWorldModel: AgentWorldModel;
  getChatOpen: () => boolean;
  getPlayerPosition: () => { x: number; y: number } | null;
  isNpcLocked?: (npcId: string) => boolean;
}

export interface NPCSystemInitResult {
  memorySystem: NpcMemorySystem;
  thinkSystem: NpcThinkSystem;
  scheduleSystem: NpcScheduleSystem;
  needsSystem: NpcNeedsSystem;
  directorSystem: NpcDirectorSystem;
  gossipSystem: NpcGossipSystem;
  agentWorldContextSyncSystem: NpcAgentWorldContextSyncSystem;
}

/**
 * Owns NPC runtime wiring: actor references, memory, perception sync, needs,
 * schedule, autonomous thinking and NPC-to-NPC gossip.
 */
export class NPCSystem {
  private scene!: Phaser.Scene;
  private primaryNpc!: Npc;
  private extraNpcs: Npc[] = [];
  private worldStateManager!: WorldStateManager;
  private dayCycle!: DayCycle;
  private memorySystem!: NpcMemorySystem;
  private thinkSystem!: NpcThinkSystem;
  private scheduleSystem!: NpcScheduleSystem;
  private needsSystem!: NpcNeedsSystem;
  private directorSystem!: NpcDirectorSystem;
  private gossipSystem!: NpcGossipSystem;
  private agentWorldContextSyncSystem!: NpcAgentWorldContextSyncSystem;
  private pathfinder!: Pathfinder;
  private player!: Player;
  private worldContext!: WorldContext;
  private actionExecutor!: ActionExecutor;
  private readonly runner = new IdleGameSystemRunner();
  private unsubscribeNavigationFailed?: () => void;

  init(options: NPCSystemInitOptions): NPCSystemInitResult {
    this.scene = options.scene;
    this.primaryNpc = options.primaryNpc;
    this.extraNpcs = options.extraNpcs;
    this.worldStateManager = options.worldStateManager;
    this.dayCycle = options.dayCycle;
    this.pathfinder = options.pathfinder;
    this.player = options.player;
    this.worldContext = options.worldContext;
    this.actionExecutor = options.actionExecutor;

    this.configureActors(options);
    this.memorySystem = new NpcMemorySystem(options.worldStateManager);
    this.bindNavigationFailures();

    this.agentWorldContextSyncSystem = new NpcAgentWorldContextSyncSystem({
      worldStateManager: options.worldStateManager,
      agentWorldModel: options.agentWorldModel,
      getNpcRegistrations: () => this.getRegistrations(),
    });

    this.thinkSystem = new NpcThinkSystem({
      worldStateManager: options.worldStateManager,
      perceptionSystem: options.perceptionSystem,
      memorySystem: this.memorySystem,
      actionExecutor: options.actionExecutor,
      agentWorldModel: options.agentWorldModel,
      getNpcRegistrations: () => this.getRegistrations(),
      getChatOpen: options.getChatOpen,
      isNpcLocked: options.isNpcLocked,
    });

    this.scheduleSystem = new NpcScheduleSystem({
      worldStateManager: options.worldStateManager,
      dayCycle: options.dayCycle,
      npcMemorySystem: this.memorySystem,
      getNpcRegistrations: () => this.getRegistrations(),
      resolveNpcHome: (npcId) => (options.scene as any).findHouseEntryTarget?.(undefined, npcId) ?? null,
      isNpcLocked: options.isNpcLocked,
    });

    this.needsSystem = new NpcNeedsSystem({
      worldStateManager: options.worldStateManager,
      dayCycle: options.dayCycle,
      npcMemorySystem: this.memorySystem,
      getNpcRegistrations: () => this.getRegistrations(),
      getPlayerPosition: options.getPlayerPosition,
      isNpcLocked: options.isNpcLocked,
    });

    this.directorSystem = new NpcDirectorSystem({
      thinkSystem: this.thinkSystem,
      scheduleSystem: this.scheduleSystem,
      needsSystem: this.needsSystem,
      getNpcRegistrations: () => this.getRegistrations(),
    });

    this.runner.setSystems([
      {
        id: 'agent-world-context-sync',
        update: ({ timeMs }) => this.agentWorldContextSyncSystem.update(timeMs),
      },
      {
        id: 'npc-director',
        update: ({ dtSeconds, gameTick }) => this.directorSystem.update(dtSeconds, gameTick),
      },
    ]);

    this.gossipSystem = new NpcGossipSystem({
      scene: options.scene,
      getNpcRegistrations: () => this.getRegistrations(),
      getNpcActivity: (npcId) =>
        options.worldStateManager.getNpcMindState(npcId)?.schedule?.currentActivity ?? null,
      isEnabled: () => this.directorSystem.isEnabled(),
    });

    return {
      memorySystem: this.memorySystem,
      thinkSystem: this.thinkSystem,
      scheduleSystem: this.scheduleSystem,
      needsSystem: this.needsSystem,
      directorSystem: this.directorSystem,
      gossipSystem: this.gossipSystem,
      agentWorldContextSyncSystem: this.agentWorldContextSyncSystem,
    };
  }

  update(dtSeconds: number, gameTick: number, timeMs: number, deltaMs: number): void {
    this.updateAI(dtSeconds, gameTick, timeMs, deltaMs);
    this.updateActors(dtSeconds, gameTick);
  }

  updateAI(dtSeconds: number, gameTick: number, timeMs: number, deltaMs: number): void {
    this.runner.update({ dtSeconds, gameTick, timeMs, deltaMs });
  }

  updateActors(dtSeconds: number, gameTick: number): void {
    this.primaryNpc.update(dtSeconds, gameTick);
    for (const npc of this.extraNpcs) npc.update(dtSeconds, gameTick);
  }

  getRegistrations(): Array<{ id: string; npc: Npc }> {
    const registrations: Array<{ id: string; npc: Npc }> = [];
    if (this.primaryNpc) registrations.push({ id: this.primaryNpc.name, npc: this.primaryNpc });
    for (const npc of this.extraNpcs) registrations.push({ id: npc.name, npc });
    return registrations;
  }

  getActiveNpcIdSet(): Set<string> {
    return new Set(this.getRegistrations().map(({ id }) => id));
  }

  all(): Npc[] {
    return this.primaryNpc ? [this.primaryNpc, ...this.extraNpcs] : [...this.extraNpcs];
  }

  addNpc(npc: Npc): void {
    if (this.findByName(npc.name)) return;
    this.extraNpcs.push(npc);
    this.configureActor(npc);
    this.memorySystem?.ensureNpcMindState(npc.name, this.dayCycle?.gameTick ?? 0);
    this.syncWorldContextsNow();
  }

  findByName(name: string): Npc | null {
    if (this.primaryNpc?.name === name) return this.primaryNpc;
    return this.extraNpcs.find((npc) => npc.name === name) ?? null;
  }

  findNearest(x: number, y: number, radius: number): Npc | null {
    let best: Npc | null = null;
    let bestDistance = radius * radius;

    for (const npc of this.all()) {
      const dx = npc.sprite.x - x;
      const dy = npc.sprite.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = npc;
      }
    }

    return best;
  }

  ensureMindStates(): void {
    if (!this.memorySystem || !this.dayCycle || !this.worldStateManager) return;

    for (const { id, npc } of this.getRegistrations()) {
      const mind = this.memorySystem.ensureNpcMindState(id, this.dayCycle.gameTick);
      this.worldStateManager.patchNpcMindState(id, {
        meta: {
          ...(mind.meta ?? {}),
          displayName: id,
          spawnX: npc.sprite.x,
          spawnY: npc.sprite.y,
        },
      });
    }
  }

  syncWorldContextsNow(): void {
    this.agentWorldContextSyncSystem?.syncNow();
  }

  getMindState(npcId: string): NpcMindState | null {
    return this.directorSystem?.getMindState(npcId) ?? null;
  }

  setBrainEnabled(enabled: boolean): void {
    this.directorSystem?.setEnabled(enabled);
  }

  isBrainEnabled(): boolean {
    return this.directorSystem?.isEnabled() ?? true;
  }

  destroy(): void {
    this.unsubscribeNavigationFailed?.();
    this.unsubscribeNavigationFailed = undefined;
    this.runner.clear();
  }

  private configureActors(options: NPCSystemInitOptions): void {
    options.actionExecutor.setWorld(options.worldContext);

    for (const npc of this.all()) {
      this.configureActor(npc);
    }
  }

  private configureActor(npc: Npc): void {
    npc.setPathfinder(this.pathfinder);
    npc.setPlayerRef(this.player.sprite);
    npc.setWorldContext(this.worldContext);
    this.actionExecutor.setWorld(this.worldContext);
  }

  private bindNavigationFailures(): void {
    this.unsubscribeNavigationFailed?.();
    this.unsubscribeNavigationFailed = gameBus.on('npc:navigation_failed', (event) => {
      this.memorySystem.recordActionResult(event.npcName, this.dayCycle?.gameTick ?? 0, {
        status: 'failed',
        actionType: 'move',
        reason: event.reason,
        x: event.x,
        y: event.y,
        worldId: event.targetWorldId ?? event.worldId,
        targetX: event.targetX,
        targetY: event.targetY,
      });
    });

    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }
}
