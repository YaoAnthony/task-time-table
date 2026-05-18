import Phaser from 'phaser';
import type { FacingDirection } from '../../../../../Types/Profile';
import type { Interactable } from '../types';
import { gameBus } from '../shared/EventBus';
import { WORLD_W, WORLD_H, SPAWN_X, SPAWN_Y, ZOOM } from '../constants';
import { AnimationSystem } from '../systems/AnimationSystem';
import { MapBuilder } from '../systems/MapBuilder';
import { DayCycle } from '../systems/DayCycle';
import { WeatherSystem } from '../systems/WeatherSystem';
import { CommandSystem } from '../systems/CommandSystem';
import { Player } from '../entities/Player';
import { Npc } from '../entities/Npc';
import { House } from '../entities/House';
import { Pathfinder } from '../systems/Pathfinder';
import { ActionExecutor } from '../systems/ActionExecutor';
import { CollisionGridBuilder } from '../systems/CollisionGridBuilder';
import { PathDebugSystem } from '../systems/PathDebugSystem';
import { ChickenStateSystem } from '../systems/ChickenStateSystem';
import { FarmSystem } from '../systems/FarmSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { NestStateSystem } from '../systems/NestStateSystem';
import { TreeStateSystem } from '../systems/TreeStateSystem';
import { PerceptionSystem } from '../systems/WorldPerceptionSystem';
import { WorldActionSystem } from '../systems/WorldActionSystem';
import { RenderSyncSystem } from '../systems/RenderSyncSystem';
import { LightingSystem } from '../systems/LightingSystem';
import { DialogueSystem } from '../systems/DialogueSystem';
import { SleepManager } from '../systems/SleepManager';
import { ActorActionService } from '../systems/ActorActionService';
import { AgentWorldModel } from '../systems/AgentWorldModel';
import { NPCSystem } from '../systems/NPCSystem';
import { ObjectSystem } from '../systems/ObjectSystem';
import { SavingSystem } from '../systems/SavingSystem';
import { WorldActionGateway } from '../actions/world/WorldActionGateway';
import { WorldMapService } from '../map/services/WorldMapService';
import { StateBackedWorldGrid } from '../shared/StateBackedWorldGrid';
import { SpatialIndex } from '../shared/SpatialIndex';
import { WorldStateManager } from '../shared/WorldStateManager';
import { WorldFacade } from '../systems/WorldFacade';
import { VILLAGE_LAYOUT } from '../world/layouts/villageLayout';
import { GAME_NPC_CATALOG, getNpcDefinitionsForSave, type GameNpcDefinition } from '../shared/GameNpcCatalog';
import type { WorldContext } from '../systems/ActionExecutor';
import { EventSystem } from '../event/EventSystem';
import { EventActionExecutor } from '../event/EventActionExecutor';
import { StorylineRuntimeSystem } from '../event/StorylineRuntimeSystem';
import { createEventRuntimeContext } from '../event/EventRuntimeContext';
import { VehicleSystem } from '../event/VehicleSystem';
import { CutsceneDirector } from '../event/CutsceneDirector';
import { RoomLocationSystem } from '../locations/RoomLocationSystem';
import {
  HouseSaveAdapter,
  HousePlacementSystem,
  HouseConstructionSystem,
  HouseInteractionSystem,
  HouseContractSystem,
} from '../housing';
import { StorageChestSystem } from '../storage';
import { PetSystem } from '../features/pets';
import { createIdleGameRuntime } from './IdleGameRuntime';
import { AudioEventMapper, AudioSystem, MusicDirector } from '../audio';

