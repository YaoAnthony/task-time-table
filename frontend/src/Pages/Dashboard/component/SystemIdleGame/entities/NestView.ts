import Phaser from 'phaser';
import type { Interactable } from '../types';
import { NEST_INTERACT_RADIUS } from '../constants';
import type { NestState } from '../shared/worldStateTypes';

const FRAME_EMPTY = 3;
const FRAME_HAS_EGG = 2;

interface NestViewCallbacks {
  getState: (id: string) => NestState | null;
  onInteract: (id: string) => void;
}

/**
 * Phaser view for nest state. Occupancy/egg/hatch timers live in WorldState.
 */
export class NestView implements Interactable {
  readonly id: string;
  readonly sprite: Phaser.GameObjects.Sprite;

  private readonly scene: Phaser.Scene;
  private readonly hint: Phaser.GameObjects.Text;
  private readonly body: Phaser.Physics.Arcade.Image | null;
  private readonly callbacks: NestViewCallbacks;
  private removed = false;

  constructor(
    scene: Phaser.Scene,
    id: string,
    x: number,
    y: number,
    callbacks: NestViewCallbacks,
    obstacles?: Phaser.Physics.Arcade.StaticGroup,
  ) {
    this.scene = scene;
    this.id = id;
    this.callbacks = callbacks;

    this.sprite = scene.add.sprite(x, y, 'egg-nest', FRAME_EMPTY);
    this.sprite.setScale(2).setDepth(y + 5);

    this.body = obstacles
      ? scene.physics.add.staticImage(x, y, '__WHITE').setDisplaySize(26, 18).setAlpha(0)
      : null;
    if (this.body && obstacles) obstacles.add(this.body, true);

    this.hint = scene.add
      .text(x, y - 22, '', {
        fontSize: '8px',
        color: '#fffbe6',
        backgroundColor: '#00000099',
        padding: { x: 3, y: 2 },
        fontFamily: '"Courier New", monospace',
      })
      .setOrigin(0.5, 1)
      .setDepth(y + 60)
      .setVisible(false);
  }

  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }
  get gone(): boolean { return this.removed; }
  get nestState(): NestState['state'] { return this.callbacks.getState(this.id)?.state ?? 'empty'; }

  isNearPlayer(px: number, py: number, radius = NEST_INTERACT_RADIUS): boolean {
    const dx = px - this.sprite.x;
    const dy = py - this.sprite.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    if (this.removed) return;
    this.callbacks.onInteract(this.id);
  }

  syncFromState(state: NestState, playerX?: number, playerY?: number): void {
    if (state.removed) {
      this.destroy();
      return;
    }

    const frame = state.hasEgg ? FRAME_HAS_EGG : FRAME_EMPTY;
    this.sprite.setFrame(frame).setDepth(this.sprite.y + 5);
    this.hint.setPosition(this.sprite.x, this.sprite.y - 20);

    if (playerX === undefined || playerY === undefined) {
      this.hint.setVisible(false);
      return;
    }

    const near = this.isNearPlayer(playerX, playerY);
    let hintText = '';
    if (near) {
      if (state.state === 'has_egg') hintText = '[F] 收蛋';
      if (state.state === 'empty') hintText = '[F] 拆鸡窝';
    }
    this.hint.setText(hintText).setVisible(hintText !== '');
  }

  playEggCollectEffect(): void {
    const icon = this.scene.add
      .sprite(this.sprite.x, this.sprite.y - 16, 'egg-nest', 0)
      .setScale(2)
      .setDepth(9999);
    this.scene.tweens.add({
      targets: icon,
      y: this.sprite.y - 48,
      alpha: 0,
      duration: 900,
      ease: 'Cubic.Out',
      onComplete: () => icon.destroy(),
    });
  }

  destroy(): void {
    if (this.removed) return;
    this.body?.destroy();
    this.sprite.destroy();
    this.hint.destroy();
    this.removed = true;
  }
}
