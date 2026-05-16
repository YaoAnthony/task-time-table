import Phaser from 'phaser';
import { ChickenView } from '../entities/ChickenView';
import type { Bed } from '../entities/Bed';
import type { DropItem } from '../entities/DropItem';
import type { Npc } from '../entities/Npc';
import type { Interactable } from '../types';
import type { WorldObjectKind } from '../shared/worldStateTypes';
import { gameBus } from '../shared/EventBus';
import type { WorldAction, WorldActionResult } from '../systems/WorldActionSystem';
import type { WorldSyncSource } from '../sync/syncPolicy';

export function nextChickenId(scene: any) : string {
    return `chicken_${scene._nextChickenId++}`;
  
}

export function nextNestId(scene: any) : string {
    return `nest-${scene._nextNestId++}`;
  
}

export function getNpcRegistrations(scene: any) : Array<{ id: string; npc: Npc }> {
    if (scene.npcSystem) return scene.npcSystem.getRegistrations();
    const all: Array<{ id: string; npc: Npc }> = [{ id: scene.npc.name, npc: scene.npc }];
    for (const n of scene.extraNpcs) all.push({ id: n.name, npc: n });
    return all;
  
}

export function getActiveNpcIdSet(scene: any) : Set<string> {
    if (scene.npcSystem) return scene.npcSystem.getActiveNpcIdSet();
    return new Set(scene.getNpcRegistrations().map(({ id }: { id: string }) => id));
  
}

export function ensureAllNpcMindStates(scene: any) : void {
    scene.npcSystem?.ensureMindStates();
  
}

export function findNpcByName(scene: any, name: string) : Npc | null {
    if (scene.npcSystem) return scene.npcSystem.findByName(name);
    if (scene.npc?.name === name) return scene.npc;
    return scene.extraNpcs.find((n: any) => n.name === name) ?? null;
  
}

export function findConversationSpotForNpc(scene: any, sourceName: string, targetName: string) : { x: number; y: number } | null {
    const source = scene.findNpcByName(sourceName);
    const target = scene.findNpcByName(targetName);
    if (!source || !target || source === target) return null;

    const offsets = [
      { x: -44, y: 0 },
      { x: 44, y: 0 },
      { x: 0, y: 44 },
      { x: 0, y: -44 },
      { x: -44, y: 32 },
      { x: 44, y: 32 },
      { x: -44, y: -32 },
      { x: 44, y: -32 },
    ].sort((a, b) => {
      const ax = target.sprite.x + a.x - source.sprite.x;
      const ay = target.sprite.y + a.y - source.sprite.y;
      const bx = target.sprite.x + b.x - source.sprite.x;
      const by = target.sprite.y + b.y - source.sprite.y;
      return (ax * ax + ay * ay) - (bx * bx + by * by);
    });

    for (const offset of offsets) {
      const x = target.sprite.x + offset.x;
      const y = target.sprite.y + offset.y;
      const cell = scene.worldGrid.worldToCell(x, y);
      if (scene.worldGrid.getWeight(cell.col, cell.row) <= 0) continue;
      const occupied = scene.allNpcs().some((npc: any) => {
        if (npc === source || npc === target) return false;
        return Phaser.Math.Distance.Between(npc.sprite.x, npc.sprite.y, x, y) < 28;
      });
      if (!occupied) return { x, y };
    }

    return null;
  
}

export function allNpcs(scene: any) : Npc[] {
    if (scene.npcSystem) return scene.npcSystem.all();
    return [scene.npc, ...scene.extraNpcs];
  
}

export function findNearestNpc(scene: any, x: number, y: number, radius: number) : Npc | null {
    if (scene.npcSystem) return scene.npcSystem.findNearest(x, y, radius);
    let best: Npc | null = null;
    let bestD2 = radius * radius;
    for (const n of scene.allNpcs()) {
      if (!n?.sprite) continue;
      const dx = n.sprite.x - x;
      const dy = n.sprite.y - y;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) { best = n; bestD2 = d2; }
    }
    return best;
  
}

