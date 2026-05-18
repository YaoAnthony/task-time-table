import type { WorldStateManager } from '../../shared/WorldStateManager';
import {
  LAOLI_CAT_ITEM_ID,
  LAOLI_CAT_MEMORY_SEEDS,
  LAOLI_CAT_PET_ID,
  type PetMemorySeed,
} from './PetCatalog';
import { PetBehaviorSystem } from './PetBehaviorSystem';
import { PetMemoryStore } from './PetMemoryStore';
import { PetNeedsSystem } from './PetNeedsSystem';
import type { PetView } from './PetView';
import type { PetAgentState, PetBehaviorMode, PetHomeAnchor } from './PetTypes';

export interface PetSystemOptions {
  worldStateManager: WorldStateManager;
  getCurrentMinute: () => number;
  getPlayerPosition: () => { x: number; y: number } | null;
  getOwnerPosition: (ownerNpcId: string) => { x: number; y: number } | null;
  getWorldIdAt?: (x: number, y: number) => string;
}

export interface RegisterPetInput {
  itemId?: string;
  petId?: string;
  ownerNpcId?: string;
  displayName?: string;
  memories?: PetMemorySeed[];
  home?: Partial<PetHomeAnchor>;
  behavior?: PetBehaviorMode;
  canSpeak?: boolean;
}

interface TrackedPet {
  state: PetAgentState;
  memoryStore: PetMemoryStore;
}

export class PetSystem {
  private readonly behaviorSystem = new PetBehaviorSystem();
  private readonly needsSystem = new PetNeedsSystem();
  private readonly pets = new Map<string, TrackedPet>();

  constructor(private readonly options: PetSystemOptions) {}

  registerPet(view: PetView, input: RegisterPetInput = {}): PetAgentState {
    const existingEntity = this.options.worldStateManager.getEntity(view.id);
    const existingMeta = existingEntity?.meta ?? {};
    const home: PetHomeAnchor = {
      x: typeof input.home?.x === 'number'
        ? input.home.x
        : typeof existingMeta.homeX === 'number'
          ? existingMeta.homeX
          : view.x,
      y: typeof input.home?.y === 'number'
        ? input.home.y
        : typeof existingMeta.homeY === 'number'
          ? existingMeta.homeY
          : view.y,
      worldId: input.home?.worldId
        ?? (typeof existingMeta.homeWorldId === 'string' ? existingMeta.homeWorldId : this.options.getWorldIdAt?.(view.x, view.y)),
      houseId: input.home?.houseId
        ?? (typeof existingMeta.homeHouseId === 'string' ? existingMeta.homeHouseId : undefined),
    };
    const memories = input.memories
      ?? (Array.isArray(existingMeta.memories) ? existingMeta.memories as PetMemorySeed[] : LAOLI_CAT_MEMORY_SEEDS);
    const memoryStore = new PetMemoryStore(memories);
    const state: PetAgentState = {
      id: view.id,
      petId: input.petId ?? view.petId ?? LAOLI_CAT_PET_ID,
      ownerNpcId: input.ownerNpcId ?? view.ownerNpcId ?? 'laoli',
      displayName: input.displayName ?? view.displayName,
      canSpeak: false,
      view,
      home,
      needs: {
        sleepiness: Number(existingMeta.sleepiness ?? 30),
        curiosity: Number(existingMeta.curiosity ?? 52),
        affection: Number(existingMeta.affection ?? 62),
        comfort: Number(existingMeta.comfort ?? 70),
      },
      behavior: input.behavior ?? (typeof existingEntity?.state === 'string' ? existingEntity.state as PetBehaviorMode : 'idle'),
      target: null,
      memories: memoryStore.list(),
      nextDecisionAt: 0,
      lastMemoryAtTick: Number(existingMeta.lastMemoryAtTick ?? 0),
    };

    this.pets.set(view.id, { state, memoryStore });
    view.setBehavior(state.behavior, null);
    this.syncEntity(state);
    return state;
  }

