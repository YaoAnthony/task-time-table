/**
 * MapBuilder — layout config for the island world.
 * Knows WHERE things go; delegates HOW to MapFactory → world/ creators.
 */

import Phaser from 'phaser';
import { WORLD_W, WORLD_H } from '../constants';
import { T }                from '../world/utils';
import { MapFactory }       from './MapFactory';

// ── Island geometry ────────────────────────────────────────────────────────────
//
//   world: 832 × 640 px
//   border: 1 tile thick on all 4 sides (T = 32 px)
//
//   IL = 64   IR = 768   IW = 704  (22 tiles wide)
//   IT = 64   IB = 576   IH = 512  (16 tiles tall)
//
const IL = T * 2;              // island left  x = 64
const IR = WORLD_W - T * 2;   // island right x = 768
const IW = IR - IL;            // island width = 704
const IT = T * 2;              // island top   y = 64
const IB = WORLD_H - T * 2;   // island bot   y = 576
const IH = IB - IT;            // island height = 512

export class MapBuilder {
  private factory: MapFactory;

  constructor(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.StaticGroup) {
    this.factory = new MapFactory(scene, obstacles);
  }

  build(): void {
    this.factory.registerFrames();
    this.factory.createWaterBackground(WORLD_W, WORLD_H);
    this.factory.createGrassFill(IL + T, IT + T, IW - T * 2, IH - T * 2);
    this.factory.createIslandBorder(IL, IT, IW, IH, WORLD_W, WORLD_H);
    this.placePond();
  }

  // ── Pond ────────────────────────────────────────────────────────────────────
  private placePond(): void {
    this.factory.createPond(560, 390, 3, 2);
  }

}
