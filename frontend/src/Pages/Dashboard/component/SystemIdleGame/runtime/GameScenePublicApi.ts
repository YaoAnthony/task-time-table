import type { CreatureState } from '../../../../../Redux/Features/gameSlice';
import type { FacingDirection, GameChest, IdleGameState } from '../../../../../Types/Profile';
import type { DropItem } from '../entities/DropItem';
import type { TreeView } from '../entities/TreeView';
import type { GameSaveV1 } from '../persistence/save/GameSaveTypes';
import { idleGameStateFromGameSave } from '../persistence/save/GameSaveMapper';
import { gameBus } from '../shared/EventBus';
import { serializeNpcKnowledgeForPrompt } from '../shared/NpcKnowledge';
import { PLAYER_HOUSE_DOOR, PLAYER_HOUSE_ROOM } from '../shared/WorldLocations';
import type { NpcMindState } from '../shared/worldStateTypes';
import type { FarmActionKind, FarmActionTarget } from '../systems/FarmSystem';
import { formatPerceptionForNpcPrompt } from '../systems/perceptionFormatter';
import type { GameSaveBuildContext } from '../systems/SavingSystem';
import type { WorldSyncSource } from '../sync/syncPolicy';
import type { Interactable, NpcMemoryEntry, ToolType } from '../types';

export function triggerInteract(scene: any, initialValue: string = '') : void {
    if (!scene.player) return;
    const px = scene.player.sprite.x;
    const py = scene.player.sprite.y;
    const target = scene.findNearestNpc(px, py, 220);   // ~7 tiles
    if (target) {
      scene.npcDirectorSystem?.pauseNpc(target.name, scene.dayCycle.gameTick, 10, 'player_interaction');
    }
    gameBus.emit('npc:interact', { npcName: target?.name ?? '闄勮繎', initialValue });
  
}

export function getNearestNpcName(scene: any, radius = 220) : string | null {
    if (!scene.player) return null;
    const n = scene.findNearestNpc(scene.player.sprite.x, scene.player.sprite.y, radius);
    return n?.name ?? null;
  
}

export function triggerAction(scene: any) : void {
    scene.worldFacade.triggerToolAction();
    if (scene.player?.currentTool !== 'axe') {
      const heldItemId = (scene.player as any).heldItemId as string | undefined;
      scene.actorActionService?.useToolAt(
        'player',
        scene.player.sprite.x,
        scene.player.sprite.y,
        scene.player.currentTool,
        heldItemId,
      );
    }
  
}

export function tryChopNearbyBed(scene: any) : boolean {
    const px = scene.player.sprite.x;
    const py = scene.player.sprite.y;
    for (let i = scene.beds.length - 1; i >= 0; i--) {
      const bed = scene.beds[i];
      if (!bed.isNearPlayer(px, py, 60)) continue;
      const itemId = bed.chop();
      scene.renderSyncSystem.unregisterBed(bed, scene.beds);
      scene.renderSyncSystem.spawnDrop(bed.worldX, bed.worldY, itemId);
      return true;
    }
    return false;
  
}

export function tryChopNearestTree(scene: any) : void {
    const px = scene.player.sprite.x;
    const py = scene.player.sprite.y;
    let closest:  TreeView | null = null;
    let closestD = Infinity;
    for (const tree of scene.trees.values()) {
      if (tree.isChopped()) continue;
      const dx = px - tree.worldX;
      const dy = py - tree.worldY;
      const d  = dx * dx + dy * dy;
      if (d <= 72 * 72 && d < closestD) { closest = tree; closestD = d; }
    }
    closest?.chop();
  
}

export function setPlayerTool(scene: any, tool: ToolType) : void {
    if (!scene.player) return;   // guard: create() not yet complete
    console.log('[GameScene] setPlayerTool', tool);
    scene.player.setTool(tool);
  
}

export function getGameState(scene: any) : IdleGameState {
    return scene.savingSystem.getGameState();
  
}

export function setInitialGameSave(scene: any, save: GameSaveV1 | null, userId = 'player') : void {
    scene.activeUserId = userId;
    scene.initialGameSave = save;
    if (save) {
      scene.initialState = {
        ...scene.initialState,
        ...idleGameStateFromGameSave(save, userId),
      };
    }
  
}

