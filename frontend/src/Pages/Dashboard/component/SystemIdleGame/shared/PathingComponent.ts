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
 *   const status = pathing.update(sprite, scene); // 'moving' | 'arrived' | 'idle' | 'failed'
 */

import Phaser from 'phaser';
import type { Pathfinder } from '../systems/Pathfinder';

export type PathingStatus = 'moving' | 'arrived' | 'idle' | 'failed';

export class PathingComponent {
  private waypoints:         [number, number][] = [];
  private onArriveCallback:  (() => void) | null = null;
  private _status:           PathingStatus = 'idle';
  private lastDistance       = Infinity;
  private lastProgressAt     = 0;
  private navigationStartedAt = 0;

  private static readonly STUCK_MS = 2_000;
  private static readonly MAX_NAVIGATION_MS = 15_000;
  private static readonly PROGRESS_EPSILON = 2;

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
    this.lastDistance = Infinity;
    this.lastProgressAt = 0;
    this.navigationStartedAt = 0;

    if (this.pathfinder) {
      const path = this.pathfinder.findPath(fromX, fromY, tx, ty);
      if (path.length > 0) {
        this.waypoints = path;
        this._status = 'moving';
        return;
      }
      this.fail();
      return;
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
    this.lastDistance     = Infinity;
    this.lastProgressAt   = 0;
    this.navigationStartedAt = 0;
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  /**
   * Advance toward the next waypoint and apply velocity to `sprite`.
   *
   * @param sprite  The arcade sprite to steer.
   * @param scene   Needed only for the optional arrive-delay callback.
   * @param arriveDelay  Extra ms delay before firing the arrive callback (0 = immediate).
   * @returns  'moving' | 'arrived' (fired exactly once per arrival) | 'idle' | 'failed'
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

    const now = scene.time.now;
    if (this.navigationStartedAt === 0) {
      this.navigationStartedAt = now;
      this.lastProgressAt = now;
    }

    const [wx, wy] = this.waypoints[0];
    const dx = wx - sprite.x;
    const dy = wy - sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < this.reachDist) {
      this.lastDistance = Infinity;
      this.lastProgressAt = now;
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
    } else if (this.isStuck(dist, now)) {
      sprite.setVelocity(0, 0);
      this.fail();
      return 'failed';
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

  private isStuck(dist: number, now: number): boolean {
    if (this.navigationStartedAt > 0 && now - this.navigationStartedAt > PathingComponent.MAX_NAVIGATION_MS) {
      return true;
    }

    if (dist < this.lastDistance - PathingComponent.PROGRESS_EPSILON) {
      this.lastDistance = dist;
      this.lastProgressAt = now;
      return false;
    }

    if (this.lastDistance === Infinity) {
      this.lastDistance = dist;
      this.lastProgressAt = now;
      return false;
    }

    return now - this.lastProgressAt > PathingComponent.STUCK_MS;
  }

  private fail(): void {
    this.waypoints = [];
    this.onArriveCallback = null;
    this._status = 'failed';
    this.lastDistance = Infinity;
    this.lastProgressAt = 0;
    this.navigationStartedAt = 0;
  }
}