export function createGameScene(scene: any): void {
    scene.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    scene.obstacles = scene.physics.add.staticGroup();
    scene.worldGrid    = new StateBackedWorldGrid();
    scene.worldStateManager = new WorldStateManager(scene.worldGrid);
    scene.interactionSystem = new InteractionSystem(scene.worldStateManager, scene.worldGrid);
    scene.worldStateManager.initialize({
      tick: scene.initialState.gameTick ?? 0,
    });
    scene.spatialIndex = new SpatialIndex(WORLD_W, WORLD_H);
    scene.nestStateSystem = new NestStateSystem(
      scene,
      scene.worldStateManager,
      (x, y) => {
        scene.spawnChickenAt(x, y);
      },
    );
    scene.treeStateSystem = new TreeStateSystem(scene, scene.worldStateManager);
    scene.chickenStateSystem = new ChickenStateSystem(
      scene,
      scene.worldStateManager,
      scene.nestStateSystem,
      scene.chickenWaterSpots,
    );
    scene.renderSyncSystem = new RenderSyncSystem(
      scene,
      scene.worldStateManager,
      {
        registerInteractable: (obj) => scene.registerInteractable(obj as Interactable),
        unregisterInteractable: (obj) => scene.unregisterInteractable(obj as Interactable),
        registerDropState: (drop: any) => scene.registerDropState(drop),
        unregisterDropState: (drop: any) => scene.unregisterDropState(drop),
        registerBedObject: (bed) => scene.registerBedObject(bed),
        unregisterRuntimeObject: (target) => scene.unregisterRuntimeObject(target),
        registerWorldObject: (id, kind, x, y, opts) => scene.registerWorldObject(id, kind, x, y, opts),
      },
      scene.chests,
      scene.drops,
    );
    // Animations (must be before MapBuilder so water-tile anim exists)
    scene.animationSystem = new AnimationSystem(scene);
    scene.animationSystem.init();

    // Map
    new MapBuilder(scene, scene.obstacles, scene.worldGrid).build();

    // Chest opening: frame 0 (closed, gold) frame 5 (opened, gold)
    // Chest.png is 5 cols 2 rows @ 48 8: row 0 = closed variants, row 1 = opened variants
    // Day / Night cycle
    // Restore gameTick from save so time-of-day is preserved across sessions.
    scene.dayCycle = new DayCycle(scene, scene.initialState.gameTick ?? 0);
    scene.lightingSystem = new LightingSystem(scene);

    // Entities
    const spawnX = scene.initialState.x      ?? SPAWN_X;
    const spawnY = scene.initialState.y      ?? SPAWN_Y;
    const facing = scene.initialState.facing ?? 'down';

    scene.player = new Player(scene, spawnX, spawnY);
    // Restore saved facing direction
    scene.player.facing = facing as FacingDirection;
    scene.player.sprite.play(`idle-${facing}`);

    const npcDefinitions = getNpcDefinitionsForSave(scene.initialGameSave);
    const [primaryNpcDefinition = GAME_NPC_CATALOG[0], ...extraNpcDefinitions] = npcDefinitions;
    const spawnNpcFromDefinition = (definition: GameNpcDefinition) => {
      const saved = scene.initialGameSave?.worldStatus.npcs?.[definition.name];
      const x = saved?.position?.x ?? definition.spawn.x;
      const y = saved?.position?.y ?? definition.spawn.y;
      const npc = new Npc(scene, x, y, definition.name);
      npc.sprite.setTint(definition.tint);
      return npc;
    };

    scene.npc = spawnNpcFromDefinition(primaryNpcDefinition);
    scene.extraNpcs = extraNpcDefinitions.map(spawnNpcFromDefinition);
    hideIntroActorsUntilArrival(scene);
    scene.registerCoreWorldEntities();

    // F key (general world-object interaction)
    scene._fKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    // Q key (drop held item as world drop)
    scene._qKey = scene.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Q);

    // Camera
    scene.cameras.main.startFollow(scene.player.sprite, true, 0.1, 0.1);
    scene.cameras.main.setZoom(ZOOM);
    scene.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    // Note: background colour is managed frame-by-frame by DayCycle.
    scene.cameras.main.setBackgroundColor('#12340e');

    // Weather + Command systems
    scene.weather  = new WeatherSystem(scene);
    scene.commands = new CommandSystem();
    scene.pathDebugSystem = new PathDebugSystem(scene);
    scene.locationSystem = new RoomLocationSystem(scene);
    scene.houseSaveAdapter = new HouseSaveAdapter(scene);
    scene.housePlacementSystem = new HousePlacementSystem(scene);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.housePlacementSystem?.destroy());
    scene.houseConstructionSystem = new HouseConstructionSystem(scene);
    scene.houseInteractionSystem = new HouseInteractionSystem(scene);
    scene.houseContractSystem = new HouseContractSystem(scene);
    scene.storageChestSystem = new StorageChestSystem(scene);
    scene.audioSystem = new AudioSystem(scene);
    scene.audioEventMapper = new AudioEventMapper(scene.audioSystem);
    scene.audioEventMapper.start();
    scene.musicDirector = new MusicDirector(
      scene.audioSystem,
      () => scene.locationSystem?.getWorldIdAt?.(scene.player?.sprite?.x ?? 0, scene.player?.sprite?.y ?? 0) ?? 'world:village',
      () => scene.dayCycle?.getCurrentMinute?.() ?? 360,
      () => scene.weather?.current ?? 'clear',
    );
    const resumeAndRefreshAudio = (source = 'unknown') => {
      void source;
      scene.audioSystem?.resume();
      scene.time.delayedCall(80, () => scene.musicDirector?.refresh(scene.time.now));
    };
    const resumeFromDocumentGesture = () => resumeAndRefreshAudio('document.gesture');
    document.addEventListener('pointerdown', resumeFromDocumentGesture, { once: true, capture: true });
    document.addEventListener('keydown', resumeFromDocumentGesture, { once: true, capture: true });
    scene.sound.once('unlocked', () => resumeAndRefreshAudio('sound.unlocked'));
    scene.input.once('pointerdown', () => resumeAndRefreshAudio('pointerdown'));
    scene.input.keyboard?.once('keydown', () => resumeAndRefreshAudio('keydown'));
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('pointerdown', resumeFromDocumentGesture, { capture: true });
      document.removeEventListener('keydown', resumeFromDocumentGesture, { capture: true });
      scene.audioEventMapper?.destroy();
      scene.audioSystem?.destroy();
    });
    scene.petSystem = new PetSystem({
      worldStateManager: scene.worldStateManager,
      getCurrentMinute: () => scene.dayCycle?.getCurrentMinute?.() ?? 360,
      getPlayerPosition: () => scene.player?.sprite ? { x: scene.player.sprite.x, y: scene.player.sprite.y } : null,
      getOwnerPosition: (ownerNpcId) => {
        if (ownerNpcId === 'laoli' && scene.npc?.sprite) {
          return { x: scene.npc.sprite.x, y: scene.npc.sprite.y };
        }
        const match = scene.getNpcRegistrations?.()
          .find(({ id, npc }: { id: string; npc: any }) => id === ownerNpcId || npc?.name === ownerNpcId);
        return match?.npc?.sprite ? { x: match.npc.sprite.x, y: match.npc.sprite.y } : null;
      },
      getWorldIdAt: (x, y) => scene.locationSystem?.getWorldIdAt?.(x, y) ?? 'world:village',
    });
    scene._registerCommands();

    // Houses
    // House 1 (10 = 320 92 px)
    // x: 80 00 y: 80 72 door col3 door-centre (192, 256)
    scene.house = new House(scene, VILLAGE_LAYOUT.playerHouse.x, VILLAGE_LAYOUT.playerHouse.y, scene.obstacles, {
      cols: VILLAGE_LAYOUT.playerHouse.cols,
      rows: VILLAGE_LAYOUT.playerHouse.rows,
      doorCol: VILLAGE_LAYOUT.playerHouse.doorCol,
    });

    // House 2 (14 = 448 56 px, stone-blue tint, double chimney)
    // x: 560 008 y: 80 36 door col6 door-centre (768, 320)
    scene.npcHouse = new House(scene, VILLAGE_LAYOUT.mayorHouse.x, VILLAGE_LAYOUT.mayorHouse.y, scene.obstacles, {
      cols:     VILLAGE_LAYOUT.mayorHouse.cols,
      rows:     VILLAGE_LAYOUT.mayorHouse.rows,
      doorCol:  VILLAGE_LAYOUT.mayorHouse.doorCol,
      chimneys: [...VILLAGE_LAYOUT.mayorHouse.chimneys],
      tint:     0xaabbdd, // cool stone-blue clearly different from warm wood
    });

    scene.registerDefaultLighting();

    // Trees (interactive entities, F=harvest, Space+axe=chop)
    scene.spawnInitialTrees();

    // Raspberry bushes (F=harvest berries, regrow over time)
    scene.spawnInitialBushes();

    // Static decorations (flowers, rocks, decorative bushes)
    scene.spawnDecorations();

    CollisionGridBuilder.syncStaticObstacles(scene.obstacles, scene.worldGrid, {
      avoidanceRadius: 2,
      firstRingPenalty: 3.5,
      agentHalfWidthPx: 12,
      agentHalfHeightPx: 10,
    });

    // Pathfinder reads WorldGrid weights directly (no physics body scan)
    scene.pathfinder    = new Pathfinder(scene.worldGrid);
    scene.actionExecutor = new ActionExecutor(scene.player);

    // Perception system (scans trees + ground items for LLM context)
    scene.perceptionSystem = new PerceptionSystem({
      worldStateManager: scene.worldStateManager,
      worldGrid: scene.worldGrid,
      spatialIndex: scene.spatialIndex,
      getLegacyObjects: () => scene.bushes.map((bush: any) => ({
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
          label: 'Player House',
          x: scene.house.houseX + 160,
          y: scene.house.houseY + 96,
        },
        {
          kind: 'house' as const,
          id: 'npc-house',
          label: 'Mayor House',
          x: scene.npcHouse.houseX + 224,
          y: scene.npcHouse.houseY + 128,
        },
      ]),
      getWorldIdAt: (x: number, y: number) => scene.locationSystem?.getWorldIdAt?.(x, y) ?? 'world:village',
    });
    // FarmSystem (tilled-dirt plots, watering, harvesting)
    scene.farmSystem = new FarmSystem(scene, scene.worldGrid, scene.worldStateManager);
    scene.worldActionSystem = new WorldActionSystem(
      scene.worldStateManager,
      scene.farmSystem,
      scene.treeStateSystem,
      scene.nestStateSystem,
      {
        onPlaceObject: (action: any) => scene.applyPlaceObjectAction(action),
        onPlaceHouse: (action: any) => scene.applyPlaceHouseAction(action),
        onPlaceStorageChest: (action: any) => scene.applyPlaceStorageChestAction(action),
        onRemoveObject: (action: any) => scene.applyRemoveObjectAction(action),
        onPickupDrop: (action: any) => scene.applyPickupDropAction(action),
        onDropItem: (action: any) => scene.applyDropItemAction(action),
      },
    );
    scene.worldActionGateway = new WorldActionGateway(scene.worldActionSystem);
    scene.farmSystem.setActionDispatcher(scene.worldActionGateway);
    scene.actorActionService = new ActorActionService(scene.farmSystem, scene.worldActionGateway);
    scene.worldMapService = new WorldMapService(scene.worldStateManager, scene.worldGrid);
    scene.agentWorldModel = new AgentWorldModel(
      scene.worldStateManager,
      scene.worldGrid,
      scene.actorActionService,
      scene.worldMapService,
      (x: number, y: number) => scene.locationSystem?.getWorldIdAt?.(x, y) ?? 'world:village',
    );
    scene.treeStateSystem.setActionDispatcher(scene.worldActionGateway);
    scene.nestStateSystem.setActionDispatcher(scene.worldActionGateway);
    scene.chickenStateSystem.setActionDispatcher(scene.worldActionGateway);
    scene.worldFacade = new WorldFacade({
      player: () => scene.player as any,
      npcName: () => scene.npc?.name ?? 'npc',
      interactionSystem: scene.interactionSystem,
      dispatchWorldAction: (action, source) => scene.dispatchWorldAction(action, source),
      syncPlayerInteractionState: () => scene.syncPlayerInteractionState(),
      findInteractableObjectByStateId: (objectId: any) => scene.findInteractableObjectByStateId(objectId),
      onNpcInteract: () => scene.triggerInteract(),
      tryChopNearestTree: () => scene.tryChopNearestTree(),
      tryChopNearbyBed: () => scene.tryChopNearbyBed(),
        findDropByItemAndPosition: (itemId, x, y) => scene.findDropByItemAndPosition(itemId, x, y) as any,
        onRemoteSleepChange: (peerId, sleeping) => scene.sleepManager.onRemoteSleepChange(peerId, sleeping, scene.dayCycle),
        applyRemotePlayerMove: (payload: any) => scene.renderSyncSystem.applyRemotePlayerMove(scene.remotePlayer, payload),
        applyRemoteFarmEvent: (type, payload) => scene.applyRemoteFarmEvent(type, payload),
        getWorldSnapshot: () => scene.buildWorldSnapshot(),
        applyWorldSnapshot: (snapshot) => scene.applyWorldSnapshotData(snapshot),
      });
    scene.npcSystem = new NPCSystem();
    const npcSystems = scene.npcSystem.init({
      scene: scene,
      primaryNpc: scene.npc,
      extraNpcs: scene.extraNpcs,
      player: scene.player,
      pathfinder: scene.pathfinder,
      worldContext: scene as unknown as WorldContext,
      worldStateManager: scene.worldStateManager,
      dayCycle: scene.dayCycle,
      perceptionSystem: scene.perceptionSystem,
      actionExecutor: scene.actionExecutor,
      agentWorldModel: scene.agentWorldModel,
      getChatOpen: () => scene._chatOpen,
      getPlayerPosition: () =>
        scene.player ? { x: scene.player.sprite.x, y: scene.player.sprite.y } : null,
      isNpcLocked: (npcId: string) => scene.storylineRuntimeSystem?.isNpcLocked?.(npcId) ?? false,
    });
    scene.npcMemorySystem = npcSystems.memorySystem;
    scene.npcDirectorSystem = npcSystems.directorSystem;
    scene.dialogueSystem = new DialogueSystem({
      scene: scene,
      getNpcRegistrations: () => scene.getNpcRegistrations(),
      getPlayerPosition: () =>
        scene.player ? { x: scene.player.sprite.x, y: scene.player.sprite.y } : null,
      getGameTick: () => scene.dayCycle?.gameTick ?? 0,
      pauseNpc: (npcId, gameTick, seconds, reason) =>
        scene.npcDirectorSystem?.pauseNpc(npcId, gameTick, seconds, reason),
      onPlayerAssignedHome: (npcId, _text, gameTick) => {
        const entry = scene.findHouseEntryTarget?.(undefined, npcId);
        if (!entry?.houseId) return;
        const remembered = scene.rememberHomeHouseForNpc?.(npcId, entry.houseId, gameTick);
        if (!remembered) return;
        gameBus.emit('ui:show_message', { text: `${npcId} 记住了这个家。` });
        gameBus.emit('game:save_requested', { reason: `npc:${npcId}:remember_home_from_dialogue` });
      },
    });
    scene.dialogueSystem.start();
    scene.vehicleSystem = new VehicleSystem(scene);
    scene.cutsceneDirector = new CutsceneDirector(scene, scene.vehicleSystem);
    scene.eventActionExecutor = new EventActionExecutor(createEventRuntimeContext(scene));
    scene.eventSystem = new EventSystem(
      scene.initialGameSave?.worldStatus?.events,
      scene.initialGameSave?.worldStatus?.unlockedNpcs ?? [],
      scene.eventActionExecutor,
      () => scene.dayCycle?.gameTick ?? 0,
    );
    scene.storylineRuntimeSystem = new StorylineRuntimeSystem(scene);
    scene.storylineRuntimeSystem.setStorylines(scene.getRuntimeStorylines?.() ?? []);

    // NPC daily routine + internal drives
    // Schedule pushes time-of-day actions (work_farm at 08:00, lunch at 12:00, etc.)
    // Needs ticks energy/hunger/social and emits autonomous lines when low.
    // Both ultimately call npc.say(...) which fires npc:speak DialogBox.


    // Gossip when one NPC speaks, nearby NPCs can chime in (canned reactions, no GPT).


    // Tool pickups inside the house
    // House-1 interior: x:112 68, y:112 56 (cols 1-8, rows 1-4)
    // Place tools on a shelf row near the back wall (row 2)

    // Chickens + Nests (created after pathfinder is ready)

    // Farm tile sensors (passthrough overlap for proximity detection)

    // Collisions
    // SleepManager (Minecraft-style night skip)
    scene.sleepManager = new SleepManager(0);

    // Fire when DayCycle's 20 fast-forward finishes at 06:00
    scene.dayCycle.onFastForwardComplete = () => {
      scene.sleepManager.onMorning();
      const toTime = scene.dayCycle.getTimeStr();
      gameBus.emit('day:night_skip', { fromTime: '--', toTime });
      gameBus.emit('ui:show_message', { text: `Night skipped. Morning starts at ${toTime}` });
    };

    // Beds (inside house interior)
    // House-1 interior: x:112 68, y:112 56. Place one pink bed near back wall.
    // sleep command
    scene.objectSystem = new ObjectSystem({
      getPlayer: () => scene.player ?? null,
      getDrops: () => scene.drops,
      getBeds: () => scene.beds,
      getSleepManager: () => scene.sleepManager ?? null,
      getDayCycle: () => scene.dayCycle ?? null,
      unregisterDropState: (drop: any) => scene.unregisterDropState(drop),
      updateChickens: (timeMs, deltaMs) => scene.updateChickens(timeMs, deltaMs),
      updateNests: (playerX, playerY, timeMs) => scene.updateNests(playerX, playerY, timeMs),
    });
    scene.objectSystem.init({
      spawnToolPickups: () => scene.spawnToolPickups(),
      createChickens: () => scene.createChickens(),
      registerFarmSensors: (playerSprite: any) => scene.farmSystem.registerPlayerSensors(playerSprite),
      spawnBeds: () => scene._spawnBeds(),
    });

    scene.physics.add.collider(scene.player.sprite, scene.obstacles);
    scene.physics.add.collider(scene.npc.sprite, scene.obstacles);
    scene.physics.add.collider(scene.player.sprite, scene.npc.sprite);
    for (const npc of scene.extraNpcs) {
      scene.physics.add.collider(npc.sprite, scene.obstacles);
      scene.physics.add.collider(scene.player.sprite, npc.sprite);
    }
    scene.physics.add.collider(scene.chickenGroup, scene.obstacles);
    scene.physics.add.collider(scene.chickenGroup, scene.chickenGroup);

    scene.savingSystem = new SavingSystem({
      scene: scene,
      getPlayer: () => scene.player,
      getDayCycle: () => scene.dayCycle,
      getTrees: () => scene.trees,
      getBeds: () => scene.beds,
      getNests: () => scene.nests,
      getWorldStateManager: () => scene.worldStateManager,
      getActiveNpcIdSet: () => scene.getActiveNpcIdSet(),
      getSleepManager: () => scene.sleepManager,
      getNestStateSystem: () => scene.nestStateSystem,
      getRenderSyncSystem: () => scene.renderSyncSystem,
      nextNestId: () => scene.nextNestId(),
      getFarmTiles: () => scene.farmSystem.getAllTiles().map((tile: any) => ({
        tx: tile.tx,
        ty: tile.ty,
        state: tile.state as any,
        cropId: tile.cropData?.cropId,
        plantRow: tile.cropData?.plantRow,
        numStages: tile.cropData?.numStages,
        plantedAt: tile.cropData?.plantedAt ?? null,
        readyAt: tile.cropData?.readyAt ?? null,
      })),
      getChests: () => [...scene.chests.values()]
        .filter((chest) => !chest.isOpen)
        .map((chest) => ({
          id: chest.id,
          x: chest.sprite.x,
          y: chest.sprite.y,
          rewards: (chest as any).rewards ?? { coins: 0, items: [] },
          opened: chest.isOpen,
          createdAt: scene.dayCycle?.gameTick ?? 0,
        })),
      getCreatureStates: () => scene.getCreatureStates(),
      getHouses: () => scene.houseSaveAdapter?.exportHouses?.() ?? [],
      getHouseContracts: () => scene.houseSaveAdapter?.exportContracts?.() ?? [],
      getStorageChests: () => scene.storageChestSystem?.exportSaveData?.() ?? [],
      getNpcMemories: () => Object.fromEntries(
        scene.getNpcRegistrations().map(({ id, npc }: { id: string; npc: any }) => [id, [...npc.memory]]),
      ),
      getEventState: () => scene.eventSystem?.exportSaveData(),
      getUnlockedNpcIds: () => scene.eventSystem?.getUnlockedNpcIds(),
      getWorldIdAt: (x: number, y: number) => scene.locationSystem?.getWorldIdAt?.(x, y) ?? 'world:village',
    });
    scene.savingSystem.init();

    scene.commands.register(
      'sleep',
      'skip night to morning | sleep threshold <0-1>',
      (args: string[]) => {
        // /sleep threshold 0.5
        if (args[0] === 'threshold') {
          const v = parseFloat(args[1] ?? '');
          if (isNaN(v) || v < 0 || v > 1)
            return 'Usage: /sleep threshold <0-1>';
          scene.sleepManager.threshold = v;
          return `Sleep threshold set to ${(v * 100).toFixed(0)}%`;
        }
        // sleep force skip (admin / debug)
        if (!scene.dayCycle.isNight())
          return 'It is daytime now; no need to skip night';
        return scene.sleepManager.trySleep(scene.dayCycle);
      },
    );

    // Restore saved world entities (beds positions, nest states)
    // Must run AFTER _spawnBeds() and createChickens() so defaults exist first.
    scene._loadWorldState(scene.initialState.worldState ?? null);
    scene.restorePetsFromWorldState(scene.initialGameSave?.worldStatus?.entities?.worldState);
    scene.houseSaveAdapter?.loadFromGameSave(scene.initialGameSave);
    ensureNpcHomeLandmarksFromHousing(scene);
    scene.storageChestSystem?.loadFromGameSave(scene.initialGameSave);
    scene.locationSystem?.restoreSavedLocations?.(scene.initialGameSave, scene.activeUserId ?? 'player');
    scene.ensureAllNpcMindStates();
    scene.syncNpcAgentWorldContexts();
    scene.idleRuntime = createIdleGameRuntime(scene);

    // Notify React that the scene is fully ready
    // React can now safely call loadNpcMemories() and other NPC APIs.
    gameBus.emit('game:ready', {});
  
}