export function loadGameSaveData(scene: any, save: GameSaveV1 | null, userId = 'player') : void {
    scene.setInitialGameSave(save, userId);
    if (!save) return;

    const restoredState = idleGameStateFromGameSave(save, userId);
    const playerSave = save.players[userId] ?? Object.values(save.players)[0];
    if (playerSave && scene.player?.sprite) {
      scene.player.sprite.setPosition(playerSave.position.x, playerSave.position.y);
      scene.player.facing = playerSave.position.facing as FacingDirection;
      scene.player.sprite.play(`idle-${playerSave.position.facing}`);
      scene.cameras.main.startFollow(scene.player.sprite, true, 0.1, 0.1);
    }
    if (typeof save.worldStatus.gameTick === 'number' && scene.dayCycle) {
      scene.dayCycle.gameTick = save.worldStatus.gameTick;
    }
    scene.eventSystem?.importSaveData?.(save.worldStatus.events, save.worldStatus.unlockedNpcs);
    scene._loadWorldState(restoredState.worldState ?? null);
    scene.houseSaveAdapter?.loadFromGameSave(save);
    scene.storageChestSystem?.loadFromGameSave(save);
    scene.locationSystem?.restoreSavedLocations?.(save, userId);
    scene.loadChests(save.worldStatus.entities.chests.filter((chest) => !chest.opened));
    scene.farmSystem?.loadFromBackend?.(save.worldStatus.entities.farmTiles);
    if (save.worldStatus.entities.creatures.length) {
      scene.restoreCreatures(save.worldStatus.entities.creatures);
    }
    Object.values(save.worldStatus.npcs).forEach((npcSave) => {
      if (npcSave.memory?.length) scene.loadNpcMemories(npcSave.name || npcSave.id, npcSave.memory);
    });
  
}

export function syncEventSaveData(scene: any, save: GameSaveV1 | null) : void {
    if (!save) return;
    console.log('[DEBUG-event-flow] syncEventSaveData called', {
      sceneReady: Boolean(scene.eventSystem),
      roomId: save.worldStatus?.roomId,
      gameTick: save.worldStatus?.gameTick,
      queuedEvents: save.worldStatus?.events?.queued,
      activeEvents: save.worldStatus?.events?.active,
      unlockedNpcs: save.worldStatus?.unlockedNpcs,
    });
    scene.initialGameSave = save;
    scene.eventSystem?.importSaveData?.(save.worldStatus.events, save.worldStatus.unlockedNpcs);
    scene.houseSaveAdapter?.loadFromGameSave(save);

}

export function getGameSaveData(scene: any, context: GameSaveBuildContext) : GameSaveV1 {
    return scene.savingSystem.getGameSaveData({
      ...context,
      previousSave: context.previousSave ?? scene.initialGameSave,
    });
  
}

export function getGameTick(scene: any) : number { return scene.dayCycle.gameTick; 
}

export function getDayCycleTick(scene: any) : number {
    return scene.dayCycle?.gameTick ?? 0;
  
}

export function setNpcThinking(scene: any, npcName: string, thinking: boolean) : void {
    const target = scene.findNpcByName(npcName);
    if (!target) return;
    target.setThinking(thinking);
    if (thinking) {
      scene.npcDirectorSystem?.pauseNpc(npcName, scene.dayCycle.gameTick, 12, 'chat_request');
    }
  
}

export function addPlayerMessageToNpc(scene: any, npcName: string, text: string) : void {
    const target = scene.findNpcByName(npcName);
    if (!target) return;
    const tick = scene.dayCycle.gameTick;
    target.addMemory(text, 'player', tick);
    // Bump relationship counters + refill social drive both are local-only
    // (not yet persisted to DB) but feed straight into the next chat prompt.
    scene.npcMemorySystem?.recordPlayerChat(npcName, tick);
    scene.npcDirectorSystem?.bumpSocial(npcName, tick, 25);
  
}

export function getNpcFamiliarity(scene: any, npcName: string) : number {
    return scene.npcMemorySystem?.getRelationship(npcName)?.familiarity ?? 0;
  
}

export function getNpcChatCount(scene: any, npcName: string) : number {
    return scene.npcMemorySystem?.getRelationship(npcName)?.chatCount ?? 0;
  
}

export function npcReply(scene: any, npcName: string, text: string) : void {
    const target = scene.findNpcByName(npcName);
    if (!target) return;
    scene.npcDirectorSystem?.pauseNpc(npcName, scene.dayCycle.gameTick, 8, 'chat_reply');
    target.say(text, scene.dayCycle.gameTick);
  
}

