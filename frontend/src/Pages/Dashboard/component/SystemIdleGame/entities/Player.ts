/**
 * Player entity — wraps a Phaser.Physics.Arcade.Sprite.
 * Handles: keyboard movement, action animations (axe / water),
 * tool switching, and exposes game-state for save.
 */

import Phaser from 'phaser';
import type { ToolType, Direction, GameCallbacks } from '../types';
import { PLAYER_SPEED, CHAR_FRAME_W, CHAR_FRAME_H } from '../constants';

export class Player {
  readonly sprite: Phaser.Physics.Arcade.Sprite;

  currentTool: ToolType  = 'empty';
  facing:      Direction = 'down';
  isActing               = false;

  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd:    Record<string, Phaser.Input.Keyboard.Key>;
  private callbacks: GameCallbacks;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    callbacks: GameCallbacks,
  ) {
    this.callbacks = callbacks;

    this.sprite = scene.physics.add.sprite(x, y, 'player', 0);
    this.sprite.setScale(2).setCollideWorldBounds(true);

    // Tight foot hitbox (the 48×48 frame has large transparent padding)
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 10);
    body.setOffset(
      (CHAR_FRAME_W - 16) / 2,   // center horizontally
      CHAR_FRAME_H - 14,          // near the bottom of the frame
    );

    this.sprite.play('idle-down');
    this.sprite.setDepth(y + 96);

    // Input
    this.cursors = scene.input.keyboard!.createCursorKeys();
    this.wasd = {
      up:    scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down:  scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left:  scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Note: Space / E key listeners are handled in GameScene
    // so proximity-to-NPC can be checked before deciding action vs. interaction.
  }

  /** Called every frame from GameScene.update() */
  update(): void {
    if (this.isActing) return;   // freeze movement during action animation
    this.handleMovement();
    this.sprite.setDepth(this.sprite.y + 96);
  }

  setTool(tool: ToolType): void {
    this.currentTool = tool;
    this.callbacks.onToolChange?.(tool);
  }

  /** Trigger the action animation for the current tool. */
  performAction(): void {
    if (this.isActing || this.currentTool === 'empty') return;

    this.isActing = true;
    const animKey = `${this.currentTool}-${this.facing}`;

    // Phaser auto-switches texture to the animation's texture key ('actions')
    this.sprite.play(animKey);
    this.sprite.once('animationcomplete', () => {
      this.isActing = false;
      // Switch back to character walk/idle texture
      this.sprite.play(`idle-${this.facing}`);
    });
  }

  getState(): { x: number; y: number; facing: Direction } {
    return {
      x:      Math.round(this.sprite.x),
      y:      Math.round(this.sprite.y),
      facing: this.facing,
    };
  }

  // ── Private ────────────────────────────────────────────────────────────────
  private handleMovement(): void {
    const body = this.sprite.body as Phaser.Physics.Arcade.Body;
    let vx = 0, vy = 0;

    if (this.cursors.left.isDown  || this.wasd.left.isDown)  vx -= PLAYER_SPEED;
    if (this.cursors.right.isDown || this.wasd.right.isDown) vx += PLAYER_SPEED;
    if (this.cursors.up.isDown    || this.wasd.up.isDown)    vy -= PLAYER_SPEED;
    if (this.cursors.down.isDown  || this.wasd.down.isDown)  vy += PLAYER_SPEED;

    if (vx !== 0 && vy !== 0) { vx *= 0.7071; vy *= 0.7071; }
    body.setVelocity(vx, vy);

    if (vx !== 0 || vy !== 0) {
      const dir = this.velToDir(vx, vy);
      this.facing = dir;
      if (this.sprite.anims.currentAnim?.key !== `walk-${dir}`) {
        this.sprite.play(`walk-${dir}`);
      }
    } else {
      const cur = this.sprite.anims.currentAnim?.key ?? '';
      if (cur.startsWith('walk-')) {
        this.sprite.play(`idle-${cur.slice(5)}`);
      }
    }
  }

  private velToDir(vx: number, vy: number): Direction {
    if (Math.abs(vy) > Math.abs(vx) * 1.6) return vy < 0 ? 'up' : 'down';
    return vx < 0 ? 'left' : 'right';
  }
}
