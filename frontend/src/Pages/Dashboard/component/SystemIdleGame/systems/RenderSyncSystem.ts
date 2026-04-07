import Phaser from 'phaser';
import type { FacingDirection, GameChest } from '../../../../../Types/Profile';
import type { Direction } from '../types';
import { Bed, type BedColor } from '../entities/Bed';
import { ChickenView } from '../entities/ChickenView';
import { Chest } from '../entities/Chest';
import { DropItem } from '../entities/DropItem';
import { NestView } from '../entities/NestView';
import { RemotePlayer } from '../entities/RemotePlayer';
import type { Npc } from '../entities/Npc';
import type { Player } from '../entities/Player';
import { TreeView } from '../entities/TreeView';
import type { WorldStateManager } from '../shared/WorldStateManager';
import type { WorldSnapshot } from './MultiplaySystem';
import type { DayCycle } from './DayCycle';
import type { Pathfinder } from './Pathfinder';
import type { SleepManager } from './SleepManager';

interface RenderSyncCallbacks {
  registerInteractable: (obj: { interact(): void; isNearPlayer(px: number, py: number, radius?: number): boolean }) => void;
  unregisterInteractable: (obj: { interact(): void; isNearPlayer(px: number, py: number, radius?: number): boolean }) => void;
  registerDropState: (drop: DropItem) => void;
  unregisterDropState: (drop: DropItem) => void;
  registerBedObject: (bed: Bed) => void;
  unregisterRuntimeObject: (target: object | null | undefined) => void;
  registerWorldObject: (
    id: string,
    kind: 'chest' | 'bed' | 'nest' | 'tree',
    x: number,
    y: number,
    opts?: { blocking?: boolean; interactable?: boolean; state?: string; meta?: Record<string, unknown> },
  ) => void;
}

/**
 * RenderSyncSystem keeps Phaser view creation/destruction and world->view sync
 * out of GameScene. It is still a compatibility layer, not a new truth source.
 */
export class RenderSyncSystem {
  constructor(
    private readonly scene: Phaser.Scene,
    private readonly worldStateManager: WorldStateManager,
    private readonly callbacks: RenderSyncCallbacks,
    private readonly chests: Map<string, Chest>,
    private readonly drops: DropItem[],
  ) {}

  registerCoreWorldEntities(player: Player, npc: Npc, extraNpcs: Npc[]): void {
    this.worldStateManager.registerEntity({
      id: 'player',
      kind: 'player',
      x: player.sprite.x,
      y: player.sprite.y,
      facing: player.facing as FacingDirection,
      meta: { interactable: false },
    });
    this.worldStateManager.registerEntity({
      id: npc.name,
      kind: 'npc',
      x: npc.sprite.x,
      y: npc.sprite.y,
      displayName: npc.name,
      meta: { interactable: false },
    });
    extraNpcs.forEach((entry, index) => {
      this.worldStateManager.registerEntity({
        id: `npc-extra-${index}`,
        kind: 'npc',
        x: entry.sprite.x,
        y: entry.sprite.y,
        displayName: entry.name,
        meta: { interactable: false },
      });
    });
  }

  syncWorldStateMeta(gameTick: number, timeStr: string): void {
    this.worldStateManager.setMeta({
      tick: gameTick,
      dayTime: timeStr,
      version: (this.worldStateManager.getState().meta.version ?? 0) + 1,
    });
  }

  syncDynamicEntityStates(params: {
    player: Player;
    npc: Npc;
    extraNpcs: Npc[];
    chickens: ChickenView[];
    remotePlayer: RemotePlayer | null;
  }): void {
    const {
      player,
      npc,
      extraNpcs,
      chickens,
      remotePlayer,
    } = params;

    this.worldStateManager.syncEntity({
      id: 'player',
      x: player.sprite.x,
      y: player.sprite.y,
    });
    this.worldStateManager.patchEntity('player', {
      facing: player.facing,
    });

    this.worldStateManager.syncEntity({
      id: npc.name,
      x: npc.sprite.x,
      y: npc.sprite.y,
    });

    extraNpcs.forEach((entry, index) => {
      this.worldStateManager.syncEntity({
        id: `npc-extra-${index}`,
        x: entry.sprite.x,
        y: entry.sprite.y,
      });
    });

    chickens.forEach((chicken) => {
      const sprite = chicken.sprite;
      if (!sprite) return;
      if (!this.worldStateManager.getEntity(chicken.id)) {
        this.worldStateManager.registerEntity({
          id: chicken.id,
          kind: 'chicken',
          x: sprite.x,
          y: sprite.y,
          meta: { interactable: false },
        });
      } else {
        this.worldStateManager.syncEntity({
          id: chicken.id,
          x: sprite.x,
          y: sprite.y,
        });
      }
      const chickenState = this.worldStateManager.getChickenState(chicken.id);
      if (chickenState) {
        this.worldStateManager.patchChickenState(chicken.id, {
          facing: chickenState.facing,
        });
      }
    });

    if (remotePlayer?.sprite) {
      if (!this.worldStateManager.getEntity('remote-player')) {
        this.worldStateManager.registerEntity({
          id: 'remote-player',
          kind: 'remote_player',
          x: remotePlayer.sprite.x,
          y: remotePlayer.sprite.y,
          meta: { interactable: false },
        });
      } else {
        this.worldStateManager.syncEntity({
          id: 'remote-player',
          x: remotePlayer.sprite.x,
          y: remotePlayer.sprite.y,
        });
      }
    }
  }

