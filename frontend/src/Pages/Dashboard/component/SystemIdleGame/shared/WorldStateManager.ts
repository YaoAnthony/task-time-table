import type {
  ChickenState,
  CropState,
  DropState,
  EntityState,
  NpcMindState,
  NestState,
  ObjectState,
  TileCell,
  TreeState,
  WorldMetaState,
  WorldState,
} from './worldStateTypes';
import { StateBackedWorldGrid } from './StateBackedWorldGrid';

interface WithPosition {
  id: string;
  x: number;
  y: number;
}

/**
 * Thin state manager for the unified world model.
 *
 * This is intentionally small and compatibility-first:
 * - WorldGrid still serves pathfinding/collision duties
 * - WorldStateManager tracks logical registration/query/movement
 * - existing Phaser entities can be migrated gradually
 */
export class WorldStateManager {
  private readonly grid: StateBackedWorldGrid;
  private readonly state: WorldState;

  constructor(grid: StateBackedWorldGrid) {
    this.grid = grid;
    this.state = {
      grid: { cols: grid.cols, rows: grid.rows },
      entities: {},
      objects: {},
      drops: {},
      crops: {},
      chickens: {},
      trees: {},
      nests: {},
      npcMinds: {},
      meta: {
        tick: 0,
        dayTime: '06:00',
        version: 0,
      },
    };
  }

  initialize(meta?: Partial<WorldMetaState>): void {
    this.state.meta = {
      ...this.state.meta,
      ...meta,
    };
  }

  setMeta(patch: Partial<WorldMetaState>): void {
    this.state.meta = {
      ...this.state.meta,
      ...patch,
    };
  }

  registerEntity(entity: Omit<EntityState, 'cellX' | 'cellY'>): EntityState {
    if (this.state.entities[entity.id]) {
      this.unregisterEntity(entity.id);
    }
    const { col, row } = this.grid.worldToCell(entity.x, entity.y);
    const next: EntityState = { ...entity, cellX: col, cellY: row };
    this.state.entities[next.id] = next;
    this.grid.addEntityToCell(col, row, next.id);
    return next;
  }

  unregisterEntity(entityId: string): void {
    const current = this.state.entities[entityId];
    if (!current) return;
    this.grid.removeEntityFromCell(current.cellX, current.cellY, entityId);
    delete this.state.entities[entityId];
  }

  updateEntityPosition(entityId: string, x: number, y: number): void {
    const current = this.state.entities[entityId];
    if (!current) return;
    const nextCell = this.grid.worldToCell(x, y);
    if (current.cellX !== nextCell.col || current.cellY !== nextCell.row) {
      this.grid.removeEntityFromCell(current.cellX, current.cellY, entityId);
      this.grid.addEntityToCell(nextCell.col, nextCell.row, entityId);
      current.cellX = nextCell.col;
      current.cellY = nextCell.row;
    }
    current.x = x;
    current.y = y;
  }

  patchEntity(entityId: string, patch: Partial<Omit<EntityState, 'id'>>): void {
    const current = this.state.entities[entityId];
    if (!current) return;
    Object.assign(current, patch);
  }

  registerObject(object: Omit<ObjectState, 'cellX' | 'cellY'>): ObjectState {
    if (this.state.objects[object.id]) {
      this.unregisterObject(object.id);
    }
    const { col, row } = this.grid.worldToCell(object.x, object.y);
    const next: ObjectState = { ...object, cellX: col, cellY: row };
    this.state.objects[next.id] = next;
    this.grid.setObjectOnCell(col, row, { id: next.id, kind: next.kind }, {
      interactable: Boolean(next.interactable),
      walkable: !next.blocking,
      transparent: true,
    });
    return next;
  }

  unregisterObject(objectId: string): void {
    const current = this.state.objects[objectId];
    if (!current) return;
    this.grid.clearObjectOnCell(current.cellX, current.cellY, objectId);
    delete this.state.objects[objectId];
  }

  patchObject(objectId: string, patch: Partial<Omit<ObjectState, 'id'>>): void {
    const current = this.state.objects[objectId];
    if (!current) return;
    Object.assign(current, patch);
    this.grid.setObjectOnCell(current.cellX, current.cellY, { id: current.id, kind: current.kind }, {
      interactable: Boolean(current.interactable),
      walkable: !current.blocking,
      transparent: true,
    });
  }

  registerDrop(drop: Omit<DropState, 'cellX' | 'cellY'>): DropState {
    if (this.state.drops[drop.id]) {
      this.unregisterDrop(drop.id);
    }
    const { col, row } = this.grid.worldToCell(drop.x, drop.y);
    const next: DropState = { ...drop, cellX: col, cellY: row };
    this.state.drops[next.id] = next;
    this.grid.addDropToCell(col, row, next.id);
    return next;
  }

