import type { Direction } from '../types';
import { gameBus } from '../shared/EventBus';
import type { InteractionCommand } from './InteractionSystem';
import type { WorldAction, WorldActionResult } from './WorldActionSystem';
import type { WorldSyncSource } from '../sync/syncPolicy';
import type { WorldSnapshot } from './MultiplaySystem';

interface PlayerAdapter {
  sprite: { x: number; y: number; body?: { velocity: { x: number; y: number } } };
  facing: Direction;
  currentTool: string;
  performAction(): void;
  heldItemId?: string;
}

interface InteractionResolver {
  resolvePrimaryInteraction(input: {
    playerId: string;
    heldItemId?: string;
    currentTool?: string;
  }): InteractionCommand;
}

interface WorldFacadeOptions {
  player: () => PlayerAdapter | null;
  npcName: () => string;
  interactionSystem: InteractionResolver;
  dispatchWorldAction: (action: WorldAction, source?: WorldSyncSource) => WorldActionResult;
  syncPlayerInteractionState: () => void;
  findInteractableObjectByStateId: (objectId: string) => { interact(): void } | null;
  onNpcInteract: () => void;
  tryChopNearestTree: () => void;
  tryChopNearbyBed: () => boolean;
  findDropByItemAndPosition: (itemId: string, x: number, y: number) => { __worldStateId?: string } | null;
  onRemoteSleepChange: (peerId: string, sleeping: boolean) => void;
  applyRemotePlayerMove: (payload: { x: number; y: number; facing: Direction; velX: number; velY: number }) => void;
  applyRemoteFarmEvent: (type: string, payload: Record<string, unknown>) => void;
  getWorldSnapshot: () => WorldSnapshot;
  applyWorldSnapshot: (snapshot: Pick<WorldSnapshot, 'choppedTreeIds' | 'worldItems' | 'farmTiles'>) => void;
}

/**
 * WorldFacade is a thin bridge between scene/external callers and the world
 * action + interaction pipeline. It keeps GameScene from growing more
 * orchestration-heavy without introducing a new truth source.
 */
export class WorldFacade {
  constructor(private readonly options: WorldFacadeOptions) {}

  triggerPrimaryInteraction(): void {
    const player = this.options.player();
    if (!player) return;
    this.options.syncPlayerInteractionState();
    const command = this.options.interactionSystem.resolvePrimaryInteraction({
      playerId: 'player',
      heldItemId: player.heldItemId,
      currentTool: player.currentTool,
    });
    this.executeInteractionCommand(command);
  }

  triggerToolAction(): void {
    const player = this.options.player();
    if (!player) return;
    player.performAction();

    if (player.currentTool === 'axe') {
      if (this.options.tryChopNearbyBed()) return;
      this.options.tryChopNearestTree();
    }
  }

  executeInteractionCommand(command: InteractionCommand): void {
    switch (command.type) {
      case 'PLACE_OBJECT':
        this.options.dispatchWorldAction({
          type: 'PLACE_OBJECT',
          actorId: command.playerId,
          itemId: command.itemId,
          x: command.targetWorld.x,
          y: command.targetWorld.y,
          placeEntity: command.placeEntity,
        });
        return;
      case 'HARVEST_CROP':
        this.options.dispatchWorldAction({
          type: 'HARVEST_CROP',
          actorId: command.playerId,
          cropId: command.cropId,
          tx: command.tx,
          ty: command.ty,
        });
        return;
      case 'PICKUP_DROP':
        this.options.dispatchWorldAction({
          type: 'PICKUP_DROP',
          actorId: command.playerId,
          dropId: command.dropId,
          itemId: command.itemId,
        });
        return;
      case 'INTERACT_OBJECT':
        this.options.findInteractableObjectByStateId(command.objectId)?.interact();
        return;
      case 'INTERACT_ENTITY':
        if (command.entityKind === 'npc') this.options.onNpcInteract();
        return;
      case 'NONE':
        return;
    }
  }

