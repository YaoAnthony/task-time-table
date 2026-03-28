/**
 * Pathfinder — weighted A* grid pathfinding for NPC navigation.
 *
 * Reads weights directly from WorldGrid (Sprint 3 refactor).
 * No longer scans Phaser physics bodies — WorldGrid is the authority.
 *
 * Cell size: 32 px (one tile, aligned with WorldGrid).
 */

import Phaser from 'phaser';
import { T } from '../world/utils';
import type { WorldGrid } from '../shared/WorldGrid';

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
  private grid: WorldGrid;
  readonly cols: number;
  readonly rows: number;
  readonly cell: number;

  constructor(grid: WorldGrid) {
    this.grid = grid;
    this.cols = grid.cols;
    this.rows = grid.rows;
    this.cell = T;   // 32 px — aligned with WorldGrid
  }

  // ── Coordinate helpers ─────────────────────────────────────────────────────
  private wc(x: number) { return Phaser.Math.Clamp(Math.floor(x / this.cell), 0, this.cols - 1); }
  private wr(y: number) { return Phaser.Math.Clamp(Math.floor(y / this.cell), 0, this.rows - 1); }
  private cx(c: number) { return c * this.cell + this.cell * 0.5; }
  private cy(r: number) { return r * this.cell + this.cell * 0.5; }

  private weight(c: number, r: number): number {
    return this.grid.getWeight(c, r);
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
