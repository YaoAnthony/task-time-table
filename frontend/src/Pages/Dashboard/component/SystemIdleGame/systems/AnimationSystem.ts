import Phaser from 'phaser';
import { registerAnimations } from './AnimationRegistry';

/**
 * Owns Phaser animation registration for the idle game.
 *
 * GameScene loads assets; this system turns loaded spritesheets into named
 * animations used by entities and world objects.
 */
export class AnimationSystem {
  constructor(private readonly scene: Phaser.Scene) {}

  init(): void {
    registerAnimations(this.scene);
    this.registerChestAnimations();
  }

  private registerChestAnimations(): void {
    if (this.scene.anims.exists('chest-open')) return;

    this.scene.anims.create({
      key: 'chest-open',
      frames: [
        { key: 'chest', frame: 0 },
        { key: 'chest', frame: 0 },
        { key: 'chest', frame: 5 },
      ],
      frameRate: 6,
      repeat: 0,
    });
  }
}
