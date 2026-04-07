import type { Direction } from '../types';
import { StateBackedWorldGrid } from '../shared/StateBackedWorldGrid';
import type { SpatialIndex } from '../shared/SpatialIndex';
import { WORLD_LOCATIONS } from '../shared/WorldLocations';
import { WorldStateManager } from '../shared/WorldStateManager';
import type {
  CropState,
  DropState,
  EntityState,
  ObjectState,
  WorldEntityKind,
  WorldObjectKind,
} from '../shared/worldStateTypes';

type PerceptionSource = 'world_state' | 'legacy_adapter' | 'derived';

export interface PerceptionVisibleTile {
  col: number;
  row: number;
  x: number;
  y: number;
  terrain: string;
  surface: string;
  moisture: string;
  distance: number;
}

export interface PerceivedObject {
  id: string;
  type: WorldObjectKind | 'berry_bush';
  x: number;
  y: number;
  distance: number;
  source: PerceptionSource;
  cellX?: number;
  cellY?: number;
  state?: string;
  interactable?: boolean;
  blocking?: boolean;
  meta?: Record<string, unknown>;
}

export interface PerceivedCrop {
  id: string;
  cropId: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  distance: number;
  state: CropState['state'];
  source: PerceptionSource;
  meta?: Record<string, unknown>;
}

export interface PerceivedDrop {
  id: string;
  itemId: string;
  x: number;
  y: number;
  distance: number;
  source: PerceptionSource;
  meta?: Record<string, unknown>;
}

export interface PerceivedEntity {
  id: string;
  type: WorldEntityKind;
  x: number;
  y: number;
  distance: number;
  source: PerceptionSource;
  facing?: Direction;
  displayName?: string;
  state?: string;
  meta?: Record<string, unknown>;
}

export interface PerceivedLandmark {
  kind: 'landmark' | 'house' | 'water' | 'farm' | 'pond';
  id?: string;
  label: string;
  x: number;
  y: number;
  distance: number;
  source: PerceptionSource;
}

export interface PerceptionNearest {
  tree?: PerceivedObject;
  water?: PerceivedWater;
  drop?: PerceivedDrop;
  landmark?: PerceivedLandmark;
  crop?: PerceivedCrop;
}

export type PerceivedWater = Pick<PerceptionVisibleTile, 'col' | 'row' | 'x' | 'y' | 'distance'>;

export interface PerceptionSummary {
  tileCount: number;
  objectCount: number;
  cropCount: number;
  dropCount: number;
  entityCount: number;
  landmarkCount: number;
}

export interface PerceptionResult {
  self: {
    entityId?: string;
    kind?: WorldEntityKind;
    x: number;
    y: number;
    facing?: Direction;
  };
  visibleTiles: PerceptionVisibleTile[];
  visibleObjects: PerceivedObject[];
  visibleCrops: PerceivedCrop[];
  visibleDrops: PerceivedDrop[];
  visibleEntities: PerceivedEntity[];
  landmarks: PerceivedLandmark[];
  nearest: PerceptionNearest;
  summary: PerceptionSummary;
}

export interface PerceiveAtInput {
  x: number;
  y: number;
  facing?: Direction;
  visionRange?: number;
  tileRange?: number;
  includeTiles?: boolean;
  entityId?: string;
  entityKind?: WorldEntityKind;
}

export interface LegacyPerceptionObject {
  id: string;
  type: PerceivedObject['type'];
  x: number;
  y: number;
  state?: string;
  interactable?: boolean;
  blocking?: boolean;
  meta?: Record<string, unknown>;
}

export interface LegacyPerceptionLandmark {
  kind: PerceivedLandmark['kind'];
  id?: string;
  label: string;
  x: number;
  y: number;
}

export interface PerceptionSystemOptions {
  worldStateManager: WorldStateManager;
  worldGrid: StateBackedWorldGrid;
  spatialIndex?: SpatialIndex;
  getLegacyObjects?: () => LegacyPerceptionObject[];
  getLegacyLandmarks?: () => LegacyPerceptionLandmark[];
}

const DEFAULT_VISION_RANGE = 350;
const DEFAULT_TILE_RANGE = 4;

function measureDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.hypot(x1 - x2, y1 - y2);
}

