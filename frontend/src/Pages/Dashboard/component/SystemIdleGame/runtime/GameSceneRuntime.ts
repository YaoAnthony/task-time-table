import Phaser from 'phaser';
import type { GameChest, IdleGameState } from '../../../../../Types/Profile';
import type { ToolType, NpcMemoryEntry, Interactable, GameWorldState } from '../types';
import { AnimationSystem }      from '../systems/AnimationSystem';
import { DayCycle }            from '../systems/DayCycle';
import { WeatherSystem }       from '../systems/WeatherSystem';
import { CommandSystem }       from '../systems/CommandSystem';
import { Player }              from '../entities/Player';
import { Npc }                 from '../entities/Npc';
import { Chest }               from '../entities/Chest';
import type { NpcMindState } from '../shared/worldStateTypes';
import { RaspberryBush }       from '../entities/RaspberryBush';
import { House }               from '../entities/House';
import { ChickenView }         from '../entities/ChickenView';
import { NestView }            from '../entities/NestView';
import { TreeView }            from '../entities/TreeView';
import { DropItem } from '../entities/DropItem';
import { RemotePlayer } from '../entities/RemotePlayer';
import { Bed }   from '../entities/Bed';
import { Pathfinder }          from '../systems/Pathfinder';
import { ActionExecutor }      from '../systems/ActionExecutor';
import { PathDebugSystem } from '../systems/PathDebugSystem';
import { ChickenStateSystem } from '../systems/ChickenStateSystem';
import { FarmSystem, type FarmActionKind, type FarmActionTarget } from '../systems/FarmSystem';
import { InteractionSystem } from '../systems/InteractionSystem';
import { NestStateSystem } from '../systems/NestStateSystem';
import { TreeStateSystem } from '../systems/TreeStateSystem';
import { PerceptionSystem }     from '../systems/WorldPerceptionSystem';
import { WorldActionSystem, type WorldAction, type WorldActionResult } from '../systems/WorldActionSystem';
import { RenderSyncSystem } from '../systems/RenderSyncSystem';
import { LightingSystem, type LightConfig } from '../systems/LightingSystem';
import { DialogueSystem } from '../systems/DialogueSystem';
import { SleepManager }        from '../systems/SleepManager';
import type { NpcMemorySystem } from '../systems/NpcMemorySystem';
import { ActorActionService } from '../systems/ActorActionService';
import { AgentWorldModel } from '../systems/AgentWorldModel';
import type { NpcDirectorSystem } from '../ai/director/NpcDirectorSystem';
import { NPCSystem } from '../systems/NPCSystem';
import { ObjectSystem } from '../systems/ObjectSystem';
import { SavingSystem, type GameSaveBuildContext } from '../systems/SavingSystem';
import { WorldActionGateway } from '../actions/world/WorldActionGateway';
import { WorldMapService } from '../map/services/WorldMapService';
import { StateBackedWorldGrid } from '../shared/StateBackedWorldGrid';
import { SpatialIndex }          from '../shared/SpatialIndex';
import { WorldStateManager }     from '../shared/WorldStateManager';
import type { WorldSyncSource }  from '../sync/syncPolicy';
import { WorldFacade } from '../systems/WorldFacade';
import type { CreatureState } from '../../../../../Redux/Features/gameSlice';
import type { GameSaveV1 } from '../persistence/save/GameSaveTypes';

