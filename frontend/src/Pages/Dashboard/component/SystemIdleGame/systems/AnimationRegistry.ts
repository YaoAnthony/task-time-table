/**
 * AnimationRegistry — registers all Phaser animations at scene create time.
 *
 * Character spritesheet layout (Basic Charakter Spritesheet.png, 192×192, 4×4 @ 48px):
 *   row 0 (frames  0– 3) = walk DOWN
 *   row 1 (frames  4– 7) = walk UP
 *   row 2 (frames  8–11) = walk LEFT
 *   row 3 (frames 12–15) = walk RIGHT
 *
 * Actions spritesheet layout (Basic Charakter Actions.png, 96×576, 2×12 @ 48px):
 *   rows 1–4  (frames  0– 7) = SCYTHE  — down/up/left/right × 2 frames each
 *   rows 5–8  (frames  8–15) = AXE     — down/up/left/right × 2 frames each
 *   rows 9–12 (frames 16–23) = WATER   — down/up/left/right × 2 frames each
 *
 * Tool icon layout (Basic tools and meterials.png, 16px grid):
 *   icon 1 (x=0)  = water can
 *   icon 2 (x=16) = axe
 *   icon 3 (x=32) = scythe
 *
 * Chicken spritesheet (Free Chicken Sprites.png, 64×32, 4×2 @ 16px):
 *   row 0 frames 0–3 = walk
 */

import Phaser from 'phaser';

const MOVE_DIRS = ['down', 'up', 'left', 'right'] as const;

export function registerAnimations(scene: Phaser.Scene): void {
  // ── Character movement ──────────────────────────────────────────────────
  MOVE_DIRS.forEach((dir, row) => {
    scene.anims.create({
      key:       `walk-${dir}`,
      frames:    scene.anims.generateFrameNumbers('player', { start: row * 4, end: row * 4 + 3 }),
      frameRate: 8,
      repeat:    -1,
    });
    scene.anims.create({
      key:       `idle-${dir}`,
      frames:    [{ key: 'player', frame: row * 4 }],
      frameRate: 1,
      repeat:    -1,
    });
  });

  // ── Scythe swing (rows 1–4 / frames 0–7) ───────────────────────────────
  MOVE_DIRS.forEach((dir, row) => {
    scene.anims.create({
      key:       `scythe-${dir}`,
      frames:    scene.anims.generateFrameNumbers('actions', { start: row * 2, end: row * 2 + 1 }),
      frameRate: 6,
      repeat:    0,
    });
  });

  // ── Axe chop (rows 5–8 / frames 8–15) ──────────────────────────────────
  MOVE_DIRS.forEach((dir, row) => {
    scene.anims.create({
      key:       `axe-${dir}`,
      frames:    scene.anims.generateFrameNumbers('actions', { start: (row + 4) * 2, end: (row + 4) * 2 + 1 }),
      frameRate: 6,
      repeat:    0,
    });
  });

  // ── Water pour (rows 9–12 / frames 16–23) ──────────────────────────────
  MOVE_DIRS.forEach((dir, row) => {
    scene.anims.create({
      key:       `water-${dir}`,
      frames:    scene.anims.generateFrameNumbers('actions', { start: (row + 8) * 2, end: (row + 8) * 2 + 1 }),
      frameRate: 6,
      repeat:    0,
    });
  });

  // ── Chicken ────────────────────────────────────────────────────────────
  scene.anims.create({
    key:       'chicken-walk',
    frames:    scene.anims.generateFrameNumbers('chicken', { start: 0, end: 3 }),
    frameRate: 8,
    repeat:    -1,
  });
  scene.anims.create({
    key:       'chicken-idle',
    frames:    [{ key: 'chicken', frame: 0 }],
    frameRate: 1,
    repeat:    -1,
  });
}