export function playerSpeak(scene: any, text: string) : number {
    return scene.dialogueSystem?.broadcastFromPlayer(text) ?? 0;
  
}

export function getNpcMemory(scene: any, npcName: string) : NpcMemoryEntry[] {
    const target = scene.findNpcByName(npcName);
    return target ? [...target.memory] : [];
  
}

export function getNpcMindState(scene: any, npcId = scene.npc.name) : NpcMindState | null {
    return scene.npcDirectorSystem?.getMindState(npcId) ?? null;
  
}

export function setNpcAuthProvider(scene: any, fn: () => string | null) : void {
    scene.npc.setAuthProvider(fn);
  
}

export function setNpcInventoryProvider(scene: any, fn: (name: string) => Record<string, number>) : void {
    scene.npc.setInventoryProvider(fn);
  
}

export function loadNpcMemories(scene: any, npcName: string, entries: NpcMemoryEntry[]) : void {
    const target = scene.findNpcByName(npcName);
    if (!target) return;
    // Only inject the built-in house-location memory for the main NPC ( .
    if (target === scene.npc) {
      const locationMemory: NpcMemoryEntry = {
        id:           'builtin-house-location',
        gameTick:     0,
        text:         `I know the left player house. The door is around (${PLAYER_HOUSE_DOOR.x}, ${PLAYER_HOUSE_DOOR.y}), and the room center is around (${PLAYER_HOUSE_ROOM.x}, ${PLAYER_HOUSE_ROOM.y}). When the player asks me to go inside or fetch a tool there, I should enter through the door first.`,



        source:       'event',
        importance:   9,
        keywords:     ['room', 'left house', 'player house', 'wooden house', 'door', 'inside', 'enter', 'tool'],
        lastAccessed: 0,
      };
      target.loadMemories([locationMemory, ...entries]);
    } else {
      target.loadMemories(entries);
    }
  
}

export function executeNpcActions(scene: any, npcName: string, actions: import('../types').NpcAction[]) : void {
    const target = scene.findNpcByName(npcName);
    if (!target) return;
    scene.npcDirectorSystem?.pauseNpc(npcName, scene.dayCycle.gameTick, 12, 'external_action_queue');
    scene.actionExecutor.execute(target, actions, scene.dayCycle.gameTick);
  
}

export function getPlayerPosition(scene: any) : { x: number; y: number } {
    return { x: scene.player.sprite.x, y: scene.player.sprite.y };
  
}

export function pauseInput(scene: any) : void { scene._chatOpen = true;  
}

export function resumeInput(scene: any) : void { scene._chatOpen = false; 
}

export function registerInteractable(scene: any, obj: Interactable) : void {
    if (!scene.interactables.includes(obj)) scene.interactables.push(obj);
  
}

export function unregisterInteractable(scene: any, obj: Interactable) : void {
    const idx = scene.interactables.indexOf(obj);
    if (idx !== -1) scene.interactables.splice(idx, 1);
  
}

export function triggerFInteract(scene: any) : void {
    scene.worldFacade.triggerPrimaryInteraction();
  
}

export function _triggerQDrop(scene: any) : void {
    scene.worldFacade.dropHeldItem();
  
}

export function loadChests(scene: any, chests: GameChest[]) : void {
    const unopenedChests = chests.filter((chest) => !chest.opened);
    const nextIds = new Set(unopenedChests.map((chest) => chest.id));
    for (const chestId of scene.chests.keys()) {
      if (!nextIds.has(chestId)) scene.lightingSystem?.removeStaticLight(`chest:${chestId}`);
    }
    scene.renderSyncSystem.loadChests(unopenedChests);
    unopenedChests.forEach((chest) => scene.registerChestLight(chest));
  
}

export function addChest(scene: any, data: GameChest) : void {
    if (data.opened) return;
    scene.renderSyncSystem.addChest(data);
    scene.registerChestLight(data);
  
}

export function panToChest(scene: any, id: string) : void {
    const chest = scene.chests.get(id);
    if (!chest) return;
    scene.cameras.main.pan(chest.sprite.x, chest.sprite.y, 600, 'Sine.easeInOut', false);
    chest.highlight();
  
}

export function getCreatureStates(scene: any) : CreatureState[] {
    return scene.worldStateManager.getChickenStates().map((state: any) => ({
      creatureId: state.id,
      type: 'chicken',
      x: state.x,
      y: state.y,
      thirst: state.thirst,
      growth: state.growth,
      state: state.state as CreatureState['state'],
    }));
  
}