import { preloadGameSceneAssets } from './GameScenePreload';
import { createGameScene } from './GameSceneBootstrap';
import { updateGameScene } from './GameSceneUpdateLoop';
import { registerDefaultLighting, getDynamicLightConfigs, registerBedLight, registerNestLight, refreshNestLights, registerChestLight, registerTreeOccluder } from './GameSceneLighting';
import { removeWorldItemsByIds, spawnToolPickups, _spawnBeds, placeEntityAt, _loadWorldState, createChickens, updateChickens, updateNests, spawnInitialTrees, spawnInitialBushes, spawnDecorations } from './GameSceneWorldObjects';
import { triggerInteract, getNearestNpcName, triggerAction, tryChopNearbyBed, tryChopNearestTree, setPlayerTool, getGameState, setInitialGameSave, loadGameSaveData, getGameSaveData, getGameTick, getDayCycleTick, setNpcThinking, addPlayerMessageToNpc, getNpcFamiliarity, getNpcChatCount, npcReply, playerSpeak, getNpcMemory, getNpcMindState, setNpcAuthProvider, setNpcInventoryProvider, loadNpcMemories, executeNpcActions, getPlayerPosition, pauseInput, resumeInput, registerInteractable, unregisterInteractable, triggerFInteract, _triggerQDrop, loadChests, addChest, panToChest, getCreatureStates, restoreCreatures, removeChest, spawnWorldItemDirect, spawnWorldItem, getPlayerWorldPos, dropPlayerItem, makeNpcSay, getPerceptionReport, getPerceptionContext, confirmNpcAction, chopTreeById, findFarmTarget, performFarmAction, executeKnowledgeSkill, findNearestTree, findWorldItem, claimWorldItem, dropWorldItem, executeCommand } from './GameScenePublicApi';
import { spawnRemotePlayer, removeRemotePlayer, applyRemoteEvent, applyRemoteFarmEvent, buildWorldSnapshot, getWorldSnapshot, setGameTick, applyWorldSnapshotData, applyWorldSnapshot } from './GameSceneMultiplayerBridge';
import { setAgentBrainEnabled, setPhysicsDebug, _registerCommands } from './GameSceneCommands';
import { nextChickenId, nextNestId, getNpcRegistrations, getActiveNpcIdSet, ensureAllNpcMindStates, findNpcByName, findConversationSpotForNpc, allNpcs, findNearestNpc, spawnChickenAt, registerCoreWorldEntities, syncWorldStateMeta, syncDynamicEntityStates, syncNpcAgentWorldContexts, registerWorldObject, ensureRuntimeObjectId, getRuntimeObjectId, registerBedObject, unregisterRuntimeObject, registerDropState, unregisterDropState, syncPlayerInteractionState, findDropByStateId, findDropByItemAndPosition, findInteractableObjectByStateId, dispatchWorldAction, applyPlaceObjectAction, applyPickupDropAction, applyDropItemAction, applyRemoveObjectAction } from './GameSceneWorldStateBridge';

export class GameSceneRuntime extends Phaser.Scene {
  initialState: Partial<IdleGameState> = {};
  initialGameSave: GameSaveV1 | null = null;

  player!:    Player;
  protected npc!:       Npc;
  protected chickenGroup!:   Phaser.Physics.Arcade.Group;
  protected chickenEntities: ChickenView[] = [];
  protected nests:           NestView[]    = [];
  protected obstacles!: Phaser.Physics.Arcade.StaticGroup;
  protected dayCycle!:  DayCycle;

  protected interactables: Interactable[] = [];

  protected drops: DropItem[] = [];

  protected chests = new Map<string, Chest>();

  protected trees = new Map<string, TreeView>();

  protected bushes: RaspberryBush[] = [];

  protected house!:    House; // (Player's Home) top-left
  protected npcHouse!: House; // (Mayor's Manor) top-right

  protected extraNpcs: Npc[] = [];

  protected pathfinder!:    Pathfinder;
  protected actionExecutor!: ActionExecutor;
  protected pathDebugSystem!: PathDebugSystem;

