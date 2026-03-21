/**
 * MapBuilder — builds the Phaser world map.
 * Uses the same "custom frame registration + add.sprite()" pattern as
 * ozguradmin/sprout-lands-portfolio: no Tilemap API, just plain sprites.
 */

import Phaser from 'phaser';
import { FRAMES, OBJ_SCALE, WORLD_W, WORLD_H } from '../constants';

const T = 16 * OBJ_SCALE;   // display tile size = 32 px

// ── Island geometry (all in world pixels) ─────────────────────────────────────
// The island is a grass rectangle in the centre of the water world.
// Top+bottom edges each have a 3-tile-tall cliff (Hills tileset).
//
//   y=0            ← water
//   y=IT (64)      ← top cliff starts  (Hills col=0 rows 1-3)
//   y=GT (160)     ← walkable grass starts
//   y=GB (480)     ← bottom cliff starts  (Hills col=2 rows 1-3)
//   y=IB (576)     ← bottom cliff ends
//   y=WORLD_H(640) ← water
//
const IL = T * 2;              // island left  x = 64
const IR = WORLD_W - T * 2;   // island right x = 768
const IW = IR - IL;            // island width = 704
const IT = T * 2;              // top cliff starts at y=64
const GT = IT + T * 3;         // grass top     at y=160
const GB = WORLD_H - T * 5;   // grass bottom  at y=480
const IB = GB + T * 3;        // bottom cliff ends at y=576

export class MapBuilder {
  private scene:     Phaser.Scene;
  private obstacles: Phaser.Physics.Arcade.StaticGroup;

  constructor(scene: Phaser.Scene, obstacles: Phaser.Physics.Arcade.StaticGroup) {
    this.scene     = scene;
    this.obstacles = obstacles;
  }

  build(): void {
    this.registerFrames();
    this.placeWater();       // full-world water background
    this.placeIslandGrass(); // grass fill + cliff edges + collision walls
    this.placePond();
    this.placeHouse();
    // Trees are now Tree entities managed by GameScene (not static sprites)
    this.placeRocks();
    this.placeBushes();
    this.placeFlowers();
  }

  // ── Frame registration (same pattern as the reference portfolio) ─────────
  private registerFrames(): void {
    for (const [key, def] of Object.entries(FRAMES)) {
      this.scene.textures.get(def.src).add(key, 0, def.x, def.y, def.w, def.h);
    }
  }

  // ── Water background (fills the entire world) ────────────────────────────
  private placeWater(): void {
    const makeTex = (key: string, atlas: string, srcX: number, srcY: number) => {
      if (this.scene.textures.exists(key)) return;
      const src = this.scene.textures.get(atlas).getSourceImage() as HTMLImageElement;
      const cvs = document.createElement('canvas');
      cvs.width = T; cvs.height = T;
      cvs.getContext('2d')!.drawImage(src, srcX, srcY, 16, 16, 0, 0, T, T);
      this.scene.textures.addCanvas(key, cvs);
    };
    makeTex('wt-fill', 'water', 0, 0);
    this.scene.add
      .tileSprite(WORLD_W / 2, WORLD_H / 2, WORLD_W, WORLD_H, 'wt-fill')
      .setDepth(-10);
  }

  // ── Island grass + cliff borders ──────────────────────────────────────────
  //
  // Layout (T=32px per tile):
  //   y=IT (64)  → 3 rows of top cliff tiles  (Hills col=0, rows 1-3)
  //   y=GT (160) → walkable grass fill (GT to GB)
  //   y=GB (480) → 3 rows of bottom cliff tiles (Hills col=2, rows 1-3)
  //
  private placeIslandGrass(): void {
    const makeTex = (key: string, atlas: string, srcX: number, srcY: number) => {
      if (this.scene.textures.exists(key)) return;
      const src = this.scene.textures.get(atlas).getSourceImage() as HTMLImageElement;
      const cvs = document.createElement('canvas');
      cvs.width = T; cvs.height = T;
      cvs.getContext('2d')!.drawImage(src, srcX, srcY, 16, 16, 0, 0, T, T);
      this.scene.textures.addCanvas(key, cvs);
    };

    // Grass fill tile (Grass.png col=1, row=1 → px 16,16)
    makeTex('gt-fill', 'grass', 16, 16);

    // Variety tiles (rows 4-5, cols 0-4)
    const varKeys: string[] = [];
    for (let row = 4; row <= 5; row++) {
      for (let col = 0; col < 5; col++) {
        const k = `gt-v${row}-${col}`;
        makeTex(k, 'grass', col * 16, row * 16);
        varKeys.push(k);
      }
    }

    // ── Grass fill tileSprite over island area ───────────────────────────────
    const grassH = GB - GT;
    this.scene.add
      .tileSprite(IL + IW / 2, GT + grassH / 2, IW, grassH, 'gt-fill')
      .setDepth(-9);

    // ── Variety scatter inside grass area ────────────────────────────────────
    const rng = new Phaser.Math.RandomDataGenerator(['island-seed']);
    for (let y = GT + T; y < GB - T; y += T * 3) {
      for (let x = IL + T; x < IR - T; x += T * 3) {
        if (rng.frac() < 0.25) {
          const key = varKeys[rng.integerInRange(0, varKeys.length - 1)];
          this.scene.add
            .image(x + rng.integerInRange(0, T * 2), y + rng.integerInRange(0, T * 2), key)
            .setOrigin(0, 0).setDepth(-8).setAlpha(0.8);
        }
      }
    }

    // ── Top cliff: Hills col=0, rows 1-3 — repeats across island width ───────
    const TILE_COLS = Math.floor(IW / T);
    for (let c = 0; c < TILE_COLS; c++) {
      const x = IL + c * T;
      this.scene.add.sprite(x, IT,       'hills', 'hillTop1').setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(-7);
      this.scene.add.sprite(x, IT + T,   'hills', 'hillTop2').setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(-7);
      this.scene.add.sprite(x, IT + T*2, 'hills', 'hillTop3').setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(-7);
    }

    // ── Bottom cliff: Hills col=2, rows 1-3 ─────────────────────────────────
    for (let c = 0; c < TILE_COLS; c++) {
      const x = IL + c * T;
      this.scene.add.sprite(x, GB,       'hills', 'hillBot1').setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(-7);
      this.scene.add.sprite(x, GB + T,   'hills', 'hillBot2').setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(-7);
      this.scene.add.sprite(x, GB + T*2, 'hills', 'hillBot3').setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(-7);
    }

    // ── Invisible collision walls (keep player on grass) ─────────────────────
    // Top cliff block
    this.addStaticBlock(IL + IW/2, IT + T*1.5,  IW, T*3);
    // Bottom cliff block
    this.addStaticBlock(IL + IW/2, GB + T*1.5,  IW, T*3);
    // Left water strip
    this.addStaticBlock(IL/2,            WORLD_H/2, IL, WORLD_H);
    // Right water strip
    this.addStaticBlock(IR + IL/2,       WORLD_H/2, IL, WORLD_H);
    // Top water above cliff
    this.addStaticBlock(WORLD_W/2,       IT/2,      WORLD_W, IT);
    // Bottom water below cliff
    this.addStaticBlock(WORLD_W/2,       IB + (WORLD_H-IB)/2, WORLD_W, WORLD_H-IB);
  }

