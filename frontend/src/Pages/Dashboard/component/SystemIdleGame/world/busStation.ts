import type Phaser from 'phaser';
import { LAYER, type WorldCtx, addBlock } from './utils';

export interface BusStationConfig {
  id: string;
  x: number;
  y: number;
  scale: number;
  collisionBlocks: ReadonlyArray<{
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  }>;
}

export function createBusStation(ctx: WorldCtx, config: BusStationConfig): Phaser.GameObjects.Image {
  const station = ctx.scene.add.image(config.x, config.y, 'bus-station')
    .setName(config.id)
    .setOrigin(0.5, 0.795)
    .setScale(config.scale)
    .setDepth(LAYER.WALL(config.y));

  for (const block of config.collisionBlocks) {
    addBlock(
      ctx,
      config.x + block.offsetX,
      config.y + block.offsetY,
      block.width,
      block.height,
    );
  }

  return station;
}
