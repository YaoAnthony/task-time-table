import { CHEST_INTERACT_RADIUS, NEST_INTERACT_RADIUS } from '../constants';
import { ITEM_DEF_MAP } from '../entities/DropItem';
import { StateBackedWorldGrid } from '../shared/StateBackedWorldGrid';
import { WorldStateManager } from '../shared/WorldStateManager';
import type {
  EntityState,
  ObjectState,
  WorldEntityKind,
  WorldObjectKind,
} from '../shared/worldStateTypes';
import type { Direction } from '../types';

const PICKUP_RADIUS = 44;
const TREE_INTERACT_RADIUS = 72;
const BED_INTERACT_RADIUS = 48;
const DEFAULT_OBJECT_RADIUS = 56;

export type InteractionCommand =
  | {
      type: 'PLACE_OBJECT';
      playerId: string;
      itemId: string;
      placeEntity?: 'bed' | 'nest';
      targetCell: { col: number; row: number };
      targetWorld: { x: number; y: number };
    }
  | {
      type: 'HARVEST_CROP';
      playerId: string;
      cropId: string;
      tx: number;
      ty: number;
    }
  | {
      type: 'PICKUP_DROP';
      playerId: string;
      dropId: string;
      itemId: string;
    }
  | {
      type: 'INTERACT_OBJECT';
      playerId: string;
      objectId: string;
      objectKind: WorldObjectKind;
    }
  | {
      type: 'INTERACT_ENTITY';
      playerId: string;
      entityId: string;
      entityKind: WorldEntityKind;
    }
  | {
      type: 'NONE';
      playerId: string;
    };

interface ResolvePrimaryInteractionInput {
  playerId: string;
  heldItemId?: string;
  currentTool?: string;
}

export class InteractionSystem {
  constructor(
    private readonly worldState: WorldStateManager,
    private readonly worldGrid: StateBackedWorldGrid,
  ) {}

  resolvePrimaryInteraction(input: ResolvePrimaryInteractionInput): InteractionCommand {
    const player = this.worldState.getEntity(input.playerId);
    if (!player) {
      return { type: 'NONE', playerId: input.playerId };
    }

    const facing = (player.facing ?? 'down') as Direction;
    const originCell = { col: player.cellX, row: player.cellY };
    const targetCell = this.getFacingCell(originCell.col, originCell.row, facing);
    const nearbyCells = this.collectNearbyCells(originCell, targetCell);

    const placeCommand = this.resolvePlaceObject(input.playerId, input.heldItemId, targetCell);
    if (placeCommand) return placeCommand;

    const harvestCommand = this.resolveHarvestCrop(input.playerId, nearbyCells);
    if (harvestCommand) return harvestCommand;

    const pickupCommand = this.resolvePickupDrop(input.playerId, player, nearbyCells);
    if (pickupCommand) return pickupCommand;

    const objectCommand = this.resolveObjectInteraction(input.playerId, player, nearbyCells);
    if (objectCommand) return objectCommand;

    const entityCommand = this.resolveEntityInteraction(input.playerId, player, nearbyCells);
    if (entityCommand) return entityCommand;

    return { type: 'NONE', playerId: input.playerId };
  }

  private resolvePlaceObject(
    playerId: string,
    heldItemId: string | undefined,
    targetCell: { col: number; row: number },
  ): InteractionCommand | null {
    if (!heldItemId) return null;

    const def = ITEM_DEF_MAP.get(heldItemId);
    if (!def || def.itemType !== 'placeable') return null;

    const cell = this.worldGrid.getCell(targetCell.col, targetCell.row);
    if (!cell) return null;

    const occupiedByEntity = cell.entityIds.some((entityId) => entityId !== playerId);
    const blockedTerrain = cell.terrain === 'water' || cell.terrain === 'border' || cell.terrain === 'pond';
    if (blockedTerrain || cell.objectId || cell.cropId || occupiedByEntity) {
      return null;
    }

    const { cx, cy } = this.worldGrid.cellToWorld(targetCell.col, targetCell.row);
    return {
      type: 'PLACE_OBJECT',
      playerId,
      itemId: heldItemId,
      placeEntity: def.placeEntity,
      targetCell,
      targetWorld: { x: cx, y: cy },
    };
  }

  private resolveHarvestCrop(
    playerId: string,
    cells: Array<{ col: number; row: number }>,
  ): InteractionCommand | null {
    for (const cellPos of cells) {
      const cell = this.worldGrid.getCell(cellPos.col, cellPos.row);
      if (!cell?.cropId) continue;
      const crop = this.worldState.getCrop(cell.cropId);
      if (!crop || crop.state !== 'ready') continue;
      return {
        type: 'HARVEST_CROP',
        playerId,
        cropId: crop.id,
        tx: crop.tx,
        ty: crop.ty,
      };
    }
    return null;
  }

