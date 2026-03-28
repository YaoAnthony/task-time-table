import { OBJ_SCALE } from '../constants';
import { T, LAYER, WorldCtx, addBlock } from './utils';
import { TerrainType } from '../shared/WorldGrid';

/**
 * Place a water pond grid (cols×rows tiles) + a single collision block.
 * @param x    top-left world x
 * @param y    top-left world y
 * @param cols number of tile columns
 * @param rows number of tile rows
 */
export function createPond(
  ctx:  WorldCtx,
  x:    number,
  y:    number,
  cols: number,
  rows: number,
): void {
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      ctx.scene.add.sprite(x + c * T, y + r * T, 'water', 'water0')
        .setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(LAYER.POND);
    }
  }
  addBlock(ctx, x + (cols * T) / 2, y + (rows * T) / 2, cols * T, rows * T);

  // Mark pond cells in WorldGrid
  if (ctx.grid) {
    const c0 = Math.floor(x / T), r0 = Math.floor(y / T);
    for (let r = r0; r < r0 + rows; r++)
      for (let c = c0; c < c0 + cols; c++)
        ctx.grid.setTerrain(c, r, TerrainType.POND);
  }
}
