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
import { WeatherSystem }       from './systems/WeatherSystem';
import { CommandSystem }       from './systems/CommandSystem';
import { Player }              from './entities/Player';
import { Npc }                 from './entities/Npc';
import { Chest }               from './entities/Chest';
import { Tree }                from './entities/Tree';
import type { TreeStage }      from './entities/Tree';
import { House }               from './entities/House';
import { Chicken }             from './entities/Chicken';
import { Nest }                from './entities/Nest';
import { Pathfinder }          from './systems/Pathfinder';
import { ActionExecutor }      from './systems/ActionExecutor';
import type { IdleGameState }  from '../../../../Types/Profile';

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

// ─────────────────────────────────────────────────────────────────────────────
export class GameScene extends Phaser.Scene {
  // ── Public: React sets these before game boots ────────────────────────────
  callbacks:    GameCallbacks = {};
  /** Optional: set before booting to restore a saved game session. */
  initialState: Partial<IdleGameState> = {};

  // ── Private game objects ──────────────────────────────────────────────────
  private player!:    Player;
  private npc!:       Npc;
  private chickenGroup!:   Phaser.Physics.Arcade.Group;
  private chickenEntities: Chicken[] = [];
  private nests:           Nest[]    = [];
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private dayCycle!:  DayCycle;

  // ── General F-key interactable registry ──────────────────────────────────
  private interactables: Interactable[] = [];

  // ── Chest management ──────────────────────────────────────────────────────
  private chests = new Map<string, Chest>();

  // ── Tree management ────────────────────────────────────────────────────────
  private trees = new Map<string, Tree>();

  // ── House ─────────────────────────────────────────────────────────────────
  private house!: House;

  // ── Pathfinder ────────────────────────────────────────────────────────────
  private pathfinder!:    Pathfinder;
  private actionExecutor!: ActionExecutor;

  // ── Systems ───────────────────────────────────────────────────────────────
  private weather!:  WeatherSystem;
  private commands!: CommandSystem;
  private physicsDebugEnabled = false;

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
    this.load.spritesheet('chest',    chestUrl,   { frameWidth: CHEST_FRAME_W,  frameHeight: CHEST_FRAME_H  });
    this.load.spritesheet('egg-nest', eggNestUrl, { frameWidth: 16, frameHeight: 16 });
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

    // ── F key (general world-object interaction) ──────────────────────────
    this._fKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);

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

    // ── Pathfinder — built after ALL obstacles (house + trees) are placed ─────
    this.pathfinder    = new Pathfinder(this.obstacles, WORLD_W, WORLD_H);
    this.npc.setPathfinder(this.pathfinder);
    this.actionExecutor = new ActionExecutor(this.player);

    // ── Chickens + Nests (created after pathfinder is ready) ─────────────────
    this.createChickens();

    // ── Collisions ────────────────────────────────────────────────────────
    this.physics.add.collider(this.player.sprite, this.obstacles);
    this.physics.add.collider(this.npc.sprite,    this.obstacles);
    this.physics.add.collider(this.player.sprite, this.npc.sprite);
    this.physics.add.collider(this.chickenGroup,  this.obstacles);
    this.physics.add.collider(this.chickenGroup,  this.chickenGroup);

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

    // ── House door proximity (player OR NPC triggers door) ────────────────
    this.house.update(
      this.player.sprite.x, this.player.sprite.y,
      this.npc.sprite.x,    this.npc.sprite.y,
    );

    // ── NPC + chickens ────────────────────────────────────────────────────
    this.npc.update(dt, this.dayCycle.gameTick);
    this.updateChickens(time, delta);
  }

  // ── Chickens + Nests ───────────────────────────────────────────────────────
  private createChickens(): void {
    this.chickenGroup = this.physics.add.group();

    // Water drinking spots — just above the pond edge (createPond is at 560,390)
    const WATER_SPOTS: [number, number][] = [[600, 386]];

    // Nests placed in a row above the chicken spawn area
    const NEST_POSITIONS: [number, number][] = [[455, 370], [480, 370], [505, 370]];
    this.nests = NEST_POSITIONS.map(([nx, ny]) => {
      const nest = new Nest(this, nx, ny, this.callbacks);
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
  }
}
