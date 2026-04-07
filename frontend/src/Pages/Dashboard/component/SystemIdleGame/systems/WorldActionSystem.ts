import { WorldStateManager } from '../shared/WorldStateManager';
import type { WorldEntityKind, WorldObjectKind } from '../shared/worldStateTypes';
import { FarmSystem } from './FarmSystem';
import { NestStateSystem } from './NestStateSystem';
import { TreeStateSystem } from './TreeStateSystem';

export type WorldAction =
  | { type: 'MOVE_ENTITY'; entityId: string; x: number; y: number }
  | { type: 'PLACE_OBJECT'; actorId: string; itemId: string; x: number; y: number; placeEntity?: 'bed' | 'nest' }
  | { type: 'REMOVE_OBJECT'; actorId?: string; objectId: string; objectKind?: WorldObjectKind }
  | { type: 'PICKUP_DROP'; actorId: string; dropId: string; itemId: string }
  | { type: 'DROP_ITEM'; actorId: string; itemId: string; x: number; y: number }
  | { type: 'TILL_TILE'; actorId: string; tx: number; ty: number; itemId?: string }
  | { type: 'WATER_TILE'; actorId: string; tx: number; ty: number; itemId?: string }
  | { type: 'PLANT_CROP'; actorId: string; tx: number; ty: number; itemId: string }
  | { type: 'HARVEST_CROP'; actorId: string; cropId: string; tx: number; ty: number }
  | { type: 'CHOP_TREE'; actorId: string; treeId: string }
  | { type: 'PICK_FRUIT'; actorId: string; treeId: string }
  | { type: 'NEST_OCCUPY'; nestId: string; chickenId: string }
  | { type: 'NEST_RELEASE'; nestId: string; chickenId?: string }
  | { type: 'NEST_LAY_EGG'; nestId: string; chickenId?: string; atTime: number }
  | { type: 'NEST_COLLECT_EGG'; actorId: string; nestId: string }
  | { type: 'UPDATE_ENTITY_STATE'; entityId: string; kind?: WorldEntityKind; patch: Record<string, unknown> }
  | { type: 'UPDATE_TREE_STATE'; treeId: string; patch: Record<string, unknown> }
  | { type: 'UPDATE_NEST_STATE'; nestId: string; patch: Record<string, unknown> };

export interface WorldActionResult {
  ok: boolean;
  action: WorldAction;
  reason?: string;
  changedIds?: string[];
}

export interface WorldActionDispatcher {
  dispatchAction(action: WorldAction): WorldActionResult;
}

interface WorldActionEffects {
  onPlaceObject?: (action: Extract<WorldAction, { type: 'PLACE_OBJECT' }>) => WorldActionResult;
  onRemoveObject?: (action: Extract<WorldAction, { type: 'REMOVE_OBJECT' }>) => WorldActionResult;
  onPickupDrop?: (action: Extract<WorldAction, { type: 'PICKUP_DROP' }>) => WorldActionResult;
  onDropItem?: (action: Extract<WorldAction, { type: 'DROP_ITEM' }>) => WorldActionResult;
}

/**
 * Unified world mutation entrypoint.
 *
 * Systems can still own domain rules, but primary state-changing operations
 * should flow through dispatchAction/applyAction so logging/debug/sync can
 * later hook into one place.
 */
export class WorldActionSystem implements WorldActionDispatcher {
  private readonly history: WorldActionResult[] = [];

  constructor(
    private readonly worldStateManager: WorldStateManager,
    private readonly farmSystem: FarmSystem,
    private readonly treeStateSystem: TreeStateSystem,
    private readonly nestStateSystem: NestStateSystem,
    private readonly effects: WorldActionEffects = {},
  ) {}

  dispatchAction(action: WorldAction): WorldActionResult {
    const result = this.applyAction(action);
    this.history.push(result);
    return result;
  }

