import { gameBus } from '../shared/EventBus';
import { getHouseDefinition, getStageAtTick } from './HouseCatalog';

export class HouseConstructionSystem {
  private readonly scene: any;
  private readonly completing = new Set<string>();

  constructor(scene: any) {
    this.scene = scene;
  }

  update(gameTick: number): void {
    const adapter = this.scene.houseSaveAdapter;
    if (!adapter) return;
    for (const view of adapter.getViews()) {
      const definition = getHouseDefinition(view.house.definitionId);
      if (!definition) continue;
      const stage = getStageAtTick(
        definition,
        view.house.startedAtTick,
        view.house.readyAtTick,
        gameTick,
        view.house.doorState === 'open',
      );
      if (view.house.stage !== stage) {
        view.setStage(stage);
        adapter.syncWorldObject(view.house);
      }
      if (String(stage).startsWith('ready') && !view.house.access?.keyItemInstanceId && !this.completing.has(view.house.id)) {
        this.completing.add(view.house.id);
        gameBus.emit('game:house_complete_requested', {
          houseId: view.house.id,
          gameTick,
          roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
        });
      }
    }
  }

  markCompleteHandled(houseId: string): void {
    this.completing.delete(houseId);
  }
}