export function spawnChickenAt(scene: any, x: number, y: number, id?: string) : ChickenView {
    const chickenId = id ?? scene.nextChickenId();
    const chicken = scene.renderSyncSystem.spawnChicken(
      scene.chickenGroup,
      scene.pathfinder,
      chickenId,
      x,
      y,
      scene.chickenEntities,
    );
    scene.chickenStateSystem.registerChicken(chicken, {
      id: chickenId,
      x,
      y,
      facing: 'right',
      state: 'wandering',
      thirst: 0,
      growth: 0,
      nextThirstAt: scene.time.now + Math.random() * 2500 + 2500,
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

export function registerCoreWorldEntities(scene: any) : void {
    scene.renderSyncSystem.registerCoreWorldEntities(scene.player, scene.npc, scene.extraNpcs);
  
}

export function syncWorldStateMeta(scene: any) : void {
    scene.renderSyncSystem.syncWorldStateMeta(
      scene.dayCycle?.gameTick ?? 0,
      scene.dayCycle?.getTimeStr?.() ?? '06:00',
    );
  
}

export function syncDynamicEntityStates(scene: any) : void {
    scene.renderSyncSystem.syncDynamicEntityStates({
      player: scene.player,
      npc: scene.npc,
      extraNpcs: scene.extraNpcs,
      chickens: scene.chickenEntities,
      remotePlayer: scene.remotePlayer,
    });
  
}

export function syncNpcAgentWorldContexts(scene: any) : void {
    scene.npcSystem?.syncWorldContextsNow();
  
}

export function registerWorldObject(scene: any, 
    id: string,
    kind: WorldObjectKind,
    x: number,
    y: number,
    opts?: { blocking?: boolean; interactable?: boolean; state?: string; meta?: Record<string, unknown> },
  ) : void {
    scene.worldStateManager.registerObject({
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

export function ensureRuntimeObjectId(scene: any, target: object, prefix: 'bed' | 'nest') : string {
    const existingId = (target as any).__worldObjectId as string | undefined;
    if (existingId) return existingId;
    const id = `${prefix}-${scene._nextWorldObjectId++}`;
    (target as any).__worldObjectId = id;
    return id;
  
}

export function getRuntimeObjectId(_scene: any, target: object | null | undefined) : string | null {
    return ((target as any)?.__worldObjectId as string | undefined) ?? null;
  
}

export function registerBedObject(scene: any, bed: Bed) : void {
    const id = scene.ensureRuntimeObjectId(bed, 'bed');
    scene.registerWorldObject(id, 'bed', bed.worldX, bed.worldY, {
      interactable: true,
      state: bed.color,
    });
    scene.registerBedLight(bed, id);
  
}

export function unregisterRuntimeObject(scene: any, target: object | null | undefined) : void {
    const id = scene.getRuntimeObjectId(target);
    if (!id) return;
    scene.lightingSystem?.removeStaticLight(`bed:${id}`);
    scene.lightingSystem?.removeStaticLight(`nest:${id}`);
    scene.worldStateManager.unregisterObject(id);
  
}

export function registerDropState(scene: any, drop: DropItem) : void {
    const existingId = (drop as any).__worldStateId as string | undefined;
    const id = existingId ?? `drop-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    (drop as any).__worldStateId = id;
    scene.worldStateManager.registerDrop({
      id,
      itemId: drop.itemId,
      x: drop.worldX,
      y: drop.worldY,
      claimed: Boolean(drop.gone),
    });
  
}

export function unregisterDropState(scene: any, drop: DropItem) : void {
    const id = (drop as any).__worldStateId as string | undefined;
    if (!id) return;
    scene.worldStateManager.unregisterDrop(id);
  
}

export function syncPlayerInteractionState(scene: any) : void {
    scene.worldStateManager.updateEntityPosition('player', scene.player.sprite.x, scene.player.sprite.y);
    scene.worldStateManager.patchEntity('player', {
      facing: scene.player.facing,
    });
  
}

export function findDropByStateId(scene: any, dropId: string) : DropItem | null {
    return scene.drops.find((drop: any) => ((drop as any).__worldStateId as string | undefined) === dropId) ?? null;
  
}

export function findDropByItemAndPosition(scene: any, itemId: string, x: number, y: number) : DropItem | null {
    return scene.drops.find(
      (drop: any) => drop.itemId === itemId
        && !drop.gone
        && Math.abs(drop.worldX - x) < 40
        && Math.abs(drop.worldY - y) < 40,
    ) ?? null;
  
}

export function findInteractableObjectByStateId(scene: any, objectId: string) : Interactable | null {
    if (scene.trees.has(objectId)) return scene.trees.get(objectId) ?? null;
    if (scene.chests.has(objectId)) return scene.chests.get(objectId) ?? null;
    const storageChest = scene.storageChestSystem?.getView?.(objectId);
    if (storageChest) return storageChest;

    const bed = scene.beds.find((entry: any) => scene.getRuntimeObjectId(entry) === objectId);
    if (bed) return bed;

    const nest = scene.nests.find((entry: any) => entry.id === objectId || scene.getRuntimeObjectId(entry) === objectId);
    if (nest) return nest;

    const house = scene.houseSaveAdapter?.getView?.(objectId);
    if (house) return house;

    return null;
  
}

export function dispatchWorldAction(scene: any, action: WorldAction, source: WorldSyncSource = 'local') : WorldActionResult {
    return scene.worldActionGateway.dispatchAction(action, source);
  
}

export function applyPlaceObjectAction(scene: any, action: Extract<WorldAction, { type: 'PLACE_OBJECT' }>) : WorldActionResult {
    const placed = scene.placeEntityAt(action.itemId, action.x, action.y);
    return {
      ok: placed,
      action,
      reason: placed ? undefined : 'Object placement failed',
      changedIds: placed ? [action.itemId] : [],
    };
  
}

export function applyPlaceHouseAction(scene: any, action: Extract<WorldAction, { type: 'PLACE_HOUSE' }>) : WorldActionResult {
    const requested = scene.housePlacementSystem?.requestPlacement(action.definitionId, action.blueprintItemId) ?? false;
    return {
      ok: requested,
      action,
      reason: requested ? undefined : 'House placement request failed',
      changedIds: requested ? [action.blueprintItemId] : [],
    };
  
}

export function applyPlaceStorageChestAction(scene: any, action: Extract<WorldAction, { type: 'PLACE_STORAGE_CHEST' }>) : WorldActionResult {
    const requested = scene.storageChestSystem?.requestPlacement(action.itemId) ?? false;
    return {
      ok: requested,
      action,
      reason: requested ? undefined : 'Storage chest placement request failed',
      changedIds: requested ? [action.itemId] : [],
    };
  
}

export function applyPickupDropAction(scene: any, action: Extract<WorldAction, { type: 'PICKUP_DROP' }>) : WorldActionResult {
    const drop = scene.findDropByStateId(action.dropId);
    if (!drop) {
      return { ok: false, action, reason: 'Drop not found' };
    }
    const x = drop.worldX;
    const y = drop.worldY;
    if (action.actorId === 'player') {
      drop.pickup();
    } else {
      drop.claimForNpc();
      gameBus.emit('world:item_picked_up', {
        itemId: action.itemId,
        x,
        y,
        actorId: action.actorId,
        source: 'local',
      });
    }
    scene.unregisterDropState(drop);
    const index = scene.drops.indexOf(drop);
    if (index >= 0) scene.drops.splice(index, 1);
    return { ok: true, action, changedIds: [action.dropId] };
  
}

export function applyDropItemAction(scene: any, action: Extract<WorldAction, { type: 'DROP_ITEM' }>) : WorldActionResult {
    const drop = scene.spawnWorldItemDirect(action.x, action.y, action.itemId);
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

export function applyRemoveObjectAction(scene: any, action: Extract<WorldAction, { type: 'REMOVE_OBJECT' }>) : WorldActionResult {
    if (action.objectKind === 'chest') {
      scene.removeChest(action.objectId);
      return { ok: true, action, changedIds: [action.objectId] };
    }
    if (action.objectKind === 'storage_chest') {
      scene.storageChestSystem?.remove?.(action.objectId);
      return { ok: true, action, changedIds: [action.objectId] };
    }
    scene.worldStateManager.unregisterObject(action.objectId);
    return { ok: true, action, changedIds: [action.objectId] };
  
}