  protected weather!:  WeatherSystem;
  protected commands!: CommandSystem;
  protected animationSystem!: AnimationSystem;
  protected objectSystem!: ObjectSystem;
  protected npcSystem?: NPCSystem;
  protected savingSystem!: SavingSystem;
  farmSystem!: FarmSystem;
  protected chickenStateSystem!: ChickenStateSystem;
  protected interactionSystem!: InteractionSystem;
  protected nestStateSystem!: NestStateSystem;
  protected renderSyncSystem!: RenderSyncSystem;
  protected lightingSystem!: LightingSystem;
  protected dialogueSystem!: DialogueSystem;
  protected treeStateSystem!: TreeStateSystem;
  protected worldActionSystem!: WorldActionSystem;
  protected worldActionGateway!: WorldActionGateway;
  protected worldFacade!: WorldFacade;
  protected actorActionService!: ActorActionService;
  protected worldMapService!: WorldMapService;
  protected agentWorldModel!: AgentWorldModel;
  protected npcMemorySystem!: NpcMemorySystem;
  protected npcDirectorSystem!: NpcDirectorSystem;
  worldGrid!: StateBackedWorldGrid;
  worldStateManager!: WorldStateManager;
  protected physicsDebugEnabled = false;

  protected perceptionSystem!: PerceptionSystem;
  protected spatialIndex!:     SpatialIndex;

  protected beds:         Bed[]         = [];
  protected sleepManager!: SleepManager;

  protected _chatOpen = false;

  remotePlayer: RemotePlayer | null = null;
  multiplayActive = false;
  protected _lastPosSend = 0;

  protected _fKey!: Phaser.Input.Keyboard.Key;
  protected _qKey!: Phaser.Input.Keyboard.Key;

  protected _lastTimeEmit = 0;
  protected _nextWorldObjectId = 1;
  protected _nextChickenId = 1;
  protected _nextNestId = 1;
  protected readonly chickenWaterSpots: [number, number][] = [[848, 638]];


  constructor() { 
    super({ key: 'GameScene' }); 
  }

  protected nextChickenId(): string {
    return nextChickenId(this);
  }

  protected nextNestId(): string {
    return nextNestId(this);
  }

  protected getNpcRegistrations(): Array<{ id: string; npc: Npc }> {
    return getNpcRegistrations(this);
  }

  protected getActiveNpcIdSet(): Set<string> {
    return getActiveNpcIdSet(this);
  }

  protected ensureAllNpcMindStates(): void {
    return ensureAllNpcMindStates(this);
  }

  protected findNpcByName(name: string): Npc | null {
    return findNpcByName(this, name);
  }

  findConversationSpotForNpc(sourceName: string, targetName: string): { x: number; y: number } | null {
    return findConversationSpotForNpc(this, sourceName, targetName);
  }

  protected allNpcs(): Npc[] {
    return allNpcs(this);
  }

  protected findNearestNpc(x: number, y: number, radius: number): Npc | null {
    return findNearestNpc(this, x, y, radius);
  }

  protected spawnChickenAt(x: number, y: number, id?: string): ChickenView {
    return spawnChickenAt(this, x, y, id);
  }

  protected registerCoreWorldEntities(): void {
    return registerCoreWorldEntities(this);
  }

  protected syncWorldStateMeta(): void {
    return syncWorldStateMeta(this);
  }

  protected syncDynamicEntityStates(): void {
    return syncDynamicEntityStates(this);
  }

  protected syncNpcAgentWorldContexts(): void {
    return syncNpcAgentWorldContexts(this);
  }

  protected registerWorldObject(
    id: string,
    kind: 'tree' | 'chest' | 'bed' | 'nest',
    x: number,
    y: number,
    opts?: { blocking?: boolean; interactable?: boolean; state?: string; meta?: Record<string, unknown> },
  ): void {
    return registerWorldObject(this, id, kind, x, y, opts);
  }

  protected ensureRuntimeObjectId(target: object, prefix: 'bed' | 'nest'): string {
    return ensureRuntimeObjectId(this, target, prefix);
  }

  protected getRuntimeObjectId(target: object | null | undefined): string | null {
    return getRuntimeObjectId(this, target);
  }

  protected registerBedObject(bed: Bed): void {
    return registerBedObject(this, bed);
  }

