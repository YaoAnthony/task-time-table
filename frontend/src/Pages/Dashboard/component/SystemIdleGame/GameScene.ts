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
import type { NpcMindState, TreeGrowthStage } from './shared/worldStateTypes';
import { RaspberryBush }       from './entities/RaspberryBush';
import { House }               from './entities/House';
import { ChickenView }         from './entities/ChickenView';
import { NestView }            from './entities/NestView';
import { TreeView }            from './entities/TreeView';
import { DropItem, TOOL_ITEM_DEFS, ITEM_DEF_MAP } from './entities/DropItem';
import { RemotePlayer } from './entities/RemotePlayer';
import { Bed, type BedColor }   from './entities/Bed';
import { Pathfinder }          from './systems/Pathfinder';
import { ActionExecutor }      from './systems/ActionExecutor';
import { ChickenStateSystem } from './systems/ChickenStateSystem';
import { FarmSystem }          from './systems/FarmSystem';
import { InteractionSystem } from './systems/InteractionSystem';
import { NestStateSystem } from './systems/NestStateSystem';
import { formatPerceptionForNpcPrompt } from './systems/perceptionFormatter';
import { TreeStateSystem } from './systems/TreeStateSystem';
import { PerceptionSystem }     from './systems/WorldPerceptionSystem';
import { WorldActionSystem, type WorldAction, type WorldActionResult } from './systems/WorldActionSystem';
import { RenderSyncSystem } from './systems/RenderSyncSystem';
import { SleepManager }        from './systems/SleepManager';
import { NpcMemorySystem } from './systems/NpcMemorySystem';
import { NpcThinkSystem } from './systems/NpcThinkSystem';
import { StateBackedWorldGrid } from './shared/StateBackedWorldGrid';
import { SpatialIndex }          from './shared/SpatialIndex';
import { WorldStateManager }     from './shared/WorldStateManager';
import type { WorldSyncSource }  from './sync/syncPolicy';
import { WorldFacade } from './systems/WorldFacade';
import type { WorldCtx }         from './world/utils';
import { createFlower }          from './world/flower';
import { createRock }            from './world/rock';
import { createBush as createDecorBush } from './world/bush';
import { VILLAGE_LAYOUT } from './world/layouts/villageLayout';
import type { WorldContext }     from './systems/ActionExecutor';
import type { IdleGameState, TreeSaveState }  from '../../../../Types/Profile';
import type { CreatureState } from '../../../../Redux/Features/gameSlice';

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
  private chickenEntities: ChickenView[] = [];
  private nests:           NestView[]    = [];
  private obstacles!: Phaser.Physics.Arcade.StaticGroup;
  private dayCycle!:  DayCycle;

  // ── General F-key interactable registry ──────────────────────────────────
  private interactables: Interactable[] = [];

  // ── Drop items (all pickupable items — tools, seeds, crops, loot) ───────────
  private drops: DropItem[] = [];

  // ── Chest management ──────────────────────────────────────────────────────
  private chests = new Map<string, Chest>();

  // ── Tree management ────────────────────────────────────────────────────────
  private trees = new Map<string, TreeView>();

  // ── Raspberry bush management ─────────────────────────────────────────────
  private bushes: RaspberryBush[] = [];

  // ── Houses ────────────────────────────────────────────────────────────────
  private house!:    House;   // 玩家的家 (Player's Home)   — top-left
  private npcHouse!: House;   // 村长府邸 (Mayor's Manor)  — top-right

  // ── Extra wandering NPCs ──────────────────────────────────────────────────
  private extraNpcs: Npc[] = [];

  // ── Pathfinder ────────────────────────────────────────────────────────────
  private pathfinder!:    Pathfinder;
  private actionExecutor!: ActionExecutor;

  // ── Systems ───────────────────────────────────────────────────────────────
  private weather!:  WeatherSystem;
  private commands!: CommandSystem;
  farmSystem!: FarmSystem;
  private chickenStateSystem!: ChickenStateSystem;
  private interactionSystem!: InteractionSystem;
  private nestStateSystem!: NestStateSystem;
  private renderSyncSystem!: RenderSyncSystem;
  private treeStateSystem!: TreeStateSystem;
  private worldActionSystem!: WorldActionSystem;
  private worldFacade!: WorldFacade;
  private npcMemorySystem!: NpcMemorySystem;
  private npcThinkSystem!: NpcThinkSystem;
  worldGrid!: StateBackedWorldGrid;
  worldStateManager!: WorldStateManager;
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
  private _nextWorldObjectId = 1;
  private _nextChickenId = 1;
  private _nextNestId = 1;
  private readonly chickenWaterSpots: [number, number][] = [[848, 638]];

  // ─────────────────────────────────────────────────────────────────────────
  constructor() { super({ key: 'GameScene' }); }

  private nextChickenId(): string {
    return `chicken_${this._nextChickenId++}`;
  }

  private nextNestId(): string {
    return `nest-${this._nextNestId++}`;
  }

  private getNpcRegistrations(): Array<{ id: string; npc: Npc }> {
    return [{ id: this.npc.name, npc: this.npc }];
  }

  private spawnChickenAt(x: number, y: number, id?: string): ChickenView {
    const chickenId = id ?? this.nextChickenId();
    const chicken = this.renderSyncSystem.spawnChicken(
      this.chickenGroup,
      this.pathfinder,
      chickenId,
      x,
      y,
      this.chickenEntities,
    );
    this.chickenStateSystem.registerChicken(chicken, {
      id: chickenId,
      x,
      y,
      facing: 'right',
      state: 'wandering',
      thirst: 0,
      growth: 0,
      nextThirstAt: this.time.now + Math.random() * 2500 + 2500,
      nextWanderAt: 0,
      stopAt: 0,
      actionUntil: null,
      nestId: null,
      targetX: null,
      targetY: null,
      meta: { interactable: false },
    });
    return chicken;
  }

  private registerCoreWorldEntities(): void {
    this.renderSyncSystem.registerCoreWorldEntities(this.player, this.npc, this.extraNpcs);
  }

  private syncWorldStateMeta(): void {
    this.renderSyncSystem.syncWorldStateMeta(
      this.dayCycle?.gameTick ?? 0,
      this.dayCycle?.getTimeStr?.() ?? '06:00',
    );
  }

  private syncDynamicEntityStates(): void {
    this.renderSyncSystem.syncDynamicEntityStates({
      player: this.player,
      npc: this.npc,
      extraNpcs: this.extraNpcs,
      chickens: this.chickenEntities,
      remotePlayer: this.remotePlayer,
    });
  }

  private registerWorldObject(
    id: string,
    kind: 'tree' | 'chest' | 'bed' | 'nest',
    x: number,
    y: number,
    opts?: { blocking?: boolean; interactable?: boolean; state?: string; meta?: Record<string, unknown> },
  ): void {
    this.worldStateManager.registerObject({
      id,
      kind,
      x,
      y,
      blocking: opts?.blocking,
      interactable: opts?.interactable,
      state: opts?.state,
      meta: opts?.meta,
    });
  }

  private ensureRuntimeObjectId(target: object, prefix: 'bed' | 'nest'): string {
    const existingId = (target as any).__worldObjectId as string | undefined;
    if (existingId) return existingId;
    const id = `${prefix}-${this._nextWorldObjectId++}`;
    (target as any).__worldObjectId = id;
    return id;
  }

  private getRuntimeObjectId(target: object | null | undefined): string | null {
    return ((target as any)?.__worldObjectId as string | undefined) ?? null;
  }

  private registerBedObject(bed: Bed): void {
    const id = this.ensureRuntimeObjectId(bed, 'bed');
    this.registerWorldObject(id, 'bed', bed.worldX, bed.worldY, {
      interactable: true,
      state: bed.color,
    });
  }

  private unregisterRuntimeObject(target: object | null | undefined): void {
    const id = this.getRuntimeObjectId(target);
    if (!id) return;
    this.worldStateManager.unregisterObject(id);
  }

  private registerDropState(drop: DropItem): void {
    const existingId = (drop as any).__worldStateId as string | undefined;
    const id = existingId ?? `drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    (drop as any).__worldStateId = id;
    this.worldStateManager.registerDrop({
      id,
      itemId: drop.itemId,
      x: drop.worldX,
      y: drop.worldY,
      claimed: Boolean(drop.gone),
    });
  }

  private unregisterDropState(drop: DropItem): void {
    const id = (drop as any).__worldStateId as string | undefined;
    if (!id) return;
    this.worldStateManager.unregisterDrop(id);
  }

  private syncPlayerInteractionState(): void {
    this.worldStateManager.updateEntityPosition('player', this.player.sprite.x, this.player.sprite.y);
    this.worldStateManager.patchEntity('player', {
      facing: this.player.facing,
    });
  }

  private findDropByStateId(dropId: string): DropItem | null {
    return this.drops.find((drop) => ((drop as any).__worldStateId as string | undefined) === dropId) ?? null;
  }

  private findDropByItemAndPosition(itemId: string, x: number, y: number): DropItem | null {
    return this.drops.find(
      (drop) => drop.itemId === itemId
        && !drop.gone
        && Math.abs(drop.worldX - x) < 40
        && Math.abs(drop.worldY - y) < 40,
    ) ?? null;
  }

  private findInteractableObjectByStateId(objectId: string): Interactable | null {
    if (this.trees.has(objectId)) return this.trees.get(objectId) ?? null;
    if (this.chests.has(objectId)) return this.chests.get(objectId) ?? null;

    const bed = this.beds.find((entry) => this.getRuntimeObjectId(entry) === objectId);
    if (bed) return bed;

    const nest = this.nests.find((entry) => entry.id === objectId || this.getRuntimeObjectId(entry) === objectId);
    if (nest) return nest;

    return null;
  }

  dispatchWorldAction(action: WorldAction, source: WorldSyncSource = 'local'): WorldActionResult {
    const result = this.worldActionSystem.dispatchAction(action);
    gameBus.emit('world:action_applied', { action, result, source });
    return result;
  }

  private applyPlaceObjectAction(action: Extract<WorldAction, { type: 'PLACE_OBJECT' }>): WorldActionResult {
    const placed = this.placeEntityAt(action.itemId, action.x, action.y);
    return {
      ok: placed,
      action,
      reason: placed ? undefined : 'Object placement failed',
      changedIds: placed ? [action.itemId] : [],
    };
  }

  private applyPickupDropAction(action: Extract<WorldAction, { type: 'PICKUP_DROP' }>): WorldActionResult {
    const drop = this.findDropByStateId(action.dropId);
    if (!drop) {
      return { ok: false, action, reason: 'Drop not found' };
    }
    if (action.actorId === 'player') {
      drop.pickup();
    } else {
      drop.claimForNpc();
    }
    return { ok: true, action, changedIds: [action.dropId] };
  }

  private applyDropItemAction(action: Extract<WorldAction, { type: 'DROP_ITEM' }>): WorldActionResult {
    const drop = this.spawnWorldItemDirect(action.x, action.y, action.itemId);
    gameBus.emit('world:item_spawned', {
      itemId: action.itemId,
      x: action.x,
      y: action.y,
      spawnId: ((drop as any).__worldStateId as string | undefined) ?? action.itemId,
      actorId: action.actorId,
      source: action.actorId === 'remote-player'
        ? 'room'
        : action.actorId === 'system'
          ? 'server'
          : 'local',
    });
    return { ok: true, action, changedIds: [(drop as any).__worldStateId ?? action.itemId] };
  }

  private applyRemoveObjectAction(action: Extract<WorldAction, { type: 'REMOVE_OBJECT' }>): WorldActionResult {
    if (action.objectKind === 'chest') {
      this.removeChest(action.objectId);
      return { ok: true, action, changedIds: [action.objectId] };
    }
    this.worldStateManager.unregisterObject(action.objectId);
    return { ok: true, action, changedIds: [action.objectId] };
  }


  // ── Phaser lifecycle ──────────────────────────────────────────────────────
  preload() {
    this.load.image('grass',   tileGrassUrl);
    this.load.spritesheet('water', tileWaterUrl, { frameWidth: 16, frameHeight: 16 });
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
    this.worldGrid    = new StateBackedWorldGrid();
    this.worldStateManager = new WorldStateManager(this.worldGrid);
    this.interactionSystem = new InteractionSystem(this.worldStateManager, this.worldGrid);
    this.worldStateManager.initialize({
      tick: this.initialState.gameTick ?? 0,
    });
    this.spatialIndex = new SpatialIndex(WORLD_W, WORLD_H);
    this.nestStateSystem = new NestStateSystem(
      this,
      this.worldStateManager,
      (x, y) => {
        this.spawnChickenAt(x, y);
      },
    );
    this.treeStateSystem = new TreeStateSystem(this, this.worldStateManager);
    this.chickenStateSystem = new ChickenStateSystem(
      this,
      this.worldStateManager,
      this.nestStateSystem,
      this.chickenWaterSpots,
    );
    this.renderSyncSystem = new RenderSyncSystem(
      this,
      this.worldStateManager,
      {
        registerInteractable: (obj) => this.registerInteractable(obj as Interactable),
        unregisterInteractable: (obj) => this.unregisterInteractable(obj as Interactable),
        registerDropState: (drop) => this.registerDropState(drop),
        unregisterDropState: (drop) => this.unregisterDropState(drop),
        registerBedObject: (bed) => this.registerBedObject(bed),
        unregisterRuntimeObject: (target) => this.unregisterRuntimeObject(target),
        registerWorldObject: (id, kind, x, y, opts) => this.registerWorldObject(id, kind, x, y, opts),
      },
      this.chests,
      this.drops,
    );
    // ── Animations (must be before MapBuilder so water-tile anim exists) ──
    registerAnimations(this);

    // ── Map ───────────────────────────────────────────────────────────────
    new MapBuilder(this, this.obstacles, this.worldGrid).build();

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

    // ── Town NPCs (wandering characters) ─────────────────────────────────────
    //   王村长  — mayor, roams south of the manor       (blue tint)
    //   陈掌柜  — merchant, lingers in the town square  (gold tint)
    //   小花    — young girl, plays near the pond       (pink tint)
    // All positions are on open grass — clear of both houses, pond, and water border.
    // Extra wandering NPCs are defined by the shared village layout.
    // Legacy NPC position notes kept below for reference during map cleanup.
    /*
    /*
      [800, 380, '王村长', 0xaaaaff],   // south of manor door  (house 2 y-max = 336)
      [400, 460, '陈掌柜', 0xffcc88],   // open town square
      [500, 660, '小花',   0xff88cc],   // south meadow near pond (pond at 800,620)
    ];
    // */
    // */
    this.extraNpcs = VILLAGE_LAYOUT.extraNpcs.map(({ x, y, name, tint }) => {
      const n = new Npc(this, x, y, name);
      n.sprite.setTint(tint);
      return n;
    });
    this.registerCoreWorldEntities();

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

    // ── Houses ──────────────────────────────────────────────────────────────
    // House 1 — 玩家的家 (10×6 = 320×192 px)
    //   x: 80–400  y: 80–272   door col3 → door-centre ≈ (192, 256)
    this.house = new House(this, VILLAGE_LAYOUT.playerHouse.x, VILLAGE_LAYOUT.playerHouse.y, this.obstacles);

    // House 2 — 村长府邸 (14×8 = 448×256 px, stone-blue tint, double chimney)
    //   x: 560–1008  y: 80–336  door col6 → door-centre ≈ (768, 320)
    this.npcHouse = new House(this, VILLAGE_LAYOUT.mayorHouse.x, VILLAGE_LAYOUT.mayorHouse.y, this.obstacles, {
      cols:     VILLAGE_LAYOUT.mayorHouse.cols,
      rows:     VILLAGE_LAYOUT.mayorHouse.rows,
      doorCol:  VILLAGE_LAYOUT.mayorHouse.doorCol,
      chimneys: [...VILLAGE_LAYOUT.mayorHouse.chimneys],
      tint:     0xaabbdd,   // cool stone-blue — clearly different from warm wood
    });

    // ── Trees (interactive entities, F=harvest, Space+axe=chop) ──────────────
    this.spawnInitialTrees();

    // ── Raspberry bushes (F=harvest berries, regrow over time) ───────────────
    this.spawnInitialBushes();

    // ── Static decorations (flowers, rocks, decorative bushes) ───────────────
    this.spawnDecorations();

    // ── Pathfinder — reads WorldGrid weights directly (no physics body scan) ──
    this.pathfinder    = new Pathfinder(this.worldGrid);
    this.npc.setPathfinder(this.pathfinder);
    this.npc.setPlayerRef(this.player.sprite);          // for follow_player action
    this.actionExecutor = new ActionExecutor(this.player);
    this.actionExecutor.setWorld(this as unknown as WorldContext);
    this.npc.setWorldContext(this as unknown as WorldContext);
    // Give every extra NPC pathfinding + player awareness so they can wander freely
    for (const n of this.extraNpcs) {
      n.setPathfinder(this.pathfinder);
      n.setPlayerRef(this.player.sprite);
      n.setWorldContext(this as unknown as WorldContext);
    }

    // ── Perception system (scans trees + ground items for LLM context) ────────
    this.perceptionSystem = new PerceptionSystem({
      worldStateManager: this.worldStateManager,
      worldGrid: this.worldGrid,
      spatialIndex: this.spatialIndex,
      getLegacyObjects: () => this.bushes.map((bush) => ({
        id: bush.id,
        type: 'berry_bush' as const,
        x: bush.worldX,
        y: bush.worldY,
        interactable: true,
      })),
      getLegacyLandmarks: () => ([
        {
          kind: 'house' as const,
          id: 'player-house',
          label: '玩家的家',
          x: this.house.houseX + 160,
          y: this.house.houseY + 96,
        },
        {
          kind: 'house' as const,
          id: 'npc-house',
          label: '村长府邸',
          x: this.npcHouse.houseX + 224,
          y: this.npcHouse.houseY + 128,
        },
      ]),
    });
    this.npcMemorySystem = new NpcMemorySystem(this.worldStateManager);

    // ── FarmSystem (tilled-dirt plots, watering, harvesting) ─────────────────
    this.farmSystem = new FarmSystem(this, this.worldGrid, this.worldStateManager);
    this.worldActionSystem = new WorldActionSystem(
      this.worldStateManager,
      this.farmSystem,
      this.treeStateSystem,
      this.nestStateSystem,
      {
        onPlaceObject: (action) => this.applyPlaceObjectAction(action),
        onRemoveObject: (action) => this.applyRemoveObjectAction(action),
        onPickupDrop: (action) => this.applyPickupDropAction(action),
        onDropItem: (action) => this.applyDropItemAction(action),
      },
    );
    this.farmSystem.setActionDispatcher(this.worldActionSystem);
    this.treeStateSystem.setActionDispatcher(this.worldActionSystem);
    this.nestStateSystem.setActionDispatcher(this.worldActionSystem);
    this.chickenStateSystem.setActionDispatcher(this.worldActionSystem);
    this.worldFacade = new WorldFacade({
      player: () => this.player as any,
      npcName: () => this.npc?.name ?? 'npc',
      interactionSystem: this.interactionSystem,
      dispatchWorldAction: (action, source) => this.dispatchWorldAction(action, source),
      syncPlayerInteractionState: () => this.syncPlayerInteractionState(),
      findInteractableObjectByStateId: (objectId) => this.findInteractableObjectByStateId(objectId),
      onNpcInteract: () => this.triggerInteract(),
      tryChopNearestTree: () => this.tryChopNearestTree(),
      tryChopNearbyBed: () => this.tryChopNearbyBed(),
        findDropByItemAndPosition: (itemId, x, y) => this.findDropByItemAndPosition(itemId, x, y) as any,
        onRemoteSleepChange: (peerId, sleeping) => this.sleepManager.onRemoteSleepChange(peerId, sleeping, this.dayCycle),
        applyRemotePlayerMove: (payload) => this.renderSyncSystem.applyRemotePlayerMove(this.remotePlayer, payload),
        applyRemoteFarmEvent: (type, payload) => this.applyRemoteFarmEvent(type, payload),
        getWorldSnapshot: () => this.buildWorldSnapshot(),
        applyWorldSnapshot: (snapshot) => this.applyWorldSnapshotData(snapshot),
      });
    this.npcThinkSystem = new NpcThinkSystem({
      worldStateManager: this.worldStateManager,
      perceptionSystem: this.perceptionSystem,
      memorySystem: this.npcMemorySystem,
      actionExecutor: this.actionExecutor,
      getNpcRegistrations: () => this.getNpcRegistrations(),
      getChatOpen: () => this._chatOpen,
    });

    // ── Tool pickups inside the house ────────────────────────────────────────
    // House-1 interior: x:112–368, y:112–256 (cols 1-8, rows 1-4)
    // Place tools on a shelf row near the back wall (row 2)
    this.spawnToolPickups();

    // ── Chickens + Nests (created after pathfinder is ready) ─────────────────
    this.createChickens();

    // ── Farm tile sensors (passthrough overlap for proximity detection) ──
    this.farmSystem.registerPlayerSensors(this.player.sprite);

    // ── Collisions ────────────────────────────────────────────────────────
    this.physics.add.collider(this.player.sprite, this.obstacles);
    this.physics.add.collider(this.npc.sprite,    this.obstacles);
    this.physics.add.collider(this.player.sprite, this.npc.sprite);
    for (const n of this.extraNpcs) {
      this.physics.add.collider(n.sprite, this.obstacles);
      this.physics.add.collider(this.player.sprite, n.sprite);
    }
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
    // House-1 interior: x:112–368, y:112–256.  Place one pink bed near back wall.
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
    this.syncWorldStateMeta();

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
      gameBus.emit('world:position_broadcast_requested', {
        x: this.player.sprite.x,
        y: this.player.sprite.y,
        facing: this.player.facing,
        velX: body.velocity.x,
        velY: body.velocity.y,
      });
    }

    // ── Player ────────────────────────────────────────────────────────────
    if (this._chatOpen) {
      (this.player.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    } else {
      this.player.update();
    }

    // ── House doors (player or any NPC triggers each door) ───────────────
    this.syncDynamicEntityStates();
    this.npcThinkSystem?.update(dt, this.dayCycle.gameTick);
    const _hpx = this.player.sprite.x, _hpy = this.player.sprite.y;
    this.house.update(_hpx, _hpy, this.npc.sprite.x, this.npc.sprite.y);
    this.npcHouse?.update(_hpx, _hpy,
      this.extraNpcs[0]?.sprite.x, this.extraNpcs[0]?.sprite.y);

    // ── NPC + chickens ────────────────────────────────────────────────────
    this.npc.update(dt, this.dayCycle.gameTick);
    for (const n of this.extraNpcs) n.update(dt, this.dayCycle.gameTick);
    this.treeStateSystem?.update(time);
    this.updateChickens(time, delta);

    // ── Nest hints + dismantled nest cleanup ──────────────────────────────
    if (this.player) {
      this.updateNests(this.player.sprite.x, this.player.sprite.y, time);
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
      if (pruned) {
        for (const drop of this.drops) {
          if (drop.gone) this.unregisterDropState(drop);
        }
        const activeDrops = this.drops.filter((d) => !d.gone);
        this.drops.splice(0, this.drops.length, ...activeDrops);
      }

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
    const activeDrops = this.drops.filter((item) => {
      if (owned.has(item.itemId)) {
        this.unregisterDropState(item);
        item.destroy();
        return false;
      }
      return true;
    });
    this.drops.splice(0, this.drops.length, ...activeDrops);
  }

  /**
   * Spawns tool world-items from the shared village layout.
   * Always spawns all three; call removeWorldItemsByIds() after inventory loads
   * to hide ones the player already picked up.
   */
  private spawnToolPickups(): void {
    // House-1 at (80,80), 10×6 tiles (T=32).  Interior: x:112–368, y:112–256.
    // Tool pickup positions come from the shared village layout.
    const TOOL_POSITIONS: [number, number][] = [...VILLAGE_LAYOUT.toolPickups];

    TOOL_ITEM_DEFS.forEach((def, i) => {
      const [x, y] = TOOL_POSITIONS[i];
      const item   = new DropItem(this, x, y, def.itemId);
      this.drops.push(item);
      this.registerDropState(item);
    });
  }

  // ── Beds ───────────────────────────────────────────────────────────────────
  /**
   * Spawn bed(s) from the shared village layout.
   * House-1 at (80,80), interior: x:112–368, y:112–256.
   */
  private _spawnBeds(): void {
    const bedConfigs: Array<{ x: number; y: number; color: 'green' | 'blue' | 'pink' }> = [...VILLAGE_LAYOUT.beds];
    for (const cfg of bedConfigs) {
      this.renderSyncSystem.createBed(
        cfg.x,
        cfg.y,
        cfg.color,
        this.beds,
        this.sleepManager,
        this.dayCycle,
      );
    }
  }

  // ── Entity placement (F key while holding a 'placeable' item) ────────────

  private placeEntityAt(itemId: string, fx: number, fy: number): boolean {
    const def = ITEM_DEF_MAP.get(itemId);
    if (!def || def.itemType !== 'placeable') return false;

    // ── Overlap check (only for solid entities: bed / nest) ──────────────────
    if (def.placeEntity) {
      const MIN_DIST = 28; // px — entities closer than this are considered overlapping
      const blocked =
        this.beds.some(b => Math.hypot(b.worldX - fx, b.worldY - fy) < MIN_DIST) ||
        this.nests.some(n => !n.gone && Math.hypot(n.x - fx, n.y - fy) < MIN_DIST);
      if (blocked) {
        gameBus.emit('ui:show_message', { text: '这里已经有东西了，换个地方放置' });
        return false; // don't consume the item
      }
    }

    switch (def.placeEntity) {
      case 'bed': {
        // 'bed_pink' → color 'pink'; 'bed_pink_flipped' → also 'pink' (same sprite key)
        const rawColor = itemId.replace('bed_', '').replace('_flipped', '');
        const color    = rawColor as BedColor;
        this.renderSyncSystem.createBed(
          fx,
          fy,
          color,
          this.beds,
          this.sleepManager,
          this.dayCycle,
        );
        break;
      }
      case 'nest': {
        const nest = new NestView(this, this.nextNestId(), fx, fy, {
          getState: (id) => this.worldStateManager.getNestState(id),
          onInteract: (id) => this.nestStateSystem.handleInteract(id),
        });
        this.nestStateSystem.registerNest(nest, {
          id: nest.id,
          x: fx,
          y: fy,
          state: 'empty',
          occupiedByChickenId: null,
          hasEgg: false,
          hatchAt: null,
          laidAt: null,
          removed: false,
        });
        this.nests.push(nest);
        this.registerInteractable(nest);
        break;
      }
      default:
        // 'placeable' furniture without a placeEntity handler yet
        gameBus.emit('ui:show_message', { text: `${def.label} 暂时无法放置` });
        return false; // don't consume
    }

    gameBus.emit('player:consume_item', { itemId, qty: 1 });
    return true;
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
      nests: this.worldStateManager.getNestStates()
        .filter(n => !n.removed)
        .map(n => ({
          x: n.x,
          y: n.y,
          state: n.state === 'has_egg' ? 'has_egg' : 'empty',
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
      this.renderSyncSystem.clearBeds(this.beds);
      for (const { color, x, y } of ws.beds) {
        this.renderSyncSystem.createBed(
          x,
          y,
          color as BedColor,
          this.beds,
          this.sleepManager,
          this.dayCycle,
        );
      }
    }

    // ── Nests ─────────────────────────────────────────────────────────────────
    if (ws.nests && ws.nests.length > 0) {
      const THRESHOLD    = 24; // px — proximity to match saved nest to default nest

      for (const saved of ws.nests) {
        // Try to match a default (already spawned) nest by proximity
        const match = this.nests.find(n =>
          !n.gone &&
          Math.abs(n.x - saved.x) < THRESHOLD &&
          Math.abs(n.y - saved.y) < THRESHOLD,
        );

        if (match) {
          // Default nest found — restore egg state
          if (saved.state === 'has_egg') this.nestStateSystem.restoreEgg(match.id, this.time.now);
        } else {
          // No matching default nest → this was a player-placed nest; respawn it
          const nest = this.renderSyncSystem.createNest(this.nextNestId(), saved.x, saved.y, this.nests, {
            getState: (id) => this.worldStateManager.getNestState(id),
            onInteract: (id) => this.nestStateSystem.handleInteract(id),
          });
          this.nestStateSystem.registerNest(nest, {
            id: nest.id,
            x: saved.x,
            y: saved.y,
            state: 'empty',
            occupiedByChickenId: null,
            hasEgg: false,
            hatchAt: null,
            laidAt: null,
            removed: false,
          });
          if (saved.state === 'has_egg') this.nestStateSystem.restoreEgg(nest.id, this.time.now);
        }
      }
    }
  }

  // ── Chickens + Nests ───────────────────────────────────────────────────────
  private createChickens(): void {
    this.chickenGroup = this.physics.add.group();

    // Nest positions come from the shared village layout.
    //   x: 720–784 (< pond x=800), y: 590 (< pond y=620)
    const NEST_POSITIONS: [number, number][] = [...VILLAGE_LAYOUT.nests];
    this.nests = NEST_POSITIONS.map(([nx, ny]) => {
      const nest = this.renderSyncSystem.createNest(this.nextNestId(), nx, ny, this.nests, {
        getState: (id) => this.worldStateManager.getNestState(id),
        onInteract: (id) => this.nestStateSystem.handleInteract(id),
      });
      this.nestStateSystem.registerNest(nest, {
        id: nest.id,
        x: nx,
        y: ny,
        state: 'empty',
        occupiedByChickenId: null,
        hasEgg: false,
        hatchAt: null,
        laidAt: null,
        removed: false,
      });
      return nest;
    });

    // Chicken spawn positions come from the shared village layout.
    const SPAWN: [number, number][] = [...VILLAGE_LAYOUT.chickens];
    this.chickenEntities = [];
    SPAWN.forEach(([cx, cy]) => {
      this.spawnChickenAt(cx, cy);
    });
  }

  private updateChickens(time: number, delta: number): void {
    this.chickenStateSystem.update(time, delta);
  }

  private updateNests(px: number, py: number, time: number): void {
    this.nestStateSystem.update(time, px, py);
    for (let i = this.nests.length - 1; i >= 0; i--) {
      const nest = this.nests[i];
      if (nest.gone) {
        this.unregisterInteractable(nest);
        this.unregisterRuntimeObject(nest);
        this.nests.splice(i, 1);
      }
    }
  }

  // ── Tree spawning ──────────────────────────────────────────────────────────
  /**
   * Place the initial set of trees from the shared village layout.
   * Trees are registered as Interactables so F-key harvesting works.
   */
  private spawnInitialTrees(): void {
    // ── Town tree layout (world 1280×960, island x:96–1184, y:96–864) ────────
    //
    //   Water border  : x<128 or x>1152, y<128 or y>832
    //   House 1       : x:80–400,   y:80–272
    //   House 2/manor : x:560–1008, y:80–336
    //   Pond          : x:800–896,  y:620–684
    //
    const POSITIONS: [number, number][] = [...VILLAGE_LAYOUT.trees.positions];
    const DEFAULT_STAGES: TreeGrowthStage[] = [...VILLAGE_LAYOUT.trees.stages];

    // Build a lookup from saved state (if we have one)
    const savedTreeMap = new Map<string, { stage: TreeGrowthStage; hasFruit: boolean }>();
    for (const ts of (this.initialState.trees ?? [])) {
      savedTreeMap.set(ts.id, { stage: ts.stage as TreeGrowthStage, hasFruit: ts.hasFruit });
    }

    POSITIONS.forEach(([x, y], i) => {
      const id    = `tree-${i}`;
      const saved = savedTreeMap.get(id);
      const stage     = saved?.stage    ?? DEFAULT_STAGES[i];
      const hasFruit  = saved?.hasFruit ?? (stage === 'C');   // default: C → has fruit

      const nextStageAt = stage === 'A'
        ? this.time.now + 60_000
        : stage === 'B'
          ? this.time.now + 120_000
          : null;
      const tree = this.renderSyncSystem.createTree(
        id,
        x,
        y,
        this.trees,
        {
          getState: (treeId) => this.worldStateManager.getTreeState(treeId),
          onInteract: (treeId) => this.treeStateSystem.harvestFruit(treeId),
          onChop: (treeId) => this.treeStateSystem.chopTree(treeId),
        },
        this.obstacles,
      );
      this.treeStateSystem.registerTree(tree, {
        id,
        x,
        y,
        stage,
        hasFruit,
        isChopped: stage === 'chopA' || stage === 'chopBC',
        nextStageAt,
        respawnAt: null,
        meta: {},
      });
      // Register in SpatialIndex for O(1) nearest-tree queries
      if (!tree.isChopped()) this.spatialIndex.insert({ id: tree.id, wx: x, wy: y, ref: tree });
    });
  }

  // ── Bush spawning ──────────────────────────────────────────────────────────
  private spawnInitialBushes(): void {
    // ── Raspberry bush positions ──────────────────────────────────────────────
    //  All placed on open grass — verified clear of houses, pond, and water border.
    //   House 1: x:80–400, y:80–272  → front yard below y=272 only
    //   House 2: x:560–1008, y:80–336 → south side below y=336 only
    //   Pond: x:800–896, y:620–684   → bushes placed outside this rectangle
    const POSITIONS: [number, number][] = [...VILLAGE_LAYOUT.berryBushes];
    POSITIONS.forEach(([x, y], i) => {
      const bush = new RaspberryBush(this, x, y, `bush-${i}`, (d) => {
        this.drops.push(d);
        this.registerDropState(d);
      }, this.obstacles);
      this.bushes.push(bush);
      this.registerInteractable(bush);
    });
  }

  // ── Static world decorations ──────────────────────────────────────────────
  /**
   * Place flowers, rocks and decorative (non-berry) bushes that give the
   * island a lived-in village feel.  All purely visual except rocks, which
   * carry a small collision block.
   */
  private spawnDecorations(): void {
    const ctx: WorldCtx = { scene: this, obstacles: this.obstacles };

    // ── Flowers (no collision, purely visual) ─────────────────────────────────
    //  Rules: on grass only — not on water border, not inside any building,
    //         not on the pond, not inside a forest cluster.
    //
    //  House 1: x:80–400, y:80–272
    //  House 2: x:560–1008, y:80–336
    //  Pond:    x:800–896, y:620–684
    //  Water border: x<128 or x>1152, y<128 or y>832
    const FLOWERS: [number, number, 1|2|3][] = [...VILLAGE_LAYOUT.flowers];
    FLOWERS.forEach(([x, y, v]) => createFlower(ctx, x, y, v));

    // ── Rocks (small collision block) ─────────────────────────────────────────
    //  Natural landscape accents — forest edges and path borders only.
    //  Verified clear of all buildings and pond.
    const ROCKS: [number, number][] = [...VILLAGE_LAYOUT.rocks];
    ROCKS.forEach(([x, y]) => createRock(ctx, x, y));

    // ── Decorative hedge-bushes (obstacle, no berries) ────────────────────────
    //  Placed just outside house walls as garden hedges.
    //  x/y chosen so they sit on the grass strip adjacent to each house,
    //  never on the house tiles themselves.
    const DECOR_BUSHES: [number, number][] = [...VILLAGE_LAYOUT.decorBushes];
    DECOR_BUSHES.forEach(([x, y]) => createDecorBush(ctx, x, y));
  }

  // ── Interaction triggers (called from React keydown handler) ─────────────
  /** E key / Talk button — open chat with the NPC. */
  triggerInteract(): void {
    this.npcThinkSystem?.pauseNpc(this.npc.name, this.dayCycle.gameTick, 10, 'player_interaction');
    gameBus.emit('npc:interact', { npcName: this.npc.name });
  }

  /** Space key — use current tool: axe→chop, scythe→till, water→irrigate, seed→plant. */
  triggerAction(): void {
    this.worldFacade.triggerToolAction();
    if (this.player?.currentTool !== 'axe') {
      const heldItemId = (this.player as any).heldItemId as string | undefined;
      this.farmSystem?.handleToolUse(
        this.player.sprite.x,
        this.player.sprite.y,
        this.player.currentTool,
        heldItemId,
      );
    }
  }

  private tryChopNearbyBed(): boolean {
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    for (let i = this.beds.length - 1; i >= 0; i--) {
      const bed = this.beds[i];
      if (!bed.isNearPlayer(px, py, 60)) continue;
      const itemId = bed.chop();
      this.renderSyncSystem.unregisterBed(bed, this.beds);
      this.renderSyncSystem.spawnDrop(bed.worldX, bed.worldY, itemId);
      return true;
    }
    return false;
  }

  /** Find the nearest un-chopped tree in range and chop it. */
  private tryChopNearestTree(): void {
    const px = this.player.sprite.x;
    const py = this.player.sprite.y;
    let closest:  TreeView | null = null;
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
    if (this.npc.name === npcName) {
      this.npc.setThinking(thinking);
      if (thinking) {
        this.npcThinkSystem?.pauseNpc(npcName, this.dayCycle.gameTick, 12, 'chat_request');
      }
    }
  }

  /** Record a player message in the NPC's memory. */
  addPlayerMessageToNpc(npcName: string, text: string): void {
    if (this.npc.name === npcName) this.npc.addMemory(text, 'player', this.dayCycle.gameTick);
  }

  /** Make the NPC speak a reply (shows bubble + triggers React dialog). */
  npcReply(npcName: string, text: string): void {
    if (this.npc.name === npcName) {
      this.npcThinkSystem?.pauseNpc(npcName, this.dayCycle.gameTick, 8, 'chat_reply');
      this.npc.say(text, this.dayCycle.gameTick);
    }
  }

  /** Return the current (local-cache) memory array for a named NPC. */
  getNpcMemory(npcName: string): NpcMemoryEntry[] {
    return this.npc.name === npcName ? [...this.npc.memory] : [];
  }

  getNpcMindState(npcId = this.npc.name): NpcMindState | null {
    return this.npcThinkSystem?.getMindState(npcId) ?? null;
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
    this.npcThinkSystem?.pauseNpc(npcName, this.dayCycle.gameTick, 12, 'external_action_queue');
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
    this.worldFacade.triggerPrimaryInteraction();
  }

  // ── Q-drop ────────────────────────────────────────────────────────────────
  /**
   * Drop the currently held item one step in front of the player as a DropItem.
   * Consumes 1 from inventory via onConsumeItem callback.
   */
  private _triggerQDrop(): void {
    this.worldFacade.dropHeldItem();
  }

  // ── Chest management ──────────────────────────────────────────────────────
  /** Load saved chests on game boot. */
  loadChests(chests: GameChest[]): void {
    this.renderSyncSystem.loadChests(chests);
  }

  /** Add a single chest to the scene (e.g. from SSE spawn event). */
  addChest(data: GameChest): void {
    this.renderSyncSystem.addChest(data);
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

  getCreatureStates(): CreatureState[] {
    return this.worldStateManager.getChickenStates().map((state) => ({
      creatureId: state.id,
      type: 'chicken',
      x: state.x,
      y: state.y,
      thirst: state.thirst,
      growth: state.growth,
      state: state.state as CreatureState['state'],
    }));
  }

  /** Restore persisted creature states (called after getCreatures() on game-ready). */
  restoreCreatures(saved: CreatureState[]): void {
    for (const savedState of saved) {
      const chicken = this.chickenEntities.find((entry) => entry.id === savedState.creatureId)
        ?? this.chickenEntities[saved.indexOf(savedState)];
      if (!chicken) continue;
      this.chickenStateSystem.restoreChickenState(chicken.id, {
        x: savedState.x,
        y: savedState.y,
        thirst: savedState.thirst,
        growth: savedState.growth,
        state: savedState.state as any,
      });
    }
  }

  /** Remove a chest from the scene after it has been opened. */
  removeChest(id: string): void {
    this.renderSyncSystem.removeChest(id);
  }


  // ── Public methods for NPC agent system ───────────────────────────────────

  /**
   * Spawn a WorldItem at the given world position.
   * Used when player drops an item (Q key) or NPC drops an item.
   */
  private spawnWorldItemDirect(x: number, y: number, itemId: string): DropItem {
    return this.renderSyncSystem.spawnDrop(x, y, itemId);
  }

  spawnWorldItem(x: number, y: number, itemId: string, source: WorldSyncSource = 'server'): void {
    this.worldFacade.spawnWorldItem(x, y, itemId, source);
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
    this.worldFacade.dropPlayerItem(itemId);
  }

  /** Make a named NPC say text (called from React after async API returns). */
  makeNpcSay(npcName: string, text: string): void {
    if (this.npc.name === npcName) {
      this.npcThinkSystem?.pauseNpc(npcName, this.dayCycle.gameTick, 8, 'async_speech');
      this.npc.say(text, this.dayCycle.gameTick);
    }
  }

  /**
   * Return a description of what the NPC can currently observe.
   * Passed to the backend as LLM context before a chat request.
   */
  getPerceptionReport(): string {
    const result = this.perceptionSystem?.perceiveEntity(this.npc.name) ?? null;
    const report = result ? formatPerceptionForNpcPrompt(result) : '';
    console.log(`[GameScene] perceptionReport (npc at ${Math.round(this.npc.sprite.x)},${Math.round(this.npc.sprite.y)}): "${report.slice(0, 200)}"`);
    return report;
  }

  /**
   * Resume or cancel the NPC's queued actions after an ask_confirm dialog.
   */
  confirmNpcAction(npcName: string, confirmed: boolean): void {
    if (this.npc.name === npcName) {
      this.npcThinkSystem?.pauseNpc(npcName, this.dayCycle.gameTick, 4, 'confirm_resolution');
      this.npc.respondToConfirm(confirmed);
    }
  }

  /**
   * Make the NPC chop a tree by ID — called from the onNpcChopTree callback
   * (fallback path when worldCtx is unavailable).
   */
  chopTreeById(id: string): void {
    this.dispatchWorldAction({
      type: 'CHOP_TREE',
      actorId: this.npc?.name ?? 'npc',
      treeId: id,
    });
  }

  /** Spawn the remote player sprite at given position with display name. */
  spawnRemotePlayer(x: number, y: number, displayName: string): void {
    this.remotePlayer = this.renderSyncSystem.spawnRemotePlayer(this.remotePlayer, x, y, displayName);
    this.multiplayActive = true;
    console.log('[GameScene] spawnRemotePlayer:', displayName);
  }

  /** Remove remote player and disable multiplay emissions. */
  removeRemotePlayer(): void {
    this.remotePlayer = this.renderSyncSystem.removeRemotePlayer(this.remotePlayer);
    this.multiplayActive = false;
  }

  /** Apply a game event received from a remote peer. */
  applyRemoteEvent(type: string, payload: Record<string, unknown>): void {
    this.worldFacade.applyRemoteEvent(type, payload);
  }

  private applyRemoteFarmEvent(type: string, payload: Record<string, unknown>): void {
    const tile = payload.tile as {
      tx?: number;
      ty?: number;
      state?: string;
      cropId?: string | null;
      plantRow?: number;
      numStages?: number;
      plantedAt?: number | null;
      readyAt?: number | null;
    } | undefined;
    const farmTiles = Array.isArray(payload.farmTiles) ? payload.farmTiles as Array<{
      tx: number;
      ty: number;
      state: string;
      cropId?: string | null;
      plantRow?: number;
      numStages?: number;
      plantedAt?: number | null;
      readyAt?: number | null;
    }> : [];

    if (type === 'farm_tick' && farmTiles.length > 0) {
      farmTiles.forEach((farmTile) => {
        const cropData = farmTile.cropId != null && farmTile.plantedAt != null && farmTile.readyAt != null ? {
          cropId: farmTile.cropId,
          plantRow: farmTile.plantRow ?? 0,
          numStages: farmTile.numStages ?? 4,
          plantedAt: farmTile.plantedAt,
          readyAt: farmTile.readyAt,
        } : null;
        this.farmSystem.updateTileState(farmTile.tx, farmTile.ty, farmTile.state, cropData);
      });
      return;
    }

    if (tile?.tx != null && tile.ty != null && tile.state) {
      const cropData = tile.cropId != null && tile.plantedAt != null && tile.readyAt != null ? {
        cropId: tile.cropId,
        plantRow: tile.plantRow ?? 0,
        numStages: tile.numStages ?? 4,
        plantedAt: tile.plantedAt,
        readyAt: tile.readyAt,
      } : null;
      this.farmSystem.updateTileState(tile.tx, tile.ty, tile.state, cropData);
    }

    if (type === 'farm_till') {
      const droppedSeed = payload.droppedSeed as { itemId?: string } | undefined;
      if (droppedSeed?.itemId && tile?.tx != null && tile.ty != null) {
        this.spawnWorldItem(tile.tx * 32 + 16, tile.ty * 32 + 36, droppedSeed.itemId, 'room');
      }
      return;
    }

    if (type === 'farm_harvest') {
      const drops = Array.isArray(payload.drops) ? payload.drops as Array<{ itemId?: string }> : [];
      const tx = typeof payload.tx === 'number' ? payload.tx : tile?.tx;
      const ty = typeof payload.ty === 'number' ? payload.ty : tile?.ty;
      if (tx == null || ty == null || drops.length === 0) return;
      this.farmSystem.updateTileState(tx, ty, 'harvested', null);
      const wx = tx * 32 + 16;
      const wy = ty * 32 + 16;
      drops.forEach((drop, i) => {
        if (!drop.itemId) return;
        const angle = (i / drops.length) * Math.PI * 2;
        this.spawnWorldItem(
          wx + Math.cos(angle) * (20 + i * 10),
          wy + Math.sin(angle) * (20 + i * 10),
          drop.itemId,
          'room',
        );
      });
    }
  }

  /** Serialize current world state for the initial snapshot sent to a new peer. */
  private buildWorldSnapshot(hostDisplayName?: string): import('./systems/MultiplaySystem').WorldSnapshot {
    return {
      choppedTreeIds: [...this.trees.entries()]
        .filter(([, t]) => t.isChopped())
        .map(([id]) => id),
      worldItems: this.drops
        .filter(d => !d.gone)
        .map(d => ({ itemId: d.itemId, x: d.worldX, y: d.worldY })),
      farmTiles: this.farmSystem.getAllTiles().map((tile) => ({
        tx: tile.tx,
        ty: tile.ty,
        state: tile.state,
        cropId: tile.cropData?.cropId,
        plantRow: tile.cropData?.plantRow,
        numStages: tile.cropData?.numStages,
        plantedAt: tile.cropData?.plantedAt ?? null,
        readyAt: tile.cropData?.readyAt ?? null,
      })),
      creatureStates: this.getCreatureStates().map((creature) => ({
        creatureId: creature.creatureId,
        type: creature.type,
        x: creature.x,
        y: creature.y,
        state: creature.state,
      })),
      hostX: this.player?.sprite.x,
      hostY: this.player?.sprite.y,
      hostDisplayName,
      // Sync game clock — guest will snap to host's gameTick on join
      gameTick: this.dayCycle?.gameTick,
    };
  }

  getWorldSnapshot(hostDisplayName?: string): import('./systems/MultiplaySystem').WorldSnapshot {
    return this.buildWorldSnapshot(hostDisplayName);
  }

  /** Set the dayCycle gameTick directly (used by guest to sync clock to host). */
  setGameTick(tick: number): void {
    if (this.dayCycle) this.dayCycle.gameTick = tick;
  }

  /** Apply a world snapshot received from the host. */
  private applyWorldSnapshotData(snapshot: {
    choppedTreeIds: string[];
    worldItems: Array<{ itemId: string; x: number; y: number }>;
    farmTiles?: Array<{
      tx: number;
      ty: number;
      state: string;
      cropId?: string;
      plantRow?: number;
      numStages?: number;
      plantedAt?: number | null;
      readyAt?: number | null;
    }>;
    creatureStates?: Array<{
      creatureId: string;
      type: string;
      x: number;
      y: number;
      state: string;
    }>;
  }): void {
    this.renderSyncSystem.applyWorldSnapshot(snapshot, this.trees);
    if (snapshot.farmTiles) {
      const snapshotKeys = new Set(snapshot.farmTiles.map((tile) => `${tile.tx},${tile.ty}`));
      for (const tile of this.farmSystem.getAllTiles()) {
        if (!snapshotKeys.has(`${tile.tx},${tile.ty}`)) {
          this.farmSystem.removeTile(tile.tx, tile.ty);
        }
      }
      snapshot.farmTiles.forEach((tile) => {
        const cropData = tile.cropId != null && tile.plantedAt != null && tile.readyAt != null ? {
          cropId: tile.cropId,
          plantRow: tile.plantRow ?? 0,
          numStages: tile.numStages ?? 4,
          plantedAt: tile.plantedAt,
          readyAt: tile.readyAt,
        } : null;
        this.farmSystem.updateTileState(tile.tx, tile.ty, tile.state, cropData);
      });
    }
    if (snapshot.creatureStates?.length) {
      this.restoreCreatures(snapshot.creatureStates as CreatureState[]);
    }
  }

  applyWorldSnapshot(snapshot: { choppedTreeIds: string[]; worldItems: Array<{ itemId: string; x: number; y: number }> }): void {
    this.worldFacade.applyWorldSnapshot(snapshot);
  }

  // ── WorldContext implementation ────────────────────────────────────────────

  findNearestTree(x: number, y: number): { id: string; x: number; y: number } | null {
    // Use SpatialIndex for O(1)-amortised query instead of O(n) full scan
    const SEARCH_RADIUS = 600;
    const candidates = this.spatialIndex.queryRadius(x, y, SEARCH_RADIUS);
    let closest: { id: string; x: number; y: number } | null = null;
    let closestD = Infinity;
    for (const entry of candidates) {
      const tree = entry.ref as TreeView;
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
    const drop = this.drops.find(d => d.itemId === itemId && !d.gone);
    const dropId = drop ? ((drop as any).__worldStateId as string | undefined) : undefined;
    if (!drop || !dropId) {
      console.warn(`[GameScene] claimWorldItem: item "${itemId}" not found in drops!`);
      return;
    }
    const result = this.dispatchWorldAction({
      type: 'PICKUP_DROP',
      actorId: npcName,
      dropId,
      itemId,
    });
    if (!result.ok) return;
    gameBus.emit('npc:pickup_world_item', { npcName, itemId, qty: 1 });
  }

  /** Create WorldItem at position (NPC dropped it) and fire Redux callback. */
  dropWorldItem(x: number, y: number, itemId: string, npcName: string): void {
    const result = this.dispatchWorldAction({
      type: 'DROP_ITEM',
      actorId: npcName,
      itemId,
      x,
      y,
    });
    if (!result.ok) return;
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