/**
 * Structured perception layer.
 *
 * This module reads world state and tile state first, then uses optional
 * legacy adapters for objects that have not migrated yet. It returns
 * structured data; prompt text formatting happens elsewhere.
 */
export class PerceptionSystem {
  private readonly worldStateManager: WorldStateManager;
  private readonly worldGrid: StateBackedWorldGrid;
  private readonly spatialIndex?: SpatialIndex;
  private readonly getLegacyObjects: () => LegacyPerceptionObject[];
  private readonly getLegacyLandmarks: () => LegacyPerceptionLandmark[];

  constructor(options: PerceptionSystemOptions) {
    this.worldStateManager = options.worldStateManager;
    this.worldGrid = options.worldGrid;
    this.spatialIndex = options.spatialIndex;
    this.getLegacyObjects = options.getLegacyObjects ?? (() => []);
    this.getLegacyLandmarks = options.getLegacyLandmarks ?? (() => []);
  }

  perceiveEntity(
    entityId: string,
    options?: Omit<PerceiveAtInput, 'x' | 'y' | 'facing' | 'entityId' | 'entityKind'>,
  ): PerceptionResult {
    const entity = this.worldStateManager.getEntity(entityId);
    if (!entity) {
      return this.perceiveAt({
        entityId,
        x: 0,
        y: 0,
        facing: 'down',
        visionRange: options?.visionRange,
        tileRange: options?.tileRange,
        includeTiles: options?.includeTiles,
      });
    }

    return this.perceiveAt({
      entityId: entity.id,
      entityKind: entity.kind,
      x: entity.x,
      y: entity.y,
      facing: entity.facing,
      visionRange: options?.visionRange,
      tileRange: options?.tileRange,
      includeTiles: options?.includeTiles,
    });
  }

  perceiveAt(input: PerceiveAtInput): PerceptionResult {
    const visionRange = input.visionRange ?? DEFAULT_VISION_RANGE;
    const tileRange = input.tileRange ?? DEFAULT_TILE_RANGE;
    const visibleTiles = input.includeTiles === false
      ? []
      : this.getVisibleTiles(input.x, input.y, visionRange, tileRange);
    const visibleObjects = this.getNearbyObjects({ x: input.x, y: input.y, radius: visionRange });
    const visibleDrops = this.getNearbyDrops({ x: input.x, y: input.y, radius: visionRange });
    const visibleEntities = this.getNearbyEntities({
      x: input.x,
      y: input.y,
      radius: visionRange,
      excludeIds: input.entityId ? [input.entityId] : [],
    });
    const visibleCrops = this.getNearbyCrops({ x: input.x, y: input.y, radius: visionRange });
    const landmarks = this.getNearbyLandmarks({ x: input.x, y: input.y, radius: visionRange });

    return {
      self: {
        entityId: input.entityId,
        kind: input.entityKind,
        x: input.x,
        y: input.y,
        facing: input.facing,
      },
      visibleTiles,
      visibleObjects,
      visibleCrops,
      visibleDrops,
      visibleEntities,
      landmarks,
      nearest: {
        tree: this.getNearestTree(input.x, input.y, visionRange, visibleObjects),
        water: this.getNearestWater(visibleTiles),
        drop: visibleDrops[0],
        landmark: landmarks[0],
        crop: visibleCrops[0],
      },
      summary: {
        tileCount: visibleTiles.length,
        objectCount: visibleObjects.length,
        cropCount: visibleCrops.length,
        dropCount: visibleDrops.length,
        entityCount: visibleEntities.length,
        landmarkCount: landmarks.length,
      },
    };
  }

  getNearbyObjects(input: { x: number; y: number; radius: number }): PerceivedObject[] {
    const state = this.worldStateManager.getReadonlySnapshot();
    const seen = new Set<string>();
    const objects: PerceivedObject[] = [];

    Object.values(state.objects).forEach((objectState) => {
      const next = this.objectFromState(objectState, input.x, input.y);
      if (next.distance > input.radius) return;
      seen.add(next.id);
      objects.push(next);
    });

    this.getLegacyObjects().forEach((legacyObject) => {
      if (seen.has(legacyObject.id)) return;
      const next = this.objectFromLegacy(legacyObject, input.x, input.y);
      if (next.distance > input.radius) return;
      objects.push(next);
    });

    return objects.sort((a, b) => a.distance - b.distance);
  }

