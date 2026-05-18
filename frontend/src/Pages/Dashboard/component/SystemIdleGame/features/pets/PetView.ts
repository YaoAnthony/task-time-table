import Phaser from 'phaser';
import { CHAR_FRAME_H, CHAR_FRAME_W } from '../../constants';
import { LAOLI_CAT_MEMORY_SEEDS, LAOLI_CAT_PET_ID, type PetMemorySeed } from './PetCatalog';
import type { PetBehaviorMode, PetTarget } from './PetTypes';

export interface PetViewOptions {
  id: string;
  petId?: string;
  ownerNpcId?: string;
  displayName?: string;
  memories?: PetMemorySeed[];
  canSpeak?: boolean;
}

export class PetView {
  readonly id: string;
  readonly petId: string;
  readonly ownerNpcId: string;
  readonly displayName: string;
  readonly memories: PetMemorySeed[];
  readonly canSpeak = false;
  readonly sprite: Phaser.Physics.Arcade.Sprite;
  private target: PetTarget | null = null;
  private behavior: PetBehaviorMode = 'idle';
  private facing: 'down' | 'up' | 'left' | 'right' = 'down';

  constructor(scene: Phaser.Scene, x: number, y: number, options: PetViewOptions) {
    this.id = options.id;
    this.petId = options.petId ?? LAOLI_CAT_PET_ID;
    this.ownerNpcId = options.ownerNpcId ?? 'laoli';
    this.displayName = options.displayName ?? '老李的猫';
    this.memories = options.memories ?? LAOLI_CAT_MEMORY_SEEDS;

    this.sprite = scene.physics.add.sprite(x, y, 'player', 0);
    this.sprite
      .setScale(1.15)
      .setTint(0xd9a066)
      .setCollideWorldBounds(true)
      .setDepth(y + 72);

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 10);
    body.setOffset((CHAR_FRAME_W - 12) / 2, CHAR_FRAME_H / 2);
    body.setImmovable(false);

    this.sprite.play('idle-down');
  }

  get x(): number {
    return this.sprite.x;
  }

  get y(): number {
    return this.sprite.y;
  }

  get currentBehavior(): PetBehaviorMode {
    return this.behavior;
  }

  setBehavior(behavior: PetBehaviorMode, target: PetTarget | null): void {
    this.behavior = behavior;
    this.target = target;
    if (!target) this.stop();
  }

  updateMotion(deltaMs: number): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    this.sprite.setDepth(this.sprite.y + 72);

    if (!this.target || this.behavior === 'sleep' || this.behavior === 'sit' || this.behavior === 'idle') {
      this.stop();
      return;
    }

    const dx = this.target.x - this.sprite.x;
    const dy = this.target.y - this.sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= this.target.radius) {
      this.target = null;
      this.stop();
      return;
    }

    const dt = Math.max(0.001, deltaMs / 1000);
    const speed = this.target.speed;
    body.setVelocity((dx / dist) * speed, (dy / dist) * speed);
    this.facing = Math.abs(dx) > Math.abs(dy)
      ? (dx < 0 ? 'left' : 'right')
      : (dy < 0 ? 'up' : 'down');

    const anim = `walk-${this.facing}`;
    if (this.sprite.anims.currentAnim?.key !== anim) {
      this.sprite.play(anim, true);
    }

    if (dist < speed * dt) {
      this.sprite.setPosition(this.target.x, this.target.y);
      this.target = null;
      this.stop();
    }
  }

  stop(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    const anim = `idle-${this.facing}`;
    if (this.sprite.anims.currentAnim?.key !== anim) {
      this.sprite.play(anim, true);
    }
  }

  destroy(): void {
    this.sprite.destroy();
  }
}
