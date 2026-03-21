/**
 * House — 10×6 tiled wooden house with door proximity animation.
 *
 * Layout (each tile = 16×16 src → 32×32 display at OBJ_SCALE=2):
 *
 *   col:  0  1  2  3  4  5  6  7  8  9
 *   row0: H  I  I  I  B  I  I  I  I  J   ← roof
 *   row1: O  P  P  P  P  P  P  P  P  Q   ← wall
 *   row2: O  P  P  P  P  P  P  P  P  Q   ← wall
 *   row3: O  P  P  P  P  P  P  P  P  Q   ← wall
 *   row4: O  P  P  P  P  P  P  P  P  Q   ← wall
 *   row5: V  W  W  D  W  W  W  W  W  X   ← floor (D=door at col 3)
 *
 * Collision — full perimeter, interior walkable:
 *   • Top  wall  rows 0-1, full width (roof + upper wall row, 2T tall)
 *   • Left  wall col 0, rows 0-5 (full height)
 *   • Right wall col 9, rows 0-5 (full height)
 *   • Bottom left  of door (cols 0-2, row 5)
 *   • Bottom right of door (cols 4-9, row 5)
 *   • Door tile (col 3, row 5) — toggled on open/close
 *
 * Door animation:  open = K→Y→R→D   close = D→R→Y→K
 */

import Phaser from 'phaser';
import { OBJ_SCALE } from '../constants';
import { createObstacleBlock } from '../world/utils';

const T = 16 * OBJ_SCALE; // 32 px per tile

// Tile key → [srcX, srcY] in Wooden House.png (16×16 tiles)
const SRC: Record<string, [number, number]> = {
  B: [16,  0],   // chimney     (r0,c1)
  D: [48,  0],   // door open   (r0,c3)
  H: [ 0, 16],   // roof-left   (r1,c0)
  I: [16, 16],   // roof-mid    (r1,c1)
  J: [32, 16],   // roof-right  (r1,c2)
  K: [48, 16],   // door closed (r1,c3)
  O: [ 0, 32],   // wall-left   (r2,c0)
  P: [16, 32],   // wall-mid    (r2,c1)
  Q: [32, 32],   // wall-right  (r2,c2)
  R: [48, 32],   // door half   (r2,c3)
  V: [ 0, 48],   // floor-left  (r3,c0)
  W: [16, 48],   // floor-mid   (r3,c1)
  X: [32, 48],   // floor-right (r3,c2)
  Y: [48, 48],   // door ajar   (r3,c3)
};

// 10 cols × 6 rows  (door starts as K = closed)
const LAYOUT: string[][] = [
  ['H','I','I','I','B','I','I','I','I','J'],
  ['O','P','P','P','P','P','P','P','P','Q'],
  ['O','P','P','P','P','P','P','P','P','Q'],
  ['O','P','P','P','P','P','P','P','P','Q'],
  ['O','P','P','P','P','P','P','P','P','Q'],
  ['V','W','W','K','W','W','W','W','W','X'],  // K = door closed on spawn
];

const HOUSE_COLS  = 10;
const HOUSE_ROWS  = 6;
const DOOR_COL    = 3;
const DOOR_ROW    = 5;
const DOOR_DIST   = 120; // px  — player proximity to trigger

export class House {
  private scene:         Phaser.Scene;
  readonly houseX:       number;
  readonly houseY:       number;
  private doorSprite!:   Phaser.GameObjects.Image;
  private doorCollider!: Phaser.Physics.Arcade.Image;
  private doorOpen      = false;
  private doorAnimating = false;

  constructor(
    scene:     Phaser.Scene,
    houseX:    number,
    houseY:    number,
    obstacles: Phaser.Physics.Arcade.StaticGroup,
  ) {
    this.scene  = scene;
    this.houseX = houseX;
    this.houseY = houseY;

    this.extractTextures();
    this.placeTiles();
    this.buildWalls(obstacles);
  }

  // ── Extract each needed tile into its own T×T canvas texture ─────────────
  private extractTextures(): void {
    const src = this.scene.textures.get('house').getSourceImage() as HTMLImageElement;
    for (const [key, [sx, sy]] of Object.entries(SRC)) {
      const k = `house-tile-${key}`;
      if (this.scene.textures.exists(k)) continue;
      const cvs = document.createElement('canvas');
      cvs.width = T; cvs.height = T;
      cvs.getContext('2d')!.drawImage(src, sx, sy, 16, 16, 0, 0, T, T);
      this.scene.textures.addCanvas(k, cvs);
    }
  }

