import type { BedColor } from '../entities/Bed';
import { DropItem, ITEM_DEF_MAP, TOOL_ITEM_DEFS } from '../entities/DropItem';
import { NestView } from '../entities/NestView';
import { RaspberryBush } from '../entities/RaspberryBush';
import type { TreeGrowthStage } from '../shared/worldStateTypes';
import { gameBus } from '../shared/EventBus';
import { createBusStation } from '../world/busStation';
import type { GameWorldState } from '../types';
import { createBush as createDecorBush } from '../world/bush';
import { createFlower } from '../world/flower';
import { VILLAGE_LAYOUT } from '../world/layouts/villageLayout';
import { createRock } from '../world/rock';
import type { WorldCtx } from '../world/utils';

export function removeWorldItemsByIds(scene: any, ownedItemIds: string[]) : void {
    const owned = new Set(ownedItemIds);
    const activeDrops = scene.drops.filter((item: any) => {
      if (owned.has(item.itemId)) {
        scene.unregisterDropState(item);
        item.destroy();
        return false;
      }
      return true;
    });
    scene.drops.splice(0, scene.drops.length, ...activeDrops);
  
}

export function spawnToolPickups(scene: any) : void {
    // House-1 at (80,80), 10 tiles (T=32). Interior: x:112 68, y:112 56.
    // Tool pickup positions come from the shared village layout.
    const TOOL_POSITIONS: [number, number][] = [...VILLAGE_LAYOUT.toolPickups];

    TOOL_ITEM_DEFS.forEach((def, i) => {
      const [x, y] = TOOL_POSITIONS[i];
      const item   = new DropItem(scene, x, y, def.itemId);
      scene.drops.push(item);
      scene.registerDropState(item);
    });
  
}

export function _spawnBeds(scene: any) : void {
    const bedConfigs: Array<{ x: number; y: number; color: 'green' | 'blue' | 'pink' }> = [...VILLAGE_LAYOUT.beds];
    for (const cfg of bedConfigs) {
      scene.renderSyncSystem.createBed(
        cfg.x,
        cfg.y,
        cfg.color,
        scene.beds,
        scene.sleepManager,
        scene.dayCycle,
      );
    }
  
}

export function placeEntityAt(scene: any, itemId: string, fx: number, fy: number) : boolean {
    const def = ITEM_DEF_MAP.get(itemId);
    if (!def || def.itemType !== 'placeable') return false;

    // Overlap check (only for solid entities: bed / nest)
    if (def.placeEntity) {
      const MIN_DIST = 28; // px entities closer than scene are considered overlapping
      const blocked =
        scene.beds.some((b: any) => Math.hypot(b.worldX - fx, b.worldY - fy) < MIN_DIST) ||
        scene.nests.some((n: any) => !n.gone && Math.hypot(n.x - fx, n.y - fy) < MIN_DIST);
      if (blocked) {
        gameBus.emit('ui:show_message', { text: 'This spot is already occupied.' });
        return false; // don't consume the item
      }
    }

    switch (def.placeEntity) {
      case 'bed': {
        // 'bed_pink' color 'pink'; 'bed_pink_flipped' also 'pink' (same sprite key)
        const rawColor = itemId.replace('bed_', '').replace('_flipped', '');
        const color    = rawColor as BedColor;
        scene.renderSyncSystem.createBed(
          fx,
          fy,
          color,
          scene.beds,
          scene.sleepManager,
          scene.dayCycle,
        );
        break;
      }
      case 'nest': {
        const nest = new NestView(scene, scene.nextNestId(), fx, fy, {
          getState: (id: any) => scene.worldStateManager.getNestState(id),
          onInteract: (id: any) => scene.nestStateSystem.handleInteract(id),
        });
        scene.nestStateSystem.registerNest(nest, {
          id: nest.id,
          x: fx,
          y: fy,
          state: 'empty',
          occupiedByChickenId: null,
          hasEgg: false,
          hatchAt: null,
          laidAt: null,
          removed: false,
        });
        scene.nests.push(nest);
        scene.registerInteractable(nest);
        scene.registerNestLight(nest);
        break;
      }
      default:
        // 'placeable' furniture without a placeEntity handler yet
        gameBus.emit('ui:show_message', { text: `${def.label} cannot be placed yet` });
        return false; // don't consume
    }

    gameBus.emit('player:consume_item', { itemId, qty: 1 });
    return true;
  
}

