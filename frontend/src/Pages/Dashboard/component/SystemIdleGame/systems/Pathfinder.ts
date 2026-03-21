/**
 * Pathfinder — weighted A* grid pathfinding for NPC navigation.
 *
 * Each grid cell carries a movement-cost weight:
 *   0          = impassable (solid wall / water)
 *   1          = normal grass / open ground
 *   0.5        = preferred path (road, stone path, etc.)
 *   2+         = discouraged terrain (dense foliage, mud …)
 *   DOOR_WEIGHT= door tile — walkable but slightly costly (opens on proximity)
 *
 * Any Phaser game-object placed in the scene can influence the grid via tags:
 *   _pathWeight: number   — override cell cost (0 = impassable)
 *   _isDoor:     true     — treated as passable with DOOR_WEIGHT
 *
 * Grid cell size: 16 px (half a tile) for fine-grained navigation.
 */

import Phaser from 'phaser';

// ── Terrain weights ──────────────────────────────────────────────────────────
export const WEIGHT = {
  IMPASSABLE: 0,    // solid obstacle (wall, water)
  GRASS:      1.0,  // default open ground
  PATH:       0.5,  // stone path / road — strongly preferred
  DOOR:       0.8,  // door tile — prefer going through it vs. around
  FOLIAGE:    2.5,  // bushes, dense plants — passable but slow
} as const;

// 8-directional moves: [dCol, dRow, baseCost]
const DIRS: [number, number, number][] = [
  [ 1,  0, 1], [-1,  0, 1], [ 0,  1, 1], [ 0, -1, 1],
  [ 1,  1, 1.414], [ 1, -1, 1.414], [-1,  1, 1.414], [-1, -1, 1.414],
];

interface ANode {
  c: number; r: number;
  g: number; f: number;
  parent: ANode | null;
}

export class Pathfinder {
  /** weight grid: 0 = impassable, >0 = traversal cost multiplier */
  private weights: Float32Array;
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;

  constructor(
    obstacles: Phaser.Physics.Arcade.StaticGroup,
    worldW: number,
    worldH: number,
    cell = 16,
  ) {
    this.cell = cell;
    this.cols = Math.ceil(worldW / cell);
    this.rows = Math.ceil(worldH / cell);
    this.weights = this.buildWeights(obstacles);
  }

  // ── Grid construction ──────────────────────────────────────────────────────
  private buildWeights(obstacles: Phaser.Physics.Arcade.StaticGroup): Float32Array {
    // Default: every cell is grass-weight walkable
    const w = new Float32Array(this.cols * this.rows).fill(WEIGHT.GRASS);

    obstacles.getChildren().forEach(obj => {
      const body = (obj as any).body as Phaser.Physics.Arcade.StaticBody | null;
      if (!body) return;

      const c0 = Math.max(0, Math.floor(body.left  / this.cell));
      const c1 = Math.min(this.cols - 1, Math.floor((body.right  - 1) / this.cell));
      const r0 = Math.max(0, Math.floor(body.top   / this.cell));
      const r1 = Math.min(this.rows - 1, Math.floor((body.bottom - 1) / this.cell));

      // Resolve weight: _pathWeight tag overrides, _isDoor → DOOR, else IMPASSABLE
      let weight: number;
      if (typeof (obj as any)._pathWeight === 'number') {
        weight = (obj as any)._pathWeight;
      } else if ((obj as any)._isDoor) {
        weight = WEIGHT.DOOR;
      } else {
        weight = WEIGHT.IMPASSABLE;
      }

      for (let r = r0; r <= r1; r++)
        for (let c = c0; c <= c1; c++)
          w[r * this.cols + c] = weight;
    });

    return w;
  }

