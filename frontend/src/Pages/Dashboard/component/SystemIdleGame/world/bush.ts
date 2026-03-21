import { OBJ_SCALE } from '../constants';
import { LAYER, WorldCtx, addBlock } from './utils';

/** Place a bush sprite + small collision block. */
export function createBush(ctx: WorldCtx, x: number, y: number): void {
  ctx.scene.add.sprite(x, y, 'objects', 'bush')
    .setOrigin(0.5, 1).setScale(OBJ_SCALE).setDepth(LAYER.OBJECT(y));
  addBlock(ctx, x, y - 4, 20, 12);
}
