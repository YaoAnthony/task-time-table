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
    this.placeRocks();
    this.placeBushes();
    this.placeFlowers();
  }

  // ── Pond ────────────────────────────────────────────────────────────────────
  private placePond(): void {
    this.factory.createPond(560, 390, 3, 2);
  }

  // ── Rocks ───────────────────────────────────────────────────────────────────
  // House footprint x:390–710, y:160–352 excluded
  private placeRocks(): void {
    const positions: [number, number][] = [
      [110, 200],   // upper-left
      [380, 185],   // upper-mid (just left of house)
      [ 90, 440],   // lower-left
      [320, 455],   // lower-mid
      [660, 435],   // lower-right
    ];
    for (const [x, y] of positions) this.factory.createRock(x, y);
  }

  // ── Bushes ──────────────────────────────────────────────────────────────────
  private placeBushes(): void {
    const positions: [number, number][] = [
      [105, 230], [105, 280],   // left cluster
      [720, 250], [725, 300],   // right cluster
      [330, 190], [370, 195],   // upper-mid cluster
    ];
    for (const [x, y] of positions) this.factory.createBush(x, y);
  }

  // ── Flowers ─────────────────────────────────────────────────────────────────
  private placeFlowers(): void {
    const positions: [number, number, 1 | 2 | 3][] = [
      [140, 300, 1], [170, 325, 2], [200, 305, 3],   // near spawn
      [290, 380, 1], [320, 405, 2],                   // lower-left
      [480, 375, 3], [530, 390, 1],                   // center (below house)
      [650, 375, 2], [700, 400, 3],                   // right (below house)
      [200, 200, 1], [340, 190, 2],                   // upper strip
    ];
    for (const [x, y, v] of positions) this.factory.createFlower(x, y, v);
  }
}
