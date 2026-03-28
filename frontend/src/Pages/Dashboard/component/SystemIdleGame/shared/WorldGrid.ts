/**
 * WorldGrid — 2D tile data structure that is the single source of truth for:
 *   · Terrain type per cell (grass, water, border, pond, path)
 *   · Object type per cell (farm tiles, trees, chests, beds, …)
 *   · Pathfinding weights (Pathfinder reads these directly — no physics scan)
 *
 * Cell size: T = 32 px (one displayed tile).
 * World 832 × 640 → 26 cols × 20 rows.
 *
 * Terrain and object types are stored as plain numbers (const enums) so the
 * grid can be JSON-serialised for the WorldSnapshot / multiplayer sync.
 */

import { T } from '../world/utils';
import { WORLD_W, WORLD_H } from '../constants';

// ─── Grid dimensions ─────────────────────────────────────────────────────────
export const GRID_COLS = Math.ceil(WORLD_W / T);   // 26
export const GRID_ROWS = Math.ceil(WORLD_H / T);   // 20

// ─── Terrain types ────────────────────────────────────────────────────────────
export const TerrainType = {
  GRASS:   1,
  PATH:    2,
  WATER:   3,   // ocean / deep water — impassable
  BORDER:  4,   // cliff / hill edge — impassable
  POND:    5,   // pond tile — impassable
  FOLIAGE: 6,   // decorative bushes — passable but slow
} as const;
export type TerrainType = typeof TerrainType[keyof typeof TerrainType];

// ─── Object types ─────────────────────────────────────────────────────────────
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

// ─── Pathfinding weights (derived from terrain + object) ─────────────────────
const TERRAIN_WEIGHT: Record<number, number> = {
  [TerrainType.GRASS]:   1.0,
  [TerrainType.PATH]:    0.5,
  [TerrainType.WATER]:   0,
  [TerrainType.BORDER]:  0,
  [TerrainType.POND]:    0,
  [TerrainType.FOLIAGE]: 2.5,
};

/** Objects that block movement entirely. */
const BLOCKING_OBJECTS = new Set<number>([
  ObjectType.TREE, ObjectType.CHEST, ObjectType.ROCK, ObjectType.BUSH,
]);

// ─── WorldGrid class ──────────────────────────────────────────────────────────
export class WorldGrid {
  readonly cols: number;
  readonly rows: number;

  private terrain: Uint8Array;
  private objects: Uint8Array;
  private weights: Float32Array;   // Pathfinder holds a reference and reads directly

  constructor(cols = GRID_COLS, rows = GRID_ROWS) {
    this.cols    = cols;
    this.rows    = rows;
    this.terrain = new Uint8Array(cols * rows).fill(TerrainType.GRASS);
    this.objects = new Uint8Array(cols * rows).fill(ObjectType.EMPTY);
    this.weights = new Float32Array(cols * rows).fill(TERRAIN_WEIGHT[TerrainType.GRASS]);
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────

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

  // ── Terrain ────────────────────────────────────────────────────────────────

  setTerrain(col: number, row: number, type: TerrainType): void {
    if (!this._inBounds(col, row)) return;
    const idx = row * this.cols + col;
    this.terrain[idx] = type;
    // Re-derive weight unless an object is blocking
    if (this.objects[idx] === ObjectType.EMPTY || !BLOCKING_OBJECTS.has(this.objects[idx])) {
      this.weights[idx] = TERRAIN_WEIGHT[type] ?? 1.0;
    }
  }

  getTerrain(col: number, row: number): TerrainType {
    if (!this._inBounds(col, row)) return TerrainType.BORDER;
    return this.terrain[row * this.cols + col] as TerrainType;
  }

  /**
   * Mark a rectangular region of cells with a terrain type.
   * Useful for batch-painting borders, water, roads, etc.
   */
  fillTerrain(c0: number, r0: number, c1: number, r1: number, type: TerrainType): void {
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        this.setTerrain(c, r, type);
  }

  // ── Objects ────────────────────────────────────────────────────────────────

  setObject(col: number, row: number, type: ObjectType): void {
    if (!this._inBounds(col, row)) return;
    const idx = row * this.cols + col;
    this.objects[idx] = type;
    // Blocking objects → impassable; empty or farm tiles → restore terrain weight
    if (BLOCKING_OBJECTS.has(type)) {
      this.weights[idx] = 0;
    } else if (type === ObjectType.EMPTY) {
      this.weights[idx] = TERRAIN_WEIGHT[this.terrain[idx]] ?? 1.0;
    }
    // Farm tiles don't block movement — weight unchanged
  }

  getObject(col: number, row: number): ObjectType {
    if (!this._inBounds(col, row)) return ObjectType.EMPTY;
    return this.objects[row * this.cols + col] as ObjectType;
  }

  // ── Pathfinding ────────────────────────────────────────────────────────────

  getWeight(col: number, row: number): number {
    if (!this._inBounds(col, row)) return 0;
    return this.weights[row * this.cols + col];
  }

  /** Returns the raw weights buffer. Pathfinder can hold a reference to avoid copies. */
  getWeightsBuffer(): Float32Array { return this.weights; }

  // ── Spatial queries ────────────────────────────────────────────────────────

  /**
   * BFS spiral search: find the nearest cell matching `predicate` within maxRadius cells.
   * Returns null if nothing found.
   */
  findNearest(
    col: number,
    row: number,
    predicate: (c: number, r: number) => boolean,
    maxRadius = 20,
  ): { col: number; row: number } | null {
    for (let d = 0; d <= maxRadius; d++) {
      for (let dc = -d; dc <= d; dc++) {
        for (let dr = -d; dr <= d; dr++) {
          if (Math.abs(dc) !== d && Math.abs(dr) !== d) continue;
          const c = col + dc, r = row + dr;
          if (this._inBounds(c, r) && predicate(c, r)) return { col: c, row: r };
        }
      }
    }
    return null;
  }

  /**
   * Return all cells in [c0..c1, r0..r1] matching `predicate`.
   */
  queryRect(
    c0: number, r0: number,
    c1: number, r1: number,
    predicate: (c: number, r: number) => boolean,
  ): Array<{ col: number; row: number }> {
    const results: Array<{ col: number; row: number }> = [];
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (this._inBounds(c, r) && predicate(c, r)) results.push({ col: c, row: r });
    return results;
  }

  // ── Serialization (for WorldSnapshot / multiplayer sync) ──────────────────

  serialize(): { terrain: number[]; objects: number[] } {
    return {
      terrain: Array.from(this.terrain),
      objects: Array.from(this.objects),
    };
  }

  static deserialize(data: { terrain: number[]; objects: number[] }): WorldGrid {
    const cols = GRID_COLS, rows = GRID_ROWS;
    const grid = new WorldGrid(cols, rows);
    for (let i = 0; i < data.terrain.length; i++) {
      const col = i % cols, row = Math.floor(i / cols);
      grid.setTerrain(col, row, data.terrain[i] as TerrainType);
      grid.setObject(col, row, data.objects[i] as ObjectType);
    }
    return grid;
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private _inBounds(col: number, row: number): boolean {
    return col >= 0 && row >= 0 && col < this.cols && row < this.rows;
  }
}
