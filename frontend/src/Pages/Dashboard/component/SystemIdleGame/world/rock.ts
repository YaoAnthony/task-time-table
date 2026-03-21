import { OBJ_SCALE } from '../constants';
import { LAYER, WorldCtx, addBlock } from './utils';

/** Place a rock sprite + small collision block. */
export function createRock(ctx: WorldCtx, x: number, y: number): void {
  ctx.scene.add.sprite(x, y, 'objects', 'rock')
    .setOrigin(0.5, 1).setScale(OBJ_SCALE).setDepth(LAYER.OBJECT(y));
  addBlock(ctx, x, y - 4, 22, 14);
}
