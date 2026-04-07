/**
 * DropItem — unified pickupable item in the game world.
 *
 * - Renders a pixel-art icon (cropped from existing textures or colored circle)
 * - Gently bobs up/down
 * - Shows "[F] <name>" hint when player is within PICKUP_RADIUS
 * - Call updateHint(px,py) every frame; call pickup() when F is pressed and isNear()
 * - claimForNpc() for silent NPC collection
 */

import Phaser from 'phaser';
import { gameBus } from '../shared/EventBus';

// ── Constants ─────────────────────────────────────────────────────────────────
const PICKUP_RADIUS   = 44;  // px — distance for hint + F-key pickup
const DISPLAY_SIZE    = 24;  // px — rendered size in world
const SRC_SIZE        = 16;  // px — source crop from sprite sheet
const DEPTH           = 500; // render above ground/walls, below roof

// ── Item definitions ──────────────────────────────────────────────────────────

export interface ItemDef {
  itemId:       string;
  label:        string;
  iconX:        number;   // -1 → no sprite, use tint circle fallback
  iconY:        number;
  textureKey?:  string;   // which loaded texture to crop from (default: 'tools')
  tint?:        number;   // hex colour for circle fallback
  /** How the item behaves in the hotbar:
   *  'tool'       — equip & use via Space key
   *  'placeable'  — press F to place as a world entity
   *  'consumable' — press F/E to use
   *  'other'      — material / stackable resource
   */
  itemType:     'tool' | 'placeable' | 'consumable' | 'other';
  /** For itemType='placeable': which entity class to spawn. */
  placeEntity?: 'bed' | 'nest';
}

