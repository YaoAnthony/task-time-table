import type { GameSaveV1 } from '../persistence/save/GameSaveTypes';
import { getHouseDefinition } from './HouseCatalog';
import { HouseInstanceView } from './HouseInstanceView';
import { buildHouseWorldMeta } from './HouseObservationAdapter';
import { HouseWorldGridAdapter } from './HouseWorldGridAdapter';
import {
  cloneHouseContractSave,
  cloneHouseInstanceSave,
  type HouseContractSave,
  type HouseInstanceSave,
} from './HouseTypes';

export class HouseSaveAdapter {
  private readonly scene: any;
  private readonly gridAdapter: HouseWorldGridAdapter;
  private readonly views = new Map<string, HouseInstanceView>();
  private contracts: HouseContractSave[] = [];

  constructor(scene: any) {
    this.scene = scene;
    this.gridAdapter = new HouseWorldGridAdapter(scene);
  }

  loadFromGameSave(gameSave: GameSaveV1 | null | undefined): void {
    const houses = gameSave?.worldStatus?.entities?.houses || [];
    this.contracts = (gameSave?.worldStatus?.entities?.houseContracts || []).map(cloneHouseContractSave);
    const nextIds = new Set(houses.map((house) => house.id));

    for (const [id, view] of this.views.entries()) {
      if (nextIds.has(id)) continue;
      this.gridAdapter.clearHouse(id);
      this.scene.worldStateManager?.unregisterObject(id);
      view.destroy();
      this.views.delete(id);
    }

    for (const house of houses) this.upsertHouse(house, this.contracts);
  }

  exportHouses(): HouseInstanceSave[] {
    return Array.from(this.views.values()).map((view) => cloneHouseInstanceSave(view.house));
  }

  exportContracts(): HouseContractSave[] {
    return this.contracts.map(cloneHouseContractSave);
  }

  getHouse(houseId: string): HouseInstanceSave | null {
    return this.views.get(houseId)?.house ?? null;
  }

  getView(houseId: string): HouseInstanceView | null {
    return this.views.get(houseId) ?? null;
  }

  getViews(): HouseInstanceView[] {
    return Array.from(this.views.values());
  }

  getContracts(): HouseContractSave[] {
    return this.contracts.map(cloneHouseContractSave);
  }

  upsertHouse(house: HouseInstanceSave, contracts = this.contracts): HouseInstanceView | null {
    const nextHouse = cloneHouseInstanceSave(house);
    const definition = getHouseDefinition(nextHouse.definitionId);
    if (!definition) return null;
    this.contracts = contracts.map(cloneHouseContractSave);
    this.gridAdapter.clearHouse(nextHouse.id);

    let view = this.views.get(nextHouse.id);
    if (!view) {
      view = new HouseInstanceView(this.scene, nextHouse);
      this.views.set(nextHouse.id, view);
    } else {
      view.updateHouse(nextHouse);
    }

    this.gridAdapter.blockHouse(nextHouse, definition);
    this.syncWorldObject(view.house);
    return view;
  }

  removeAll(): void {
    for (const [id, view] of this.views.entries()) {
      this.gridAdapter.clearHouse(id);
      this.scene.worldStateManager?.unregisterObject(id);
      view.destroy();
    }
    this.views.clear();
    this.contracts = [];
  }

  syncWorldObject(house: HouseInstanceSave): void {
    this.scene.registerWorldObject?.(house.id, 'house', house.x, house.y, {
      blocking: true,
      interactable: true,
      state: house.stage,
      meta: buildHouseWorldMeta(house, this.contracts),
    });
  }

  canPlace(definitionId: string, x: number, y: number): boolean {
    const definition = getHouseDefinition(definitionId);
    if (!definition) return false;
    return this.gridAdapter.isPlacementClear(definition, x, y);
  }
}
