import type Phaser from 'phaser';
import {
  CHICKEN_GROWTH_PER_DRINK,
  CHICKEN_GROWTH_THRESHOLD,
  CHICKEN_DRINK_MS,
  CHICKEN_LAY_MS,
  CHICKEN_THIRST_PER_TICK,
  CHICKEN_THIRST_THRESHOLD,
  CHICKEN_THIRST_TICK_MS,
} from '../constants';
import { WorldStateManager } from '../shared/WorldStateManager';
import type { ChickenBehaviorState, ChickenState, NestState } from '../shared/worldStateTypes';
import { ChickenView } from '../entities/ChickenView';
import { NestStateSystem } from './NestStateSystem';
import type { WorldActionDispatcher } from './WorldActionSystem';

const WATER_REACH_DIST = 48;

/**
 * Drives chicken business state from WorldState and keeps ChickenView synced.
 */
export class ChickenStateSystem {
  private readonly views = new Map<string, ChickenView>();
  private actionDispatcher: WorldActionDispatcher | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldStateManager: WorldStateManager,
    private readonly nestStateSystem: NestStateSystem,
    private readonly waterSpots: [number, number][],
  ) {}

  setActionDispatcher(dispatcher: WorldActionDispatcher | null): void {
    this.actionDispatcher = dispatcher;
  }

  registerChicken(view: ChickenView, initial: Omit<ChickenState, 'cellX' | 'cellY'>): void {
    const next = this.worldStateManager.registerChickenState(initial);
    this.views.set(next.id, view);
    view.syncFromState(next);
  }

  update(time: number, _delta: number): void {
    this.worldStateManager.getChickenStates().forEach((chickenState) => {
      const view = this.views.get(chickenState.id);
      if (!view) return;

      switch (chickenState.state) {
        case 'wandering':
          this.updateThirst(chickenState, time);
          if (this.worldStateManager.getChickenState(chickenState.id)?.state === 'moving_to_water') {
            this.syncChickenPosition(chickenState.id, view);
            return;
          }
          this.updateWander(chickenState, view, time);
          break;
        case 'moving_to_water':
          this.updateMovingToWater(chickenState, view, time);
          break;
        case 'drinking':
          if ((chickenState.actionUntil ?? 0) <= time) {
            this.finishDrinking(chickenState, time);
          } else {
            view.stop();
          }
          break;
        case 'moving_to_nest':
          this.updateMovingToNest(chickenState, view, time);
          break;
        case 'laying':
          if ((chickenState.actionUntil ?? 0) <= time) {
            this.finishLaying(chickenState, time);
          } else {
            view.stop();
          }
          break;
      }

      this.syncChickenPosition(chickenState.id, view);
    });
  }

  restoreChickenState(chickenId: string, patch: Partial<ChickenState>): void {
    const chickenState = this.worldStateManager.getChickenState(chickenId);
    if (!chickenState) return;
    this.worldStateManager.patchChickenState(chickenId, {
      ...patch,
      state: this.normalizeState(patch.state),
    });
    if (patch.x !== undefined && patch.y !== undefined) {
      this.worldStateManager.updateChickenPosition(chickenId, patch.x, patch.y);
    }
    this.views.get(chickenId)?.syncFromState(this.worldStateManager.getChickenState(chickenId)!);
  }

  getChickenState(chickenId: string): ChickenState | null {
    return this.worldStateManager.getChickenState(chickenId);
  }

  private updateThirst(chickenState: ChickenState, time: number): void {
    if (time < chickenState.nextThirstAt) return;
    this.worldStateManager.patchChickenState(chickenState.id, {
      nextThirstAt: time + CHICKEN_THIRST_TICK_MS,
      thirst: Math.min(100, chickenState.thirst + CHICKEN_THIRST_PER_TICK),
    });

    const next = this.worldStateManager.getChickenState(chickenState.id);
    if (next && next.thirst >= CHICKEN_THIRST_THRESHOLD) {
      this.seekWater(next);
    }
  }

  private seekWater(chickenState: ChickenState): void {
    if (this.waterSpots.length === 0) return;
    const view = this.views.get(chickenState.id);
    if (!view) return;
    const nearest = this.closestPoint(chickenState.x, chickenState.y, this.waterSpots);
    view.navigateTo(nearest[0], nearest[1]);
    this.worldStateManager.patchChickenState(chickenState.id, {
      state: 'moving_to_water',
      targetX: nearest[0],
      targetY: nearest[1],
      stopAt: 0,
    });
  }

  private updateMovingToWater(chickenState: ChickenState, view: ChickenView, time: number): void {
    if (this.nearWater(view.x, view.y)) {
      this.startDrinking(chickenState.id, time, view);
      return;
    }

    const status = view.stepNavigation(this.scene);
    if (status === 'arrived' || this.nearWater(view.x, view.y)) {
      this.startDrinking(chickenState.id, time, view);
    }
  }

  private startDrinking(chickenId: string, time: number, view: ChickenView): void {
    view.stop();
    this.worldStateManager.patchChickenState(chickenId, {
      state: 'drinking',
      actionUntil: time + CHICKEN_DRINK_MS,
      targetX: null,
      targetY: null,
    });
  }

  private finishDrinking(chickenState: ChickenState, time: number): void {
    const growth = Math.min(100, chickenState.growth + CHICKEN_GROWTH_PER_DRINK);
    this.worldStateManager.patchChickenState(chickenState.id, {
      thirst: 0,
      growth,
      actionUntil: null,
    });

    if (growth >= CHICKEN_GROWTH_THRESHOLD) {
      const next = this.worldStateManager.getChickenState(chickenState.id);
      if (next) this.seekNest(next);
      return;
    }

    this.worldStateManager.patchChickenState(chickenState.id, {
      state: 'wandering',
      nextWanderAt: time,
    });
  }

  private seekNest(chickenState: ChickenState): void {
    const view = this.views.get(chickenState.id);
    if (!view) return;
    const nests = this.nestStateSystem.getAvailableNests();
    if (nests.length === 0) {
      this.worldStateManager.patchChickenState(chickenState.id, {
        state: 'wandering',
        growth: CHICKEN_GROWTH_THRESHOLD - CHICKEN_GROWTH_PER_DRINK,
        nestId: null,
      });
      return;
    }

    const targetNest = this.closestNest(chickenState.x, chickenState.y, nests);
    const occupied = this.actionDispatcher
      ? this.actionDispatcher.dispatchAction({ type: 'NEST_OCCUPY', nestId: targetNest.id, chickenId: chickenState.id }).ok
      : this.nestStateSystem.occupyNest(targetNest.id, chickenState.id);
    if (!occupied) {
      this.worldStateManager.patchChickenState(chickenState.id, {
        state: 'wandering',
        growth: CHICKEN_GROWTH_THRESHOLD - CHICKEN_GROWTH_PER_DRINK,
        nestId: null,
      });
      return;
    }

    view.navigateTo(targetNest.x, targetNest.y);
    this.worldStateManager.patchChickenState(chickenState.id, {
      state: 'moving_to_nest',
      nestId: targetNest.id,
      targetX: targetNest.x,
      targetY: targetNest.y,
    });
  }

  private updateMovingToNest(chickenState: ChickenState, view: ChickenView, time: number): void {
    const nestState = chickenState.nestId ? this.nestStateSystem.getNestState(chickenState.nestId) : null;
    if (!nestState || nestState.removed) {
      view.stop();
      this.worldStateManager.patchChickenState(chickenState.id, {
        state: 'wandering',
        nestId: null,
        targetX: null,
        targetY: null,
      });
      return;
    }

    const status = view.stepNavigation(this.scene);
    if (status === 'arrived') {
      view.stop();
      this.worldStateManager.patchChickenState(chickenState.id, {
        state: 'laying',
        actionUntil: time + CHICKEN_LAY_MS,
      });
    }
  }

  private finishLaying(chickenState: ChickenState, time: number): void {
    if (chickenState.nestId) {
      if (this.actionDispatcher) {
        this.actionDispatcher.dispatchAction({
          type: 'NEST_LAY_EGG',
          nestId: chickenState.nestId,
          chickenId: chickenState.id,
          atTime: time,
        });
      } else {
        this.nestStateSystem.layEgg(chickenState.nestId, time);
      }
    }
    this.worldStateManager.patchChickenState(chickenState.id, {
      state: 'wandering',
      growth: 0,
      nestId: null,
      actionUntil: null,
      nextWanderAt: time,
      targetX: null,
      targetY: null,
    });
  }

  private updateWander(chickenState: ChickenState, view: ChickenView, time: number): void {
    const body = view.sprite.body as Phaser.Physics.Arcade.Body;
    if (time >= chickenState.nextWanderAt) {
      if (Math.random() < 0.5) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 35 + Math.random() * 25;
        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;
        view.setWalkVelocity(vx, vy);
        this.worldStateManager.patchChickenState(chickenState.id, {
          stopAt: time + 800 + Math.random() * 1200,
          nextWanderAt: time + 1400 + Math.random() * 2700,
          facing: vx < 0 ? 'left' : 'right',
        });
      } else {
        view.stop();
        this.worldStateManager.patchChickenState(chickenState.id, {
          stopAt: 0,
          nextWanderAt: time + 1500 + Math.random() * 2000,
        });
      }
    }

    if (chickenState.stopAt > 0 && time >= chickenState.stopAt) {
      view.stop();
      this.worldStateManager.patchChickenState(chickenState.id, {
        stopAt: 0,
      });
    }

    if (Math.abs(body.velocity.x) > 0.1) {
      this.worldStateManager.patchChickenState(chickenState.id, {
        facing: body.velocity.x < 0 ? 'left' : 'right',
      });
    }
  }

  private syncChickenPosition(chickenId: string, view: ChickenView): void {
    this.worldStateManager.updateChickenPosition(chickenId, view.x, view.y);
    const chickenState = this.worldStateManager.getChickenState(chickenId);
    if (!chickenState) return;
    view.syncFromState(chickenState);
  }

  private nearWater(x: number, y: number): boolean {
    return this.waterSpots.some(([wx, wy]) => {
      const dx = wx - x;
      const dy = wy - y;
      return dx * dx + dy * dy <= WATER_REACH_DIST * WATER_REACH_DIST;
    });
  }

  private closestPoint(x: number, y: number, points: [number, number][]): [number, number] {
    let best = points[0];
    let bestDistance = Infinity;
    points.forEach((point) => {
      const dx = point[0] - x;
      const dy = point[1] - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = point;
      }
    });
    return best;
  }

  private closestNest(x: number, y: number, nests: NestState[]): NestState {
    let best = nests[0];
    let bestDistance = Infinity;
    nests.forEach((nest) => {
      const dx = nest.x - x;
      const dy = nest.y - y;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = nest;
      }
    });
    return best;
  }

  private normalizeState(state: ChickenBehaviorState | string | undefined): ChickenBehaviorState | undefined {
    if (!state) return undefined;
    if (
      state === 'wandering'
      || state === 'moving_to_water'
      || state === 'drinking'
      || state === 'moving_to_nest'
      || state === 'laying'
    ) {
      return state;
    }
    return 'wandering';
  }
}