export const ALL_ITEM_DEFS: ItemDef[] = [
  // Tools (from 'tools' texture — Basic tools and materials.png)
  { itemId: 'watering_can', label: '水壶',     iconX:  0, iconY:  0, itemType: 'tool' },
  { itemId: 'axe',          label: '斧头',     iconX: 16, iconY:  0, itemType: 'tool' },
  { itemId: 'scythe',       label: '镰刀',     iconX: 32, iconY:  0, itemType: 'tool' },
  // Farm seeds & crops (from 'basic-plants': col 0 = seed bag, col 5 = harvested)
  { itemId: 'wheat_seed',   label: '小麦种子',  iconX:  0, iconY:  0, textureKey: 'basic-plants', itemType: 'consumable' },
  { itemId: 'tomato_seed',  label: '番茄种子',  iconX:  0, iconY: 16, textureKey: 'basic-plants', itemType: 'consumable' },
  { itemId: 'wheat',        label: '小麦',     iconX: 80, iconY:  0, textureKey: 'basic-plants', itemType: 'other' },
  { itemId: 'tomato',       label: '番茄',     iconX: 80, iconY: 16, textureKey: 'basic-plants', itemType: 'consumable' },
  // Fruit from trees (apple_ripe at row 2, col 2 of objects sheet)
  { itemId: 'fruit',        label: '苹果',     iconX: 32, iconY: 32, textureKey: 'objects', itemType: 'consumable' },
  // Raspberry from bush (raspberry_ripe at row 3, col 3 of objects sheet)
  { itemId: 'raspberry',    label: '树莓',     iconX: 48, iconY: 48, textureKey: 'objects', itemType: 'consumable' },
  // Loot / materials — no sprite position, use color circles
  { itemId: 'log',          label: '木头',     iconX: -1, iconY: -1, tint: 0x8B4513, itemType: 'other' },
  { itemId: 'stone',        label: '石头',     iconX: -1, iconY: -1, tint: 0x808080, itemType: 'other' },
  { itemId: 'berry',        label: '浆果',     iconX: -1, iconY: -1, tint: 0xFF4444, itemType: 'consumable' },
  { itemId: 'apple',        label: '苹果',     iconX: 32, iconY: 32, textureKey: 'objects', itemType: 'consumable' },
  { itemId: 'egg',          label: '鸡蛋',     iconX: -1, iconY: -1, tint: 0xFFF5C0, itemType: 'consumable' },

  // ── Furniture (from 'furniture' texture — Basic_Furniture.png, 16×16 tiles) ──
  // coordinate = (row, col) → iconX = col*16, iconY = row*16

  // 画（row 0, col 0-2）
  { itemId: 'painting_1',        label: '画（绿）',    iconX:  0, iconY:  0, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'painting_2',        label: '画（蓝）',    iconX: 16, iconY:  0, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'painting_3',        label: '画（粉）',    iconX: 32, iconY:  0, textureKey: 'furniture', itemType: 'placeable' },

  // 花盆（row 0, col 3-5）
  { itemId: 'flower_pot_1',      label: '花盆（红花）', iconX: 48, iconY:  0, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'flower_pot_2',      label: '花盆（黄花）', iconX: 64, iconY:  0, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'flower_pot_3',      label: '花盆（粉花）', iconX: 80, iconY:  0, textureKey: 'furniture', itemType: 'placeable' },

  // 灯（row 1, col 3-5）
  { itemId: 'lamp_green',        label: '绿灯',       iconX: 48, iconY: 16, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'lamp_blue',         label: '蓝灯',       iconX: 64, iconY: 16, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'lamp_pink',         label: '粉灯',       iconX: 80, iconY: 16, textureKey: 'furniture', itemType: 'placeable' },

  // 鸡窝 (Egg_And_Nest.png frame 3: x=48, y=0)
  { itemId: 'chicken_nest',      label: '鸡窝',       iconX: 48, iconY:  0, textureKey: 'egg-nest',  itemType: 'placeable', placeEntity: 'nest' },

  // 床（row 2, col 0-2）
  { itemId: 'bed_green',         label: '绿色床',     iconX:  0, iconY: 32, textureKey: 'furniture', itemType: 'placeable', placeEntity: 'bed' },
  { itemId: 'bed_blue',          label: '蓝色床',     iconX: 16, iconY: 32, textureKey: 'furniture', itemType: 'placeable', placeEntity: 'bed' },
  { itemId: 'bed_pink',          label: '粉色床',     iconX: 32, iconY: 32, textureKey: 'furniture', itemType: 'placeable', placeEntity: 'bed' },

  // 柜子（row 2, col 3）
  { itemId: 'cabinet',           label: '柜子',       iconX: 48, iconY: 32, textureKey: 'furniture', itemType: 'placeable' },

  // 椅子四朝向（row 2, col 4-7）
  { itemId: 'chair_right',       label: '椅子（右）',  iconX: 64, iconY: 32, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'chair_left',        label: '椅子（左）',  iconX: 80, iconY: 32, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'chair_down',        label: '椅子（下）',  iconX: 96, iconY: 32, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'chair_up',          label: '椅子（上）',  iconX:112, iconY: 32, textureKey: 'furniture', itemType: 'placeable' },

  // 桌子（row 3, col 3-4）
  { itemId: 'table_large',       label: '大桌子',     iconX: 48, iconY: 48, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'table_small',       label: '小桌子',     iconX: 64, iconY: 48, textureKey: 'furniture', itemType: 'placeable' },

  // 挂钟（row 3, col 5-7）
  { itemId: 'clock_rabbit',      label: '兔耳挂钟',   iconX: 80, iconY: 48, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'clock_normal',      label: '挂钟',       iconX: 96, iconY: 48, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'clock_small',       label: '小挂钟',     iconX:112, iconY: 48, textureKey: 'furniture', itemType: 'placeable' },

  // 翻转床（row 4, col 0-2）
  { itemId: 'bed_green_flipped', label: '绿色床（翻）', iconX:  0, iconY: 64, textureKey: 'furniture', itemType: 'placeable', placeEntity: 'bed' },
  { itemId: 'bed_blue_flipped',  label: '蓝色床（翻）', iconX: 16, iconY: 64, textureKey: 'furniture', itemType: 'placeable', placeEntity: 'bed' },
  { itemId: 'bed_pink_flipped',  label: '粉色床（翻）', iconX: 32, iconY: 64, textureKey: 'furniture', itemType: 'placeable', placeEntity: 'bed' },

  // 小地毯（row 5, col 0-2）
  { itemId: 'rug_small_green',   label: '绿色小地毯',  iconX:  0, iconY: 80, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'rug_small_blue',    label: '蓝色小地毯',  iconX: 16, iconY: 80, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'rug_small_pink',    label: '粉色小地毯',  iconX: 32, iconY: 80, textureKey: 'furniture', itemType: 'placeable' },

  // 大地毯（row 5, col 3-5）
  { itemId: 'rug_large_green',   label: '绿色大地毯',  iconX: 48, iconY: 80, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'rug_large_blue',    label: '蓝色大地毯',  iconX: 64, iconY: 80, textureKey: 'furniture', itemType: 'placeable' },
  { itemId: 'rug_large_pink',    label: '粉色大地毯',  iconX: 80, iconY: 80, textureKey: 'furniture', itemType: 'placeable' },
];

/** Just the starter tools placed on the house shelf. */
export const TOOL_ITEM_DEFS: ItemDef[] = ALL_ITEM_DEFS.slice(0, 3);

/** O(1) lookup by itemId. */
export const ITEM_DEF_MAP = new Map<string, ItemDef>(
  ALL_ITEM_DEFS.map(d => [d.itemId, d]),
);

// ── Texture builder ───────────────────────────────────────────────────────────

