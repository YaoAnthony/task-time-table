/**
 * Nest entity — interactive chicken nest with three states.
 *
 * States & F-key behaviour:
 *   empty     → [F] 拆鸡窝  — removes nest, adds 'chicken_nest' to inventory
 *   occupied  — chicken is sitting; no player interaction
 *   has_egg   → [F] 收蛋    — collect egg; if ignored for HATCH_DELAY_SEC, a new chick hatches
 *
 * Collision: a small static physics body blocks the player from walking through.
 *
 * Egg_And_Nest.png frame layout (64×16 px, each frame 16×16):
 *   frame 0 = single egg
 *   frame 1 = unused
 *   frame 2 = nest + egg
 *   frame 3 = empty nest
 */

import Phaser from 'phaser';
import type { Interactable } from '../types';
import { NEST_INTERACT_RADIUS } from '../constants';
import { gameBus } from '../shared/EventBus';

// ─────────────────────────────────────────────────────────────────────────────
type NestState = 'empty' | 'occupied' | 'has_egg';

const FRAME_EMPTY    = 3;
const FRAME_HAS_EGG  = 2;
const HATCH_DELAY_MS = 60_000; // 60 s without collection → spawn chick

// ─────────────────────────────────────────────────────────────────────────────
export class Nest implements Interactable {

  // ── Sprites / bodies ──────────────────────────────────────────────────────
  readonly sprite:  Phaser.GameObjects.Sprite;
  private _hint:    Phaser.GameObjects.Text;
  private _body:    Phaser.Physics.Arcade.Image | null = null;

  // ── State ─────────────────────────────────────────────────────────────────
  private _state:       NestState = 'empty';
  private _hatchTimer:  Phaser.Time.TimerEvent | null = null;
  private _gone         = false;

  // ── External refs ─────────────────────────────────────────────────────────
  private _scene: Phaser.Scene;

  /**
   * Set by GameScene after construction.
   * Called when incubation completes — GameScene spawns a new chick.
   */
  onHatch?: (x: number, y: number) => void;

  // ──────────────────────────────────────────────────────────────────────────
  constructor(
    scene:     Phaser.Scene,
    x:         number,
    y:         number,
    obstacles?: Phaser.Physics.Arcade.StaticGroup,
  ) {
    this._scene = scene;

    // ── Nest sprite ────────────────────────────────────────────────────────
    this.sprite = scene.add.sprite(x, y, 'egg-nest', FRAME_EMPTY);
    this.sprite.setScale(2).setDepth(y + 5);

    // ── Collision body ─────────────────────────────────────────────────────
    if (obstacles) {
      this._body = scene.physics.add
        .staticImage(x, y, '__WHITE')
        .setDisplaySize(26, 18)
        .setAlpha(0);          // invisible, purely for physics
      obstacles.add(this._body, true);
    }

    // ── Hint label ─────────────────────────────────────────────────────────
    this._hint = scene.add
      .text(x, y - 22, '', {
        fontSize:        '8px',
        color:           '#fffbe6',
        backgroundColor: '#00000099',
        padding:         { x: 3, y: 2 },
        fontFamily:      '"Courier New", monospace',
      })
      .setOrigin(0.5, 1)
      .setDepth(y + 60)
      .setVisible(false);
  }

  // ── Accessors ─────────────────────────────────────────────────────────────
  get x(): number { return this.sprite.x; }
  get y(): number { return this.sprite.y; }
  /** True if this nest has been dismantled (GameScene prunes gone nests). */
  get gone(): boolean { return this._gone; }
  /** Public read-only: current nest state for serialization. */
  get nestState(): NestState { return this._state; }

  // ── Chicken API ───────────────────────────────────────────────────────────
  /** True if a chicken can claim this nest. */
  isAvailable(): boolean { return this._state === 'empty'; }

  /** Called by Chicken when it arrives — reserves the nest. */
  occupy(): void { this._state = 'occupied'; }

  /**
   * Called by Chicken after laying — nest now holds an egg.
   * Starts a 60-second hatch timer; if the player doesn't collect the egg,
   * `onHatch` fires and a new chick is spawned.
   */
  layEgg(): void {
    this._state = 'has_egg';
    this.sprite.setFrame(FRAME_HAS_EGG);

    // Start incubation countdown
    this._hatchTimer = this._scene.time.addEvent({
      delay:         HATCH_DELAY_MS,
      callback:      this._hatch,
      callbackScope: this,
    });
  }

  // ── Interactable ──────────────────────────────────────────────────────────
  isNearPlayer(px: number, py: number, radius = NEST_INTERACT_RADIUS): boolean {
    const dx = px - this.sprite.x;
    const dy = py - this.sprite.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    if (this._gone) return;

    if (this._state === 'has_egg') {
      // ── Collect egg ──────────────────────────────────────────────────────
      this._cancelHatch();

      // Floating egg icon animation
      const scene = this._scene;
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

      gameBus.emit('player:item_pickup', { itemKey: 'egg', quantity: 1 });
      this._reset();

    } else if (this._state === 'empty') {
      // ── Dismantle nest → go to inventory ─────────────────────────────────
      gameBus.emit('player:item_pickup', { itemKey: 'chicken_nest', quantity: 1 });
      this._destroy();
    }
    // 'occupied' → chicken is sitting, ignore F
  }

  // ── Per-frame update (called by GameScene.update) ─────────────────────────
  update(px: number, py: number): void {
    if (this._gone) return;
    const near = this.isNearPlayer(px, py);

    let hintText = '';
    if (near) {
      if      (this._state === 'has_egg') hintText = '[F] 收蛋';
      else if (this._state === 'empty')   hintText = '[F] 拆鸡窝';
    }

    this._hint
      .setText(hintText)
      .setVisible(hintText !== '')
      .setPosition(this.sprite.x, this.sprite.y - 20);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  /** Incubation complete — spawn a new chick and reset to empty. */
  private _hatch(): void {
    this._hatchTimer = null;
    this.onHatch?.(this.sprite.x, this.sprite.y);
    this._reset();
  }

  private _cancelHatch(): void {
    if (this._hatchTimer) {
      this._hatchTimer.remove();
      this._hatchTimer = null;
    }
  }

  /** Revert to empty nest (egg collected or chick hatched). */
  private _reset(): void {
    this._state = 'empty';
    this.sprite.setFrame(FRAME_EMPTY);
  }

  /** Full teardown — called when player dismantles the nest. */
  private _destroy(): void {
    this._cancelHatch();
    this._body?.destroy();
    this.sprite.destroy();
    this._hint.destroy();
    this._gone = true;
  }

  /** Legacy cleanup (scene shutdown). */
  destroy(): void { this._destroy(); }
}