  getNearbyDrops(input: { x: number; y: number; radius: number }): PerceivedDrop[] {
    const state = this.worldStateManager.getReadonlySnapshot();
    return Object.values(state.drops)
      .filter((drop) => !drop.claimed)
      .map((drop) => this.dropFromState(drop, input.x, input.y))
      .filter((drop) => drop.distance <= input.radius)
      .sort((a, b) => a.distance - b.distance);
  }

  getNearbyEntities(input: { x: number; y: number; radius: number; excludeIds?: string[] }): PerceivedEntity[] {
    const exclude = new Set(input.excludeIds ?? []);
    const state = this.worldStateManager.getReadonlySnapshot();
    return Object.values(state.entities)
      .filter((entity) => !exclude.has(entity.id))
      .map((entity) => this.entityFromState(entity, input.x, input.y))
      .filter((entity) => entity.distance <= input.radius)
      .sort((a, b) => a.distance - b.distance);
  }

  getNearestByType(
    type: 'tree' | 'drop' | 'water' | 'crop' | 'landmark' | WorldObjectKind | WorldEntityKind | 'berry_bush',
    input: { x: number; y: number; radius?: number },
  ): PerceivedObject | PerceivedDrop | PerceivedEntity | PerceivedLandmark | PerceivedCrop | PerceivedWater | null {
    const radius = input.radius ?? DEFAULT_VISION_RANGE;
    if (type === 'drop') {
      return this.getNearbyDrops({ x: input.x, y: input.y, radius })[0] ?? null;
    }
    if (type === 'water') {
      return this.getNearestWater(this.getVisibleTiles(input.x, input.y, radius, DEFAULT_TILE_RANGE)) ?? null;
    }
    if (type === 'crop') {
      return this.getNearbyCrops({ x: input.x, y: input.y, radius })[0] ?? null;
    }
    if (type === 'landmark') {
      return this.getNearbyLandmarks({ x: input.x, y: input.y, radius })[0] ?? null;
    }

    const objects = this.getNearbyObjects({ x: input.x, y: input.y, radius });
    const objectMatch = objects.find((objectItem) => objectItem.type === type);
    if (objectMatch) return objectMatch;

    const entities = this.getNearbyEntities({ x: input.x, y: input.y, radius });
    return entities.find((entity) => entity.type === type) ?? null;
  }

  private getVisibleTiles(cx: number, cy: number, visionRange: number, tileRange: number): PerceptionVisibleTile[] {
    const center = this.worldGrid.worldToCell(cx, cy);
    const tiles: PerceptionVisibleTile[] = [];

    for (let row = center.row - tileRange; row <= center.row + tileRange; row++) {
      for (let col = center.col - tileRange; col <= center.col + tileRange; col++) {
        const cell = this.worldGrid.getCell(col, row);
        if (!cell) continue;
        const world = this.worldGrid.cellToWorld(col, row);
        const distance = measureDistance(cx, cy, world.cx, world.cy);
        if (distance > visionRange) continue;
        tiles.push({
          col,
          row,
          x: world.cx,
          y: world.cy,
          terrain: cell.terrain,
          surface: cell.surface,
          moisture: cell.moisture,
          distance,
        });
      }
    }

    return tiles.sort((a, b) => a.distance - b.distance);
  }

  private getNearbyCrops(input: { x: number; y: number; radius: number }): PerceivedCrop[] {
    const state = this.worldStateManager.getReadonlySnapshot();
    return Object.values(state.crops)
      .map((crop) => this.cropFromState(crop, input.x, input.y))
      .filter((crop) => crop.distance <= input.radius)
      .sort((a, b) => a.distance - b.distance);
  }