  protected unregisterRuntimeObject(target: object | null | undefined): void {
    return unregisterRuntimeObject(this, target);
  }

  protected registerDropState(drop: DropItem): void {
    return registerDropState(this, drop);
  }

  protected unregisterDropState(drop: DropItem): void {
    return unregisterDropState(this, drop);
  }

  protected syncPlayerInteractionState(): void {
    return syncPlayerInteractionState(this);
  }

  protected findDropByStateId(dropId: string): DropItem | null {
    return findDropByStateId(this, dropId);
  }

  protected findDropByItemAndPosition(itemId: string, x: number, y: number): DropItem | null {
    return findDropByItemAndPosition(this, itemId, x, y);
  }

  protected findInteractableObjectByStateId(objectId: string): Interactable | null {
    return findInteractableObjectByStateId(this, objectId);
  }

  dispatchWorldAction(action: WorldAction, source: WorldSyncSource = 'local'): WorldActionResult {
    return dispatchWorldAction(this, action, source);
  }

  protected applyPlaceObjectAction(action: Extract<WorldAction, { type: 'PLACE_OBJECT' }>): WorldActionResult {
    return applyPlaceObjectAction(this, action);
  }

  protected applyPickupDropAction(action: Extract<WorldAction, { type: 'PICKUP_DROP' }>): WorldActionResult {
    return applyPickupDropAction(this, action);
  }

  protected applyDropItemAction(action: Extract<WorldAction, { type: 'DROP_ITEM' }>): WorldActionResult {
    return applyDropItemAction(this, action);
  }

  protected applyRemoveObjectAction(action: Extract<WorldAction, { type: 'REMOVE_OBJECT' }>): WorldActionResult {
    return applyRemoveObjectAction(this, action);
  }


  preload() {
    return preloadGameSceneAssets(this);
  }

  create() {
    return createGameScene(this);
  }

  update(time: number, delta: number) {
    return updateGameScene(this, time, delta);
  }

  protected registerDefaultLighting(): void {
    return registerDefaultLighting(this);
  }

  protected getDynamicLightConfigs(): LightConfig[] {
    return getDynamicLightConfigs(this);
  }

  protected registerBedLight(bed: Bed, id: string): void {
    return registerBedLight(this, bed, id);
  }

  protected registerNestLight(nest: NestView): void {
    return registerNestLight(this, nest);
  }

  protected refreshNestLights(): void {
    return refreshNestLights(this);
  }

  protected registerChestLight(chest: Pick<GameChest, 'id' | 'x' | 'y'>): void {
    return registerChestLight(this, chest);
  }

  protected registerTreeOccluder(tree: TreeView): void {
    return registerTreeOccluder(this, tree);
  }


  removeWorldItemsByIds(ownedItemIds: string[]): void {
    return removeWorldItemsByIds(this, ownedItemIds);
  }

  protected spawnToolPickups(): void {
    return spawnToolPickups(this);
  }

  protected _spawnBeds(): void {
    return _spawnBeds(this);
  }


  protected placeEntityAt(itemId: string, fx: number, fy: number): boolean {
    return placeEntityAt(this, itemId, fx, fy);
  }


  protected _loadWorldState(ws: GameWorldState | null): void {
    return _loadWorldState(this, ws);
  }

  protected createChickens(): void {
    return createChickens(this);
  }

  protected updateChickens(time: number, delta: number): void {
    return updateChickens(this, time, delta);
  }

  protected updateNests(px: number, py: number, time: number): void {
    return updateNests(this, px, py, time);
  }

  protected spawnInitialTrees(): void {
    return spawnInitialTrees(this);
  }

  protected spawnInitialBushes(): void {
    return spawnInitialBushes(this);
  }

  protected spawnDecorations(): void {
    return spawnDecorations(this);
  }

  triggerInteract(initialValue: string = ''): void {
    return triggerInteract(this, initialValue);
  }

  getNearestNpcName(radius = 220): string | null {
    return getNearestNpcName(this, radius);
  }

