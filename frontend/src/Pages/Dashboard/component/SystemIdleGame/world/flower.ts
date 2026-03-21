import { OBJ_SCALE } from '../constants';
import { LAYER, WorldCtx } from './utils';

/** Place a flower sprite (no collision). variant 1 | 2 | 3. */
export function createFlower(
  ctx:     WorldCtx,
  x:       number,
  y:       number,
  variant: 1 | 2 | 3 = 1,
): void {
  ctx.scene.add.sprite(x, y, 'objects', `flower${variant}`)
    .setOrigin(0.5, 1).setScale(OBJ_SCALE).setDepth(LAYER.OBJECT(y));
}
