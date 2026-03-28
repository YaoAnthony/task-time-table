/**
 * PerceptionSystem — describes the NPC's visible surroundings to the LLM.
 *
 * Called just before the NPC chat API request, so the LLM knows what
 * the NPC can "see" when deciding what actions to take.
 *
 * Sprint 5: Uses SpatialIndex for O(1)-amortised tree/item radius queries
 * instead of O(n) full-list iteration.
 */

import type { Tree }         from '../entities/Tree';
import type { WorldItem }    from '../entities/WorldItem';
import type { SpatialIndex } from '../shared/SpatialIndex';
import { WORLD_LOCATIONS }   from '../shared/WorldLocations';

function dist2(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2, dy = y1 - y2;
  return dx * dx + dy * dy;
}

export class PerceptionSystem {
  constructor(
    private readonly getTrees:      () => Map<string, Tree>,
    private readonly getWorldItems: () => WorldItem[],
    private readonly spatialIndex?: SpatialIndex,
  ) {}

  /**
   * Scan around (cx, cy) within `radius` pixels and return a Chinese
   * description of what the NPC can observe. Used as LLM context.
   */
  scan(cx: number, cy: number, radius = 350): string {
    const r2 = radius * radius;
    const parts: string[] = [];

    // ── Trees (via SpatialIndex when available) ────────────────────────────
    let liveTrees: { id: string; x: number; y: number; d: number }[];

    if (this.spatialIndex) {
      liveTrees = this.spatialIndex
        .queryRadius(cx, cy, radius)
        .map(e => {
          const tree = e.ref as Tree;
          return { id: tree.id, x: e.wx, y: e.wy, d: dist2(cx, cy, e.wx, e.wy), _tree: tree };
        })
        .filter(t => !(t as any)._tree.isChopped())
        .sort((a, b) => a.d - b.d);
    } else {
      liveTrees = [...this.getTrees().values()]
        .filter(t => !t.isChopped())
        .map(t => ({ id: t.id, x: t.worldX, y: t.worldY, d: dist2(cx, cy, t.worldX, t.worldY) }))
        .filter(t => t.d <= r2)
        .sort((a, b) => a.d - b.d);
    }

    if (liveTrees.length > 0) {
      const c = liveTrees[0];
      parts.push(
        `视野内有 ${liveTrees.length} 棵可以砍的树；` +
        `最近的树ID="${c.id}" 坐标(${Math.round(c.x)},${Math.round(c.y)})`,
      );
    } else {
      parts.push('视野内没有可砍的树');
    }

    // ── Ground items ───────────────────────────────────────────────────────
    const groundItems = this.getWorldItems()
      .filter(i => !i.gone)
      .map(i => ({
        itemId: i.itemId, x: i.worldX, y: i.worldY,
        d: dist2(cx, cy, i.worldX, i.worldY),
      }))
      .filter(i => i.d <= r2);

    if (groundItems.length > 0) {
      parts.push(
        `地上有物品：${groundItems
          .map(i => `${i.itemId}(${Math.round(i.x)},${Math.round(i.y)})`)
          .join(', ')}`,
      );
    }

    // ── Static landmarks (data-driven from WorldLocations) ────────────────
    for (const loc of WORLD_LOCATIONS) {
      if (loc.desc) parts.push(loc.desc);
    }

    return parts.join('；');
  }
}