function hideIntroActorsUntilArrival(scene: any): void {
  const flags = scene.initialGameSave?.worldStatus?.events?.flags ?? {};
  const introStarted = flags['storyline:default_intro_bus_arrival:event:intro_arrival:started'] === true;
  const introCompleted = flags['storyline:default_intro_bus_arrival:state'] === 'completed';
  const earlyTick = Number(scene.initialState?.gameTick ?? 0) <= 60;
  if (introStarted || introCompleted || !earlyTick) return;

  hideSprite(scene.player?.sprite);
  hideSprite(scene.npc?.sprite);
}

function hideSprite(sprite: any): void {
  if (!sprite) return;
  sprite.setVisible?.(false);
  sprite.setAlpha?.(0);
  const body = sprite.body;
  if (body) {
    body.enable = false;
    body.setVelocity?.(0, 0);
  }
}

function ensureNpcHomeLandmarksFromHousing(scene: any): void {
  const houses = scene.houseSaveAdapter?.exportHouses?.() ?? [];
  const gameTick = scene.dayCycle?.gameTick ?? 0;
  let patched = false;

  for (const house of houses) {
    if (!String(house?.stage ?? '').startsWith('ready')) continue;
    const npcName = resolveResidentNpcName(house?.tenancy);
    if (!npcName) continue;

    const mind = scene.worldStateManager?.getNpcMindState?.(npcName);
    const landmarkKey = `house:${house.id}`;
    if (mind?.meta?.homeHouseId === house.id && mind?.knownLandmarks?.[landmarkKey]) continue;

    patched = scene.rememberHomeHouseForNpc?.(npcName, house.id, gameTick) || patched;
  }

  if (patched) {
    gameBus.emit('game:save_requested', { reason: 'npc:home_landmark_backfill_from_housing' });
  }
}

function resolveResidentNpcName(tenancy: any): string | null {
  const residentNpcName = typeof tenancy?.residentNpcName === 'string' ? tenancy.residentNpcName.trim() : '';
  if (residentNpcName) return residentNpcName;

  const residentNpcId = typeof tenancy?.residentNpcId === 'string' ? tenancy.residentNpcId.trim() : '';
  if (!residentNpcId) return null;
  return GAME_NPC_CATALOG.find((npc) => npc.id === residentNpcId || npc.name === residentNpcId)?.name ?? residentNpcId;
}