  applyAction(action: WorldAction): WorldActionResult {
    switch (action.type) {
      case 'MOVE_ENTITY':
        this.worldStateManager.updateEntityPosition(action.entityId, action.x, action.y);
        return { ok: true, action, changedIds: [action.entityId] };
      case 'PLACE_OBJECT':
        return this.effects.onPlaceObject?.(action)
          ?? { ok: false, action, reason: 'PLACE_OBJECT effect adapter missing' };
      case 'REMOVE_OBJECT':
        if (action.objectKind === 'nest') {
          this.nestStateSystem.applyRemoveNest(action.objectId);
          return { ok: true, action, changedIds: [action.objectId] };
        }
        if (this.effects.onRemoveObject) {
          return this.effects.onRemoveObject(action);
        }
        this.worldStateManager.unregisterObject(action.objectId);
        return { ok: true, action, changedIds: [action.objectId] };
      case 'PICKUP_DROP':
        return this.effects.onPickupDrop?.(action)
          ?? { ok: false, action, reason: 'PICKUP_DROP effect adapter missing' };
      case 'DROP_ITEM':
        return this.effects.onDropItem?.(action)
          ?? { ok: false, action, reason: 'DROP_ITEM effect adapter missing' };
      case 'TILL_TILE':
        return this.farmSystem.applyTillTile(action.actorId, action.tx, action.ty, action.itemId)
          ? { ok: true, action, changedIds: [`${action.tx},${action.ty}`] }
          : { ok: false, action, reason: 'Till tile failed' };
      case 'WATER_TILE':
        return this.farmSystem.applyWaterTile(action.actorId, action.tx, action.ty, action.itemId)
          ? { ok: true, action, changedIds: [`${action.tx},${action.ty}`] }
          : { ok: false, action, reason: 'Water tile failed' };
      case 'PLANT_CROP':
        return this.farmSystem.applyPlantCrop(action.actorId, action.tx, action.ty, action.itemId)
          ? { ok: true, action, changedIds: [`${action.tx},${action.ty}`] }
          : { ok: false, action, reason: 'Plant crop failed' };
      case 'HARVEST_CROP':
        return this.farmSystem.applyHarvestCrop(action.actorId, action.tx, action.ty, action.cropId)
          ? { ok: true, action, changedIds: [action.cropId] }
          : { ok: false, action, reason: 'Crop harvest failed' };
      case 'CHOP_TREE':
        return this.treeStateSystem.applyChopTree(action.treeId)
          ? { ok: true, action, changedIds: [action.treeId] }
          : { ok: false, action, reason: 'Tree chop failed' };
      case 'PICK_FRUIT':
        return this.treeStateSystem.applyHarvestFruit(action.treeId, action.actorId)
          ? { ok: true, action, changedIds: [action.treeId] }
          : { ok: false, action, reason: 'Fruit harvest failed' };
      case 'NEST_OCCUPY':
        return this.nestStateSystem.applyOccupyNest(action.nestId, action.chickenId)
          ? { ok: true, action, changedIds: [action.nestId, action.chickenId] }
          : { ok: false, action, reason: 'Nest occupy failed' };
      case 'NEST_RELEASE':
        return this.nestStateSystem.applyReleaseNest(action.nestId, action.chickenId)
          ? { ok: true, action, changedIds: [action.nestId] }
          : { ok: false, action, reason: 'Nest release failed' };
      case 'NEST_LAY_EGG':
        return this.nestStateSystem.applyLayEgg(action.nestId, action.atTime, action.chickenId)
          ? { ok: true, action, changedIds: [action.nestId] }
          : { ok: false, action, reason: 'Nest lay egg failed' };
      case 'NEST_COLLECT_EGG':
        return this.nestStateSystem.applyCollectEgg(action.nestId, action.actorId)
          ? { ok: true, action, changedIds: [action.nestId] }
          : { ok: false, action, reason: 'Nest egg collect failed' };
      case 'UPDATE_ENTITY_STATE':
        this.worldStateManager.patchEntity(action.entityId, action.patch as never);
        return { ok: true, action, changedIds: [action.entityId] };
      case 'UPDATE_TREE_STATE':
        this.worldStateManager.patchTreeState(action.treeId, action.patch as never);
        return { ok: true, action, changedIds: [action.treeId] };
      case 'UPDATE_NEST_STATE':
        this.worldStateManager.patchNestState(action.nestId, action.patch as never);
        return { ok: true, action, changedIds: [action.nestId] };
      default:
        return { ok: false, action, reason: 'Unhandled world action' };
    }
  }

  getHistory(): readonly WorldActionResult[] {
    return this.history;
  }
}