  loadChests(chests: GameChest[]): void {
    chests.forEach((chest) => this.addChest(chest));
  }

  addChest(data: GameChest): void {
    if (this.chests.has(data.id)) return;
    const chest = new Chest(this.scene, data.x, data.y, data.id, data.rewards);
    this.chests.set(data.id, chest);
    this.callbacks.registerInteractable(chest);
    this.callbacks.registerWorldObject(data.id, 'chest', data.x, data.y, {
      blocking: true,
      interactable: true,
    });
  }

  removeChest(id: string): void {
    const chest = this.chests.get(id);
    if (!chest) return;
    this.callbacks.unregisterInteractable(chest);
    this.worldStateManager.unregisterObject(id);
    chest.destroy();
    this.chests.delete(id);
  }

  spawnDrop(x: number, y: number, itemId: string): DropItem {
    const drop = new DropItem(this.scene, x, y, itemId);
    this.drops.push(drop);
    this.callbacks.registerDropState(drop);
    return drop;
  }

  clearAllDrops(): void {
    for (const drop of this.drops) {
      this.callbacks.unregisterDropState(drop);
      drop.destroy();
    }
    this.drops.length = 0;
  }

  spawnRemotePlayer(
    current: RemotePlayer | null,
    x: number,
    y: number,
    displayName: string,
  ): RemotePlayer {
    current?.destroy();
    const remotePlayer = new RemotePlayer(this.scene, x, y, displayName);
    this.worldStateManager.registerEntity({
      id: 'remote-player',
      kind: 'remote_player',
      x,
      y,
      displayName,
      meta: { interactable: false },
    });
    return remotePlayer;
  }

  removeRemotePlayer(current: RemotePlayer | null): null {
    current?.destroy();
    this.worldStateManager.unregisterEntity('remote-player');
    return null;
  }

  applyWorldSnapshot(snapshot: Pick<WorldSnapshot, 'choppedTreeIds' | 'worldItems'>, trees: Map<string, TreeView>): void {
    snapshot.choppedTreeIds.forEach((treeId) => {
      trees.get(treeId)?.chop();
    });
    this.clearAllDrops();
    snapshot.worldItems.forEach(({ itemId, x, y }) => {
      this.spawnDrop(x, y, itemId);
    });
  }

  applyRemotePlayerMove(
    remotePlayer: RemotePlayer | null,
    payload: { x: number; y: number; facing: Direction; velX: number; velY: number },
  ): void {
    remotePlayer?.moveTo(payload.x, payload.y, payload.facing, payload.velX, payload.velY);
  }

  createBed(
    x: number,
    y: number,
    color: BedColor,
    beds: Bed[],
    sleepManager: SleepManager,
    dayCycle: DayCycle,
  ): Bed {
    const bed = new Bed(this.scene, x, y, color, sleepManager, dayCycle);
    beds.push(bed);
    this.callbacks.registerInteractable(bed);
    this.callbacks.registerBedObject(bed);
    return bed;
  }

  destroyBed(bed: Bed, beds: Bed[]): void {
    const index = beds.indexOf(bed);
    if (index >= 0) beds.splice(index, 1);
    this.callbacks.unregisterInteractable(bed);
    this.callbacks.unregisterRuntimeObject(bed);
    bed.destroy();
  }

  unregisterBed(bed: Bed, beds: Bed[]): void {
    const index = beds.indexOf(bed);
    if (index >= 0) beds.splice(index, 1);
    this.callbacks.unregisterInteractable(bed);
    this.callbacks.unregisterRuntimeObject(bed);
  }

  clearBeds(beds: Bed[]): void {
    [...beds].forEach((bed) => this.destroyBed(bed, beds));
  }

  spawnChicken(
    group: Phaser.Physics.Arcade.Group,
    pathfinder: Pathfinder,
    id: string,
    x: number,
    y: number,
    chickens: ChickenView[],
  ): ChickenView {
    const chicken = new ChickenView(group, id, x, y, pathfinder);
    chickens.push(chicken);
    return chicken;
  }

  createNest(
    id: string,
    x: number,
    y: number,
    nests: NestView[],
    callbacks: {
      getState: (id: string) => any;
      onInteract: (id: string) => void;
    },
  ): NestView {
    const nest = new NestView(this.scene, id, x, y, callbacks);
    nests.push(nest);
    this.callbacks.registerInteractable(nest);
    return nest;
  }

  createTree(
    id: string,
    x: number,
    y: number,
    trees: Map<string, TreeView>,
    callbacks: {
      getState: (id: string) => any;
      onInteract: (id: string) => void;
      onChop: (id: string) => void;
    },
    obstacles?: Phaser.Physics.Arcade.StaticGroup,
  ): TreeView {
    const tree = new TreeView(this.scene, x, y, id, callbacks, obstacles);
    trees.set(tree.id, tree);
    this.callbacks.registerInteractable(tree);
    return tree;
  }
}