  update(dtSeconds: number, gameTick: number, timeMs: number, deltaMs: number): void {
    for (const tracked of this.pets.values()) {
      const { state, memoryStore } = tracked;
      const currentMinute = this.options.getCurrentMinute();
      this.needsSystem.update(state, dtSeconds, currentMinute);

      if (timeMs >= state.nextDecisionAt) {
        const context = {
          gameTick,
          currentMinute,
          player: this.options.getPlayerPosition(),
          owner: this.options.getOwnerPosition(state.ownerNpcId),
        };
        const decision = this.behaviorSystem.decide(state, context);
        state.behavior = decision.behavior;
        state.target = decision.target;
        state.nextDecisionAt = timeMs + decision.decisionDelayMs;
        state.view.setBehavior(decision.behavior, decision.target);
        this.rememberBehaviorCue(state, memoryStore, context);
      }

      state.view.updateMotion(deltaMs);
      this.syncEntity(state);
    }
  }

  remember(petEntityId: string, memory: PetMemorySeed): void {
    const tracked = this.pets.get(petEntityId);
    if (!tracked) return;
    tracked.memoryStore.remember(memory);
    tracked.state.memories = tracked.memoryStore.list();
    tracked.state.lastMemoryAtTick = memory.lastSeenTick ?? memory.createdAtTick ?? tracked.state.lastMemoryAtTick;
    this.syncEntity(tracked.state);
  }

  setHome(petEntityId: string, home: Partial<PetHomeAnchor>): void {
    const tracked = this.pets.get(petEntityId);
    if (!tracked) return;
    tracked.state.home = {
      ...tracked.state.home,
      ...home,
    };
    this.syncEntity(tracked.state);
  }

  getMemories(petEntityId: string): PetMemorySeed[] {
    return this.pets.get(petEntityId)?.memoryStore.list() ?? [];
  }

  private rememberBehaviorCue(
    state: PetAgentState,
    memoryStore: PetMemoryStore,
    context: { gameTick: number; owner: { x: number; y: number } | null; player: { x: number; y: number } | null },
  ): void {
    if (state.behavior === 'follow_owner' && context.owner) {
      memoryStore.remember({
        id: `${state.id}:owner_nearby`,
        kind: 'observation',
        text: '记得老李刚才在附近，靠近他会感到安心。',
        importance: 0.62,
        lastSeenTick: context.gameTick,
      });
    }
    if (state.behavior === 'approach_player' && context.player) {
      memoryStore.remember({
        id: `${state.id}:player_is_safe`,
        kind: 'observation',
        text: '记得主角靠近时没有威胁，可以短暂靠近观察。',
        importance: 0.52,
        lastSeenTick: context.gameTick,
      });
    }
    if (state.behavior === 'return_home' || state.behavior === 'sleep') {
      memoryStore.remember({
        id: `${state.id}:home_anchor`,
        kind: 'home',
        text: '记得这个位置是自己的安全落脚点。',
        importance: 0.74,
        lastSeenTick: context.gameTick,
      });
    }
    state.memories = memoryStore.list();
  }

  private syncEntity(state: PetAgentState): void {
    const meta = {
      itemId: LAOLI_CAT_ITEM_ID,
      petId: state.petId,
      ownerNpcId: state.ownerNpcId,
      canSpeak: false,
      homeX: state.home.x,
      homeY: state.home.y,
      homeWorldId: state.home.worldId,
      homeHouseId: state.home.houseId,
      sleepiness: state.needs.sleepiness,
      curiosity: state.needs.curiosity,
      affection: state.needs.affection,
      comfort: state.needs.comfort,
      lastMemoryAtTick: state.lastMemoryAtTick,
      memories: state.memories,
    };

    if (!this.options.worldStateManager.getEntity(state.id)) {
      this.options.worldStateManager.registerEntity({
        id: state.id,
        kind: 'pet',
        x: state.view.x,
        y: state.view.y,
        facing: 'down',
        displayName: state.displayName,
        state: state.behavior,
        meta,
      });
      return;
    }

    this.options.worldStateManager.updateEntityPosition(state.id, state.view.x, state.view.y);
    this.options.worldStateManager.patchEntity(state.id, {
      kind: 'pet',
      displayName: state.displayName,
      state: state.behavior,
      meta,
    });
  }
}
