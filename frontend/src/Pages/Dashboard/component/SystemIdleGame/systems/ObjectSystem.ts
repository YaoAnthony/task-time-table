import type Phaser from 'phaser';
import type { Bed } from '../entities/Bed';
import type { DropItem } from '../entities/DropItem';
import type { Player } from '../entities/Player';
import type { DayCycle } from './DayCycle';
import type { SleepManager } from './SleepManager';

export interface ObjectSystemOptions {
  getPlayer: () => Player | null;
  getDrops: () => DropItem[];
  getBeds: () => Bed[];
  getSleepManager: () => SleepManager | null;
  getDayCycle: () => DayCycle | null;
  unregisterDropState: (drop: DropItem) => void;
  updateChickens: (timeMs: number, deltaMs: number) => void;
  updateNests: (playerX: number, playerY: number, timeMs: number) => void;
}

export interface ObjectSystemInitSteps {
  spawnToolPickups: () => void;
  createChickens: () => void;
  registerFarmSensors: (playerSprite: Phaser.Physics.Arcade.Sprite) => void;
  spawnBeds: () => void;
}

/**
 * Lifecycle wrapper for dynamic world objects: drops, beds, chickens and nests.
 *
 * The concrete entity creation still lives in the focused entity/render systems;
 * this class owns their boot order and frame updates so GameScene can stay thin.
 */
export class ObjectSystem {
  constructor(private readonly options: ObjectSystemOptions) {}

  init(steps: ObjectSystemInitSteps): void {
    const player = this.options.getPlayer();
    steps.spawnToolPickups();
    steps.createChickens();
    if (player) steps.registerFarmSensors(player.sprite);
    steps.spawnBeds();
  }

  update(timeMs: number, deltaMs: number): void {
    const player = this.options.getPlayer();
    this.options.updateChickens(timeMs, deltaMs);

    if (!player) return;

    const px = player.sprite.x;
    const py = player.sprite.y;
    this.options.updateNests(px, py, timeMs);
    this.updateDrops(px, py);
    this.updateBeds(px, py);
    this.resetSleepAtMorning();
  }

  private updateDrops(playerX: number, playerY: number): void {
    const drops = this.options.getDrops();
    let pruned = false;

    for (const drop of drops) {
      if (drop.gone) {
        pruned = true;
        continue;
      }
      drop.updateHint(playerX, playerY);
    }

    if (!pruned) return;

    for (const drop of drops) {
      if (drop.gone) this.options.unregisterDropState(drop);
    }
    const activeDrops = drops.filter((drop) => !drop.gone);
    drops.splice(0, drops.length, ...activeDrops);
  }

  private updateBeds(playerX: number, playerY: number): void {
    for (const bed of this.options.getBeds()) {
      bed.update(playerX, playerY);
    }
  }

  private resetSleepAtMorning(): void {
    const sleepManager = this.options.getSleepManager();
    const dayCycle = this.options.getDayCycle();
    if (sleepManager?.localSleeping && dayCycle && !dayCycle.isNight()) {
      sleepManager.onMorning();
    }
  }
}