  triggerAction(): void {
    return triggerAction(this);
  }

  protected tryChopNearbyBed(): boolean {
    return tryChopNearbyBed(this);
  }

  protected tryChopNearestTree(): void {
    return tryChopNearestTree(this);
  }

  setPlayerTool(tool: ToolType): void {
    return setPlayerTool(this, tool);
  }

  getGameState(): IdleGameState {
    return getGameState(this);
  }

  setInitialGameSave(save: GameSaveV1 | null, userId = 'player'): void {
    return setInitialGameSave(this, save, userId);
  }

  loadGameSaveData(save: GameSaveV1 | null, userId = 'player'): void {
    return loadGameSaveData(this, save, userId);
  }

  getGameSaveData(context: GameSaveBuildContext): GameSaveV1 {
    return getGameSaveData(this, context);
  }

  getGameTick(): number {
    return getGameTick(this);
  }

  getDayCycleTick(): number {
    return getDayCycleTick(this);
  }

  setNpcThinking(npcName: string, thinking: boolean): void {
    return setNpcThinking(this, npcName, thinking);
  }

  addPlayerMessageToNpc(npcName: string, text: string): void {
    return addPlayerMessageToNpc(this, npcName, text);
  }

  getNpcFamiliarity(npcName: string): number {
    return getNpcFamiliarity(this, npcName);
  }

  getNpcChatCount(npcName: string): number {
    return getNpcChatCount(this, npcName);
  }

  npcReply(npcName: string, text: string): void {
    return npcReply(this, npcName, text);
  }

  playerSpeak(text: string): number {
    return playerSpeak(this, text);
  }

  getNpcMemory(npcName: string): NpcMemoryEntry[] {
    return getNpcMemory(this, npcName);
  }

  getNpcMindState(npcId = this.npc.name): NpcMindState | null {
    return getNpcMindState(this, npcId);
  }

  setNpcAuthProvider(fn: () => string | null): void {
    return setNpcAuthProvider(this, fn);
  }

  setNpcInventoryProvider(fn: (name: string) => Record<string, number>): void {
    return setNpcInventoryProvider(this, fn);
  }

  loadNpcMemories(npcName: string, entries: NpcMemoryEntry[]): void {
    return loadNpcMemories(this, npcName, entries);
  }


  executeNpcActions(npcName: string, actions: import('../types').NpcAction[]): void {
    return executeNpcActions(this, npcName, actions);
  }

  getPlayerPosition(): { x: number; y: number } {
    return getPlayerPosition(this);
  }

  pauseInput(): void {
    return pauseInput(this);
  }

  resumeInput(): void {
    return resumeInput(this);
  }

  registerInteractable(obj: Interactable): void {
    return registerInteractable(this, obj);
  }

  unregisterInteractable(obj: Interactable): void {
    return unregisterInteractable(this, obj);
  }

  protected triggerFInteract(): void {
    return triggerFInteract(this);
  }

  protected _triggerQDrop(): void {
    return _triggerQDrop(this);
  }

  loadChests(chests: GameChest[]): void {
    return loadChests(this, chests);
  }

  addChest(data: GameChest): void {
    return addChest(this, data);
  }

  panToChest(id: string): void {
    return panToChest(this, id);
  }

  getCreatureStates(): CreatureState[] {
    return getCreatureStates(this);
  }

  restoreCreatures(saved: CreatureState[]): void {
    return restoreCreatures(this, saved);
  }

  removeChest(id: string): void {
    return removeChest(this, id);
  }



  protected spawnWorldItemDirect(x: number, y: number, itemId: string): DropItem {
    return spawnWorldItemDirect(this, x, y, itemId);
  }

  spawnWorldItem(x: number, y: number, itemId: string, source: WorldSyncSource = 'server'): void {
    return spawnWorldItem(this, x, y, itemId, source);
  }

  getPlayerWorldPos(): { x: number; y: number } | null {
    return getPlayerWorldPos(this);
  }