  private getNearbyLandmarks(input: { x: number; y: number; radius: number }): PerceivedLandmark[] {
    const landmarks: PerceivedLandmark[] = [];
    const seen = new Set<string>();

    WORLD_LOCATIONS.forEach((location) => {
      const distance = measureDistance(input.x, input.y, location.worldX, location.worldY);
      if (distance > input.radius) return;
      const id = location.id;
      seen.add(id);
      landmarks.push({
        kind: location.id === 'pond' ? 'pond' : location.id === 'farm' ? 'farm' : 'landmark',
        id,
        label: location.label,
        x: location.worldX,
        y: location.worldY,
        distance,
        source: 'derived',
      });
    });

    this.getLegacyLandmarks().forEach((landmark) => {
      const key = landmark.id ?? `${landmark.kind}:${landmark.label}`;
      if (seen.has(key)) return;
      const distance = measureDistance(input.x, input.y, landmark.x, landmark.y);
      if (distance > input.radius) return;
      landmarks.push({
        ...landmark,
        distance,
        source: 'legacy_adapter',
      });
    });

    return landmarks.sort((a, b) => a.distance - b.distance);
  }

  private getNearestTree(
    x: number,
    y: number,
    radius: number,
    visibleObjects: PerceivedObject[],
  ): PerceivedObject | undefined {
    if (this.spatialIndex) {
      const indexedTree = this.spatialIndex
        .queryRadius(x, y, radius)
        .map((entry) => {
          const objectState = this.worldStateManager.getObject(entry.id);
          const distance = measureDistance(x, y, entry.wx, entry.wy);
          return { objectState, distance };
        })
        .filter((entry) => entry.objectState?.kind === 'tree' && entry.objectState.state !== 'chopped')
        .sort((a, b) => a.distance - b.distance)[0];

      if (indexedTree?.objectState) {
        return this.objectFromState(indexedTree.objectState, x, y);
      }
    }

    return visibleObjects.find((objectItem) => objectItem.type === 'tree' && objectItem.state !== 'chopped');
  }

  private getNearestWater(visibleTiles: PerceptionVisibleTile[]): PerceivedWater | undefined {
    const waterTile = visibleTiles.find((tile) => tile.terrain === 'water' || tile.terrain === 'pond');
    if (!waterTile) return undefined;
    return {
      col: waterTile.col,
      row: waterTile.row,
      x: waterTile.x,
      y: waterTile.y,
      distance: waterTile.distance,
    };
  }

  private objectFromState(objectState: ObjectState, originX: number, originY: number): PerceivedObject {
    return {
      id: objectState.id,
      type: objectState.kind,
      x: objectState.x,
      y: objectState.y,
      cellX: objectState.cellX,
      cellY: objectState.cellY,
      distance: measureDistance(originX, originY, objectState.x, objectState.y),
      state: objectState.state,
      interactable: objectState.interactable,
      blocking: objectState.blocking,
      meta: objectState.meta,
      source: 'world_state',
    };
  }

  private objectFromLegacy(legacyObject: LegacyPerceptionObject, originX: number, originY: number): PerceivedObject {
    return {
      id: legacyObject.id,
      type: legacyObject.type,
      x: legacyObject.x,
      y: legacyObject.y,
      distance: measureDistance(originX, originY, legacyObject.x, legacyObject.y),
      state: legacyObject.state,
      interactable: legacyObject.interactable,
      blocking: legacyObject.blocking,
      meta: legacyObject.meta,
      source: 'legacy_adapter',
    };
  }

  private entityFromState(entityState: EntityState, originX: number, originY: number): PerceivedEntity {
    return {
      id: entityState.id,
      type: entityState.kind,
      x: entityState.x,
      y: entityState.y,
      distance: measureDistance(originX, originY, entityState.x, entityState.y),
      facing: entityState.facing,
      displayName: entityState.displayName,
      state: entityState.state,
      meta: entityState.meta,
      source: 'world_state',
    };
  }

  private dropFromState(dropState: DropState, originX: number, originY: number): PerceivedDrop {
    return {
      id: dropState.id,
      itemId: dropState.itemId,
      x: dropState.x,
      y: dropState.y,
      distance: measureDistance(originX, originY, dropState.x, dropState.y),
      meta: dropState.meta,
      source: 'world_state',
    };
  }

  private cropFromState(cropState: CropState, originX: number, originY: number): PerceivedCrop {
    const world = this.worldGrid.cellToWorld(cropState.tx, cropState.ty);
    return {
      id: cropState.id,
      cropId: cropState.cropId,
      x: world.cx,
      y: world.cy,
      tx: cropState.tx,
      ty: cropState.ty,
      distance: measureDistance(originX, originY, world.cx, world.cy),
      state: cropState.state,
      meta: cropState.meta,
      source: 'world_state',
    };
  }
}
