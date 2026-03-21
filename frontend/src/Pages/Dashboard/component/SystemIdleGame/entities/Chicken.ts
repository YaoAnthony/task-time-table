/**
 * Chicken entity — autonomous state-machine with A* pathfinding.
 *
 * State machine:
 *   wandering ──(thirst ≥ 80)──→ moving_to_water ──(arrived)──→ drinking(3s)
 *       ↑                                                            │
 *       └─(growth < 100, finished drinking)────────────────────────┘
 *
 *   wandering ──(growth ≥ 100)──→ moving_to_nest ──(arrived)──→ laying(5s)
 *       ↑                                                           │
 *       └─(growth reset to 0, egg placed in nest)──────────────────┘
 */

import Phaser from 'phaser';
import {
  CHICKEN_SPEED,
  CHICKEN_THIRST_TICK_MS,
  CHICKEN_THIRST_PER_TICK,
  CHICKEN_THIRST_THRESHOLD,
  CHICKEN_GROWTH_PER_DRINK,
  CHICKEN_GROWTH_THRESHOLD,
  CHICKEN_DRINK_MS,
  CHICKEN_LAY_MS,
} from '../constants';
import type { Pathfinder } from '../systems/Pathfinder';
import type { Nest } from './Nest';

type ChickenState =
  | 'wandering'
  | 'moving_to_water'
  | 'drinking'
  | 'moving_to_nest'
  | 'laying';

const REACH_DIST = 14;  // px — waypoint considered reached

export class Chicken {
  readonly sprite: Phaser.Physics.Arcade.Sprite;

  private state:      ChickenState = 'wandering';
  private thirst      = 0;
  private growth      = 0;
  private waypoints:  [number, number][] = [];
  private actionTimer = 0;        // ms remaining for drink / lay
  private nextWander  = 0;        // game-time ms for next wander decision
  private stopTime    = 0;        // game-time ms to stop current wander move
  private nextThirst  = 0;        // game-time ms for next thirst tick
  private targetNest: Nest | null = null;

  private readonly pathfinder: Pathfinder;
  private readonly waterSpots: [number, number][];
  private readonly nests:      Nest[];

  constructor(
    group:      Phaser.Physics.Arcade.Group,
    x:          number,
    y:          number,
    pathfinder: Pathfinder,
    waterSpots: [number, number][],
    nests:      Nest[],
  ) {
    this.pathfinder  = pathfinder;
    this.waterSpots  = waterSpots;
    this.nests       = nests;

    // Stagger initial thirst so chickens don't all seek water at the same time
    this.nextThirst = CHICKEN_THIRST_TICK_MS * (0.5 + Math.random());

    this.sprite = group.create(x, y, 'chicken', 0) as Phaser.Physics.Arcade.Sprite;
    this.sprite.setScale(2).setCollideWorldBounds(true).play('chicken-idle');
    this.sprite.setDepth(y + 32);
  }

  // ── Per-frame update ────────────────────────────────────────────────────────
  update(time: number, delta: number): void {
    // Thirst tick (only while wandering)
    if (this.state === 'wandering' && time > this.nextThirst) {
      this.nextThirst = time + CHICKEN_THIRST_TICK_MS;
      this.thirst     = Math.min(100, this.thirst + CHICKEN_THIRST_PER_TICK);
      if (this.thirst >= CHICKEN_THIRST_THRESHOLD) this.seekWater();
    }

    const body = this.sprite.body as Phaser.Physics.Arcade.Body;

    switch (this.state) {
      case 'wandering':
        this.updateWander(time, body);
        break;

      case 'moving_to_water':
      case 'moving_to_nest':
        this.followWaypoints(body);
        break;

      case 'drinking':
        this.actionTimer -= delta;
        if (this.actionTimer <= 0) this.finishDrinking();
        break;

      case 'laying':
        this.actionTimer -= delta;
        if (this.actionTimer <= 0) this.finishLaying();
        break;
    }

    this.sprite.setDepth(this.sprite.y + 32);
  }

  // ── Water ───────────────────────────────────────────────────────────────────
  private seekWater(): void {
    if (this.waterSpots.length === 0) return;
    const nearest = this.closestPoint(this.waterSpots);
    const path    = this.pathfinder.findPath(this.sprite.x, this.sprite.y, nearest[0], nearest[1]);
    this.waypoints = path.length > 0 ? path : [nearest];
    this.state     = 'moving_to_water';
    this.stopBody();
  }