  // ── Place all visual tiles ────────────────────────────────────────────────
  //  Depth rules:
  //    row 0  (roof)        → 600      — always above player, below night overlay
  //    rows 1-4 (walls)     → wy + 10  — Y-sorted: characters below the house appear in front
  //    row 5  (front floor) → GRASS(-9) — same layer as ground so characters always walk on top
  private placeTiles(): void {
    const { scene, houseX, houseY } = this;

    for (let row = 0; row < HOUSE_ROWS; row++) {
      for (let col = 0; col < HOUSE_COLS; col++) {
        const wx   = houseX + col * T;
        const wy   = houseY + row * T;
        const depth = row === 0 ? 600   // roof
                    : row  <  5 ? wy + 10  // walls — Y-sorted
                    :             -9;       // floor — grass level
        const tKey = LAYOUT[row][col];

        if (row === DOOR_ROW && col === DOOR_COL) {
          this.doorSprite = scene.add.image(wx, wy, 'house-tile-K')
            .setOrigin(0, 0).setDepth(depth);
          continue;
        }
        scene.add.image(wx, wy, `house-tile-${tKey}`)
          .setOrigin(0, 0).setDepth(depth);
      }
    }
  }

  // ── Collision walls — full perimeter, interior is clear ──────────────────
  private buildWalls(obstacles: Phaser.Physics.Arcade.StaticGroup): void {
    const { houseX: hx, houseY: hy } = this;
    const innerLeftX = hx + T;
    const innerRightX = hx + HOUSE_COLS * T - T;

    // Top wall: shrink to the inner edges of the narrowed side walls.
    this.addBlock(
      obstacles,
      (innerLeftX + innerRightX) / 2,
      hy + T / 2,
      innerRightX - innerLeftX,
      T,
    );

    // Left wall: shifted right — visual wall face is on the right side of col 0
    this.addBlock(obstacles, hx + T * 3 / 4, hy + HOUSE_ROWS * T / 2, T / 2, HOUSE_ROWS * T);

    // Right wall: shifted left — visual wall face is on the left side of col 9
    this.addBlock(obstacles, hx + HOUSE_COLS * T - T * 3 / 4, hy + HOUSE_ROWS * T / 2, T / 2, HOUSE_ROWS * T);

    // Bottom wall — left of door. Also starts at the inner edge of the left wall.
    this.addBlock(obstacles, hx + T * 1.5, hy + T * 5.5, T, T);

    // Bottom wall — right of door. Ends at the inner edge of the right wall.
    this.addBlock(obstacles, hx + T * 6.5, hy + T * 5.5, T * 5, T);

    // Door collision tile (toggleable). Tagged _isDoor so Pathfinder treats
    // this cell as always-passable (the door opens on proximity before arrival).
    const doorImg = createObstacleBlock(
      this.scene,
      obstacles,
      hx + DOOR_COL * T + T / 2,
      hy + DOOR_ROW * T + T / 2,
      T,
      T,
    );
    (doorImg as any)._isDoor = true;
    this.doorCollider = doorImg;
  }

  private addBlock(
    group: Phaser.Physics.Arcade.StaticGroup,
    cx: number, cy: number, w: number, h: number,
  ): void {
    createObstacleBlock(this.scene, group, cx, cy, w, h);
  }

  // ── Called every frame ────────────────────────────────────────────────────
  /** npcX/npcY optional — door also opens when NPC approaches. */
  update(playerX: number, playerY: number, npcX?: number, npcY?: number): void {
    const doorWX = this.houseX + DOOR_COL * T + T / 2;
    const doorWY = this.houseY + DOOR_ROW * T + T / 2;
    const pdx = playerX - doorWX, pdy = playerY - doorWY;
    const playerNear = pdx * pdx + pdy * pdy < DOOR_DIST * DOOR_DIST;
    const npcNear = npcX !== undefined && npcY !== undefined
      ? (npcX - doorWX) ** 2 + (npcY - doorWY) ** 2 < DOOR_DIST * DOOR_DIST
      : false;
    const near = playerNear || npcNear;

    if ( near && !this.doorOpen && !this.doorAnimating) this.animateDoor(['K','Y','R','D'], true);
    if (!near &&  this.doorOpen && !this.doorAnimating) this.animateDoor(['D','R','Y','K'], false);
  }

  private animateDoor(frames: string[], opening: boolean): void {
    this.doorAnimating = true;
    let i = 0;
    const tick = () => {
      if (i < frames.length) {
        this.doorSprite.setTexture(`house-tile-${frames[i++]}`);
        this.scene.time.delayedCall(100, tick);
      } else {
        this.doorOpen      = opening;
        this.doorAnimating = false;
        const body = this.doorCollider.body as Phaser.Physics.Arcade.StaticBody;
        body.enable = !opening;
        if (!opening) body.updateFromGameObject();
      }
    };
    tick();
  }
}
