/**
 * GameScene — Phaser 3 scene for the idle/exploration game.
 *
 * Deliberately thin: delegates map building, animations, and entity logic
 * to the dedicated modules in /systems and /entities.
 *
 * Architecture follows ozguradmin/sprout-lands-portfolio:
 *   · All Sprout Lands PNGs loaded as plain images
 *   · Sub-regions registered as named frames at runtime
 *   · Objects placed as individual add.sprite() calls with Y-sort depth
 *   · React ↔ Phaser bridge via the public `callbacks` property
 *
 * Day/Night cycle:
 *   Handled entirely by DayCycle (systems/DayCycle.ts).
 *   GameScene no longer owns gameTick or the night overlay.
 *
 * Save/Load:
 *   · Set `scene.initialState` before booting to restore a saved game.
 *   · Call `getGameState()` to get the current state for saving.
 */

import Phaser from 'phaser';
import type { FacingDirection, GameChest } from '../../../../Types/Profile';
import type { ToolType, GameCallbacks, NpcMemoryEntry, Interactable } from './types';
import {
  WORLD_W, WORLD_H, SPAWN_X, SPAWN_Y,
  NPC_X, NPC_Y, NPC_NAME,
  ZOOM,
  CHAR_FRAME_W, CHAR_FRAME_H,
  ACTION_FRAME_W, ACTION_FRAME_H,
  CHICK_FRAME_W, CHICK_FRAME_H,
  CHEST_FRAME_W, CHEST_FRAME_H,
} from './constants';
import { registerAnimations }  from './systems/AnimationRegistry';
import { MapBuilder }          from './systems/MapBuilder';
import { DayCycle }            from './systems/DayCycle';
import { Player }              from './entities/Player';
import { Npc }                 from './entities/Npc';
import { Chest }               from './entities/Chest';
import { Tree }                from './entities/Tree';
import type { TreeStage }      from './entities/Tree';
import type { IdleGameState }  from '../../../../Types/Profile';

// ─── Asset imports (Vite resolves to hashed URLs at build time) ─────────────
// @ts-ignore
import tileGrassUrl  from '../../../../assets/Sprout-Lands/Tilesets/Grass.png';
// @ts-ignore
import tileWaterUrl  from '../../../../assets/Sprout-Lands/Tilesets/Water.png';
// @ts-ignore
import tileHillsUrl  from '../../../../assets/Sprout-Lands/Tilesets/Hills.png';
// @ts-ignore
import objsUrl       from '../../../../assets/Sprout-Lands/Objects/Basic_Grass_Biom_things.png';
// @ts-ignore
import charUrl       from '../../../../assets/Sprout-Lands/Characters/Basic Charakter Spritesheet.png';
// @ts-ignore
import actionsUrl    from '../../../../assets/Sprout-Lands/Characters/Basic Charakter Actions.png';
// @ts-ignore
import chickenUrl    from '../../../../assets/Sprout-Lands/Characters/Free Chicken Sprites.png';
// @ts-ignore
import houseUrl      from '../../../../assets/Sprout-Lands/Tilesets/Wooden House.png';
// @ts-ignore
import chestUrl      from '../../../../assets/Sprout-Lands/Objects/Chest.png';