export function restoreCreatures(scene: any, saved: CreatureState[]) : void {
    for (const savedState of saved) {
      const chicken = scene.chickenEntities.find((entry: any) => entry.id === savedState.creatureId)
        ?? scene.chickenEntities[saved.indexOf(savedState)];
      if (!chicken) continue;
      scene.chickenStateSystem.restoreChickenState(chicken.id, {
        x: savedState.x,
        y: savedState.y,
        thirst: savedState.thirst,
        growth: savedState.growth,
        state: savedState.state as any,
      });
    }
  
}

export function removeChest(scene: any, id: string) : void {
    scene.renderSyncSystem.removeChest(id);
    scene.lightingSystem?.removeStaticLight(`chest:${id}`);
  
}

export function spawnWorldItemDirect(scene: any, x: number, y: number, itemId: string) : DropItem {
    return scene.renderSyncSystem.spawnDrop(x, y, itemId);
  
}

export function spawnWorldItem(scene: any, x: number, y: number, itemId: string, source: WorldSyncSource = 'server') : void {
    scene.worldFacade.spawnWorldItem(x, y, itemId, source);
  
}

export function getPlayerWorldPos(scene: any) : { x: number; y: number } | null {
    if (!scene.player) return null;
    return { x: scene.player.sprite.x, y: scene.player.sprite.y };
  
}

export function dropPlayerItem(scene: any, itemId: string) : void {
    scene.worldFacade.dropPlayerItem(itemId);
  
}

export function makeNpcSay(scene: any, npcName: string, text: string) : void {
    const target = scene.findNpcByName(npcName);
    if (!target) return;
    scene.npcDirectorSystem?.pauseNpc(npcName, scene.dayCycle.gameTick, 8, 'async_speech');
    target.say(text, scene.dayCycle.gameTick);
  
}

export function getPerceptionReport(scene: any, npcName?: string) : string {
    const target = npcName ? scene.findNpcByName(npcName) : scene.npc;
    if (!target) return '';
    const result = scene.perceptionSystem?.perceiveEntity(target.name) ?? null;
    const report = result ? formatPerceptionForNpcPrompt(result) : '';
    console.log(`[GameScene] perceptionReport (${target.name} at ${Math.round(target.sprite.x)},${Math.round(target.sprite.y)}): "${report.slice(0, 200)}"`);
    return report;
  
}

export function getPerceptionContext(scene: any, npcName?: string) : Record<string, unknown> | null {
    const target = npcName ? scene.findNpcByName(npcName) : scene.npc;
    if (!target || !scene.perceptionSystem) return null;
    const perception = scene.perceptionSystem.perceiveEntity(target.name);
    const mind = scene.worldStateManager.getNpcMindState(target.name);
    const agentWorld = scene.agentWorldModel?.buildContext(target.name, mind) ?? null;
    return {
      npcId: target.name,
      gameTick: scene.dayCycle?.gameTick ?? 0,
      time: scene.dayCycle?.getDateTimeStr?.() ?? scene.dayCycle?.getTimeStr?.() ?? '',
      self: perception.self,
      summary: perception.summary,
      nearest: perception.nearest,
      visibleObjects: perception.visibleObjects.slice(0, 20),
      visibleDrops: perception.visibleDrops.slice(0, 20),
      visibleEntities: perception.visibleEntities.slice(0, 12),
      visibleCrops: perception.visibleCrops.slice(0, 20),
      landmarks: perception.landmarks.slice(0, 12),
      currentIntent: mind?.currentIntent ?? null,
      recentMemories: Object.values(mind?.recentMemories ?? {}).slice(-20),
      knownLandmarks: Object.values(mind?.knownLandmarks ?? {}).slice(-20),
      knowledge: serializeNpcKnowledgeForPrompt(),
      needs: mind?.needs ?? null,
      schedule: mind?.schedule ?? null,
      relationships: mind?.relationships ?? {},
      agentWorld,
    };
  
}

export function confirmNpcAction(scene: any, npcName: string, confirmed: boolean) : void {
    const target = scene.findNpcByName(npcName);
    if (!target) return;
    scene.npcDirectorSystem?.pauseNpc(npcName, scene.dayCycle.gameTick, 4, 'confirm_resolution');
    target.respondToConfirm(confirmed);
  
}

