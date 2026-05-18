import Phaser from 'phaser';
import {
  PET_FOLLOW_RADIUS,
  PET_FOLLOW_STOP_RADIUS,
  PET_HOME_RADIUS,
  PET_INTEREST_POINTS,
  PET_PLAYER_CURIOSITY_RADIUS,
} from './PetCatalog';
import type { PetAgentState, PetBehaviorMode, PetPerceptionContext, PetTarget } from './PetTypes';

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
}

function randomNear(center: { x: number; y: number }, radius: number): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = Phaser.Math.Between(24, radius);
  return {
    x: Phaser.Math.Clamp(center.x + Math.cos(angle) * dist, 48, 1872),
    y: Phaser.Math.Clamp(center.y + Math.sin(angle) * dist, 48, 1232),
  };
}

function offsetNear(target: { x: number; y: number }, min = 42, max = 72): { x: number; y: number } {
  const angle = Math.random() * Math.PI * 2;
  const dist = Phaser.Math.Between(min, max);
  return {
    x: Phaser.Math.Clamp(target.x + Math.cos(angle) * dist, 48, 1872),
    y: Phaser.Math.Clamp(target.y + Math.sin(angle) * dist, 48, 1232),
  };
}

export class PetBehaviorSystem {
  decide(state: PetAgentState, context: PetPerceptionContext): {
    behavior: PetBehaviorMode;
    target: PetTarget | null;
    decisionDelayMs: number;
  } {
    const petPos = { x: state.view.x, y: state.view.y };
    const homeDist = distance(petPos, state.home);
    const isNight = context.currentMinute < 360 || context.currentMinute >= 1260;

    if (isNight && homeDist > 34) {
      return this.withTarget('return_home', state.home, 48, 62, 1600, 2600);
    }

    if (isNight || state.needs.sleepiness > 82) {
      return {
        behavior: homeDist <= 46 ? 'sleep' : 'return_home',
        target: homeDist <= 46 ? null : { x: state.home.x, y: state.home.y, radius: 42, speed: 58 },
        decisionDelayMs: Phaser.Math.Between(3600, 6200),
      };
    }

    if (context.owner && distance(petPos, context.owner) < PET_FOLLOW_RADIUS && state.needs.affection > 22) {
      const target = offsetNear(context.owner, PET_FOLLOW_STOP_RADIUS, PET_FOLLOW_STOP_RADIUS + 28);
      return this.withTarget('follow_owner', target, 24, 72, 1400, 3200);
    }

    if (
      context.player &&
      distance(petPos, context.player) < PET_PLAYER_CURIOSITY_RADIUS &&
      state.needs.curiosity > 36 &&
      Math.random() < 0.42
    ) {
      const target = offsetNear(context.player, 50, 86);
      return this.withTarget('approach_player', target, 28, 66, 1400, 3000);
    }

    if (state.needs.curiosity > 58 && Math.random() < 0.45) {
      const point = PET_INTEREST_POINTS[Phaser.Math.Between(0, PET_INTEREST_POINTS.length - 1)];
      const target = randomNear(point, 36);
      return this.withTarget('inspect_interest', target, 24, 58, 1800, 3600);
    }

    if (Math.random() < 0.34) {
      return {
        behavior: Math.random() < 0.55 ? 'sit' : 'idle',
        target: null,
        decisionDelayMs: Phaser.Math.Between(1200, 3400),
      };
    }

    return this.withTarget('wander_near_home', randomNear(state.home, PET_HOME_RADIUS), 22, 54, 1400, 3600);
  }

  private withTarget(
    behavior: PetBehaviorMode,
    target: { x: number; y: number },
    radius: number,
    speed: number,
    minDelay: number,
    maxDelay: number,
  ): { behavior: PetBehaviorMode; target: PetTarget; decisionDelayMs: number } {
    return {
      behavior,
      target: { x: target.x, y: target.y, radius, speed },
      decisionDelayMs: Phaser.Math.Between(minDelay, maxDelay),
    };
  }
}
