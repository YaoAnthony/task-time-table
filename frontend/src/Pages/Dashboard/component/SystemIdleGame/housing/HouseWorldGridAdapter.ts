import type { HouseDefinition, HouseInstanceSave } from './HouseTypes';
import { ObjectType } from '../shared/WorldGrid';

export class HouseWorldGridAdapter {
  private readonly scene: any;
  private readonly blockedCells = new Map<string, Array<{ col: number; row: number }>>();

  constructor(scene: any) {
    this.scene = scene;
  }

  blockHouse(house: HouseInstanceSave, definition: HouseDefinition): void {
    this.clearHouse(house.id);
    const cells: Array<{ col: number; row: number }> = [];
    for (const box of definition.collisionBoxes) {
      const left = house.x + box.x;
      const top = house.y + box.y;
      const right = left + box.w;
      const bottom = top + box.h;
      const start = this.scene.worldGrid.worldToCell(left, top);
      const end = this.scene.worldGrid.worldToCell(right, bottom);
      for (let row = start.row; row <= end.row; row += 1) {
        for (let col = start.col; col <= end.col; col += 1) {
          const cell = this.scene.worldGrid.getCell?.(col, row);
          if (!cell) continue;
          this.scene.worldGrid.setCell?.(col, row, {
            objectId: house.id,
            flags: {
              walkable: false,
              transparent: true,
              interactable: true,
            },
          });
          this.scene.worldGrid.setObject?.(col, row, ObjectType.ROCK);
          cells.push({ col, row });
        }
      }
    }
    this.blockedCells.set(house.id, cells);
  }

  clearHouse(houseId: string): void {
    const cells = this.blockedCells.get(houseId) || [];
    for (const { col, row } of cells) {
      this.scene.worldGrid.clearObjectOnCell?.(col, row, houseId);
    }
    this.blockedCells.delete(houseId);
  }

  isPlacementClear(definition: HouseDefinition, x: number, y: number): boolean {
    for (const box of definition.collisionBoxes) {
      const left = x + box.x;
      const top = y + box.y;
      const right = left + box.w;
      const bottom = top + box.h;
      const start = this.scene.worldGrid.worldToCell(left, top);
      const end = this.scene.worldGrid.worldToCell(right, bottom);
      for (let row = start.row; row <= end.row; row += 1) {
        for (let col = start.col; col <= end.col; col += 1) {
          const cell = this.scene.worldGrid.getCell?.(col, row);
          if (!cell) return false;
          const blockedTerrain = cell.terrain === 'water' || cell.terrain === 'pond' || cell.terrain === 'border';
          if (blockedTerrain || cell.objectId || cell.cropId || (cell.entityIds?.length || 0) > 0) {
            return false;
          }
        }
      }
    }
    const door = this.scene.worldGrid.worldToCell(x + definition.doorOffset.x, y + definition.doorOffset.y + 32);
    const doorCell = this.scene.worldGrid.getCell?.(door.col, door.row);
    return Boolean(doorCell && doorCell.flags?.walkable !== false && !doorCell.objectId);
  }
}
