import type { GameSaveV1 } from '../persistence/save/GameSaveTypes';
import { gameBus } from '../shared/EventBus';
import { getStorageChestDefinitionByItemId } from './StorageChestCatalog';
import { StorageChestView } from './StorageChestView';
import { cloneStorageChestSave, type StorageChestSave } from './StorageChestTypes';

export class StorageChestSystem {
  private readonly views = new Map<string, StorageChestView>();

  constructor(private readonly scene: any) {}

  previewTarget(): { x: number; y: number } | null {
    const player = this.scene.player;
    if (!player?.sprite) return null;
    const facing = (player.facing || 'down') as 'up' | 'down' | 'left' | 'right';
    const offsets: Record<typeof facing, { x: number; y: number }> = {
      up: { x: 0, y: -36 },
      down: { x: 0, y: 36 },
      left: { x: -36, y: 0 },
      right: { x: 36, y: 0 },
    };
    const offset = offsets[facing] || offsets.down;
    return { x: player.sprite.x + offset.x, y: player.sprite.y + offset.y };
  }

  requestPlacement(itemId = 'storage_chest_basic'): boolean {
    const definition = getStorageChestDefinitionByItemId(itemId);
    const target = this.previewTarget();
    if (!definition || !target) return false;
    if (!this.canPlace(target.x, target.y)) {
      this.scene.ui?.toast?.('Cannot place storage chest here.');
      return false;
    }

    gameBus.emit('game:storage_chest_place_requested', {
      itemId,
      x: target.x,
      y: target.y,
      roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
      placementProof: {
        requestedAtTick: this.scene.dayCycle?.gameTick ?? 0,
        footprint: {
          x: target.x - definition.footprint.w / 2,
          y: target.y - definition.footprint.h / 2,
          w: definition.footprint.w,
          h: definition.footprint.h,
        },
      },
    });
    return true;
  }

  loadFromGameSave(gameSave: GameSaveV1 | null | undefined): void {
    const chests = gameSave?.worldStatus?.entities?.storageChests || [];
    const nextIds = new Set(chests.map((chest) => chest.id));
    for (const id of this.views.keys()) {
      if (nextIds.has(id)) continue;
      this.remove(id);
    }
    chests.forEach((chest) => this.upsert(chest));
  }

  exportSaveData(): StorageChestSave[] {
    return Array.from(this.views.values()).map((view) => view.data);
  }

  getView(id: string): StorageChestView | null {
    return this.views.get(id) ?? null;
  }

  upsert(chest: StorageChestSave): StorageChestView {
    const next = cloneStorageChestSave(chest);
    let view = this.views.get(next.id);
    if (!view) {
      view = new StorageChestView(this.scene, next);
      this.views.set(next.id, view);
      this.scene.registerInteractable?.(view);
    } else {
      view.updateChest(next);
    }
    this.syncWorldObject(next);
    return view;
  }

  remove(id: string): void {
    const view = this.views.get(id);
    if (!view) return;
    this.scene.unregisterInteractable?.(view);
    this.scene.worldStateManager?.unregisterObject(id);
    view.destroy();
    this.views.delete(id);
  }

  private syncWorldObject(chest: StorageChestSave): void {
    this.scene.registerWorldObject?.(chest.id, 'storage_chest', chest.x, chest.y, {
      blocking: true,
      interactable: true,
      state: 'closed',
      meta: {
        definitionId: chest.definitionId,
        label: 'Storage Chest',
        capacity: chest.capacity,
        usedSlots: chest.slots.filter(Boolean).length,
        ownerName: chest.ownerName,
        affordances: ['inspect_storage', 'open_storage'],
      },
    });
  }

  private canPlace(x: number, y: number): boolean {
    const cell = this.scene.worldGrid?.worldToCell?.(x, y);
    if (!cell) return false;
    const stateCell = this.scene.worldGrid?.getCell?.(cell.col, cell.row);
    if (!stateCell) return false;
    const blockedTerrain = stateCell.terrain === 'water' || stateCell.terrain === 'border' || stateCell.terrain === 'pond';
    const occupiedByEntity = stateCell.entityIds.some((entityId: string) => entityId !== 'player');
    return !blockedTerrain && !stateCell.objectId && !stateCell.cropId && !occupiedByEntity;
  }
}
