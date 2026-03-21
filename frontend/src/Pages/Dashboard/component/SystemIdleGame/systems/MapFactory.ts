/**
 * MapFactory — thin factory class.
 * Holds a WorldCtx and forwards every create*() call to the
 * corresponding pure function in the world/ folder.
 */

import Phaser from 'phaser';
import { FRAMES } from '../constants';
import { WorldCtx }                                       from '../world/utils';
import { createWaterBackground, createGrassFill,
         createIslandBorder }                             from '../world/ground';
import { createRock }                                     from '../world/rock';
import { createBush }                                     from '../world/bush';
import { createFlower }                                   from '../world/flower';
import { createPond }                                     from '../world/pond';

export class MapFactory {
  private ctx: WorldCtx;

  constructor(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.StaticGroup) {
    this.ctx = { scene, obstacles };
  }

  /** Register all named frames from FRAMES onto their source textures. */
  registerFrames(): void {
    for (const [key, def] of Object.entries(FRAMES)) {
      this.ctx.scene.textures.get(def.src).add(key, 0, def.x, def.y, def.w, def.h);
    }
  }

  createWaterBackground(worldW: number, worldH: number): void {
    createWaterBackground(this.ctx, worldW, worldH);
  }

  createGrassFill(x: number, y: number, width: number, height: number): void {
    createGrassFill(this.ctx, x, y, width, height);
  }

  createIslandBorder(
    x: number, y: number,
    width: number, height: number,
    worldW: number, worldH: number,
  ): void {
    createIslandBorder(this.ctx, x, y, width, height, worldW, worldH);
  }

  createRock(x: number, y: number): void {
    createRock(this.ctx, x, y);
  }

  createBush(x: number, y: number): void {
    createBush(this.ctx, x, y);
  }

  createFlower(x: number, y: number, variant: 1 | 2 | 3 = 1): void {
    createFlower(this.ctx, x, y, variant);
  }

  createPond(x: number, y: number, cols: number, rows: number): void {
    createPond(this.ctx, x, y, cols, rows);
  }
}
