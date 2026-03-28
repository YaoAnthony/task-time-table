/**
 * Ground creators:
 *   createWaterBackground  — full-world water tileSprite
 *   createGrassFill        — grass tileSprite + variety scatter over a rectangle
 *   createIslandBorder     — 9-patch Hills cliff frame + collision walls
 */

import Phaser from 'phaser';
import { OBJ_SCALE } from '../constants';
import { T, LAYER, WorldCtx, makeTile, addBlock } from './utils';
import { TerrainType } from '../shared/WorldGrid';

// ── Water ─────────────────────────────────────────────────────────────────────

export function createWaterBackground(
  ctx:    WorldCtx,
  worldW: number,
  worldH: number,
): void {
  makeTile(ctx, 'wt-fill', 'water', 0, 0);
  ctx.scene.add
    .tileSprite(worldW / 2, worldH / 2, worldW, worldH, 'wt-fill')
    .setDepth(LAYER.WATER);
}

// ── Grass ─────────────────────────────────────────────────────────────────────

/**
 * Grass fill tileSprite + random variety scatter over a rectangle.
 * @param x      left edge (world px)
 * @param y      top  edge (world px)
 * @param width  px
 * @param height px
 */
export function createGrassFill(
  ctx:    WorldCtx,
  x:      number,
  y:      number,
  width:  number,
  height: number,
): void {
  makeTile(ctx, 'gt-fill', 'grass', 16, 16); // col=1 row=1 = plain fill

  ctx.scene.add
    .tileSprite(x + width / 2, y + height / 2, width, height, 'gt-fill')
    .setDepth(LAYER.GRASS);

  // Variety tiles: Grass.png rows 4-5, cols 0-4
  const varKeys: string[] = [];
  for (let row = 4; row <= 5; row++) {
    for (let col = 0; col < 5; col++) {
      const k = `gt-v${row}-${col}`;
      makeTile(ctx, k, 'grass', col * 16, row * 16);
      varKeys.push(k);
    }
  }

  const rng = new Phaser.Math.RandomDataGenerator(['island-seed']);
  for (let gy = y + T; gy < y + height - T; gy += T * 3) {
    for (let gx = x + T; gx < x + width - T; gx += T * 3) {
      if (rng.frac() < 0.25) {
        const key = varKeys[rng.integerInRange(0, varKeys.length - 1)];
        ctx.scene.add
          .image(
            gx + rng.integerInRange(0, T * 2),
            gy + rng.integerInRange(0, T * 2),
            key,
          )
          .setOrigin(0, 0).setDepth(LAYER.DETAIL).setAlpha(0.8);
      }
    }
  }
}

// ── Island border (9-patch Hills tileset) ─────────────────────────────────────

/**
 * Draws the 9-patch Hills cliff border around the island rectangle and
 * adds invisible collision walls so the player cannot leave the grass.
 *
 *   A B B … B C   ← top row
 *   D             ← left column (repeating)
 *           F     ← right column (repeating)
 *   G H H … H I   ← bottom row
 *
 * @param x      left edge of island (world px)
 * @param y      top  edge of island
 * @param width  total island width  (border included)
 * @param height total island height
 * @param worldW full world width  (for outer water collision strips)
 * @param worldH full world height
 */
export function createIslandBorder(
  ctx:    WorldCtx,
  x:      number,
  y:      number,
  width:  number,
  height: number,
  worldW: number,
  worldH: number,
): void {
  const cols = width  / T;
  const rows  = height / T;

  // Top row: A, B…B, C
  for (let c = 0; c < cols; c++) {
    const frame = c === 0 ? 'hillA' : c === cols - 1 ? 'hillC' : 'hillB';
    ctx.scene.add.sprite(x + c * T, y, 'hills', frame)
      .setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(LAYER.BORDER);
  }
  // Bottom row: G, H…H, I
  for (let c = 0; c < cols; c++) {
    const frame = c === 0 ? 'hillG' : c === cols - 1 ? 'hillI' : 'hillH';
    ctx.scene.add.sprite(x + c * T, y + height - T, 'hills', frame)
      .setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(LAYER.BORDER);
  }
  // Left (D) and right (F) columns — skip corners
  for (let r = 1; r < rows - 1; r++) {
    ctx.scene.add.sprite(x,              y + r * T, 'hills', 'hillD').setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(LAYER.BORDER);
    ctx.scene.add.sprite(x + width - T,  y + r * T, 'hills', 'hillF').setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(LAYER.BORDER);
  }

  // Collision: border tile + water strip on each of the 4 sides
  addBlock(ctx, worldW / 2, (y + T) / 2,                                       worldW, y + T);
  addBlock(ctx, worldW / 2, y + height - T + (worldH - y - height + T) / 2,   worldW, worldH - y - height + T);
  addBlock(ctx, (x + T) / 2,                          worldH / 2,              x + T,  worldH);
  addBlock(ctx, x + width - T + (worldW - x - width + T) / 2, worldH / 2,     worldW - x - width + T, worldH);

  // Mark border + water cells in WorldGrid (for pathfinding)
  if (ctx.grid) {
    const { grid } = ctx;
    const c0 = Math.floor(x / T), r0 = Math.floor(y / T);
    const c1 = Math.floor((x + width - 1) / T);
    const r1 = Math.floor((y + height - 1) / T);
    // Top/bottom border rows
    for (let c = c0; c <= c1; c++) {
      grid.setTerrain(c, r0, TerrainType.BORDER);
      grid.setTerrain(c, r1, TerrainType.BORDER);
    }
    // Left/right border columns
    for (let r = r0 + 1; r < r1; r++) {
      grid.setTerrain(c0, r, TerrainType.BORDER);
      grid.setTerrain(c1, r, TerrainType.BORDER);
    }
    // Outer water strips
    const worldCols = Math.ceil(worldW / T), worldRows = Math.ceil(worldH / T);
    for (let c = 0; c < worldCols; c++) {
      for (let r = 0; r < r0; r++) grid.setTerrain(c, r, TerrainType.WATER);
      for (let r = r1 + 1; r < worldRows; r++) grid.setTerrain(c, r, TerrainType.WATER);
    }
    for (let r = 0; r < worldRows; r++) {
      for (let c = 0; c < c0; c++) grid.setTerrain(c, r, TerrainType.WATER);
      for (let c = c1 + 1; c < worldCols; c++) grid.setTerrain(c, r, TerrainType.WATER);
    }
  }
}
