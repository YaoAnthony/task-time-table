/**
 * RaspberryBush entity — a world shrub that regrows berries over time.
 *
 * Sprite layout in Basic_Grass_Biom_things.png (source 16 px tiles):
 *   ripe  : col 0, row 3 → src x=0,  y=48, 16×16  (raspberry_bush_ripe)
 *   empty : col 1, row 3 → src x=16, y=48, 16×16  (raspberry_bush_empty)
 *
 * Mechanics:
 *   - Press F when ripe → spawns a 'raspberry' DropItem on the ground
 *   - Bush switches to 'empty' and regrows after GROW_MS
 */

import Phaser from 'phaser';
import type { Interactable } from '../types';
import { DropItem } from './DropItem';

// ─── Source regions (px in Basic_Grass_Biom_things.png) ──────────────────────
export type BushStage = 'ripe' | 'empty';

const SRC: Record<BushStage, [number, number, number, number]> = {
  ripe:  [0,  48, 16, 16],   // col 0, row 3 — raspberry_bush_ripe
  empty: [16, 48, 16, 16],   // col 1, row 3 — raspberry_bush_empty
};

const SCALE = 2;
const GROW_MS = 90_000;        // 90 s to regrow
const INTERACT_RADIUS = 56;    // px

// ─── RaspberryBush entity ─────────────────────────────────────────────────────
export class RaspberryBush implements Interactable {
  readonly id:     string;
  readonly worldX: number;
  readonly worldY: number;

  private scene:      Phaser.Scene;
  private sprite:     Phaser.GameObjects.Image;
  private stage:      BushStage;
  private growTimer?: Phaser.Time.TimerEvent;
  private drops:      DropItem[];   // shared array managed by GameScene

  constructor(
    scene:         Phaser.Scene,
    x:             number,
    y:             number,
    id:            string,
    drops:         DropItem[],
    initialStage:  BushStage = 'ripe',
  ) {
    this.scene  = scene;
    this.worldX = x;
    this.worldY = y;
    this.id     = id;
    this.drops  = drops;
    this.stage  = initialStage;

    this.ensureTextures();

    this.sprite = scene.add
      .image(x, y, 'bush-tex-ripe')
      .setOrigin(0.5, 1)
      .setDepth(y + 5);

    this.applyStage(initialStage);

    if (initialStage === 'empty') this.scheduleGrow();
  }

  // ── Canvas texture extraction ──────────────────────────────────────────────
  private ensureTextures(): void {
    const make = (key: string, sx: number, sy: number, sw: number, sh: number) => {
      if (this.scene.textures.exists(key)) return;
      const img = this.scene.textures.get('objects').getSourceImage() as HTMLImageElement;
      const cvs = document.createElement('canvas');
      cvs.width  = sw * SCALE;
      cvs.height = sh * SCALE;
      const ctx  = cvs.getContext('2d')!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw * SCALE, sh * SCALE);
      this.scene.textures.addCanvas(key, cvs);
    };
    make('bush-tex-ripe',  ...SRC.ripe);
    make('bush-tex-empty', ...SRC.empty);
  }

  // ── Stage transitions ──────────────────────────────────────────────────────
  private applyStage(stage: BushStage): void {
    this.stage = stage;
    this.sprite
      .setTexture(stage === 'ripe' ? 'bush-tex-ripe' : 'bush-tex-empty')
      .setDepth(this.worldY + 5);
  }

  private scheduleGrow(): void {
    this.growTimer?.remove();
    this.growTimer = this.scene.time.addEvent({
      delay:    GROW_MS,
      callback: () => this.applyStage('ripe'),
    });
  }

  // ── Interactable interface ─────────────────────────────────────────────────
  isNearPlayer(px: number, py: number, radius = INTERACT_RADIUS): boolean {
    const dx = px - this.worldX;
    const dy = py - this.worldY;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    if (this.stage !== 'ripe') return;
    this.harvest();
  }

  // ── Harvest ───────────────────────────────────────────────────────────────
  private harvest(): void {
    // Spawn drop item just in front of the bush base
    const drop = new DropItem(this.scene, this.worldX, this.worldY - 8, 'raspberry');
    this.drops.push(drop);

    // Floating berry icon rises and fades as visual feedback
    const icon = this.scene.add
      .image(this.worldX, this.worldY - 20, 'drop-raspberry')
      .setDisplaySize(16, 16)
      .setDepth(9999);
    this.scene.tweens.add({
      targets:  icon,
      y:        this.worldY - 56,
      alpha:    0,
      duration: 700,
      ease:     'Cubic.Out',
      onComplete: () => icon.destroy(),
    });

    // Bush goes dormant and regrows
    this.applyStage('empty');
    this.scheduleGrow();
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────
  destroy(): void {
    this.growTimer?.remove();
    this.sprite.destroy();
  }
}