export function chopTreeById(scene: any, id: string) : void {
    scene.dispatchWorldAction({
      type: 'CHOP_TREE',
      actorId: scene.npc?.name ?? 'npc',
      treeId: id,
    });
  
}

export function findFarmTarget(scene: any, 
    action: FarmActionKind,
    x: number,
    y: number,
    maxRadiusCells = 10,
    actorId?: string,
  ) : FarmActionTarget | null {
    return scene.actorActionService?.findFarmTarget(action, x, y, maxRadiusCells, actorId) ?? null;
  
}

export function performFarmAction(scene: any, 
    actorId: string,
    action: FarmActionKind,
    target: Pick<FarmActionTarget, 'tx' | 'ty' | 'cropId'>,
    itemId?: string,
  ) : boolean {
    const result = scene.actorActionService.performFarmAction(actorId, action, target, itemId);
    if (actorId !== 'player') {
      scene.npcMemorySystem?.recordActionResult(actorId, scene.dayCycle?.gameTick ?? 0, {
        status: result.ok ? 'success' : 'failed',
        actionType: `farm_${action}`,
        reason: result.reason,
        targetX: target.tx * 32 + 16,
        targetY: target.ty * 32 + 16,
        worldId: getWorldIdAt(scene, target.tx * 32 + 16, target.ty * 32 + 16),
      });
    }
    return result.ok;
  
}

export function executeKnowledgeSkill(scene: any, 
    npcName: string,
    skillId: string,
    origin: { x: number; y: number },
    navigate: (x: number, y: number, onArrive?: () => void) => void,
    gameTick: number,
  ) : boolean {
    const ok = scene.actorActionService.executeKnowledgeSkill({
      actorId: npcName,
      skillId,
      originX: origin.x,
      originY: origin.y,
      gameTick,
      navigate,
    });
    scene.npcMemorySystem?.recordActionResult(npcName, gameTick, {
      status: ok ? 'success' : 'failed',
      actionType: `skill_${skillId}`,
      reason: ok ? undefined : 'skill_target_not_found',
      x: origin.x,
      y: origin.y,
      worldId: getWorldIdAt(scene, origin.x, origin.y),
    });
    return ok;
  
}

export function findNearestTree(scene: any, x: number, y: number) : { id: string; x: number; y: number } | null {
    // Use SpatialIndex for O(1)-amortised query instead of O(n) full scan
    const SEARCH_RADIUS = 600;
    const candidates = scene.spatialIndex.queryRadius(x, y, SEARCH_RADIUS);
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
      for (const tree of scene.trees.values()) {
        if (tree.isChopped()) continue;
        const dx = tree.worldX - x, dy = tree.worldY - y;
        const d = dx * dx + dy * dy;
        if (d < closestD) { closestD = d; closest = { id: tree.id, x: tree.worldX, y: tree.worldY + 40 }; }
      }
    }
    return closest;
  
}

export function findWorldItem(scene: any, itemId: string) : DropItem | null {
    return scene.drops.find((d: any) => d.itemId === itemId && !d.gone) ?? null;
  
}

export function getWorldIdAt(scene: any, x: number, y: number): string {
    return scene.locationSystem?.getWorldIdAt?.(x, y) ?? 'world:village';
}

export function getNpcWorldId(scene: any, npcName: string): string {
    const npc = scene.findNpcByName?.(npcName) ?? null;
    const sprite = npc?.sprite;
    if (!sprite) return 'world:village';
    return getWorldIdAt(scene, sprite.x, sprite.y);
}

function findHouseViewByRoomId(scene: any, roomId: string): any | null {
    const views = scene.houseSaveAdapter?.getViews?.() ?? [];
    const matching = views.find((view: any) => (
      view.house?.roomId === roomId
      || `room:${view.house?.id}` === roomId
      || view.house?.id === roomId
    ));
    return matching ?? null;
}

function findHouseEntryByRoomId(scene: any, roomId: string, npcName?: string): { houseId: string; roomId: string; x: number; y: number } | null {
    void npcName;
    const view = findHouseViewByRoomId(scene, roomId);
    if (!view || !String(view.house?.stage ?? '').startsWith('ready')) return null;
    const door = view.getDoorWorldPosition?.();
    if (!door) return null;
    return {
      houseId: view.house.id,
      roomId: view.house.roomId,
      x: door.x,
      y: door.y,
    };
}