function buildTexture(scene: Phaser.Scene, key: string, def: ItemDef | undefined): void {
  const c   = document.createElement('canvas');
  c.width   = DISPLAY_SIZE;
  c.height  = DISPLAY_SIZE;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const texKey = def?.textureKey ?? 'tools';

  if (def && def.iconX >= 0 && scene.textures.exists(texKey)) {
    const src = scene.textures.get(texKey).getSourceImage() as CanvasImageSource;
    ctx.drawImage(src, def.iconX, def.iconY, SRC_SIZE, SRC_SIZE, 0, 0, DISPLAY_SIZE, DISPLAY_SIZE);
  } else {
    // Coloured-circle fallback
    const hex = def?.tint ?? 0xdddddd;
    const r   = (hex >> 16) & 0xFF;
    const g   = (hex >>  8) & 0xFF;
    const b   =  hex        & 0xFF;
    const cx  = DISPLAY_SIZE / 2;
    ctx.fillStyle = `rgba(${r},${g},${b},0.92)`;
    ctx.beginPath();
    ctx.arc(cx, cx, cx - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.arc(cx - 3, cx - 3, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  scene.textures.addCanvas(key, c);
}

// ── DropItem class ─────────────────────────────────────────────────────────────

export class DropItem {
  private _sprite:    Phaser.GameObjects.Image;
  private _hint:      Phaser.GameObjects.Text;
  private _gone     = false;
  private _baseX:     number;
  private _baseY:     number;
  private _scene:     Phaser.Scene;

  readonly itemId: string;
  readonly label:  string;

  constructor(
    scene:     Phaser.Scene,
    x:         number,
    y:         number,
    itemId:    string,
  ) {
    this._scene = scene;
    this._baseX = x;
    this._baseY     = y;
    this.itemId     = itemId;

    const def   = ALL_ITEM_DEFS.find(d => d.itemId === itemId);
    this.label  = def?.label ?? itemId;

    // Build icon texture once per item type
    const texKey = `drop-${itemId}`;
    if (!scene.textures.exists(texKey)) buildTexture(scene, texKey, def);

    this._sprite = scene.add.image(x, y, scene.textures.exists(texKey) ? texKey : '__WHITE');
    this._sprite.setDisplaySize(DISPLAY_SIZE, DISPLAY_SIZE);
    this._sprite.setDepth(DEPTH);

    // Gentle bob
    scene.tweens.add({
      targets:  this._sprite,
      y:        y - 5,
      duration: 820 + Math.random() * 180,
      ease:     'Sine.easeInOut',
      yoyo:     true,
      repeat:   -1,
    });

    // Pickup hint (hidden until player is near)
    this._hint = scene.add
      .text(x, y - 22, `[F] ${this.label}`, {
        fontSize:        '8px',
        color:           '#fffbe6',
        backgroundColor: '#00000099',
        padding:         { x: 3, y: 2 },
        fontFamily:      '"Courier New", monospace',
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH + 1)
      .setVisible(false);
  }

  // ── Per-frame call ─────────────────────────────────────────────────────────

  /**
   * Call every frame from GameScene.update().
   * Shows/hides the hint label based on player proximity.
   */
  updateHint(playerX: number, playerY: number): void {
    if (this._gone) return;
    const near = this.isNearPlayer(playerX, playerY);
    this._hint.setVisible(near);
    // Keep hint pinned above the (bobbing) sprite
    this._hint.setPosition(this._sprite.x, this._sprite.y - 16);
  }

  // ── Interaction ────────────────────────────────────────────────────────────

  /** True when the player is within pickup radius. */
  isNearPlayer(px: number, py: number): boolean {
    if (this._gone) return false;
    const dx = px - this._baseX;
    const dy = py - this._baseY;  // use stable base Y, not the bobbing sprite.y
    return dx * dx + dy * dy <= PICKUP_RADIUS * PICKUP_RADIUS;
  }

  /** Player presses F while in range — collect this item. */
  pickup(): void {
    if (this._gone) return;
    gameBus.emit('player:item_pickup', { itemKey: this.itemId, quantity: 1 });
    gameBus.emit('world:item_picked_up', {
      itemId: this.itemId,
      x: this._sprite.x,
      y: this._sprite.y,
      actorId: 'player',
      source: 'local',
    });
    this.destroy();
  }

  /** NPC silently claims this item — no player callback. */
  claimForNpc(): boolean {
    if (this._gone) return false;
    this.destroy();
    return true;
  }

  destroy(): void {
    if (this._gone) return;
    this._gone = true;
    this._scene.tweens.killTweensOf(this._sprite);
    this._sprite.destroy();
    this._hint.destroy();
  }

  // ── Getters ────────────────────────────────────────────────────────────────
  get gone():   boolean { return this._gone; }
  get worldX(): number  { return this._baseX; }
  get worldY(): number  { return this._baseY; }
}
