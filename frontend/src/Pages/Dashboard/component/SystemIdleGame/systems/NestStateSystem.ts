import type Phaser from 'phaser';
import { gameBus } from '../shared/EventBus';
import { WorldStateManager } from '../shared/WorldStateManager';
import type { NestState } from '../shared/worldStateTypes';
import { NestView } from '../entities/NestView';
import type { WorldActionDispatcher } from './WorldActionSystem';

const HATCH_DELAY_MS = 60_000;

/**
 * Owns logical nest occupancy/egg/hatching state and keeps NestView in sync.
 */
export class NestStateSystem {
  private readonly views = new Map<string, NestView>();
  private actionDispatcher: WorldActionDispatcher | null = null;

  constructor(
    _scene: Phaser.Scene,
    private readonly worldStateManager: WorldStateManager,
    private readonly onHatch: (x: number, y: number) => void,
  ) {
    void _scene;
  }

  setActionDispatcher(dispatcher: WorldActionDispatcher | null): void {
    this.actionDispatcher = dispatcher;
  }

  registerNest(view: NestView, initial: Omit<NestState, 'cellX' | 'cellY'>): void {
    const next = this.worldStateManager.registerNestState(initial);
    this.views.set(next.id, view);
    view.syncFromState(next);
  }

  update(time: number, playerX: number, playerY: number): void {
    this.worldStateManager.getNestStates().forEach((nestState) => {
      if (nestState.removed) return;
      if (nestState.state === 'has_egg' && nestState.hatchAt !== null && time >= nestState.hatchAt) {
        this.onHatch(nestState.x, nestState.y);
        this.worldStateManager.patchNestState(nestState.id, {
          state: 'empty',
          hasEgg: false,
          hatchAt: null,
          laidAt: null,
          occupiedByChickenId: null,
        });
      }
      this.syncNestView(nestState.id, playerX, playerY);
    });
  }

  occupyNest(nestId: string, chickenId: string): boolean {
    if (this.actionDispatcher) {
      return this.actionDispatcher.dispatchAction({ type: 'NEST_OCCUPY', nestId, chickenId }).ok;
    }
    return this.applyOccupyNest(nestId, chickenId);
  }

  applyOccupyNest(nestId: string, chickenId: string): boolean {
    const nestState = this.worldStateManager.getNestState(nestId);
    if (!nestState || nestState.removed || nestState.state !== 'empty') return false;
    this.worldStateManager.patchNestState(nestId, {
      state: 'occupied',
      occupiedByChickenId: chickenId,
      hasEgg: false,
      hatchAt: null,
    });
    this.syncNestView(nestId);
    return true;
  }

  layEgg(nestId: string, time: number): void {
    if (this.actionDispatcher) {
      this.actionDispatcher.dispatchAction({ type: 'NEST_LAY_EGG', nestId, atTime: time });
      return;
    }
    this.applyLayEgg(nestId, time);
  }

  applyLayEgg(nestId: string, time: number, _chickenId?: string): boolean {
    const nestState = this.worldStateManager.getNestState(nestId);
    if (!nestState || nestState.removed) return false;
    this.worldStateManager.patchNestState(nestId, {
      state: 'has_egg',
      occupiedByChickenId: null,
      hasEgg: true,
      laidAt: time,
      hatchAt: time + HATCH_DELAY_MS,
    });
    this.syncNestView(nestId);
    return true;
  }

  restoreEgg(nestId: string, time: number): void {
    const nestState = this.worldStateManager.getNestState(nestId);
    if (!nestState || nestState.removed) return;
    this.worldStateManager.patchNestState(nestId, {
      state: 'has_egg',
      hasEgg: true,
      hatchAt: time + HATCH_DELAY_MS,
      laidAt: time,
      occupiedByChickenId: null,
    });
    this.syncNestView(nestId);
  }

  handleInteract(nestId: string): void {
    const nestState = this.worldStateManager.getNestState(nestId);
    if (!nestState || nestState.removed) return;

    if (nestState.state === 'has_egg') {
      if (this.actionDispatcher) {
        this.actionDispatcher.dispatchAction({ type: 'NEST_COLLECT_EGG', actorId: 'player', nestId });
      } else {
        this.applyCollectEgg(nestId, 'player');
      }
      return;
    }

    if (nestState.state === 'empty') {
      if (this.actionDispatcher) {
        this.actionDispatcher.dispatchAction({ type: 'REMOVE_OBJECT', actorId: 'player', objectId: nestId, objectKind: 'nest' });
      } else {
        this.applyRemoveNest(nestId);
      }
    }
  }

  applyCollectEgg(nestId: string, actorId: string): boolean {
    const nestState = this.worldStateManager.getNestState(nestId);
    if (!nestState || nestState.removed || nestState.state !== 'has_egg') return false;
    this.views.get(nestId)?.playEggCollectEffect();
    if (actorId === 'player') {
      gameBus.emit('player:item_pickup', { itemKey: 'egg', quantity: 1 });
    }
    this.worldStateManager.patchNestState(nestId, {
      state: 'empty',
      hasEgg: false,
      hatchAt: null,
      laidAt: null,
      occupiedByChickenId: null,
    });
    this.syncNestView(nestId);
    return true;
  }

  applyReleaseNest(nestId: string, chickenId?: string): boolean {
    const nestState = this.worldStateManager.getNestState(nestId);
    if (!nestState || nestState.removed) return false;
    if (chickenId && nestState.occupiedByChickenId !== chickenId) return false;
    this.worldStateManager.patchNestState(nestId, {
      state: nestState.hasEgg ? 'has_egg' : 'empty',
      occupiedByChickenId: null,
    });
    this.syncNestView(nestId);
    return true;
  }

  removeNest(nestId: string): void {
    this.applyRemoveNest(nestId);
  }

  applyRemoveNest(nestId: string): boolean {
    const nestState = this.worldStateManager.getNestState(nestId);
    if (!nestState || nestState.removed) return false;
    gameBus.emit('player:item_pickup', { itemKey: 'chicken_nest', quantity: 1 });
    this.worldStateManager.unregisterNestState(nestId);
    this.views.get(nestId)?.destroy();
    this.views.delete(nestId);
    return true;
  }

  getAvailableNests(): NestState[] {
    return this.worldStateManager.getNestStates().filter((nestState) => !nestState.removed && nestState.state === 'empty');
  }

  getNestState(nestId: string): NestState | null {
    return this.worldStateManager.getNestState(nestId);
  }

  private syncNestView(nestId: string, playerX?: number, playerY?: number): void {
    const nestState = this.worldStateManager.getNestState(nestId);
    const view = this.views.get(nestId);
    if (!nestState || !view) return;
    view.syncFromState(nestState, playerX, playerY);
  }
}
