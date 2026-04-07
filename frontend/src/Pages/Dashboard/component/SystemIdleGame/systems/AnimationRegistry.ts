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

  // ── Water tile (Water.png — 4 frames × 16px, 64×16) ───────────────────
  scene.anims.create({
    key:       'water-tile',
    frames:    scene.anims.generateFrameNumbers('water', { start: 0, end: 3 }),
    frameRate: 4,
    repeat:    -1,
  });

  // ── Chicken ────────────────────────────────────────────────────────────
  // Actual pixel data (64×32, 4×2 @ 16px):
  //   Row 0: frame 0 = walk-A (27px), frame 1 = walk-B (27px),
  //           frame 2 = EMPTY (0px),  frame 3 = EMPTY (0px)
  //   Row 1: frame 4 = idle-A (22px), frame 5 = idle-B (27px),
  //           frame 6 = idle-C (22px), frame 7 = idle-D (27px)
  //
  // Walk: alternate between the two real walk frames.
  // Idle: loop all four row-1 frames for a gentle head-bob.
  scene.anims.create({
    key:       'chicken-walk',
    frames:    scene.anims.generateFrameNumbers('chicken', { frames: [4, 5, 6, 5] }),
    frameRate: 8,
    repeat:    -1,
  });
  scene.anims.create({
    key:       'chicken-idle',
    frames:    scene.anims.generateFrameNumbers('chicken', { frames: [0, 1, 0, 1] }),
    frameRate: 3,
    repeat:    -1,
  });
}
