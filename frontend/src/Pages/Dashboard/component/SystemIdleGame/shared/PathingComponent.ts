/**
 * PathingComponent — reusable A* waypoint navigation.
 *
 * Encapsulates the ~30 lines of duplicated waypoint-following code that
 * previously existed in both Npc.ts and Chicken.ts.
 *
 * Usage:
 *   const pathing = new PathingComponent(speed, reachDist, pathfinder);
 *
 *   // Navigate to world-coordinate target:
 *   pathing.navigateTo(sprite.x, sprite.y, tx, ty, () => doOnArrive());
 *
 *   // Call every frame from update():
 *   const status = pathing.update(sprite, dt);   // 'moving' | 'arrived' | 'idle'
 */

import Phaser from 'phaser';
import type { Pathfinder } from '../systems/Pathfinder';

export type PathingStatus = 'moving' | 'arrived' | 'idle';

export class PathingComponent {
  private waypoints:         [number, number][] = [];
  private onArriveCallback:  (() => void) | null = null;
  private _status:           PathingStatus = 'idle';

  constructor(
    private readonly speed:     number,
    private readonly reachDist: number,
    private readonly pathfinder: Pathfinder | null,
  ) {}

  // ── Navigation ─────────────────────────────────────────────────────────────

  /**
   * Start navigating from (fromX, fromY) toward (tx, ty).
   * Uses the Pathfinder if available; falls back to direct movement.
   */
  navigateTo(
    fromX:    number,
    fromY:    number,
    tx:       number,
    ty:       number,
    onArrive?: () => void,
  ): void {
    this.onArriveCallback = onArrive ?? null;
    this.waypoints = [];

    if (this.pathfinder) {
      const path = this.pathfinder.findPath(fromX, fromY, tx, ty);
      if (path.length > 0) {
        this.waypoints = path;
        this._status = 'moving';
        return;
      }
    }
    // Direct fallback: single waypoint at target
    this.waypoints = [[tx, ty]];
    this._status   = 'moving';
  }

  /** Stop all navigation immediately. */
  clearNavigation(): void {
    this.waypoints        = [];
    this.onArriveCallback = null;
    this._status          = 'idle';
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  /**
   * Advance toward the next waypoint and apply velocity to `sprite`.
   *
   * @param sprite  The arcade sprite to steer.
   * @param scene   Needed only for the optional arrive-delay callback.
   * @param arriveDelay  Extra ms delay before firing the arrive callback (0 = immediate).
   * @returns  'moving' | 'arrived' (fired exactly once per arrival) | 'idle'
   */
  update(
    sprite:       Phaser.Physics.Arcade.Sprite,
    scene:        Phaser.Scene,
    arriveDelay = 0,
  ): PathingStatus {
    if (this.waypoints.length === 0) {
      sprite.setVelocity(0, 0);
      return this._status;
    }

    const [wx, wy] = this.waypoints[0];
    const dx = wx - sprite.x;
    const dy = wy - sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.reachDist) {
      this.waypoints.shift();
      if (this.waypoints.length === 0) {
        sprite.setVelocity(0, 0);
        this._status = 'arrived';

        const cb = this.onArriveCallback;
        this.onArriveCallback = null;
        if (cb) {
          if (arriveDelay > 0) {
            scene.time.delayedCall(arriveDelay, cb);
          } else {
            cb();
          }
        }
        return 'arrived';
      }
    } else {
      sprite.setVelocity(
        (dx / dist) * this.speed,
        (dy / dist) * this.speed,
      );
      this._status = 'moving';
    }

    return this._status;
  }

  /** True while there are remaining waypoints. */
  isMoving(): boolean { return this.waypoints.length > 0; }

  /** Current navigation status (does not advance state). */
  get status(): PathingStatus { return this._status; }
}