  dropPlayerItem(itemId: string): void {
    return dropPlayerItem(this, itemId);
  }

  makeNpcSay(npcName: string, text: string): void {
    return makeNpcSay(this, npcName, text);
  }

  getPerceptionReport(npcName?: string): string {
    return getPerceptionReport(this, npcName);
  }

  getPerceptionContext(npcName?: string): Record<string, unknown> | null {
    return getPerceptionContext(this, npcName);
  }

  confirmNpcAction(npcName: string, confirmed: boolean): void {
    return confirmNpcAction(this, npcName, confirmed);
  }

  chopTreeById(id: string): void {
    return chopTreeById(this, id);
  }

  spawnRemotePlayer(x: number, y: number, displayName: string): void {
    return spawnRemotePlayer(this, x, y, displayName);
  }

  removeRemotePlayer(): void {
    return removeRemotePlayer(this);
  }

  applyRemoteEvent(type: string, payload: Record<string, unknown>): void {
    return applyRemoteEvent(this, type, payload);
  }

  protected applyRemoteFarmEvent(type: string, payload: Record<string, unknown>): void {
    return applyRemoteFarmEvent(this, type, payload);
  }

  protected buildWorldSnapshot(hostDisplayName?: string): import('../systems/MultiplaySystem').WorldSnapshot {
    return buildWorldSnapshot(this, hostDisplayName);
  }

  getWorldSnapshot(hostDisplayName?: string): import('../systems/MultiplaySystem').WorldSnapshot {
    return getWorldSnapshot(this, hostDisplayName);
  }

  setGameTick(tick: number): void {
    return setGameTick(this, tick);
  }

  protected applyWorldSnapshotData(snapshot: {
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
    return applyWorldSnapshotData(this, snapshot);
  }

  applyWorldSnapshot(snapshot: { choppedTreeIds: string[]; worldItems: Array<{ itemId: string; x: number; y: number }> }): void {
    return applyWorldSnapshot(this, snapshot);
  }


  findFarmTarget(
    action: FarmActionKind,
    x: number,
    y: number,
    maxRadiusCells = 10,
    actorId?: string,
  ): FarmActionTarget | null {
    return findFarmTarget(this, action, x, y, maxRadiusCells, actorId);
  }

  performFarmAction(
    actorId: string,
    action: FarmActionKind,
    target: Pick<FarmActionTarget, 'tx' | 'ty' | 'cropId'>,
    itemId?: string,
  ): boolean {
    return performFarmAction(this, actorId, action, target, itemId);
  }

  executeKnowledgeSkill(
    npcName: string,
    skillId: string,
    origin: { x: number; y: number },
    navigate: (x: number, y: number, onArrive?: () => void) => void,
    gameTick: number,
  ): boolean {
    return executeKnowledgeSkill(this, npcName, skillId, origin, navigate, gameTick);
  }

  findNearestTree(x: number, y: number): { id: string; x: number; y: number } | null {
    return findNearestTree(this, x, y);
  }

  findWorldItem(itemId: string): DropItem | null {
    return findWorldItem(this, itemId);
  }

  claimWorldItem(itemId: string, npcName: string): void {
    return claimWorldItem(this, itemId, npcName);
  }

  dropWorldItem(x: number, y: number, itemId: string, npcName: string): void {
    return dropWorldItem(this, x, y, itemId, npcName);
  }


  executeCommand(input: string): string {
    return executeCommand(this, input);
  }

  isAgentBrainEnabled(): boolean {
    return this.npcDirectorSystem?.isEnabled?.() ?? true;
  }

  protected setAgentBrainEnabled(enabled: boolean): void {
    return setAgentBrainEnabled(this, enabled);
  }

  protected setPhysicsDebug(enabled: boolean): void {
    return setPhysicsDebug(this, enabled);
  }

  protected _registerCommands(): void {
    return _registerCommands(this);
  }
}
