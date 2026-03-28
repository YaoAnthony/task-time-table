/**
 * Tree entity — a world object with three growth stages.
 *
 * Stage layout in Basic_Grass_Biom_things.png (source 16 px tiles):
 *   A (young)  : col  0,   rows 0-1 → src x=0,  y=0,  16×32  (tree_stage1)
 *   B (medium) : cols 1-2, rows 0-1 → src x=16, y=0,  32×32  (tree_stage2_no_fruit)
 *   C (fruit)  : cols 3-4, rows 0-1 → src x=48, y=0,  32×32  (tree_stage2_fruit)
 *   chopA stump: col  3,   row  2   → src x=48, y=32, 16×16  (stump_small)
 *   chopBC log : col  4,   row  2   → src x=64, y=32, 16×16  (stump_large)
 *   fruit icon : col  2,   row  2   → src x=32, y=32, 16×16  (apple_ripe)
 *
 * Growth cycle (real time):
 *   A ──(60 s)──► B ──(120 s)──► C
 *   After fruit harvest: C reverts to B and regrows.
 *
 * Interactions:
 *   F key (interact)  → harvest fruit when stage = C
 *   Space + axe tool  → chop tree (GameScene calls chop())
 */

import Phaser from 'phaser';
import type { Interactable } from '../types';
import type { TreeSaveState } from '../../../../../Types/Profile';
import { createObstacleBlock } from '../world/utils';
import { gameBus } from '../shared/EventBus';

// ─── Types ───────────────────────────────────────────────────────────────────
export type TreeStage = 'A' | 'B' | 'C' | 'chopA' | 'chopBC';

// ─── Source regions (px in Basic_Grass_Biom_things.png, 144×80) ──────────────
// [srcX, srcY, srcW, srcH]
const SRC: Record<string, [number, number, number, number]> = {
  A:     [0,  0,  16, 32],   // col 0,   rows 0-1 → tree_stage1 (16×32)
  B:     [16, 0,  32, 32],   // cols 1-2, rows 0-1 → tree_stage2_no_fruit (32×32)
  C:     [48, 0,  32, 32],   // cols 3-4, rows 0-1 → tree_stage2_fruit (32×32)
  chopA: [48, 32, 16, 16],   // col 3, row 2 → stump_small (16×16)
  chopBC:[64, 32, 16, 16],   // col 4, row 2 → stump_large (16×16)
  fruit: [32, 32, 16, 16],   // col 2, row 2 → apple_ripe icon (16×16)
};

// Scale: source 16 px tiles → 32 px world tiles (OBJ_SCALE = 2)
const SCALE = 2;

// Growth timers (ms real time)
const GROW_A_B_MS = 60_000;   // 1 minute
const GROW_B_C_MS = 120_000;  // 2 minutes

// Interaction radius in world pixels
const TREE_INTERACT_RADIUS = 72;

// ─── Tree entity ─────────────────────────────────────────────────────────────
export class Tree implements Interactable {
  readonly id:     string;
  readonly worldX: number;
  readonly worldY: number;

  private scene:       Phaser.Scene;
  private sprite:      Phaser.GameObjects.Image;
  private stage:       TreeStage;
  private growTimer?:  Phaser.Time.TimerEvent;
  private hasFruit     = false;


  constructor(
    scene:         Phaser.Scene,
    x:             number,
    y:             number,
    id:            string,
    obstacles?:    Phaser.Physics.Arcade.StaticGroup,
    initialStage:  TreeStage = 'A',
    /** Override hasFruit after applyStage (e.g. restoring a harvested C tree) */
    initialHasFruit?: boolean,
  ) {
    this.scene     = scene;
    this.worldX    = x;
    this.worldY    = y;
    this.id        = id;
    this.stage     = initialStage;

    this.ensureTextures();

    this.sprite = scene.add
      .image(x, y, `tree-tex-A`)
      .setOrigin(0.5, 1)
      .setDepth(y + 10);

    // Optional collision body
    if (obstacles) {
      const block = createObstacleBlock(scene, obstacles, x, y - 8, 28, 16);
      block.setActive(true);
    }

    this.applyStage(initialStage);

    // Override hasFruit if explicitly provided (e.g. C tree already harvested)
    if (initialHasFruit !== undefined) this.hasFruit = initialHasFruit;

    // Only schedule growth for living (non-chopped) trees
    const isChopped = initialStage === 'chopA' || initialStage === 'chopBC';
    if (!isChopped) {
      if (initialStage === 'A') this.scheduleGrow('A');
      else if (initialStage === 'B') this.scheduleGrow('B');
      // C: already bearing fruit — no growth needed
    }
  }