  private resolvePickupDrop(
    playerId: string,
    player: EntityState,
    cells: Array<{ col: number; row: number }>,
  ): InteractionCommand | null {
    let nearest: { id: string; itemId: string; distanceSq: number } | null = null;

    for (const cellPos of cells) {
      const cell = this.worldGrid.getCell(cellPos.col, cellPos.row);
      if (!cell) continue;
      for (const dropId of cell.dropIds) {
        const drop = this.worldState.getDrop(dropId);
        if (!drop || drop.claimed) continue;
        const dx = player.x - drop.x;
        const dy = player.y - drop.y;
        const distanceSq = dx * dx + dy * dy;
        if (distanceSq > PICKUP_RADIUS * PICKUP_RADIUS) continue;
        if (!nearest || distanceSq < nearest.distanceSq) {
          nearest = { id: drop.id, itemId: drop.itemId, distanceSq };
        }
      }
    }

    if (!nearest) return null;
    return {
      type: 'PICKUP_DROP',
      playerId,
      dropId: nearest.id,
      itemId: nearest.itemId,
    };
  }

  private resolveObjectInteraction(
    playerId: string,
    player: EntityState,
    cells: Array<{ col: number; row: number }>,
  ): InteractionCommand | null {
    const seen = new Set<string>();
    let nearest: { object: ObjectState; distanceSq: number } | null = null;

    for (const cellPos of cells) {
      const cell = this.worldGrid.getCell(cellPos.col, cellPos.row);
      if (!cell?.objectId || seen.has(cell.objectId)) continue;
      seen.add(cell.objectId);

      const object = this.worldState.getObject(cell.objectId);
      if (!object || !object.interactable) continue;

      const dx = player.x - object.x;
      const dy = player.y - object.y;
      const distanceSq = dx * dx + dy * dy;
      const radius = this.getObjectInteractRadius(object.kind);
      if (distanceSq > radius * radius) continue;

      if (!nearest || distanceSq < nearest.distanceSq) {
        nearest = { object, distanceSq };
      }
    }

    if (!nearest) return null;
    return {
      type: 'INTERACT_OBJECT',
      playerId,
      objectId: nearest.object.id,
      objectKind: nearest.object.kind,
    };
  }

  private resolveEntityInteraction(
    playerId: string,
    player: EntityState,
    cells: Array<{ col: number; row: number }>,
  ): InteractionCommand | null {
    const seen = new Set<string>();

    for (const cellPos of cells) {
      const cell = this.worldGrid.getCell(cellPos.col, cellPos.row);
      if (!cell) continue;
      for (const entityId of cell.entityIds) {
        if (entityId === playerId || seen.has(entityId)) continue;
        seen.add(entityId);
        const entity = this.worldState.getEntity(entityId);
        if (!entity || entity.meta?.interactable !== true) continue;

        const dx = player.x - entity.x;
        const dy = player.y - entity.y;
        if (dx * dx + dy * dy > DEFAULT_OBJECT_RADIUS * DEFAULT_OBJECT_RADIUS) continue;

        return {
          type: 'INTERACT_ENTITY',
          playerId,
          entityId: entity.id,
          entityKind: entity.kind,
        };
      }
    }

    return null;
  }

  private collectNearbyCells(
    originCell: { col: number; row: number },
    targetCell: { col: number; row: number },
  ): Array<{ col: number; row: number }> {
    const rawCells: Array<{ col: number; row: number }> = [
      targetCell,
      originCell,
      { col: originCell.col - 1, row: originCell.row },
      { col: originCell.col + 1, row: originCell.row },
      { col: originCell.col, row: originCell.row - 1 },
      { col: originCell.col, row: originCell.row + 1 },
      { col: originCell.col - 1, row: originCell.row - 1 },
      { col: originCell.col + 1, row: originCell.row - 1 },
      { col: originCell.col - 1, row: originCell.row + 1 },
      { col: originCell.col + 1, row: originCell.row + 1 },
      { col: targetCell.col - 1, row: targetCell.row },
      { col: targetCell.col + 1, row: targetCell.row },
      { col: targetCell.col, row: targetCell.row - 1 },
      { col: targetCell.col, row: targetCell.row + 1 },
      { col: targetCell.col - 1, row: targetCell.row - 1 },
      { col: targetCell.col + 1, row: targetCell.row - 1 },
      { col: targetCell.col - 1, row: targetCell.row + 1 },
      { col: targetCell.col + 1, row: targetCell.row + 1 },
    ];

    const deduped: Array<{ col: number; row: number }> = [];
    const seen = new Set<string>();

    for (const cell of rawCells) {
      if (!this.worldGrid.getCell(cell.col, cell.row)) continue;
      const key = `${cell.col},${cell.row}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(cell);
    }

    return deduped;
  }

  private getFacingCell(col: number, row: number, facing: Direction): { col: number; row: number } {
    switch (facing) {
      case 'up':
        return { col, row: row - 1 };
      case 'left':
        return { col: col - 1, row };
      case 'right':
        return { col: col + 1, row };
      case 'down':
      default:
        return { col, row: row + 1 };
    }
  }

  private getObjectInteractRadius(kind: WorldObjectKind): number {
    switch (kind) {
      case 'tree':
        return TREE_INTERACT_RADIUS;
      case 'chest':
        return CHEST_INTERACT_RADIUS;
      case 'nest':
        return NEST_INTERACT_RADIUS;
      case 'bed':
        return BED_INTERACT_RADIUS;
      default:
        return DEFAULT_OBJECT_RADIUS;
    }
  }
}