export function navigateNpcToWorldPosition(
    scene: any,
    npcName: string,
    target: { x: number; y: number; worldId?: string },
    onArrive?: () => void,
  ) : boolean {
    const npc = scene.findNpcByName?.(npcName) ?? null;
    if (!npc?.sprite) return false;
    const targetWorldId = target.worldId ?? getWorldIdAt(scene, target.x, target.y);
    const currentWorldId = getNpcWorldId(scene, npcName);
    const finishInCurrentWorld = () => npc.navigateTo(target.x, target.y, onArrive);

    if (currentWorldId === targetWorldId) {
      finishInCurrentWorld();
      return true;
    }

    if (currentWorldId !== 'world:village') {
      const exit = scene.locationSystem?.getRoomExitApproachTarget?.(currentWorldId);
      if (!exit) return false;
      npc.navigateTo(exit.x, exit.y, () => {
        scene.locationSystem?.exitNpcToVillage?.(npc, currentWorldId, {
          onComplete: () => navigateNpcToWorldPosition(scene, npcName, target, onArrive),
        });
      });
      return true;
    }

    if (targetWorldId !== 'world:village') {
      const entry = findHouseEntryByRoomId(scene, targetWorldId, npcName);
      if (entry) {
        npc.navigateTo(entry.x, entry.y + 40, () => {
          scene.locationSystem?.enterNpcRoom?.(npc, entry.roomId, {
            templateId: 'two_bedroom_living_room',
            entryPoint: { x: entry.x, y: entry.y },
            returnTo: { x: entry.x, y: entry.y + 58 },
            onComplete: finishInCurrentWorld,
          });
        });
        return true;
      }

      scene.locationSystem?.enterNpcRoom?.(npc, targetWorldId, {
        templateId: 'two_bedroom_living_room',
        transition: false,
        onComplete: finishInCurrentWorld,
      });
      return true;
    }

    finishInCurrentWorld();
    return true;
}

export function claimWorldItem(scene: any, itemId: string, npcName: string, target?: { x: number; y: number; worldId?: string }) : void {
    console.log(`[GameScene] claimWorldItem: itemId=${itemId} drops=[${scene.drops.map((d: any)=>d.itemId).join(',')}]`);
    const allCandidates = scene.drops.filter((d: any) => d.itemId === itemId && !d.gone);
    const candidates = target?.worldId
      ? allCandidates.filter((d: any) => getWorldIdAt(scene, d.worldX, d.worldY) === target.worldId)
      : allCandidates;
    const candidatePool = candidates.length > 0 ? candidates : allCandidates;
    const nearestTo = (point: { x: number; y: number } | null) => {
      if (!point || candidatePool.length === 0) return null;
      let best: any = null;
      let bestDistance = Infinity;
      for (const candidate of candidatePool) {
        const dx = candidate.worldX - point.x;
        const dy = candidate.worldY - point.y;
        const distance = dx * dx + dy * dy;
        if (distance < bestDistance) {
          best = candidate;
          bestDistance = distance;
        }
      }
      return best;
    };
    const npc = scene.findNpcByName?.(npcName) ?? null;
    const drop = nearestTo(target ?? null)
      ?? nearestTo(npc ? { x: npc.sprite.x, y: npc.sprite.y } : null)
      ?? candidatePool[0]
      ?? null;
    const dropId = drop ? ((drop as any).__worldStateId as string | undefined) : undefined;
    if (!drop || !dropId) {
      console.warn(`[GameScene] claimWorldItem: item "${itemId}" not found in drops!`);
      return;
    }
    const result = scene.dispatchWorldAction({
      type: 'PICKUP_DROP',
      actorId: npcName,
      dropId,
      itemId,
    });
    if (!result.ok) return;
    gameBus.emit('npc:pickup_world_item', { npcName, itemId, qty: 1 });
  
}

export function dropWorldItem(scene: any, x: number, y: number, itemId: string, npcName: string) : void {
    const result = scene.dispatchWorldAction({
      type: 'DROP_ITEM',
      actorId: npcName,
      itemId,
      x,
      y,
    });
    if (!result.ok) return;
    gameBus.emit('npc:drop_item', { npcName, itemId, qty: 1 });
  
}