export function _loadWorldState(scene: any, ws: GameWorldState | null) : void {
    scene.savingSystem.loadWorldState(ws);
    scene.refreshNestLights();
  
}

export function createChickens(scene: any) : void {
    scene.chickenGroup = scene.physics.add.group();

    // Nest positions come from the shared village layout.
    // x: 720 84 (< pond x=800), y: 590 (< pond y=620)
    const NEST_POSITIONS: [number, number][] = [...VILLAGE_LAYOUT.nests];
    scene.nests = NEST_POSITIONS.map(([nx, ny]) => {
      const nest = scene.renderSyncSystem.createNest(scene.nextNestId(), nx, ny, scene.nests, {
        getState: (id: any) => scene.worldStateManager.getNestState(id),
        onInteract: (id: any) => scene.nestStateSystem.handleInteract(id),
      });
      scene.nestStateSystem.registerNest(nest, {
        id: nest.id,
        x: nx,
        y: ny,
        state: 'empty',
        occupiedByChickenId: null,
        hasEgg: false,
        hatchAt: null,
        laidAt: null,
        removed: false,
      });
      scene.registerNestLight(nest);
      return nest;
    });

    // Chicken spawn positions come from the shared village layout.
    const SPAWN: [number, number][] = [...VILLAGE_LAYOUT.chickens];
    scene.chickenEntities = [];
    SPAWN.forEach(([cx, cy]) => {
      scene.spawnChickenAt(cx, cy);
    });
  
}

export function updateChickens(scene: any, time: number, delta: number) : void {
    scene.chickenStateSystem.update(time, delta);
  
}

export function updateNests(scene: any, px: number, py: number, time: number) : void {
    scene.nestStateSystem.update(time, px, py);
    for (let i = scene.nests.length - 1; i >= 0; i--) {
      const nest = scene.nests[i];
      if (nest.gone) {
        scene.lightingSystem?.removeStaticLight(`nest:${nest.id}`);
        scene.unregisterInteractable(nest);
        scene.unregisterRuntimeObject(nest);
        scene.nests.splice(i, 1);
      }
    }
  
}

export function spawnInitialTrees(scene: any) : void {
    // Town tree layout (world 1280 60, island x:96 184, y:96 64)
    //
    //   Water border  : x<128 or x>1152, y<128 or y>832
    // House 1 : x:80 00, y:80 72
    // House 2/manor : x:560 008, y:80 36
    // Pond : x:800 96, y:620 84
    //
    const POSITIONS: [number, number][] = [...VILLAGE_LAYOUT.trees.positions];
    const DEFAULT_STAGES: TreeGrowthStage[] = [...VILLAGE_LAYOUT.trees.stages];

    // Build a lookup from saved state (if we have one)
    const savedTreeMap = new Map<string, { stage: TreeGrowthStage; hasFruit: boolean }>();
    for (const ts of (scene.initialState.trees ?? [])) {
      savedTreeMap.set(ts.id, { stage: ts.stage as TreeGrowthStage, hasFruit: ts.hasFruit });
    }

    POSITIONS.forEach(([x, y], i) => {
      const id    = `tree-${i}`;
      const saved = savedTreeMap.get(id);
      const stage     = saved?.stage    ?? DEFAULT_STAGES[i];
      const hasFruit  = saved?.hasFruit ?? (stage === 'C'); // default: C has fruit

      const nextStageAt = stage === 'A'
        ? scene.time.now + 60_000
        : stage === 'B'
          ? scene.time.now + 120_000
          : null;
      const tree = scene.renderSyncSystem.createTree(
        id,
        x,
        y,
        scene.trees,
        {
          getState: (treeId: any) => scene.worldStateManager.getTreeState(treeId),
          onInteract: (treeId: any) => scene.treeStateSystem.harvestFruit(treeId),
          onChop: (treeId: any) => scene.treeStateSystem.chopTree(treeId),
        },
        scene.obstacles,
      );
      scene.treeStateSystem.registerTree(tree, {
        id,
        x,
        y,
        stage,
        hasFruit,
        isChopped: stage === 'chopA' || stage === 'chopBC',
        nextStageAt,
        respawnAt: null,
        meta: {},
      });
      scene.registerTreeOccluder(tree);
      // Register in SpatialIndex for O(1) nearest-tree queries
      if (!tree.isChopped()) scene.spatialIndex.insert({ id: tree.id, wx: x, wy: y, ref: tree });
    });
  
}