  dropHeldItem(): void {
    const player = this.options.player();
    if (!player?.heldItemId) return;
    const step = 24;
    const dir = player.facing ?? 'down';
    const x = player.sprite.x + (dir === 'left' ? -step : dir === 'right' ? step : 0);
    const y = player.sprite.y + (dir === 'up' ? -step : dir === 'down' ? step : 0);
    const result = this.options.dispatchWorldAction({
      type: 'DROP_ITEM',
      actorId: 'player',
      itemId: player.heldItemId,
      x,
      y,
    });
    if (!result.ok) return;
    gameBus.emit('player:consume_item', { itemId: player.heldItemId, qty: 1 });
  }

  spawnWorldItem(x: number, y: number, itemId: string, source: WorldSyncSource = 'server'): void {
    this.options.dispatchWorldAction({
      type: 'DROP_ITEM',
      actorId: 'system',
      itemId,
      x,
      y,
    }, source);
  }

  dropPlayerItem(itemId: string): void {
    const player = this.options.player();
    if (!player) return;
    this.options.dispatchWorldAction({
      type: 'DROP_ITEM',
      actorId: 'player',
      itemId,
      x: player.sprite.x + 22,
      y: player.sprite.y,
    });
  }

  claimWorldItem(itemId: string, actorId: string): boolean {
    const player = this.options.player();
    const drop = player
      ? this.options.findDropByItemAndPosition(itemId, player.sprite.x, player.sprite.y)
      : null;
    const dropId = drop?.__worldStateId;
    if (!dropId) return false;
    return this.options.dispatchWorldAction({
      type: 'PICKUP_DROP',
      actorId,
      dropId,
      itemId,
    }).ok;
  }

  dropWorldItem(x: number, y: number, itemId: string, actorId: string): boolean {
    return this.options.dispatchWorldAction({
      type: 'DROP_ITEM',
      actorId,
      itemId,
      x,
      y,
    }).ok;
  }

  applyRemoteEvent(type: string, payload: Record<string, unknown>): void {
    switch (type) {
      case 'player_move':
        this.options.applyRemotePlayerMove({
          x: payload.x as number,
          y: payload.y as number,
          facing: payload.facing as Direction,
          velX: payload.velX as number,
          velY: payload.velY as number,
        });
        return;
      case 'item_spawn':
        this.options.dispatchWorldAction({
          type: 'DROP_ITEM',
          actorId: 'remote-player',
          itemId: payload.itemId as string,
          x: payload.x as number,
          y: payload.y as number,
        }, 'room');
        return;
      case 'item_claim': {
        const drop = this.options.findDropByItemAndPosition(
          payload.itemId as string,
          payload.x as number,
          payload.y as number,
        );
        const dropId = drop?.__worldStateId;
        if (!dropId) return;
        this.options.dispatchWorldAction({
          type: 'PICKUP_DROP',
          actorId: 'remote-player',
          dropId,
          itemId: payload.itemId as string,
        }, 'room');
        return;
      }
      case 'tree_chop':
        this.options.dispatchWorldAction({
          type: 'CHOP_TREE',
          actorId: 'remote-player',
          treeId: payload.treeId as string,
        }, 'room');
        return;
      case 'player_sleep':
        this.options.onRemoteSleepChange(
          (payload.peerId ?? 'remote') as string,
          payload.sleeping as boolean,
        );
        return;
      case 'farm_till':
      case 'farm_water':
      case 'farm_plant':
      case 'farm_harvest':
      case 'farm_tick':
        this.options.applyRemoteFarmEvent(type, payload);
        return;
      default:
        return;
    }
  }

  getWorldSnapshot(): WorldSnapshot {
    return this.options.getWorldSnapshot();
  }

  applyWorldSnapshot(snapshot: Pick<WorldSnapshot, 'choppedTreeIds' | 'worldItems' | 'farmTiles'>): void {
    this.options.applyWorldSnapshot(snapshot);
  }
}