  /**
   * Paint a rectangular region of the weight grid with a custom weight.
   * Call this after construction to add roads, paths, etc.
   * @param wx  world X of region top-left
   * @param wy  world Y of region top-left
   * @param ww  world width
   * @param wh  world height
   * @param weight  new weight value (use WEIGHT.PATH, WEIGHT.FOLIAGE, etc.)
   */
  paintRegion(wx: number, wy: number, ww: number, wh: number, weight: number): void {
    const c0 = Math.max(0, Math.floor(wx / this.cell));
    const c1 = Math.min(this.cols - 1, Math.floor((wx + ww - 1) / this.cell));
    const r0 = Math.max(0, Math.floor(wy / this.cell));
    const r1 = Math.min(this.rows - 1, Math.floor((wy + wh - 1) / this.cell));
    for (let r = r0; r <= r1; r++)
      for (let c = c0; c <= c1; c++)
        if (this.weights[r * this.cols + c] !== WEIGHT.IMPASSABLE)  // never un-block walls
          this.weights[r * this.cols + c] = weight;
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  private wc(x: number) { return Phaser.Math.Clamp(Math.floor(x / this.cell), 0, this.cols - 1); }
  private wr(y: number) { return Phaser.Math.Clamp(Math.floor(y / this.cell), 0, this.rows - 1); }
  private cx(c: number) { return c * this.cell + this.cell * 0.5; }
  private cy(r: number) { return r * this.cell + this.cell * 0.5; }

  private weight(c: number, r: number): number {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return WEIGHT.IMPASSABLE;
    return this.weights[r * this.cols + c];
  }

  private walkable(c: number, r: number): boolean {
    return this.weight(c, r) > 0;
  }

  /** Spiral outward from (c0,r0) to find the nearest walkable cell. */
  private nearest(c0: number, r0: number): [number, number] | null {
    for (let d = 1; d < 40; d++) {
      for (let dc = -d; dc <= d; dc++) {
        for (let dr = -d; dr <= d; dr++) {
          if (Math.abs(dc) !== d && Math.abs(dr) !== d) continue;
          if (this.walkable(c0 + dc, r0 + dr)) return [c0 + dc, r0 + dr];
        }
      }
    }
    return null;
  }

  // ── Weighted A* ────────────────────────────────────────────────────────────
  /**
   * Find a world-coordinate path from (sx,sy) → (ex,ey).
   * Lower-weight cells (e.g. WEIGHT.PATH = 0.5) are preferred over
   * higher-weight ones (e.g. WEIGHT.GRASS = 1.0).
   * Returns an array of [x,y] waypoints, or [] if unreachable.
   * Capped at 8 000 iterations to avoid freezing the game loop.
   */
  findPath(sx: number, sy: number, ex: number, ey: number): [number, number][] {
    let sc = this.wc(sx), sr = this.wr(sy);
    let ec = this.wc(ex), er = this.wr(ey);

    // Snap blocked start/end to nearest walkable
    if (!this.walkable(sc, sr)) {
      const n = this.nearest(sc, sr);
      if (!n) return [];
      [sc, sr] = n;
    }
    if (!this.walkable(ec, er)) {
      const n = this.nearest(ec, er);
      if (!n) return [];
      [ec, er] = n;
    }
    if (sc === ec && sr === er) return [[ex, ey]];

    const h   = (c: number, r: number) => Math.abs(c - ec) + Math.abs(r - er);
    const key = (c: number, r: number) => r * this.cols + c;

    const open   = new Map<number, ANode>();
    const closed = new Set<number>();
    open.set(key(sc, sr), { c: sc, r: sr, g: 0, f: h(sc, sr), parent: null });

    let iters = 0;
    while (open.size > 0 && iters++ < 8000) {
      let cur: ANode | null = null;
      for (const n of open.values()) if (!cur || n.f < cur.f) cur = n;
      if (!cur) break;

      if (cur.c === ec && cur.r === er) {
        const pts: [number, number][] = [];
        let n: ANode | null = cur;
        while (n) { pts.unshift([this.cx(n.c), this.cy(n.r)]); n = n.parent; }
        pts.push([ex, ey]);
        return this.simplify(pts);
      }

      open.delete(key(cur.c, cur.r));
      closed.add(key(cur.c, cur.r));

      for (const [dc, dr, baseCost] of DIRS) {
        const nc = cur.c + dc, nr = cur.r + dr;
        if (!this.walkable(nc, nr) || closed.has(key(nc, nr))) continue;
        // Block diagonal if both cardinal neighbours are solid
        if (dc !== 0 && dr !== 0) {
          if (!this.walkable(cur.c + dc, cur.r) && !this.walkable(cur.c, cur.r + dr)) continue;
        }
        // g cost = base movement cost × destination cell's terrain weight
        const g = cur.g + baseCost * this.weight(nc, nr);
        const existing = open.get(key(nc, nr));
        if (existing && existing.g <= g) continue;
        open.set(key(nc, nr), { c: nc, r: nr, g, f: g + h(nc, nr), parent: cur });
      }
    }
    return [];
  }

  /** Remove redundant collinear intermediate points. */
  private simplify(pts: [number, number][]): [number, number][] {
    if (pts.length <= 2) return pts;
    const out: [number, number][] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], [cx, cy] = pts[i + 1];
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(cross) > this.cell * 0.5) out.push(pts[i]);
    }
    out.push(pts[pts.length - 1]);
    return out;
  }
}
