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
import type { ToolType, NpcMemoryEntry, Interactable, GameWorldState } from './types';
import { gameBus } from './shared/EventBus';
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
import { WeatherSystem }       from './systems/WeatherSystem';
import { CommandSystem }       from './systems/CommandSystem';
import { Player }              from './entities/Player';
import { Npc }                 from './entities/Npc';
import { Chest }               from './entities/Chest';
import { Tree }                from './entities/Tree';
import type { TreeStage }      from './entities/Tree';
import { RaspberryBush }       from './entities/RaspberryBush';
import { House }               from './entities/House';
import { Chicken }             from './entities/Chicken';
import { Nest }                from './entities/Nest';
import { DropItem, TOOL_ITEM_DEFS, ITEM_DEF_MAP } from './entities/DropItem';
import { RemotePlayer } from './entities/RemotePlayer';
import { Bed, type BedColor }   from './entities/Bed';
import { Pathfinder }          from './systems/Pathfinder';
import { ActionExecutor }      from './systems/ActionExecutor';
import { FarmSystem }          from './systems/FarmSystem';
import { PerceptionSystem }     from './systems/PerceptionSystem';
import { SleepManager }        from './systems/SleepManager';
import { WorldGrid, ObjectType } from './shared/WorldGrid';
import { SpatialIndex }          from './shared/SpatialIndex';
import type { WorldContext }     from './systems/ActionExecutor';
import type { IdleGameState, TreeSaveState }  from '../../../../Types/Profile';

// ── House interior navigation target (world px) ──────────────────────────────
// ROOM_INTERIOR_X/Y now defined in ActionExecutor.ts NAMED_LOCATIONS

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
// @ts-ignore
import eggNestUrl    from '../../../../assets/Sprout-Lands/Characters/Egg_And_Nest.png';
// @ts-ignore
import tilledDirtUrl from '../../../../assets/Sprout-Lands/Tilesets/Tilled Dirt.png';
// @ts-ignore
import toolsUrl       from '../../../../assets/Sprout-Lands/Objects/Basic tools and meterials.png';
// @ts-ignore
import basicPlantsUrl  from '../../../../assets/Sprout-Lands/Objects/Basic_Plants.png';
// @ts-ignore
import furnitureUrl    from '../../../../assets/Sprout-Lands/Objects/Basic_Furniture.png';

