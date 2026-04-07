/**
 * MapBuilder — layout config for the island world.
 * Knows WHERE things go; delegates HOW to MapFactory → world/ creators.
 */

import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../constants';
import { T }                from '../world/utils';
import { VILLAGE_LAYOUT } from '../world/layouts/villageLayout';
import { MapFactory }       from './MapFactory';
import type { WorldGrid }   from '../shared/WorldGrid';

// ── Island geometry ────────────────────────────────────────────────────────────
//
//   world: 1280 × 960 px
//   border: 2 tiles thick on all 4 sides (T = 32 px)
//
//   IL = 64   IR = 1216   IW = 1152  (36 tiles wide)
//   IT = 64   IB =  896   IH =  832  (26 tiles tall)
//
const IL = T * 2;              // island left  x = 64
const IR = WORLD_W - T * 2;   // island right x = 1856
const IW = IR - IL;            // island width = 1792
const IT = T * 2;              // island top   y = 64
const IB = WORLD_H - T * 2;   // island bot   y = 1216
const IH = IB - IT;            // island height = 1152

export class MapBuilder {
  private factory: MapFactory;

  constructor(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.StaticGroup, grid?: WorldGrid) {
    this.factory = new MapFactory(scene, obstacles, grid);
  }

  build(): void {
    this.factory.registerFrames();
    this.factory.createWaterBackground(WORLD_W, WORLD_H);
    this.factory.createGrassFill(IL + T, IT + T, IW - T * 2, IH - T * 2);
    this.factory.createIslandBorder(IL, IT, IW, IH, WORLD_W, WORLD_H);
    this.placePond();
  }

  // ── Pond ────────────────────────────────────────────────────────────────────
  // South-east island area, away from all buildings and the main town square
  private placePond(): void {
    this.factory.createPond(
      VILLAGE_LAYOUT.pond.x,
      VILLAGE_LAYOUT.pond.y,
      VILLAGE_LAYOUT.pond.cols,
      VILLAGE_LAYOUT.pond.rows,
    );
  }

}
