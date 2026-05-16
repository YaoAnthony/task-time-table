/**
 * Chest entity — a world object the player can open by pressing F nearby.
 *
 * Implements the Interactable interface so GameScene's general
 * F-key system can handle it without chest-specific logic in the scene.
 */

import Phaser from 'phaser';
import type { Interactable } from '../types';
import type { ChestRewardItem, GameChest } from '../../../../../Types/Profile';
import { CHEST_INTERACT_RADIUS } from '../constants';
import { gameBus } from '../shared/EventBus';

export class Chest implements Interactable {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly id: string;
  isOpen = false;

  private readonly rewards: { coins: number; items: ChestRewardItem[] };
  private rewardEmitted = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    id: string,
    rewards: { coins: number; items: ChestRewardItem[] },
  ) {
    this.id      = id;
    this.rewards = rewards;

    this.sprite = scene.add.sprite(x, y, 'chest', 0);
    // 48×48 source frame → scale 1 = same as 3×3 tiles, looks good in world
    this.sprite.setScale(1).setDepth(y + 50);

    // Floating label so the player can spot the chest easily
    const label = scene.add.text(x, y - 20, '宝箱', {
      fontSize:        '8px',
      color:           '#ffe57a',
      backgroundColor: '#00000099',
      padding:         { x: 3, y: 2 },
    }).setOrigin(0.5, 1).setDepth(y + 51);

    // Keep label tethered to sprite (store ref for destroy)
    (this as any)._label = label;
  }

  // ── Interactable impl ──────────────────────────────────────────────────────
  isNearPlayer(px: number, py: number, radius = CHEST_INTERACT_RADIUS): boolean {
    const dx = px - this.sprite.x;
    const dy = py - this.sprite.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    console.log('[DEBUG-event-flow] Chest.interact', {
      chestId: this.id,
      isOpen: this.isOpen,
      position: { x: this.sprite.x, y: this.sprite.y },
    });
    if (this.isOpen) return;
    this.open();
  }

  // ── Open ───────────────────────────────────────────────────────────────────
  open(): void {
    console.log('[DEBUG-event-flow] Chest.open', {
      chestId: this.id,
      isOpen: this.isOpen,
      animExists: this.sprite.scene.anims.exists('chest-open'),
      rewards: this.rewards,
    });
    if (this.isOpen) return;
    this.isOpen = true;

    if (!this.sprite.scene.anims.exists('chest-open')) {
      this.sprite.setFrame(5);
      this.emitReward();
      return;
    }

    this.sprite.play('chest-open');
    this.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.emitReward());
    this.sprite.scene.time.delayedCall(800, () => this.emitReward());
  }

  private emitReward(): void {
    if (this.rewardEmitted) return;
    this.rewardEmitted = true;
    const chest: GameChest = {
      id: this.id,
      x: this.sprite.x,
      y: this.sprite.y,
      rewards: this.rewards,
      opened: false,
      createdAt: 0,
    };
    console.log('[DEBUG-event-flow] Chest.emitReward chest:interact', { chest });
    gameBus.emit('chest:interact', { chestId: this.id, rewards: this.rewards, chest });
  }

  /**
   * Flash a glowing ring around the chest to help the player locate it.
   * Draws a circle that fades out over ~1.5 s.
   */
  highlight(): void {
    const scene = this.sprite.scene;
    const gfx = scene.add.graphics().setDepth(9999);

    let alpha = 1;
    const x = this.sprite.x;
    const y = this.sprite.y;

    const timer = scene.time.addEvent({
      delay:    30,
      repeat:   50,
      callback: () => {
        gfx.clear();
        gfx.lineStyle(3, 0xffe57a, alpha);
        gfx.strokeCircle(x, y, 20 + (1 - alpha) * 20);
        alpha -= 0.033;
        if (alpha <= 0) {
          gfx.destroy();
          timer.destroy();
        }
      },
    });
  }

  /** Remove the chest sprite (and label) from the scene. */
  destroy(): void {
    (this as any)._label?.destroy();
    this.sprite.destroy();
  }
}