// ─────────────────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  // ── Public: React sets these before game boots ────────────────────────────
  callbacks:    GameCallbacks = {};
  /** Optional: set before booting to restore a saved game session. */
  initialState: Partial<IdleGameState> = {};

  // ── Private game objects ──────────────────────────────────────────────────
  private player!:    Player;
  private npc!:       Npc;
  private chickens!:  Phaser.Physics.Arcade.Group;
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private dayCycle!:  DayCycle;

  // ── General F-key interactable registry ──────────────────────────────────
  private interactables: Interactable[] = [];

  // ── Chest management ──────────────────────────────────────────────────────
  private chests = new Map<string, Chest>();

  // ── Tree management ────────────────────────────────────────────────────────
  private trees = new Map<string, Tree>();

  // ── Chat state flag ───────────────────────────────────────────────────────
  /** True while the React chat input is open — suppresses player movement. */
  private _chatOpen = false;

  // ── F-key reference (set in create()) ────────────────────────────────────
  private _fKey!: Phaser.Input.Keyboard.Key;

  // ── Time-emit throttle ────────────────────────────────────────────────────
  private _lastTimeEmit = 0;

  // ─────────────────────────────────────────────────────────────────────────
  constructor() { super({ key: 'GameScene' }); }

  // ── Phaser lifecycle ──────────────────────────────────────────────────────
  preload() {
    this.load.image('grass',   tileGrassUrl);
    this.load.image('water',   tileWaterUrl);
    this.load.image('hills',   tileHillsUrl);
    this.load.image('objects', objsUrl);
    this.load.image('house',   houseUrl);
    this.load.spritesheet('player',  charUrl,    { frameWidth: CHAR_FRAME_W,   frameHeight: CHAR_FRAME_H   });
    this.load.spritesheet('actions', actionsUrl, { frameWidth: ACTION_FRAME_W, frameHeight: ACTION_FRAME_H });
    this.load.spritesheet('chicken', chickenUrl, { frameWidth: CHICK_FRAME_W,  frameHeight: CHICK_FRAME_H  });
    this.load.spritesheet('chest',   chestUrl,   { frameWidth: CHEST_FRAME_W,  frameHeight: CHEST_FRAME_H  });
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.obstacles = this.physics.add.staticGroup();

    // ── Map ───────────────────────────────────────────────────────────────
    new MapBuilder(this, this.obstacles).build();

    // ── Animations ────────────────────────────────────────────────────────
    registerAnimations(this);

    // Chest opening: frame 0 (closed, gold) → frame 5 (opened, gold)
    // Chest.png is 5 cols × 2 rows @ 48×48: row 0 = closed variants, row 1 = opened variants
    this.anims.create({
      key:       'chest-open',
      frames:    [
        { key: 'chest', frame: 0 },   // closed
        { key: 'chest', frame: 0 },   // brief hold
        { key: 'chest', frame: 5 },   // opened
      ],
      frameRate: 6,
      repeat:    0,
    });

    // ── Day / Night cycle ─────────────────────────────────────────────────
    // Restore gameTick from save so time-of-day is preserved across sessions.
    this.dayCycle = new DayCycle(this, this.initialState.gameTick ?? 0);

    // ── Entities ──────────────────────────────────────────────────────────
    const spawnX = this.initialState.x      ?? SPAWN_X;
    const spawnY = this.initialState.y      ?? SPAWN_Y;
    const facing = this.initialState.facing ?? 'down';

    this.player = new Player(this, spawnX, spawnY, this.callbacks);
    // Restore saved facing direction
    this.player.facing = facing as FacingDirection;
    this.player.sprite.play(`idle-${facing}`);

    this.npc = new Npc(this, NPC_X, NPC_Y, NPC_NAME, this.callbacks);

    // ── Chickens ──────────────────────────────────────────────────────────
    this.createChickens();

    // ── Collisions ────────────────────────────────────────────────────────
    this.physics.add.collider(this.player.sprite, this.obstacles);
    this.physics.add.collider(this.npc.sprite,    this.obstacles);
    this.physics.add.collider(this.player.sprite, this.npc.sprite);
    this.physics.add.collider(this.chickens,      this.obstacles);
    this.physics.add.collider(this.chickens,      this.chickens);

    // ── F key (general world-object interaction) ──────────────────────────
    this._fKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);

    // ── Camera ────────────────────────────────────────────────────────────
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    // Note: background colour is managed frame-by-frame by DayCycle.
    this.cameras.main.setBackgroundColor('#12340e');

    // ── Trees (interactive entities, F=harvest, Space+axe=chop) ──────────────
    this.spawnInitialTrees();

    // ── Notify React that the scene is fully ready ─────────────────────────
    // React can now safely call loadNpcMemories() and other NPC APIs.
    console.log('[GameScene] create() complete — firing onGameReady');
    this.callbacks.onGameReady?.();
  }

  update(time: number, delta: number) {
    const dt = delta / 1000;

    // ── Day/Night cycle update (advances time, repaints overlay) ─────────
    this.dayCycle.update(dt);

    // ── Emit time string to React HUD (max once per real second) ─────────
    if (time - this._lastTimeEmit > 1000) {
      this._lastTimeEmit = time;
      this.callbacks.onTickUpdate?.(this.dayCycle.gameTick, this.dayCycle.getTimeStr());
    }

    // ── F-key: general world-object interaction ───────────────────────────
    if (Phaser.Input.Keyboard.JustDown(this._fKey) && !this._chatOpen) {
      this.triggerFInteract();
    }

    // ── Player ────────────────────────────────────────────────────────────
    if (this._chatOpen) {
      (this.player.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    } else {
      this.player.update();
    }

    // ── NPC + chickens ────────────────────────────────────────────────────
    this.npc.update(dt, this.dayCycle.gameTick);
    this.updateChickens(time);
  }

  // ── Chickens ──────────────────────────────────────────────────────────────
  private createChickens() {
    this.chickens = this.physics.add.group();
    for (const [cx, cy] of [[510, 380], [545, 400], [480, 415]] as [number, number][]) {
      const c = this.chickens.create(cx, cy, 'chicken') as Phaser.Physics.Arcade.Sprite;
      c.setScale(2).setCollideWorldBounds(true).play('chicken-idle');
      c.setDepth(cy + 32);
      (c as any).nextAction = 0;
      (c as any).stopTime   = 0;
    }
  }

  private updateChickens(time: number) {
    this.chickens.getChildren().forEach((obj) => {
      const c    = obj as Phaser.Physics.Arcade.Sprite;
      const body = c.body as Phaser.Physics.Arcade.Body;
      const a    = c as any;

      if (time > a.nextAction) {
        if (Math.random() < 0.5) {
          const angle = Math.random() * Math.PI * 2;
          const spd   = 35 + Math.random() * 25;
          body.setVelocity(Math.cos(angle) * spd, Math.sin(angle) * spd);
          c.setFlipX(body.velocity.x < 0);
          c.play('chicken-walk', true);
          a.stopTime = time + 800 + Math.random() * 1200;
        } else {
          body.setVelocity(0, 0);
          c.play('chicken-idle', true);
          a.stopTime = 0;
        }
        a.nextAction = time + 1500 + Math.random() * 2000;
      }
      if (a.stopTime && time > a.stopTime) {
        body.setVelocity(0, 0);
        c.play('chicken-idle', true);
        a.stopTime = 0;
      }
      c.setDepth(c.y + 32);
    });
  }

  // ── Tree spawning ──────────────────────────────────────────────────────────
  /**
   * Place the initial set of trees around the world.
   * Trees are registered as Interactables so F-key harvesting works.
   * Positioned to match the old static MapBuilder layout.
   */
  private spawnInitialTrees(): void {
    // Single test tree right next to spawn — already at stage C so you can
    // immediately walk up and press F to harvest fruit.
    const POSITIONS: [number, number, TreeStage][] = [
      [SPAWN_X + 120, SPAWN_Y - 60, 'C'],
    ];

    POSITIONS.forEach(([x, y, stage], i) => {
      const tree = new Tree(
        this, x, y,
        `tree-${i}`,
        this.callbacks,
        this.obstacles,
        stage,
      );
      this.trees.set(tree.id, tree);
      this.registerInteractable(tree);
    });
  }

  // ── Interaction triggers (called from React keydown handler) ─────────────
  /** E key / Talk button — open chat with the NPC. */
  triggerInteract(): void {
    this.callbacks.onInteract?.(this.npc.name);
  }

  /** Space key — use current tool (axe / water animation). */
  triggerAction(): void {
    this.player.performAction();
    // Axe: try to chop the nearest unchoppped tree within range
    if (this.player.currentTool === 'axe') {
      this.tryChopNearestTree();
    }
  }

  /** Find the nearest un-chopped tree in range and chop it. */
  private tryChopNearestTree(): void {
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    let closest:  Tree | null = null;
    let closestD = Infinity;
    for (const tree of this.trees.values()) {
      if (tree.isChopped()) continue;
      const dx = px - tree.worldX;
      const dy = py - tree.worldY;
      const d  = dx * dx + dy * dy;
      if (d <= 72 * 72 && d < closestD) { closest = tree; closestD = d; }
    }
    closest?.chop();
  }

  // ── Public API (called from React) ────────────────────────────────────────
  setPlayerTool(tool: ToolType): void {
    this.player.setTool(tool);
  }

  /**
   * Returns the full world state for saving to the server.
   * Persists: player position, facing direction, and current gameTick (time-of-day).
   */
  getGameState(): IdleGameState {
    const ps = this.player.getState();
    const facing = (['down', 'up', 'left', 'right'] as FacingDirection[]).includes(
      ps.facing as FacingDirection
    ) ? ps.facing as FacingDirection : 'down' as FacingDirection;

    return {
      x:        ps.x,
      y:        ps.y,
      gameTick: this.dayCycle.gameTick,
      facing,
    };
  }

  getGameTick(): number { return this.dayCycle.gameTick; }

  /** Show / hide the thinking indicator on a named NPC's speech bubble. */
  setNpcThinking(npcName: string, thinking: boolean): void {
    if (this.npc.name === npcName) this.npc.setThinking(thinking);
  }

  /** Record a player message in the NPC's memory. */
  addPlayerMessageToNpc(npcName: string, text: string): void {
    if (this.npc.name === npcName) this.npc.addMemory(text, 'player', this.dayCycle.gameTick);
  }

  /** Make the NPC speak a reply (shows bubble + triggers React dialog). */
  npcReply(npcName: string, text: string): void {
    if (this.npc.name === npcName) this.npc.say(text, this.dayCycle.gameTick);
  }

  /** Return the current (local-cache) memory array for a named NPC. */
  getNpcMemory(npcName: string): NpcMemoryEntry[] {
    return this.npc.name === npcName ? [...this.npc.memory] : [];
  }

  /**
   * Seed the NPC's local memory cache with entries fetched from the backend.
   * Call this once after the game boots to restore persistent memory.
   */
  loadNpcMemories(npcName: string, entries: NpcMemoryEntry[]): void {
    if (this.npc.name === npcName) this.npc.loadMemories(entries);
  }

  /** Freeze player movement / interaction while React chat input is open. */
  pauseInput(): void  { this._chatOpen = true;  }

  /** Resume player control after chat input is closed. */
  resumeInput(): void { this._chatOpen = false; }

  // ── Interactable registry ─────────────────────────────────────────────────
  registerInteractable(obj: Interactable): void {
    if (!this.interactables.includes(obj)) this.interactables.push(obj);
  }

  unregisterInteractable(obj: Interactable): void {
    const idx = this.interactables.indexOf(obj);
    if (idx !== -1) this.interactables.splice(idx, 1);
  }

  /** Called when the player presses F — finds the nearest interactable and triggers it. */
  private triggerFInteract(): void {
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    for (const obj of this.interactables) {
      if (obj.isNearPlayer(px, py)) {
        obj.interact();
        break;
      }
    }
  }

  // ── Chest management ──────────────────────────────────────────────────────
  /** Load saved chests on game boot. */
  loadChests(chests: GameChest[]): void {
    for (const c of chests) this.addChest(c);
  }

  /** Add a single chest to the scene (e.g. from SSE spawn event). */
  addChest(data: GameChest): void {
    if (this.chests.has(data.id)) return;  // already present
    const chest = new Chest(this, data.x, data.y, data.id, data.rewards, this.callbacks);
    this.chests.set(data.id, chest);
    this.registerInteractable(chest);
  }

  /**
   * Pan the camera to a chest and flash it so the player can find it.
   * @param id chest id to pan to
   */
  panToChest(id: string): void {
    const chest = this.chests.get(id);
    if (!chest) return;
    this.cameras.main.pan(chest.sprite.x, chest.sprite.y, 600, 'Sine.easeInOut', false);
    chest.highlight();
  }

  /** Remove a chest from the scene after it has been opened. */
  removeChest(id: string): void {
    const chest = this.chests.get(id);
    if (!chest) return;
    this.unregisterInteractable(chest);
    chest.destroy();
    this.chests.delete(id);
  }
}
