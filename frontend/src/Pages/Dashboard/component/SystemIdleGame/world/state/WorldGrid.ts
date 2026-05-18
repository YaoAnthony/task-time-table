/**
 * WorldGrid is the pathfinding source of truth:
 * - terrain per cell
 * - logical objects per cell
 * - navigation overlays generated from Phaser collision bodies
 *
 * Terrain/object data is serialized for multiplayer snapshots. Navigation
 * overlays are runtime-only and are rebuilt from colliders on scene boot.
 */

import { WORLD_W, WORLD_H } from '../../constants';
import { T } from '../utils';

export const GRID_COLS = Math.ceil(WORLD_W / T);
export const GRID_ROWS = Math.ceil(WORLD_H / T);

export const TerrainType = {
  GRASS:   1,
  PATH:    2,
  WATER:   3,
  BORDER:  4,
  POND:    5,
  FOLIAGE: 6,
} as const;
export type TerrainType = typeof TerrainType[keyof typeof TerrainType];

export const ObjectType = {
  EMPTY:          0,
  FARM_TILLED:    1,
  FARM_WATERED:   2,
  FARM_SEEDED:    3,
  FARM_GROWING:   4,
  FARM_READY:     5,
  FARM_HARVESTED: 6,
  TREE:           10,
  CHEST:          11,
  BED:            12,
  NEST:           13,
  ROCK:           14,
  BUSH:           15,
} as const;
export type ObjectType = typeof ObjectType[keyof typeof ObjectType];

const TERRAIN_WEIGHT: Record<number, number> = {
  [TerrainType.GRASS]:   1.0,
  [TerrainType.PATH]:    0.5,
  [TerrainType.WATER]:   0,
  [TerrainType.BORDER]:  0,
  [TerrainType.POND]:    0,
  [TerrainType.FOLIAGE]: 2.5,
};

const BLOCKING_OBJECTS = new Set<number>([
  ObjectType.TREE,
  ObjectType.CHEST,
  ObjectType.ROCK,
  ObjectType.BUSH,
]);

export class WorldGrid {
  readonly cols: number;
  readonly rows: number;

  private terrain: Uint8Array;
  private objects: Uint8Array;
  private navBlocked: Uint8Array;
  private navPenalty: Float32Array;
  private weights: Float32Array;

  constructor(cols = GRID_COLS, rows = GRID_ROWS) {
    const total = cols * rows;
    this.cols       = cols;
    this.rows       = rows;
    this.terrain    = new Uint8Array(total).fill(TerrainType.GRASS);
    this.objects    = new Uint8Array(total).fill(ObjectType.EMPTY);
    this.navBlocked = new Uint8Array(total);
    this.navPenalty = new Float32Array(total).fill(1);
    this.weights    = new Float32Array(total).fill(TERRAIN_WEIGHT[TerrainType.GRASS]);
  }

  worldToCell(wx: number, wy: number): { col: number; row: number } {
    return {
      col: Math.floor(wx / T),
      row: Math.floor(wy / T),
    };
  }

  cellToWorld(col: number, row: number): { cx: number; cy: number } {
    return {
      cx: col * T + T / 2,
      cy: row * T + T / 2,
    };
  }

  setTerrain(col: number, row: number, type: TerrainType): void {
    if (!this.inBounds(col, row)) return;
    const idx = row * this.cols + col;
    this.terrain[idx] = type;
    this.recomputeWeight(idx);
  }

  getTerrain(col: number, row: number): TerrainType {
    if (!this.inBounds(col, row)) return TerrainType.BORDER;
    return this.terrain[row * this.cols + col] as TerrainType;
  }

  fillTerrain(c0: number, r0: number, c1: number, r1: number, type: TerrainType): void {
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        this.setTerrain(c, r, type);
      }
    }
  }

  setObject(col: number, row: number, type: ObjectType): void {
    if (!this.inBounds(col, row)) return;
    const idx = row * this.cols + col;
    this.objects[idx] = type;
    this.recomputeWeight(idx);
  }

  getObject(col: number, row: number): ObjectType {
    if (!this.inBounds(col, row)) return ObjectType.EMPTY;
    return this.objects[row * this.cols + col] as ObjectType;
  }

  getWeight(col: number, row: number): number {
    if (!this.inBounds(col, row)) return 0;
    return this.weights[row * this.cols + col];
  }

  getWeightsBuffer(): Float32Array {
    return this.weights;
  }

  clearNavigationOverrides(): void {
    this.navBlocked.fill(0);
    this.navPenalty.fill(1);
    for (let i = 0; i < this.weights.length; i += 1) this.recomputeWeight(i);
  }

  setNavigationBlock(col: number, row: number, blocked: boolean): void {
    if (!this.inBounds(col, row)) return;
    const idx = row * this.cols + col;
    this.navBlocked[idx] = blocked ? 1 : 0;
    this.recomputeWeight(idx);
  }

  setNavigationPenalty(col: number, row: number, penalty: number): void {
    if (!this.inBounds(col, row)) return;
    const idx = row * this.cols + col;
    this.navPenalty[idx] = Math.max(this.navPenalty[idx], Math.max(1, penalty));
    this.recomputeWeight(idx);
  }

  isNavigationBlocked(col: number, row: number): boolean {
    if (!this.inBounds(col, row)) return true;
    return this.navBlocked[row * this.cols + col] === 1;
  }

  findNearest(
    col: number,
    row: number,
    predicate: (c: number, r: number) => boolean,
    maxRadius = 20,
  ): { col: number; row: number } | null {
    for (let d = 0; d <= maxRadius; d += 1) {
      for (let dc = -d; dc <= d; dc += 1) {
        for (let dr = -d; dr <= d; dr += 1) {
          if (Math.abs(dc) !== d && Math.abs(dr) !== d) continue;
          const c = col + dc;
          const r = row + dr;
          if (this.inBounds(c, r) && predicate(c, r)) return { col: c, row: r };
        }
      }
    }
    return null;
  }

  queryRect(
    c0: number,
    r0: number,
    c1: number,
    r1: number,
    predicate: (c: number, r: number) => boolean,
  ): Array<{ col: number; row: number }> {
    const results: Array<{ col: number; row: number }> = [];
    for (let r = r0; r <= r1; r += 1) {
      for (let c = c0; c <= c1; c += 1) {
        if (this.inBounds(c, r) && predicate(c, r)) results.push({ col: c, row: r });
      }
    }
    return results;
  }

  serialize(): { terrain: number[]; objects: number[] } {
    return {
      terrain: Array.from(this.terrain),
      objects: Array.from(this.objects),
    };
  }

  static deserialize(data: { terrain: number[]; objects: number[] }): WorldGrid {
    const grid = new WorldGrid(GRID_COLS, GRID_ROWS);
    for (let i = 0; i < data.terrain.length; i += 1) {
      const col = i % grid.cols;
      const row = Math.floor(i / grid.cols);
      grid.setTerrain(col, row, data.terrain[i] as TerrainType);
      grid.setObject(col, row, data.objects[i] as ObjectType);
    }
    return grid;
  }

  private inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }

  private recomputeWeight(idx: number): void {
    if (this.navBlocked[idx] === 1 || BLOCKING_OBJECTS.has(this.objects[idx])) {
      this.weights[idx] = 0;
      return;
    }

    const terrainWeight = TERRAIN_WEIGHT[this.terrain[idx]] ?? 1.0;
    this.weights[idx] = terrainWeight <= 0 ? 0 : terrainWeight * this.navPenalty[idx];
  }
}