function getHouseViewForNpc(scene: any, houseId?: string, npcName?: string): any | null {
    const adapter = scene.houseSaveAdapter;
    if (!adapter) return null;
    if (houseId) return adapter.getView?.(houseId) ?? null;

    const mind = npcName ? scene.worldStateManager?.getNpcMindState?.(npcName) : null;
    const rememberedHouseId = mind?.meta?.homeHouseId;
    if (rememberedHouseId) {
      const remembered = adapter.getView?.(String(rememberedHouseId));
      if (remembered) return remembered;
    }

    const views = adapter.getViews?.() ?? [];
    if (npcName) {
      const contracted = views.find((view: any) => (
        view.house?.tenancy?.residentNpcName === npcName
        || view.house?.tenancy?.residentNpcId === npcName
        || (view.house?.access?.allowedNpcIds ?? []).includes(npcName)
      ));
      if (contracted) return contracted;
    }
    return views.find((view: any) => String(view.house?.stage ?? '').startsWith('ready')) ?? null;
}

function isHouseAccessibleToNpc(scene: any, view: any, npcName: string): boolean {
    const house = view?.house;
    if (!house) return false;
    if (house.doorState === 'open') return true;
    if (house.tenancy?.residentNpcName === npcName || house.tenancy?.residentNpcId === npcName) return true;
    if ((house.access?.allowedNpcIds ?? []).includes(npcName)) return true;
    const mind = scene.worldStateManager?.getNpcMindState?.(npcName);
    return mind?.meta?.homeHouseId === house.id;
}

export function findHouseEntryTarget(scene: any, houseId?: string, npcName?: string) : { houseId: string; roomId: string; x: number; y: number } | null {
    const view = getHouseViewForNpc(scene, houseId, npcName);
    if (!view || !String(view.house?.stage ?? '').startsWith('ready')) return null;
    const door = view.getDoorWorldPosition();
    return {
      houseId: view.house.id,
      roomId: view.house.roomId,
      x: door.x,
      y: door.y,
    };
}

export function enterHouseForNpc(scene: any, npcName: string, houseId: string) : boolean {
    const npc = scene.findNpcByName?.(npcName) ?? null;
    const view = getHouseViewForNpc(scene, houseId, npcName);
    if (!npc || !view || !String(view.house?.stage ?? '').startsWith('ready')) return false;
    if (!isHouseAccessibleToNpc(scene, view, npcName)) return false;
    const door = view.getDoorWorldPosition();
    scene.locationSystem?.enterNpcRoom?.(npc, view.house.roomId, {
      templateId: 'two_bedroom_living_room',
      entryPoint: door,
      returnTo: { x: door.x, y: door.y + 42 },
    });
    scene.npcMemorySystem?.recordActionResult(npcName, scene.dayCycle?.gameTick ?? 0, {
      status: 'success',
      actionType: 'enter_house',
      targetX: door.x,
      targetY: door.y,
      worldId: 'world:village',
    });
    return true;
}

export function rememberHomeHouseForNpc(scene: any, npcName: string, houseId: string, gameTick: number) : boolean {
    const view = getHouseViewForNpc(scene, houseId, npcName);
    if (!view) return false;
    const current = scene.npcMemorySystem?.ensureNpcMindState?.(npcName, gameTick)
      ?? scene.worldStateManager?.getNpcMindState?.(npcName);
    scene.worldStateManager?.patchNpcMindState?.(npcName, {
      meta: {
        ...(current?.meta ?? {}),
        homeHouseId: view.house.id,
        homeRoomId: view.house.roomId,
        homeHouseRememberedAtTick: gameTick,
      },
      knownLandmarks: {
        ...(current?.knownLandmarks ?? {}),
        [`house:${view.house.id}`]: {
          key: `house:${view.house.id}`,
          sourceId: view.house.id,
          kind: 'landmark',
          type: 'house',
          label: view.house.tenancy?.residentNpcName === npcName ? 'my home' : 'remembered home',
          worldId: 'world:village',
          x: view.house.x,
          y: view.house.y,
          lastSeenTick: gameTick,
          meta: {
            houseId: view.house.id,
            roomId: view.house.roomId,
            doorState: view.house.doorState,
          },
        },
      },
    });
    scene.npcMemorySystem?.recordActionResult?.(npcName, gameTick, {
      status: 'success',
      actionType: 'remember_home_house',
      targetX: view.house.x,
      targetY: view.house.y,
      worldId: 'world:village',
    });
    return true;
}

export function executeCommand(scene: any, input: string) : string {
    return scene.commands.execute(input);
  
}