  // ── Canvas texture extraction ──────────────────────────────────────────────
  private ensureTextures(): void {
    const make = (key: string, sx: number, sy: number, sw: number, sh: number) => {
      if (this.scene.textures.exists(key)) return;
      const img = this.scene.textures.get('objects').getSourceImage() as HTMLImageElement;
      const cvs = document.createElement('canvas');
      cvs.width  = sw * SCALE;
      cvs.height = sh * SCALE;
      const ctx = cvs.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * SCALE, sh * SCALE);
      this.scene.textures.addCanvas(key, cvs);
    };

    make('tree-tex-A',    ...SRC.A);
    make('tree-tex-B',    ...SRC.B);
    make('tree-tex-C',    ...SRC.C);
    make('tree-tex-chopA', ...SRC.chopA);
    make('tree-tex-chopBC',...SRC.chopBC);
    make('tree-tex-fruit', ...SRC.fruit);
  }

  // ── Stage transitions ──────────────────────────────────────────────────────
  private applyStage(stage: TreeStage): void {
    this.stage = stage;
    const TEX: Record<TreeStage, string> = {
      A:     'tree-tex-A',
      B:     'tree-tex-B',
      C:     'tree-tex-C',
      chopA: 'tree-tex-chopA',
      chopBC:'tree-tex-chopBC',
    };
    this.sprite.setTexture(TEX[stage]).setDepth(this.worldY + 10);
    if (stage === 'C') this.hasFruit = true;
  }

  private scheduleGrow(from: 'A' | 'B'): void {
    this.growTimer?.remove();
    this.growTimer = this.scene.time.addEvent({
      delay:    from === 'A' ? GROW_A_B_MS : GROW_B_C_MS,
      callback: () => {
        if (from === 'A') {
          this.applyStage('B');
          this.scheduleGrow('B');
        } else {
          this.applyStage('C');
        }
      },
    });
  }

  // ── Interactable interface ─────────────────────────────────────────────────
  isNearPlayer(px: number, py: number, radius = TREE_INTERACT_RADIUS): boolean {
    const dx = px - this.worldX;
    const dy = py - this.worldY;
    return dx * dx + dy * dy <= radius * radius;
  }

  /** F key → harvest fruit (stage C only). */
  interact(): void {
    if (this.stage === 'C' && this.hasFruit) this.harvestFruit();
  }

  /** Serialise for save / restore. */
  getState(): TreeSaveState {
    return { id: this.id, stage: this.stage, hasFruit: this.hasFruit };
  }

  // ── Axe chop (called by GameScene when Space + axe) ───────────────────────
  isChopped(): boolean {
    return this.stage === 'chopA' || this.stage === 'chopBC';
  }

  chop(): void {
    if (this.isChopped()) return;
    this.growTimer?.remove();
    this.growTimer = undefined;
    this.applyStage(this.stage === 'A' ? 'chopA' : 'chopBC');

    // Chop particle: a few flying leaf sprites
    this.spawnChopParticles();
  }

  // ── Fruit harvest ──────────────────────────────────────────────────────────
  private harvestFruit(): void {
    this.hasFruit = false;

    // Floating fruit icon rises and fades
    const icon = this.scene.add
      .image(this.worldX, this.worldY - 40, 'tree-tex-fruit')
      .setDepth(9999);
    this.scene.tweens.add({
      targets:  icon,
      y:        this.worldY - 90,
      alpha:    0,
      duration: 900,
      ease:     'Cubic.Out',
      onComplete: () => icon.destroy(),
    });

    // Notify React → inventory
    gameBus.emit('player:item_pickup', { itemKey: 'fruit', quantity: 1 });

    // Tree regresses to B then re-grows to C
    this.applyStage('B');
    this.scheduleGrow('B');
  }

  // ── Visual feedback ────────────────────────────────────────────────────────
  /** Pulsing green ring shown when player is near. */
  highlight(): void {
    const g = this.scene.add.graphics().setDepth(this.worldY + 20);
    g.lineStyle(2, 0x44ff88, 1);
    g.strokeCircle(this.worldX, this.worldY - 20, 30);
    this.scene.tweens.add({
      targets:  g,
      alpha:    0,
      duration: 700,
      onComplete: () => g.destroy(),
    });
  }

  private spawnChopParticles(): void {
    for (let i = 0; i < 5; i++) {
      const p = this.scene.add.graphics().setDepth(this.worldY + 25);
      p.fillStyle(0x44aa22, 1);
      p.fillRect(-3, -3, 6, 6);
      p.x = this.worldX + Phaser.Math.Between(-10, 10);
      p.y = this.worldY - 20;
      this.scene.tweens.add({
        targets:  p,
        x:        p.x + Phaser.Math.Between(-20, 20),
        y:        p.y + Phaser.Math.Between(-30, 10),
        alpha:    0,
        duration: 500 + Phaser.Math.Between(0, 300),
        onComplete: () => p.destroy(),
      });
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  destroy(): void {
    this.growTimer?.remove();
    this.sprite.destroy();
  }
}
