/**
 * Nest entity — a chicken nest that can hold an egg.
 *
 * States:
 *   empty     → frame 3 (empty nest)
 *   occupied  → frame 3 (chicken sitting on it — chicken sprite overlaps)
 *   has_egg   → frame 2 (nest with egg visible)
 *
 * The player presses F near a has_egg nest to collect the egg.
 * Egg_And_Nest.png frame layout (16×16, 4 frames horizontal):
 *   0 = single egg, 1 = unused, 2 = nest + egg, 3 = empty nest
 */

import Phaser from 'phaser';
import type { Interactable, GameCallbacks } from '../types';
import { NEST_INTERACT_RADIUS } from '../constants';

type NestState = 'empty' | 'occupied' | 'has_egg';

export class Nest implements Interactable {
  readonly sprite: Phaser.GameObjects.Sprite;

  private state:     NestState = 'empty';
  private callbacks: GameCallbacks;

  private static readonly FRAME_EMPTY   = 3;
  private static readonly FRAME_HAS_EGG = 2;

  constructor(scene: Phaser.Scene, x: number, y: number, callbacks: GameCallbacks) {
    this.callbacks = callbacks;
    this.sprite = scene.add.sprite(x, y, 'egg-nest', Nest.FRAME_EMPTY);
    this.sprite.setScale(2).setDepth(y + 5);
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }

  /** True if a chicken can claim this nest. */
  isAvailable(): boolean { return this.state === 'empty'; }

  /** Called when a chicken arrives — reserves the nest. */
  occupy(): void { this.state = 'occupied'; }

  /** Called when the chicken leaves after sitting — nest now has an egg. */
  layEgg(): void {
    this.state = 'has_egg';
    this.sprite.setFrame(Nest.FRAME_HAS_EGG);
  }

  /** Revert to empty after the player collects the egg. */
  private reset(): void {
    this.state = 'empty';
    this.sprite.setFrame(Nest.FRAME_EMPTY);
  }

  // ── Interactable ─────────────────────────────────────────────────────────────
  isNearPlayer(px: number, py: number, radius = NEST_INTERACT_RADIUS): boolean {
    const dx = px - this.sprite.x;
    const dy = py - this.sprite.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    if (this.state !== 'has_egg') return;

    // Floating egg icon that rises and fades
    const scene = this.sprite.scene;
    const icon  = scene.add
      .sprite(this.sprite.x, this.sprite.y - 16, 'egg-nest', 0)
      .setScale(2).setDepth(9999);
    scene.tweens.add({
      targets:    icon,
      y:          this.sprite.y - 48,
      alpha:      0,
      duration:   900,
      ease:       'Cubic.Out',
      onComplete: () => icon.destroy(),
    });

    this.callbacks.onItemPickup?.('egg', 1);
    this.reset();
  }
}
