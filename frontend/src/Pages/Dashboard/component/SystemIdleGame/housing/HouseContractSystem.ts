export class HouseContractSystem {
  private readonly scene: any;

  constructor(scene: any) {
    this.scene = scene;
  }

  getReadyVacantHouses() {
    return this.scene.houseSaveAdapter
      ?.getViews()
      .map((view: any) => view.house)
      .filter((house: any) => String(house.stage).startsWith('ready') && house.tenancy?.status !== 'occupied') ?? [];
  }
}
