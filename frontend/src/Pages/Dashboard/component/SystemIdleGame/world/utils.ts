/**
 * Shared primitives for all world creators.
 *
 * Depth stack (bottom → top):
 *   WATER    -10
 *   GRASS     -9
 *   DETAIL    -8   (grass variety)
 *   BORDER    -7   (Hills cliff tiles)
 *   POND      -5
 *   OBJECT  y+5    (rocks, bushes, flowers, trees — Y-sorted)
 *   WALL   y+10    (house walls — Y-sorted)
 *   ROOF    600    (above player ≤544, below night overlay 9800)
 *   OVERLAY 9800   (DayCycle night rectangle)
 */

import Phaser from 'phaser';
import { OBJ_SCALE } from '../constants';
import type { WorldGrid } from '../shared/WorldGrid';

export const T = 16 * OBJ_SCALE; // 32 px per displayed tile

export const LAYER = {
  WATER:   -10,
  GRASS:    -9,
  DETAIL:   -8,
  BORDER:   -7,
  POND:     -5,
  OBJECT:  (y: number) => y + 5,
  WALL:    (y: number) => y + 10,
  ROOF:     600,
  OVERLAY:  9800,
} as const;

/** Shared context passed to every world creator function. */
export type WorldCtx = {
  scene:     Phaser.Scene;
  obstacles: Phaser.Physics.Arcade.StaticGroup;
  /** Optional grid — populated during map build for pathfinding & world queries. */
  grid?:     WorldGrid;
};

export function createObstacleBlock(
  scene: Phaser.Scene,
  obstacles: Phaser.Physics.Arcade.StaticGroup,
  cx: number,
  cy: number,
  w: number,
  h: number,
): Phaser.Physics.Arcade.Image {
  // ⚠️ Do NOT use scene.add.rectangle here.
  // Phaser.GameObjects.Shape lacks the Size mixin (no `displayWidth` getter), so
  // StaticBody's constructor falls through to the 64×64 default instead of using w/h.
  //
  // Fix: use obstacles.create() (a real Image), which has displayWidth.
  // Then: remove from tree → resize → re-insert so the broadphase has correct bounds.
  const img = obstacles.create(cx, cy, 'grass', 'grass1') as Phaser.Physics.Arcade.Image;
  img.setVisible(false);

  const body = img.body as Phaser.Physics.Arcade.StaticBody;
  // obstacles.create inserted the body at frame size (16×16). Fix it:
  scene.physics.world.remove(body);   // remove stale 16×16 tree entry
  body.setSize(w, h, true);           // correct width/height; adjusts offset to centre on frame
  body.reset(cx, cy);                 // recompute position with updated offset
  scene.physics.world.add(body);      // re-insert at correct w×h bounds

  return img;
}

/**
 * Extract a 16×16 region of `atlas` into a standalone T×T canvas texture.
 * Idempotent — safe to call multiple times with the same key.
 */
export function makeTile(
  ctx:   WorldCtx,
  key:   string,
  atlas: string,
  srcX:  number,
  srcY:  number,
): void {
  if (ctx.scene.textures.exists(key)) return;
  const src = ctx.scene.textures.get(atlas).getSourceImage() as HTMLImageElement;
  const cvs = document.createElement('canvas');
  cvs.width = T; cvs.height = T;
  cvs.getContext('2d')!.drawImage(src, srcX, srcY, 16, 16, 0, 0, T, T);
  ctx.scene.textures.addCanvas(key, cvs);
}

/** Add an invisible static collision block to the obstacles group. */
export function addBlock(
  ctx: WorldCtx,
  cx: number, cy: number,
  w:  number, h:  number,
): void {
  createObstacleBlock(ctx.scene, ctx.obstacles, cx, cy, w, h);
}