  private startDrinking(): void {
    this.state       = 'drinking';
    this.actionTimer = CHICKEN_DRINK_MS;
    this.stopBody();
    this.sprite.play('chicken-idle', true);
  }

  private finishDrinking(): void {
    this.thirst = 0;
    this.growth = Math.min(100, this.growth + CHICKEN_GROWTH_PER_DRINK);
    if (this.growth >= CHICKEN_GROWTH_THRESHOLD) {
      this.seekNest();
    } else {
      this.state      = 'wandering';
      this.nextWander = 0;
    }
  }

  // ── Nest ────────────────────────────────────────────────────────────────────
  private seekNest(): void {
    const available = this.nests.filter(n => n.isAvailable());
    if (available.length === 0) {
      // No nest free — wait and try again after drinking once more
      this.state  = 'wandering';
      this.growth = CHICKEN_GROWTH_THRESHOLD - CHICKEN_GROWTH_PER_DRINK;
      return;
    }
    const nest       = this.closestNest(available);
    this.targetNest  = nest;
    nest.occupy();
    const path       = this.pathfinder.findPath(this.sprite.x, this.sprite.y, nest.x, nest.y);
    this.waypoints   = path.length > 0 ? path : [[nest.x, nest.y]];
    this.state       = 'moving_to_nest';
    this.stopBody();
  }

  private startLaying(): void {
    if (!this.targetNest) { this.state = 'wandering'; return; }
    this.state       = 'laying';
    this.actionTimer = CHICKEN_LAY_MS;
    this.stopBody();
    this.sprite.play('chicken-idle', true);
  }

  private finishLaying(): void {
    this.targetNest?.layEgg();
    this.targetNest = null;
    this.growth     = 0;
    this.state      = 'wandering';
    this.nextWander = 0;
  }

  // ── Random wandering ────────────────────────────────────────────────────────
  private updateWander(time: number, body: Phaser.Physics.Arcade.Body): void {
    if (time > this.nextWander) {
      if (Math.random() < 0.5) {
        const angle = Math.random() * Math.PI * 2;
        const spd   = 35 + Math.random() * 25;
        body.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
        this.sprite.setFlipX(body.velocity.x < 0);
        this.sprite.play('chicken-walk', true);
        this.stopTime   = time + 800 + Math.random() * 1200;
        this.nextWander = this.stopTime + 500 + Math.random() * 1500;
      } else {
        this.stopBody();
        this.sprite.play('chicken-idle', true);
        this.nextWander = time + 1500 + Math.random() * 2000;
      }
    }
    if (this.stopTime > 0 && time > this.stopTime) {
      this.stopBody();
      this.sprite.play('chicken-idle', true);
      this.stopTime = 0;
    }
  }

  // ── A* waypoint following ──────────────────────────────────────────────────
  private followWaypoints(body: Phaser.Physics.Arcade.Body): void {
    if (this.waypoints.length === 0) {
      this.stopBody();
      if (this.state === 'moving_to_water') this.startDrinking();
      else if (this.state === 'moving_to_nest') this.startLaying();
      return;
    }

    const [wx, wy] = this.waypoints[0];
    const dx   = wx - this.sprite.x;
    const dy   = wy - this.sprite.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < REACH_DIST) {
      this.waypoints.shift();
      if (this.waypoints.length === 0) {
        this.stopBody();
        if (this.state === 'moving_to_water') this.startDrinking();
        else if (this.state === 'moving_to_nest') this.startLaying();
      }
    } else {
      const vx = (dx / dist) * CHICKEN_SPEED;
      const vy = (dy / dist) * CHICKEN_SPEED;
      body.setVelocity(vx, vy);
      this.sprite.setFlipX(vx < 0);
      this.sprite.play('chicken-walk', true);
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────
  private stopBody(): void {
    (this.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
  }

  private closestPoint(points: [number, number][]): [number, number] {
    let best = points[0];
    let bestD = Infinity;
    for (const p of points) {
      const d = (p[0] - this.sprite.x) ** 2 + (p[1] - this.sprite.y) ** 2;
      if (d < bestD) { bestD = d; best = p; }
    }
    return best;
  }

  private closestNest(nests: Nest[]): Nest {
    let best  = nests[0];
    let bestD = Infinity;
    for (const n of nests) {
      const d = (n.x - this.sprite.x) ** 2 + (n.y - this.sprite.y) ** 2;
      if (d < bestD) { bestD = d; best = n; }
    }
    return best;
  }
}