  // ── Water pond ────────────────────────────────────────────────────────────
  //  Lower-right area of island grass (GT=160..GB=480, IL=64..IR=768)
  private placePond(): void {
    const POND_X = 560, POND_Y = 390;
    const COLS = 3, ROWS = 2;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        this.scene.add.sprite(POND_X + c * T, POND_Y + r * T, 'water', 'water0')
          .setOrigin(0, 0).setScale(OBJ_SCALE).setDepth(-5);
      }
    }
    this.addStaticBlock(
      POND_X + (COLS * T) / 2,
      POND_Y + (ROWS * T) / 2,
      COLS * T, ROWS * T,
    );
  }

  // ── House ─────────────────────────────────────────────────────────────────
  //  Upper-right area of island grass (GT=160..GB=480, IL=64..IR=768)
  private placeHouse(): void {
    const HX = 580, HY = 250;
    this.scene.add.sprite(HX, HY, 'house', 'house')
      .setOrigin(0.5, 1).setScale(OBJ_SCALE).setDepth(HY + 10);
    this.addStaticBlock(HX, HY - 28, 160, 56);
  }

  // ── Rocks ─────────────────────────────────────────────────────────────────
  //  All within island grass: x:80–740, y:180–460
  private placeRocks(): void {
    const list: [number, number][] = [
      [110, 200],   // upper-left
      [380, 185],   // upper-mid
      [680, 210],   // upper-right
      [ 90, 440],   // lower-left
      [320, 455],   // lower-mid
      [660, 435],   // lower-right
    ];
    for (const [rx, ry] of list) {
      this.scene.add.sprite(rx, ry, 'objects', 'rock')
        .setOrigin(0.5, 1).setScale(OBJ_SCALE).setDepth(ry + 5);
      this.addStaticBlock(rx, ry - 4, 22, 14);
    }
  }

  // ── Bushes ────────────────────────────────────────────────────────────────
  //  Clustered near island edges; all within x:80–740, y:180–460
  private placeBushes(): void {
    const list: [number, number][] = [
      [ 80, 230],  [ 85, 280],   // left cluster
      [720, 250],  [725, 300],   // right cluster
      [330, 190],  [370, 195],   // upper-mid cluster
    ];
    for (const [bx, by] of list) {
      this.scene.add.sprite(bx, by, 'objects', 'bush')
        .setOrigin(0.5, 1).setScale(OBJ_SCALE).setDepth(by + 5);
      this.addStaticBlock(bx, by - 4, 20, 12);
    }
  }

  // ── Flowers ───────────────────────────────────────────────────────────────
  //  Spread naturally across island grass: x:100–720, y:180–460
  private placeFlowers(): void {
    const keys = ['flower1', 'flower2', 'flower3'] as const;
    const list: [number, number][] = [
      [140, 300],  [170, 325],  [200, 305],   // near spawn
      [290, 380],  [320, 405],                // lower-left
      [450, 350],  [480, 375],                // center
      [620, 350],  [650, 375],               // right side
      [200, 200],  [450, 200],  [680, 300],  // upper strip
    ];
    list.forEach(([fx, fy], i) => {
      this.scene.add.sprite(fx, fy, 'objects', keys[i % 3])
        .setOrigin(0.5, 1).setScale(OBJ_SCALE).setDepth(fy);
    });
  }

  // ── Invisible static collision block ──────────────────────────────────────
  private addStaticBlock(cx: number, cy: number, w: number, h: number): void {
    const img = this.scene.physics.add.staticImage(cx, cy, 'grass', 'grass1');
    img.setVisible(false).setActive(false);
    (img.body as Phaser.Physics.Arcade.StaticBody).setSize(w, h, false);
    img.refreshBody();
    this.obstacles.add(img);
  }
}