  unregisterDrop(dropId: string): void {
    const current = this.state.drops[dropId];
    if (!current) return;
    this.grid.removeDropFromCell(current.cellX, current.cellY, dropId);
    delete this.state.drops[dropId];
  }

  updateDropPosition(dropId: string, x: number, y: number): void {
    const current = this.state.drops[dropId];
    if (!current) return;
    const nextCell = this.grid.worldToCell(x, y);
    if (current.cellX !== nextCell.col || current.cellY !== nextCell.row) {
      this.grid.removeDropFromCell(current.cellX, current.cellY, dropId);
      this.grid.addDropToCell(nextCell.col, nextCell.row, dropId);
      current.cellX = nextCell.col;
      current.cellY = nextCell.row;
    }
    current.x = x;
    current.y = y;
  }

  patchDrop(dropId: string, patch: Partial<Omit<DropState, 'id'>>): void {
    const current = this.state.drops[dropId];
    if (!current) return;
    Object.assign(current, patch);
  }

  registerCrop(crop: CropState): CropState {
    if (this.state.crops[crop.id]) {
      this.unregisterCrop(crop.id);
    }
    this.state.crops[crop.id] = crop;
    this.grid.setCropOnCell(crop.tx, crop.ty, crop);
    return crop;
  }

  unregisterCrop(cropId: string): void {
    const current = this.state.crops[cropId];
    if (!current) return;
    this.grid.clearCropOnCell(current.tx, current.ty, cropId);
    delete this.state.crops[cropId];
  }

  patchCrop(cropId: string, patch: Partial<Omit<CropState, 'id'>>): void {
    const current = this.state.crops[cropId];
    if (!current) return;
    Object.assign(current, patch);
    this.grid.setCropOnCell(current.tx, current.ty, current);
  }

  registerChickenState(chicken: Omit<ChickenState, 'cellX' | 'cellY'>): ChickenState {
    if (this.state.chickens[chicken.id]) {
      this.unregisterChickenState(chicken.id);
    }
    const { col, row } = this.grid.worldToCell(chicken.x, chicken.y);
    const next: ChickenState = { ...chicken, cellX: col, cellY: row };
    this.state.chickens[next.id] = next;
    this.registerEntity({
      id: next.id,
      kind: 'chicken',
      x: next.x,
      y: next.y,
      facing: next.facing,
      state: next.state,
      meta: {
        ...(next.meta ?? {}),
        interactable: false,
      },
    });
    return next;
  }

  unregisterChickenState(chickenId: string): void {
    const current = this.state.chickens[chickenId];
    if (!current) return;
    delete this.state.chickens[chickenId];
    this.unregisterEntity(chickenId);
  }

  updateChickenPosition(chickenId: string, x: number, y: number): void {
    const current = this.state.chickens[chickenId];
    if (!current) return;
    const nextCell = this.grid.worldToCell(x, y);
    current.x = x;
    current.y = y;
    current.cellX = nextCell.col;
    current.cellY = nextCell.row;
    this.updateEntityPosition(chickenId, x, y);
  }

  patchChickenState(chickenId: string, patch: Partial<Omit<ChickenState, 'id'>>): void {
    const current = this.state.chickens[chickenId];
    if (!current) return;
    Object.assign(current, patch);
    this.patchEntity(chickenId, {
      x: current.x,
      y: current.y,
      facing: current.facing,
      state: current.state,
      meta: {
        ...(current.meta ?? {}),
        interactable: false,
      },
    });
  }

  registerTreeState(tree: Omit<TreeState, 'cellX' | 'cellY'>): TreeState {
    if (this.state.trees[tree.id]) {
      this.unregisterTreeState(tree.id);
    }
    const { col, row } = this.grid.worldToCell(tree.x, tree.y);
    const next: TreeState = { ...tree, cellX: col, cellY: row };
    this.state.trees[next.id] = next;
    this.registerObject({
      id: next.id,
      kind: 'tree',
      x: next.x,
      y: next.y,
      blocking: !next.isChopped,
      interactable: !next.isChopped,
      state: next.stage,
      meta: {
        ...(next.meta ?? {}),
        hasFruit: next.hasFruit,
        isChopped: next.isChopped,
      },
    });
    return next;
  }

  unregisterTreeState(treeId: string): void {
    const current = this.state.trees[treeId];
    if (!current) return;
    delete this.state.trees[treeId];
    this.unregisterObject(treeId);
  }