// ─────────────────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  // ── Public: React sets these before game boots ────────────────────────────
  /** Optional: set before booting to restore a saved game session. */
  initialState: Partial<IdleGameState> = {};

  // ── Private game objects ──────────────────────────────────────────────────
  player!:    Player;
  private npc!:       Npc;
  private chickenGroup!:   Phaser.Physics.Arcade.Group;
  private chickenEntities: Chicken[] = [];
  private nests:           Nest[]    = [];
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private dayCycle!:  DayCycle;

  // ── General F-key interactable registry ──────────────────────────────────
  private interactables: Interactable[] = [];

  // ── Drop items (all pickupable items — tools, seeds, crops, loot) ───────────
  private drops: DropItem[] = [];

  // ── Chest management ──────────────────────────────────────────────────────
  private chests = new Map<string, Chest>();

  // ── Tree management ────────────────────────────────────────────────────────
  private trees = new Map<string, Tree>();

  // ── Raspberry bush management ─────────────────────────────────────────────
  private bushes: RaspberryBush[] = [];

  // ── House ─────────────────────────────────────────────────────────────────
  private house!: House;

  // ── Pathfinder ────────────────────────────────────────────────────────────
  private pathfinder!:    Pathfinder;
  private actionExecutor!: ActionExecutor;

  // ── Systems ───────────────────────────────────────────────────────────────
  private weather!:  WeatherSystem;
  private commands!: CommandSystem;
  farmSystem!: FarmSystem;
  worldGrid!: WorldGrid;
  private physicsDebugEnabled = false;

  // ── Perception system ─────────────────────────────────────────────────────
  private perceptionSystem!: PerceptionSystem;
  private spatialIndex!:     SpatialIndex;

  // ── Beds + sleep system ───────────────────────────────────────────────────
  private beds:         Bed[]         = [];
  private sleepManager!: SleepManager;

  // ── Chat state flag ───────────────────────────────────────────────────────
  /** True while the React chat input is open — suppresses player movement. */
  private _chatOpen = false;

  // ── Multiplayer ───────────────────────────────────────────────────────────
  remotePlayer: RemotePlayer | null = null;
  multiplayActive = false;
  private _lastPosSend = 0;

  // ── F / Q key references (set in create()) ───────────────────────────────
  private _fKey!: Phaser.Input.Keyboard.Key;
  private _qKey!: Phaser.Input.Keyboard.Key;

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
    this.load.spritesheet('chest',    chestUrl,   { frameWidth: CHEST_FRAME_W,  frameHeight: CHEST_FRAME_H  });
    this.load.spritesheet('egg-nest', eggNestUrl, { frameWidth: 16, frameHeight: 16 });
    this.load.image('tilled-dirt',  tilledDirtUrl);
    this.load.image('tools',        toolsUrl);
    this.load.image('basic-plants', basicPlantsUrl);
    this.load.image('furniture',    furnitureUrl);
  }

  create() {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.obstacles = this.physics.add.staticGroup();
    this.worldGrid    = new WorldGrid();
    this.spatialIndex = new SpatialIndex(WORLD_W, WORLD_H);

    // ── Map ───────────────────────────────────────────────────────────────
    new MapBuilder(this, this.obstacles, this.worldGrid).build();

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

    this.player = new Player(this, spawnX, spawnY);
    // Restore saved facing direction
    this.player.facing = facing as FacingDirection;
    this.player.sprite.play(`idle-${facing}`);

    this.npc = new Npc(this, NPC_X, NPC_Y, NPC_NAME);

    // ── F key (general world-object interaction) ──────────────────────────
    this._fKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    // ── Q key (drop held item as world drop) ──────────────────────────────
    this._qKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

    // ── Camera ────────────────────────────────────────────────────────────
    this.cameras.main.startFollow(this.player.sprite, true, 0.1, 0.1);
    this.cameras.main.setZoom(ZOOM);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    // Note: background colour is managed frame-by-frame by DayCycle.
    this.cameras.main.setBackgroundColor('#12340e');

    // ── Weather + Command systems ──────────────────────────────────────────
    this.weather  = new WeatherSystem(this);
    this.commands = new CommandSystem();
    this._registerCommands();

    // ── House (tiled, door animation) ─────────────────────────────────────────
    // House: 10×6 tiles, upper-right area (x:390-710, y:160-352)
    this.house = new House(this, 390, 160, this.obstacles);

    // ── Trees (interactive entities, F=harvest, Space+axe=chop) ──────────────
    this.spawnInitialTrees();

    // ── Raspberry bushes (F=harvest berries, regrow over time) ───────────────
    this.spawnInitialBushes();

    // ── Pathfinder — reads WorldGrid weights directly (no physics body scan) ──
    this.pathfinder    = new Pathfinder(this.worldGrid);
    this.npc.setPathfinder(this.pathfinder);
    this.npc.setPlayerRef(this.player.sprite);          // for follow_player action
    this.actionExecutor = new ActionExecutor(this.player);
    this.actionExecutor.setWorld(this as unknown as WorldContext);
    this.npc.setWorldContext(this as unknown as WorldContext);

    // ── Perception system (scans trees + ground items for LLM context) ────────
    this.perceptionSystem = new PerceptionSystem(
      () => this.trees,
      () => this.drops,
      this.spatialIndex,
    );

    // ── FarmSystem (tilled-dirt plots, watering, harvesting) ─────────────────
    this.farmSystem = new FarmSystem(this, this.worldGrid);

    // ── Tool pickups inside the house ────────────────────────────────────────
    // House interior is roughly x:422–678, y:224–320 (cols 1-8, rows 2-4)
    // Place tools on a table row near the back wall
    this.spawnToolPickups();

    // ── Chickens + Nests (created after pathfinder is ready) ─────────────────
    this.createChickens();

    // ── Farm tile sensors (passthrough overlap for proximity detection) ──
    this.farmSystem.registerPlayerSensors(this.player.sprite);

    // ── Collisions ────────────────────────────────────────────────────────
    this.physics.add.collider(this.player.sprite, this.obstacles);
    this.physics.add.collider(this.npc.sprite,    this.obstacles);
    this.physics.add.collider(this.player.sprite, this.npc.sprite);
    this.physics.add.collider(this.chickenGroup,  this.obstacles);
    this.physics.add.collider(this.chickenGroup,  this.chickenGroup);

    // ── SleepManager (Minecraft-style night skip) ─────────────────────────
    this.sleepManager = new SleepManager(0);

    // Fire when DayCycle's 20× fast-forward finishes at 06:00
    this.dayCycle.onFastForwardComplete = () => {
      this.sleepManager.onMorning();
      const toTime = this.dayCycle.getTimeStr();
      gameBus.emit('day:night_skip', { fromTime: '--', toTime });
      gameBus.emit('ui:show_message', { text: `🌅 早上好！时间已到 ${toTime}` });
    };

    // ── Beds (inside house interior) ───────────────────────────────────────
    // House interior: x 422–678, y 224–320.  Place one pink bed near back wall.
    this._spawnBeds();

    // ── /sleep command ─────────────────────────────────────────────────────
    this.commands.register(
      'sleep',
      '跳过黑夜到明天早上 | sleep threshold <0-1> 修改睡眠比例',
      (args) => {
        // /sleep threshold 0.5
        if (args[0] === 'threshold') {
          const v = parseFloat(args[1] ?? '');
          if (isNaN(v) || v < 0 || v > 1)
            return '用法: /sleep threshold <0-1>  (0=任意1人, 1=所有人)';
          this.sleepManager.threshold = v;
          return `睡眠比例已设置为 ${(v * 100).toFixed(0)}%`;
        }
        // /sleep  → force skip (admin / debug)
        if (!this.dayCycle.isNight())
          return '🌞 现在是白天，不需要跳过夜晚';
        return this.sleepManager.trySleep(this.dayCycle);
      },
    );

    // ── Restore saved world entities (beds positions, nest states) ──────────
    // Must run AFTER _spawnBeds() and createChickens() so defaults exist first.
    this._loadWorldState(this.initialState.worldState ?? null);

    // ── Notify React that the scene is fully ready ─────────────────────────
    // React can now safely call loadNpcMemories() and other NPC APIs.
    console.log('[GameScene] create() complete — firing onGameReady');
    gameBus.emit('game:ready', {});
  }

  update(time: number, delta: number) {
    const dt = delta / 1000;

    // ── Day/Night cycle update (advances time, repaints overlay) ─────────
    this.dayCycle.update(dt);

    // ── Farm: update crop visuals every frame ─────────────────────────────
    this.farmSystem?.update(this.dayCycle.gameTick);

    // ── Emit time string to React HUD (max once per real second) ─────────
    if (time - this._lastTimeEmit > 1000) {
      this._lastTimeEmit = time;
      gameBus.emit('tick:update', { gameTick: this.dayCycle.gameTick, timeStr: this.dayCycle.getTimeStr() });
    }

    // ── F-key: general world-object interaction ───────────────────────────
    if (Phaser.Input.Keyboard.JustDown(this._fKey) && !this._chatOpen) {
      this.triggerFInteract();
    }

    // ── Q-key: drop held item as world drop ───────────────────────────────
    if (Phaser.Input.Keyboard.JustDown(this._qKey) && !this._chatOpen) {
      this._triggerQDrop();
    }

    // ── Remote player (multiplayer) ───────────────────────────────────────
    this.remotePlayer?.update();

    // ── Emit local player position to peers (throttled 20fps) ─────────────
    if (this.multiplayActive && time - this._lastPosSend > 50) {
      this._lastPosSend = time;
      const body = this.player.sprite.body as Phaser.Physics.Arcade.Body;
      gameBus.emit('mp:relay', { type: 'player_move', payload: {
        x: this.player.sprite.x,
        y: this.player.sprite.y,
        facing: this.player.facing,
        velX: body.velocity.x,
        velY: body.velocity.y,
      }});
    }

    // ── Player ────────────────────────────────────────────────────────────
    if (this._chatOpen) {
      (this.player.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    } else {
      this.player.update();
    }

    // ── House door proximity (player OR NPC triggers door) ────────────────
    this.house.update(
      this.player.sprite.x, this.player.sprite.y,
      this.npc.sprite.x,    this.npc.sprite.y,
    );

    // ── NPC + chickens ────────────────────────────────────────────────────
    this.npc.update(dt, this.dayCycle.gameTick);
    this.updateChickens(time, delta);

    // ── Nest hints + dismantled nest cleanup ──────────────────────────────
    if (this.player) {
      this.updateNests(this.player.sprite.x, this.player.sprite.y);
    }

    // ── Drop items: update hints + prune gone items ───────────────────────
    if (this.player) {
      const px = this.player.sprite.x;
      const py = this.player.sprite.y;
      let pruned = false;
      for (const drop of this.drops) {
        if (drop.gone) { pruned = true; continue; }
        drop.updateHint(px, py);
      }
      if (pruned) this.drops = this.drops.filter(d => !d.gone);

      // ── Beds: update proximity hints + night bob ────────────────────────
      for (const bed of this.beds) {
        bed.update(px, py);
      }

      // ── SleepManager: natural morning reset ────────────────────────────
      // When day arrives while local player is sleeping, wake them up
      if (this.sleepManager?.localSleeping && !this.dayCycle.isNight()) {
        this.sleepManager.onMorning();
      }
    }
  }

  // ── Tool pickups ───────────────────────────────────────────────────────────

  /** Remove drop items whose itemId the player already owns (called on game-ready). */
  removeWorldItemsByIds(ownedItemIds: string[]): void {
    const owned = new Set(ownedItemIds);
    this.drops = this.drops.filter(item => {
      if (owned.has(item.itemId)) { item.destroy(); return false; }
      return true;
    });
  }

  /**
   * Spawns tool world-items inside the house interior.
   * Always spawns all three; call removeWorldItemsByIds() after inventory loads
   * to hide ones the player already picked up.
   */
  private spawnToolPickups(): void {
    // House interior tool shelf: x from 475 to 605, y=250 (row 3 of interior)
    const TOOL_POSITIONS: [number, number][] = [
      [480, 255],  // watering_can
      [540, 255],  // axe
      [600, 255],  // scythe
    ];

    TOOL_ITEM_DEFS.forEach((def, i) => {
      const [x, y] = TOOL_POSITIONS[i];
      const item   = new DropItem(this, x, y, def.itemId);
      this.drops.push(item);
    });
  }

  // ── Beds ───────────────────────────────────────────────────────────────────
  /**
   * Spawn bed(s) inside the house interior.
   * House interior: x 422–678, y 224–320.
   * The pink bed is placed near the right back-wall (high-y = front of room).
   */
  private _spawnBeds(): void {
    const bedConfigs: Array<{ x: number; y: number; color: 'green' | 'blue' | 'pink' }> = [
      // y=310: safely inside house interior (rows 2-4, y=224-320), away from roof row (y=160-192)
      { x: 620, y: 310, color: 'pink' },
    ];
    for (const cfg of bedConfigs) {
      const bed = new Bed(this, cfg.x, cfg.y, cfg.color, this.sleepManager, this.dayCycle);
      this.beds.push(bed);
      this.registerInteractable(bed);
    }
  }

  // ── Entity placement (F key while holding a 'placeable' item) ────────────

  /**
   * Unified placement handler: spawns the appropriate world entity one tile-step
   * in front of the player and consumes 1 from inventory.
   * Replaces the old _isPlaceableFurniture + _placeFurniture pair.
   */
  private _placeEntity(itemId: string, px: number, py: number): void {
    const def = ITEM_DEF_MAP.get(itemId);
    if (!def || def.itemType !== 'placeable') return;

    const STEP = 32;
    const dir  = this.player.facing ?? 'down';
    const fx   = px + (dir === 'left' ? -STEP : dir === 'right' ? STEP : 0);
    const fy   = py + (dir === 'up'   ? -STEP : dir === 'down'  ? STEP : 0);

    // ── Overlap check (only for solid entities: bed / nest) ──────────────────
    if (def.placeEntity) {
      const MIN_DIST = 28; // px — entities closer than this are considered overlapping
      const blocked =
        this.beds.some(b => Math.hypot(b.worldX - fx, b.worldY - fy) < MIN_DIST) ||
        this.nests.some(n => !n.gone && Math.hypot(n.x - fx, n.y - fy) < MIN_DIST);
      if (blocked) {
        gameBus.emit('ui:show_message', { text: '这里已经有东西了，换个地方放置' });
        return; // don't consume the item
      }
    }

    switch (def.placeEntity) {
      case 'bed': {
        // 'bed_pink' → color 'pink'; 'bed_pink_flipped' → also 'pink' (same sprite key)
        const rawColor = itemId.replace('bed_', '').replace('_flipped', '');
        const color    = rawColor as BedColor;
        const bed      = new Bed(this, fx, fy, color, this.sleepManager, this.dayCycle);
        this.beds.push(bed);
        this.registerInteractable(bed);
        break;
      }
      case 'nest': {
        const WATER_SPOTS: [number, number][] = [[600, 386]];
        const nest = new Nest(this, fx, fy); // no obstacles → walk-through
        nest.onHatch = (hx, hy) => {
          new Chicken(this.chickenGroup, hx, hy, this.pathfinder, WATER_SPOTS, this.nests);
        };
        this.nests.push(nest);
        this.registerInteractable(nest);
        break;
      }
      default:
        // 'placeable' furniture without a placeEntity handler yet
        gameBus.emit('ui:show_message', { text: `${def.label} 暂时无法放置` });
        return; // don't consume
    }

    gameBus.emit('player:consume_item', { itemId, qty: 1 });
  }

  // ── World-state persistence ────────────────────────────────────────────────

  /**
   * Capture the current positions and states of all dynamic world entities
   * (beds, nests) into a JSON-serialisable blob for backend storage.
   */
  private _serializeWorld(): GameWorldState {
    return {
      schemaVersion: 1,
      beds: this.beds.map(b => ({ color: b.color, x: b.worldX, y: b.worldY })),
      nests: this.nests
        .filter(n => !n.gone)
        .map(n => ({
          x: n.x,
          y: n.y,
          // 'occupied' is transient — save as 'empty' so chicken re-lays next session
          state: n.nestState === 'has_egg' ? 'has_egg' : 'empty',
        })),
    };
  }

  /**
   * Restore world entities from a saved blob (called at end of create()).
   * If `ws` is null (first play or no saved state), defaults remain.
   */
  private _loadWorldState(ws: GameWorldState | null): void {
    if (!ws) return;

    // ── Beds ──────────────────────────────────────────────────────────────────
    if (ws.beds && ws.beds.length > 0) {
      // Replace auto-spawned default beds with the saved positions
      for (const bed of this.beds) {
        this.unregisterInteractable(bed);
        bed.destroy();
      }
      this.beds = [];
      for (const { color, x, y } of ws.beds) {
        const bed = new Bed(this, x, y, color as BedColor, this.sleepManager, this.dayCycle);
        this.beds.push(bed);
        this.registerInteractable(bed);
      }
    }

    // ── Nests ─────────────────────────────────────────────────────────────────
    if (ws.nests && ws.nests.length > 0) {
      const THRESHOLD    = 24; // px — proximity to match saved nest to default nest
      const WATER_SPOTS: [number, number][] = [[600, 386]];

      for (const saved of ws.nests) {
        // Try to match a default (already spawned) nest by proximity
        const match = this.nests.find(n =>
          !n.gone &&
          Math.abs(n.x - saved.x) < THRESHOLD &&
          Math.abs(n.y - saved.y) < THRESHOLD,
        );

        if (match) {
          // Default nest found — restore egg state
          if (saved.state === 'has_egg') match.layEgg();
        } else {
          // No matching default nest → this was a player-placed nest; respawn it
          const nest = new Nest(this, saved.x, saved.y);
          nest.onHatch = (hx, hy) => {
            new Chicken(this.chickenGroup, hx, hy, this.pathfinder, WATER_SPOTS, this.nests);
          };
          this.nests.push(nest);
          this.registerInteractable(nest);
          if (saved.state === 'has_egg') nest.layEgg();
        }
      }
    }
  }

  // ── Chickens + Nests ───────────────────────────────────────────────────────
  private createChickens(): void {
    this.chickenGroup = this.physics.add.group();

    // Water drinking spots — just above the pond edge (createPond is at 560,390)
    const WATER_SPOTS: [number, number][] = [[600, 386]];

    // Nests placed in a row above the chicken spawn area
    const NEST_POSITIONS: [number, number][] = [[455, 370], [480, 370], [505, 370]];
    this.nests = NEST_POSITIONS.map(([nx, ny]) => {
      const nest = new Nest(this, nx, ny); // no obstacles → walk-through
      // onHatch: incubation complete → spawn a new chick at the nest location
      nest.onHatch = (hx, hy) => {
        new Chicken(this.chickenGroup, hx, hy, this.pathfinder, WATER_SPOTS, this.nests);
      };
      this.registerInteractable(nest);
      return nest;
    });

    const SPAWN: [number, number][] = [[510, 390], [545, 405], [480, 420]];
    this.chickenEntities = SPAWN.map(([cx, cy]) =>
      new Chicken(this.chickenGroup, cx, cy, this.pathfinder, WATER_SPOTS, this.nests),
    );
  }

  private updateChickens(time: number, delta: number): void {
    this.chickenEntities.forEach(c => c.update(time, delta));
  }

  private updateNests(px: number, py: number): void {
    // Update hints and prune dismantled nests
    for (let i = this.nests.length - 1; i >= 0; i--) {
      const nest = this.nests[i];
      nest.update(px, py);
      if (nest.gone) {
        this.unregisterInteractable(nest);
        this.nests.splice(i, 1);
      }
    }
  }

  // ── Tree spawning ──────────────────────────────────────────────────────────
  /**
   * Place the initial set of trees around the world.
   * Trees are registered as Interactables so F-key harvesting works.
   * Positioned to match the old static MapBuilder layout.
   */
  private spawnInitialTrees(): void {
    // Canonical tree positions — always the same layout.
    // Stages are restored from save data if available.
    const POSITIONS: [number, number][] = [
      [SPAWN_X + 60,  SPAWN_Y - 40],   // close to spawn
      [SPAWN_X - 80,  SPAWN_Y + 30],   // left of spawn
      [SPAWN_X + 160, SPAWN_Y + 80],   // farther right
    ];
    const DEFAULT_STAGES: TreeStage[] = ['C', 'B', 'A'];

    // Build a lookup from saved state (if we have one)
    const savedTreeMap = new Map<string, { stage: TreeStage; hasFruit: boolean }>();
    for (const ts of (this.initialState.trees ?? [])) {
      savedTreeMap.set(ts.id, { stage: ts.stage as TreeStage, hasFruit: ts.hasFruit });
    }

    POSITIONS.forEach(([x, y], i) => {
      const id    = `tree-${i}`;
      const saved = savedTreeMap.get(id);
      const stage     = saved?.stage    ?? DEFAULT_STAGES[i];
      const hasFruit  = saved?.hasFruit ?? (stage === 'C');   // default: C → has fruit

      const tree = new Tree(
        this, x, y,
        id,
        this.obstacles,
        stage,
        hasFruit,
      );
      this.trees.set(tree.id, tree);
      this.registerInteractable(tree);
      // Mark tree cell impassable in WorldGrid
      const { col, row } = this.worldGrid.worldToCell(x, y);
      this.worldGrid.setObject(col, row, ObjectType.TREE);
      // Register in SpatialIndex for O(1) nearest-tree queries
      if (!tree.isChopped()) this.spatialIndex.insert({ id: tree.id, wx: x, wy: y, ref: tree });
    });
  }

  // ── Bush spawning ──────────────────────────────────────────────────────────
  private spawnInitialBushes(): void {
    const POSITIONS: [number, number][] = [
      [SPAWN_X - 120, SPAWN_Y + 60],
      [SPAWN_X + 200, SPAWN_Y - 20],
      [SPAWN_X + 80,  SPAWN_Y + 120],
    ];
    POSITIONS.forEach(([x, y], i) => {
      const bush = new RaspberryBush(this, x, y, `bush-${i}`, this.drops);
      this.bushes.push(bush);
      this.registerInteractable(bush);
    });
  }

  // ── Interaction triggers (called from React keydown handler) ─────────────
  /** E key / Talk button — open chat with the NPC. */
  triggerInteract(): void {
    gameBus.emit('npc:interact', { npcName: this.npc.name });
  }

  /** Space key — use current tool: axe→chop, scythe→till, water→irrigate, seed→plant. */
  triggerAction(): void {
    if (!this.player) return;
    this.player.performAction();

    if (this.player.currentTool === 'axe') {
      // Axe can chop beds — check before trees
      const px = this.player.sprite.x;
      const py = this.player.sprite.y;
      for (let i = this.beds.length - 1; i >= 0; i--) {
        const bed = this.beds[i];
        if (bed.isNearPlayer(px, py, 60)) {
          const bx     = bed.worldX;
          const by     = bed.worldY;
          const itemId = bed.chop();            // destroys bed sprite
          this.beds.splice(i, 1);
          this.unregisterInteractable(bed);
          const drop = new DropItem(this, bx, by, itemId);
          this.drops.push(drop);
          return;
        }
      }
      this.tryChopNearestTree();
      return;
    }

    // Farm tool actions (till / water / plant)
    const heldItemId = (this.player as any).heldItemId as string | undefined;
    this.farmSystem?.handleToolUse(
      this.player.sprite.x,
      this.player.sprite.y,
      this.player.currentTool,
      heldItemId,
    );
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
    if (!this.player) return;   // guard: create() not yet complete
    console.log('[GameScene] setPlayerTool →', tool);
    this.player.setTool(tool);
  }

  /**
   * Returns the full world state for saving to the server.
   * Persists: player position/facing/gameTick + all tree states.
   */
  getGameState(): IdleGameState {
    const ps = this.player.getState();
    const facing = (['down', 'up', 'left', 'right'] as FacingDirection[]).includes(
      ps.facing as FacingDirection
    ) ? ps.facing as FacingDirection : 'down' as FacingDirection;

    const trees: TreeSaveState[] = [...this.trees.values()].map(t => t.getState());

    return {
      x:          ps.x,
      y:          ps.y,
      gameTick:   this.dayCycle.gameTick,
      facing,
      trees,
      worldState: this._serializeWorld(),
    };
  }

  getGameTick(): number { return this.dayCycle.gameTick; }

  getDayCycleTick(): number {
    return this.dayCycle?.gameTick ?? 0;
  }

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

  /** Wire the auth-token provider into the NPC (called by usePhaserBoot on game:ready). */
  setNpcAuthProvider(fn: () => string | null): void {
    this.npc.setAuthProvider(fn);
  }

  /** Wire the NPC-inventory provider into the NPC (called by usePhaserBoot on game:ready). */
  setNpcInventoryProvider(fn: (name: string) => Record<string, number>): void {
    this.npc.setInventoryProvider(fn);
  }

  /**
   * Seed the NPC's local memory cache with entries fetched from the backend.
   * Always appends the built-in location memory so 老李 knows where the room is.
   */
  loadNpcMemories(npcName: string, entries: NpcMemoryEntry[]): void {
    if (this.npc.name !== npcName) return;
    const locationMemory: NpcMemoryEntry = {
      id:           'builtin-house-location',
      gameTick:     0,
      text:         '我知道地图右边有一间木屋，那是我和玩家共同的房间。' +
                    '木屋大门入口坐标约(502, 336)，房间内部中心坐标约(550, 240)。' +
                    '当玩家说"去房间里"时，我应该回复我要去，然后去房间。' +
                    '当玩家说"出来找我"时，我应该出来到玩家身边。',
      source:       'event',
      importance:   9,
      keywords:     ['房间', '木屋', '大门', '室内', '里面', '进去', '出来', '找我'],
      lastAccessed: 0,
    };
    this.npc.loadMemories([locationMemory, ...entries]);
  }

  // ── NPC action execution (called from React after player message / SSE) ────

  /**
   * Execute a sequence of NpcActions on a named NPC.
   * Used by both chat replies and SSE npc_command events.
   */
  executeNpcActions(npcName: string, actions: import('./types').NpcAction[]): void {
    if (this.npc.name !== npcName) return;
    this.actionExecutor.execute(this.npc, actions, this.dayCycle.gameTick);
  }

  /** Return the player's current world position (used to pass to backend for context). */
  getPlayerPosition(): { x: number; y: number } {
    return { x: this.player.sprite.x, y: this.player.sprite.y };
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

  /**
   * F key — universal INTERACT:
   * 1. Harvest ready farm crop (standing on/near one)
   * 2. Pick up nearest DropItem within range
   * 3. Open chests / collect nest eggs (Interactable registry)
   */
  private triggerFInteract(): void {
    if (!this.player) return;
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;

    // 0. Item placement: if holding a 'placeable' item, place it in the world
    const heldItemId = (this.player as any).heldItemId as string | undefined;
    if (heldItemId && ITEM_DEF_MAP.get(heldItemId)?.itemType === 'placeable') {
      this._placeEntity(heldItemId, px, py);
      return;
    }

    // 1. Farm: harvest mature crop
    if (this.farmSystem?.handleInteract(px, py)) return;

    // 2. Pick up the closest drop item within range
    let nearest: DropItem | null = null;
    let nearestD = Infinity;
    for (const drop of this.drops) {
      if (!drop.gone && drop.isNearPlayer(px, py)) {
        const dx = px - drop.worldX;
        const dy = py - drop.worldY;
        const d  = dx * dx + dy * dy;
        if (d < nearestD) { nearest = drop; nearestD = d; }
      }
    }
    if (nearest) { nearest.pickup(); return; }

    // 3. Static interactables: trees with fruit, chests, nests
    for (const obj of this.interactables) {
      if (obj.isNearPlayer(px, py)) {
        obj.interact();
        break;
      }
    }
  }

  // ── Q-drop ────────────────────────────────────────────────────────────────
  /**
   * Drop the currently held item one step in front of the player as a DropItem.
   * Consumes 1 from inventory via onConsumeItem callback.
   */
  private _triggerQDrop(): void {
    const heldItemId = (this.player as any).heldItemId as string | undefined;
    if (!heldItemId) return;
    const px   = this.player.sprite.x;
    const py   = this.player.sprite.y;
    const STEP = 24;
    const dir  = this.player.facing ?? 'down';
    const fx   = px + (dir === 'left' ? -STEP : dir === 'right' ? STEP : 0);
    const fy   = py + (dir === 'up'   ? -STEP : dir === 'down'  ? STEP : 0);
    this.drops.push(new DropItem(this, fx, fy, heldItemId));
    gameBus.emit('player:consume_item', { itemId: heldItemId, qty: 1 });
  }

  // ── Chest management ──────────────────────────────────────────────────────
  /** Load saved chests on game boot. */
  loadChests(chests: GameChest[]): void {
    for (const c of chests) this.addChest(c);
  }

  /** Add a single chest to the scene (e.g. from SSE spawn event). */
  addChest(data: GameChest): void {
    if (this.chests.has(data.id)) return;  // already present
    const chest = new Chest(this, data.x, data.y, data.id, data.rewards);
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

  getCreatureStates(): ReturnType<Chicken['getState']>[] {
    return this.chickenEntities.map(c => c.getState());
  }

  /** Restore persisted creature states (called after getCreatures() on game-ready). */
  restoreCreatures(saved: ReturnType<Chicken['getState']>[]): void {
    for (const savedState of saved) {
      // Match by sequential index — IDs regenerate each session, so match by order
      const idx = parseInt(savedState.creatureId.replace('chicken_', ''), 10) - 1;
      const chicken = this.chickenEntities[idx] ?? this.chickenEntities.find((_, i) => i === saved.indexOf(savedState));
      chicken?.restoreState(savedState);
    }
  }

  /** Remove a chest from the scene after it has been opened. */
  removeChest(id: string): void {
    const chest = this.chests.get(id);
    if (!chest) return;
    this.unregisterInteractable(chest);
    chest.destroy();
    this.chests.delete(id);
  }


  // ── Public methods for NPC agent system ───────────────────────────────────

  /**
   * Spawn a WorldItem at the given world position.
   * Used when player drops an item (Q key) or NPC drops an item.
   */
  spawnWorldItem(x: number, y: number, itemId: string): void {
    const drop = new DropItem(this, x, y, itemId);
    this.drops.push(drop);
  }

  /** Return the player's current world-space position (used by React to decide drop coords). */
  getPlayerWorldPos(): { x: number; y: number } | null {
    if (!this.player) return null;
    return { x: this.player.sprite.x, y: this.player.sprite.y };
  }

  /**
   * Drop the player's currently held item at a position near the player.
   * Called when player presses Q.
   */
  dropPlayerItem(itemId: string): void {
    if (!this.player) return;
    const x = this.player.sprite.x + 22;
    const y = this.player.sprite.y;
    this.spawnWorldItem(x, y, itemId);
    if (this.multiplayActive) {
      gameBus.emit('mp:relay', { type: 'item_spawn', payload: { itemId, x, y } });
    }
  }

  /** Make a named NPC say text (called from React after async API returns). */
  makeNpcSay(npcName: string, text: string): void {
    if (this.npc.name === npcName) {
      this.npc.say(text, this.dayCycle.gameTick);
    }
  }

  /**
   * Return a description of what the NPC can currently observe.
   * Passed to the backend as LLM context before a chat request.
   */
  getPerceptionReport(): string {
    const report = this.perceptionSystem?.scan(this.npc.sprite.x, this.npc.sprite.y) ?? '';
    console.log(`[GameScene] perceptionReport (npc at ${Math.round(this.npc.sprite.x)},${Math.round(this.npc.sprite.y)}): "${report.slice(0, 200)}"`);
    return report;
  }

  /**
   * Resume or cancel the NPC's queued actions after an ask_confirm dialog.
   */
  confirmNpcAction(npcName: string, confirmed: boolean): void {
    if (this.npc.name === npcName) this.npc.respondToConfirm(confirmed);
  }

  /**
   * Make the NPC chop a tree by ID — called from the onNpcChopTree callback
   * (fallback path when worldCtx is unavailable).
   */
  chopTreeById(id: string): void {
    const tree = this.trees.get(id);
    if (tree) {
      tree.chop();
      const { worldX: wx, worldY: wy } = tree;
      this.spatialIndex.remove(id, wx, wy);
    }
    if (this.multiplayActive) {
      gameBus.emit('mp:relay', { type: 'tree_chop', payload: { treeId: id } });
    }
  }

  /** Spawn the remote player sprite at given position with display name. */
  spawnRemotePlayer(x: number, y: number, displayName: string): void {
    this.remotePlayer?.destroy();
    this.remotePlayer = new RemotePlayer(this, x, y, displayName);
    this.multiplayActive = true;
    console.log('[GameScene] spawnRemotePlayer:', displayName);
  }

  /** Remove remote player and disable multiplay emissions. */
  removeRemotePlayer(): void {
    this.remotePlayer?.destroy();
    this.remotePlayer = null;
    this.multiplayActive = false;
  }

  /** Apply a game event received from a remote peer. */
  applyRemoteEvent(type: string, payload: Record<string, unknown>): void {
    switch (type) {
      case 'player_move':
        if (this.remotePlayer) {
          this.remotePlayer.moveTo(
            payload.x as number,
            payload.y as number,
            payload.facing as import('./types').Direction,
            payload.velX as number,
            payload.velY as number,
          );
        }
        break;

      case 'item_spawn':
        this.spawnWorldItem(payload.x as number, payload.y as number, payload.itemId as string);
        break;

      case 'item_claim': {
        const itemId = payload.itemId as string;
        const ix = payload.x as number;
        const iy = payload.y as number;
        const idx = this.drops.findIndex(
          d => d.itemId === itemId && !d.gone &&
               Math.abs(d.worldX - ix) < 40 && Math.abs(d.worldY - iy) < 40,
        );
        if (idx !== -1) {
          this.drops[idx].claimForNpc();
          this.drops.splice(idx, 1);
        }
        break;
      }

      case 'tree_chop':
        this.trees.get(payload.treeId as string)?.chop();
        break;

      case 'player_sleep': {
        // Remote peer changed their sleep state
        const peerId   = (payload.peerId ?? 'remote') as string;
        const sleeping = payload.sleeping as boolean;
        this.sleepManager?.onRemoteSleepChange(peerId, sleeping, this.dayCycle);
        break;
      }
    }
  }

  /** Serialize current world state for the initial snapshot sent to a new peer. */
  getWorldSnapshot(hostDisplayName?: string): import('./systems/MultiplaySystem').WorldSnapshot {
    return {
      choppedTreeIds: [...this.trees.entries()]
        .filter(([, t]) => t.isChopped())
        .map(([id]) => id),
      worldItems: this.drops
        .filter(d => !d.gone)
        .map(d => ({ itemId: d.itemId, x: d.worldX, y: d.worldY })),
      hostX: this.player?.sprite.x,
      hostY: this.player?.sprite.y,
      hostDisplayName,
      // Sync game clock — guest will snap to host's gameTick on join
      gameTick: this.dayCycle?.gameTick,
    };
  }

  /** Set the dayCycle gameTick directly (used by guest to sync clock to host). */
  setGameTick(tick: number): void {
    if (this.dayCycle) this.dayCycle.gameTick = tick;
  }

  /** Apply a world snapshot received from the host. */
  applyWorldSnapshot(snapshot: { choppedTreeIds: string[]; worldItems: Array<{ itemId: string; x: number; y: number }> }): void {
    // Chop trees the host already chopped
    for (const treeId of snapshot.choppedTreeIds) {
      this.trees.get(treeId)?.chop();
    }
    // Replace all drops with host's current state
    for (const drop of this.drops) drop.destroy();
    this.drops = [];
    for (const { itemId, x, y } of snapshot.worldItems) {
      this.spawnWorldItem(x, y, itemId);
    }
  }

  // ── WorldContext implementation ────────────────────────────────────────────

  findNearestTree(x: number, y: number): { id: string; x: number; y: number } | null {
    // Use SpatialIndex for O(1)-amortised query instead of O(n) full scan
    const SEARCH_RADIUS = 600;
    const candidates = this.spatialIndex.queryRadius(x, y, SEARCH_RADIUS);
    let closest: { id: string; x: number; y: number } | null = null;
    let closestD = Infinity;
    for (const entry of candidates) {
      const tree = entry.ref as Tree;
      if (tree.isChopped()) continue;
      const dx = entry.wx - x, dy = entry.wy - y;
      const d = dx * dx + dy * dy;
      if (d < closestD) {
        closestD = d;
        closest = { id: tree.id, x: entry.wx, y: entry.wy + 40 };
      }
    }
    // Fall back to full scan if nothing found within radius (small map edge case)
    if (!closest) {
      for (const tree of this.trees.values()) {
        if (tree.isChopped()) continue;
        const dx = tree.worldX - x, dy = tree.worldY - y;
        const d = dx * dx + dy * dy;
        if (d < closestD) { closestD = d; closest = { id: tree.id, x: tree.worldX, y: tree.worldY + 40 }; }
      }
    }
    return closest;
  }

  findWorldItem(itemId: string): DropItem | null {
    return this.drops.find(d => d.itemId === itemId && !d.gone) ?? null;
  }

  /** Remove DropItem from world (NPC picked it up) and fire callback for Redux. */
  claimWorldItem(itemId: string, npcName: string): void {
    console.log(`[GameScene] claimWorldItem: itemId=${itemId} drops=[${this.drops.map(d=>d.itemId).join(',')}]`);
    const idx = this.drops.findIndex(d => d.itemId === itemId && !d.gone);
    if (idx === -1) {
      console.warn(`[GameScene] claimWorldItem: item "${itemId}" not found in drops!`);
      return;
    }
    this.drops[idx].claimForNpc();
    this.drops.splice(idx, 1);
    gameBus.emit('npc:pickup_world_item', { npcName, itemId, qty: 1 });
  }

  /** Create WorldItem at position (NPC dropped it) and fire Redux callback. */
  dropWorldItem(x: number, y: number, itemId: string, npcName: string): void {
    this.spawnWorldItem(x, y, itemId);
    gameBus.emit('npc:drop_item', { npcName, itemId, qty: 1 });
  }

  // ── Command system ─────────────────────────────────────────────────────────

  /**
   * Parse and execute a slash command (e.g. "/weather rain").
   * Returns a player-facing feedback string to display in the UI.
   */
  executeCommand(input: string): string {
    return this.commands.execute(input);
  }

  private setPhysicsDebug(enabled: boolean): void {
    const world = this.physics.world;

    if (enabled) {
      // Ensure the debug graphic exists (createDebugGraphic also sets drawDebug=true)
      if (!world.debugGraphic) world.createDebugGraphic();
      world.drawDebug = true;
      world.defaults.debugShowBody         = true;
      world.defaults.debugShowStaticBody   = true;
      world.defaults.debugShowVelocity     = false;
      world.defaults.bodyDebugColor        = 0x2ee6a6;   // cyan  — dynamic
      world.defaults.staticBodyDebugColor  = 0xff4d6d;   // pink  — static/wall

      // ⚠️ Phaser sets body.debugShowBody at CREATION time from world.defaults.
      // Bodies created while debug=false have debugShowBody=false permanently
      // unless we patch them all here.
      world.bodies.iterate((body: Phaser.Physics.Arcade.Body) => {
        body.debugShowBody  = true;
        body.debugBodyColor = world.defaults.bodyDebugColor;
        return true;
      });
      (world.staticBodies as Phaser.Structs.Set<Phaser.Physics.Arcade.StaticBody>)
        .iterate((body: Phaser.Physics.Arcade.StaticBody) => {
          body.debugShowBody  = true;
          body.debugBodyColor = world.defaults.staticBodyDebugColor;
          return true;
        });

      world.debugGraphic!.setVisible(true);
      this.physicsDebugEnabled = true;
      return;
    }

    world.drawDebug = false;
    if (world.debugGraphic) {
      world.debugGraphic.clear();
      world.debugGraphic.setVisible(false);
    }
    this.physicsDebugEnabled = false;
  }

  /** Register built-in game commands. Add new commands here. */
  private _registerCommands(): void {
    // /weather <rain|clear>
    this.commands.register(
      'weather',
      'set weather — rain | clear',
      (args) => {
        const w = args[0]?.toLowerCase();
        if (w === 'rain')  { this.weather.setWeather('rain');  return '🌧  天气: 下雨'; }
        if (w === 'clear') { this.weather.setWeather('clear'); return '☀️  天气: 晴天'; }
        return `用法: /weather rain | /weather clear`;
      },
    );

    // /time set <0-1439>
    this.commands.register(
      'time',
      'set in-game time — /time set <0-1439>',
      (args) => {
        if (args[0] === 'set') {
          const mins = parseInt(args[1] ?? '');
          if (!isNaN(mins) && mins >= 0 && mins <= 1439) {
            this.dayCycle.setTimeOfDay(mins);
            const h = Math.floor(mins / 60).toString().padStart(2, '0');
            const m = (mins % 60).toString().padStart(2, '0');
            return `🕐  时间跳转到 ${h}:${m}`;
          }
        }
        return `用法: /time set <0-1439>  例: /time set 480`;
      },
    );

    this.commands.register(
      'debug',
      'toggle physics debug — /debug on | /debug off',
      (args) => {
        const mode = args[0]?.toLowerCase();
        if (mode === 'on') {
          this.setPhysicsDebug(true);
          return '碰撞调试已开启';
        }
        if (mode === 'off') {
          this.setPhysicsDebug(false);
          return '碰撞调试已关闭';
        }
        return `当前状态: ${this.physicsDebugEnabled ? 'on' : 'off'}。用法: /debug on | /debug off`;
      },
    );

    // /help
    this.commands.register('help', '查看所有可用命令', () => this.commands.listHelp());

    // /getInventory <name>
    this.commands.register(
      'getInventory',
      '查看NPC背包 — /getInventory <名字>',
      (args) => {
        const name = args.join(' ').trim() || NPC_NAME;
        const inv = this.npc.getInventory(name);
        const entries = Object.entries(inv);
        if (entries.length === 0) return `${name} 的背包是空的。`;
        return `${name} 的背包：\n${entries.map(([k, v]) => `  ${k} × ${v}`).join('\n')}`;
      },
    );
  }
}