export function spawnInitialBushes(scene: any) : void {
    // Raspberry bush positions
    // All placed on open grass verified clear of houses, pond, and water border.
    // House 1: x:80 00, y:80 72 front yard below y=272 only
    // House 2: x:560 008, y:80 36 south side below y=336 only
    // Pond: x:800 96, y:620 84 bushes placed outside scene rectangle
    const POSITIONS: [number, number][] = [...VILLAGE_LAYOUT.berryBushes];
    POSITIONS.forEach(([x, y], i) => {
      const bush = new RaspberryBush(scene, x, y, `bush-${i}`, (d: any) => {
        scene.drops.push(d);
        scene.registerDropState(d);
      }, scene.obstacles);
      scene.bushes.push(bush);
      scene.registerInteractable(bush);
    });
  
}

export function spawnDecorations(scene: any) : void {
    const ctx: WorldCtx = { scene: scene, obstacles: scene.obstacles };
    const station = createBusStation(ctx, VILLAGE_LAYOUT.busStation);
    scene.busStation = station;
    scene.worldStateManager?.registerObject?.({
      id: VILLAGE_LAYOUT.busStation.id,
      kind: 'decoration',
      x: VILLAGE_LAYOUT.busStation.x,
      y: VILLAGE_LAYOUT.busStation.y,
      blocking: true,
      interactable: false,
      state: 'bus_station',
      meta: {
        subtype: 'bus_station',
        label: '车站',
        collisionBlocks: VILLAGE_LAYOUT.busStation.collisionBlocks.map((block) => ({ ...block })),
      },
    });

    // Flowers (no collision, purely visual)
    // Rules: on grass only not on water border, not inside any building,
    //         not on the pond, not inside a forest cluster.
    //
    // House 1: x:80 00, y:80 72
    // House 2: x:560 008, y:80 36
    // Pond: x:800 96, y:620 84
    //  Water border: x<128 or x>1152, y<128 or y>832
    const FLOWERS: [number, number, 1|2|3][] = [...VILLAGE_LAYOUT.flowers];
    FLOWERS.forEach(([x, y, v]) => createFlower(ctx, x, y, v));

    // Rocks (small collision block)
    // Natural landscape accents forest edges and path borders only.
    //  Verified clear of all buildings and pond.
    const ROCKS: [number, number][] = [...VILLAGE_LAYOUT.rocks];
    ROCKS.forEach(([x, y]) => createRock(ctx, x, y));

    // Decorative hedge-bushes (obstacle, no berries)
    //  Placed just outside house walls as garden hedges.
    //  x/y chosen so they sit on the grass strip adjacent to each house,
    //  never on the house tiles themselves.
    const DECOR_BUSHES: [number, number][] = [...VILLAGE_LAYOUT.decorBushes];
    DECOR_BUSHES.forEach(([x, y]) => createDecorBush(ctx, x, y));
  
}