  patchTreeState(treeId: string, patch: Partial<Omit<TreeState, 'id'>>): void {
    const current = this.state.trees[treeId];
    if (!current) return;
    Object.assign(current, patch);
    this.patchObject(treeId, {
      x: current.x,
      y: current.y,
      blocking: !current.isChopped,
      interactable: !current.isChopped,
      state: current.stage,
      meta: {
        ...(current.meta ?? {}),
        hasFruit: current.hasFruit,
        isChopped: current.isChopped,
      },
    });
  }

  registerNestState(nest: Omit<NestState, 'cellX' | 'cellY'>): NestState {
    if (this.state.nests[nest.id]) {
      this.unregisterNestState(nest.id);
    }
    const { col, row } = this.grid.worldToCell(nest.x, nest.y);
    const next: NestState = { ...nest, cellX: col, cellY: row };
    this.state.nests[next.id] = next;
    this.registerObject({
      id: next.id,
      kind: 'nest',
      x: next.x,
      y: next.y,
      interactable: !next.removed && next.state !== 'occupied',
      blocking: false,
      state: next.state,
      meta: {
        ...(next.meta ?? {}),
        hasEgg: next.hasEgg,
        occupiedByChickenId: next.occupiedByChickenId,
        removed: next.removed,
      },
    });
    return next;
  }

  unregisterNestState(nestId: string): void {
    const current = this.state.nests[nestId];
    if (!current) return;
    delete this.state.nests[nestId];
    this.unregisterObject(nestId);
  }

  patchNestState(nestId: string, patch: Partial<Omit<NestState, 'id'>>): void {
    const current = this.state.nests[nestId];
    if (!current) return;
    Object.assign(current, patch);
    this.patchObject(nestId, {
      x: current.x,
      y: current.y,
      interactable: !current.removed && current.state !== 'occupied',
      blocking: false,
      state: current.state,
      meta: {
        ...(current.meta ?? {}),
        hasEgg: current.hasEgg,
        occupiedByChickenId: current.occupiedByChickenId,
        removed: current.removed,
      },
    });
  }

  registerNpcMindState(npcMind: NpcMindState): NpcMindState {
    this.state.npcMinds[npcMind.npcId] = npcMind;
    return npcMind;
  }

  patchNpcMindState(npcId: string, patch: Partial<Omit<NpcMindState, 'npcId'>>): void {
    const current = this.state.npcMinds[npcId];
    if (!current) return;
    Object.assign(current, patch);
  }

  getNpcMindState(npcId: string): NpcMindState | null {
    return this.state.npcMinds[npcId] ?? null;
  }

  getNpcMindStates(): NpcMindState[] {
    return Object.values(this.state.npcMinds);
  }

  getState(): Readonly<WorldState> {
    return this.state;
  }

  getCell(x: number, y: number): TileCell | null {
    return this.grid.getCell(x, y);
  }

  getEntity(id: string): EntityState | null {
    return this.state.entities[id] ?? null;
  }

  getObject(id: string): ObjectState | null {
    return this.state.objects[id] ?? null;
  }

  getDrop(id: string): DropState | null {
    return this.state.drops[id] ?? null;
  }

  getCrop(id: string): CropState | null {
    return this.state.crops[id] ?? null;
  }

  getChickenState(id: string): ChickenState | null {
    return this.state.chickens[id] ?? null;
  }

  getTreeState(id: string): TreeState | null {
    return this.state.trees[id] ?? null;
  }

  getNestState(id: string): NestState | null {
    return this.state.nests[id] ?? null;
  }

  getChickenStates(): ChickenState[] {
    return Object.values(this.state.chickens);
  }

  getTreeStates(): TreeState[] {
    return Object.values(this.state.trees);
  }

  getNestStates(): NestState[] {
    return Object.values(this.state.nests);
  }

  getEntitiesInCell(x: number, y: number): EntityState[] {
    const ids = this.grid.getCell(x, y)?.entityIds ?? [];
    return ids.map(id => this.state.entities[id]).filter(Boolean);
  }

  getDropsInCell(x: number, y: number): DropState[] {
    const ids = this.grid.getCell(x, y)?.dropIds ?? [];
    return ids.map(id => this.state.drops[id]).filter(Boolean);
  }

  getReadonlySnapshot(): Readonly<WorldState> {
    return this.state;
  }

  syncEntity(entity: WithPosition): void {
    if (!this.state.entities[entity.id]) return;
    this.updateEntityPosition(entity.id, entity.x, entity.y);
  }
}
