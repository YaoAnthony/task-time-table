import Phaser from 'phaser';
import type { Interactable } from '../types';
import { LAYER, createObstacleBlock } from '../world/utils';
import { getHouseDefinition } from './HouseCatalog';
import { getHouseTextureKey } from './HouseAssetKeys';
import {
  cloneHouseInstanceSave,
  type HouseDefinition,
  type HouseInstanceSave,
  type HouseStage,
} from './HouseTypes';

export class HouseInstanceView implements Interactable {
  readonly id: string;
  readonly house: HouseInstanceSave;

  private readonly scene: any;
  private readonly definition: HouseDefinition;
  private readonly image: Phaser.GameObjects.Image;
  private readonly blockers: Phaser.Physics.Arcade.Image[] = [];

  constructor(scene: any, house: HouseInstanceSave) {
    this.scene = scene;
    this.id = house.id;
    this.house = cloneHouseInstanceSave(house);
    const definition = getHouseDefinition(house.definitionId);
    if (!definition) throw new Error(`Unknown house definition: ${house.definitionId}`);
    this.definition = definition;

    this.image = scene.add.image(
      house.x,
      house.y,
      getHouseTextureKey(house.definitionId, house.stage),
    );
    this.image.setDisplaySize(definition.displaySize.w, definition.displaySize.h);
    this.image.setDepth(LAYER.WALL(house.y));
    this.image.setOrigin(0.5, 0.5);
    this.image.setData('houseId', house.id);
    this.createCollision();
  }

  updateHouse(next: HouseInstanceSave): void {
    Object.assign(this.house, cloneHouseInstanceSave(next));
    this.image.setPosition(next.x, next.y);
    this.image.setTexture(getHouseTextureKey(next.definitionId, next.stage));
    this.image.setDepth(LAYER.WALL(next.y));
  }

  setStage(stage: HouseStage): void {
    this.house.stage = stage;
    this.house.doorState = stage === 'ready_open' ? 'open' : this.house.doorState;
    this.image.setTexture(getHouseTextureKey(this.house.definitionId, stage));
  }

  interact(): void {
    this.scene.houseInteractionSystem?.interact(this.house.id);
  }

  isNearPlayer(x: number, y: number, radius = 72): boolean {
    const door = this.getDoorWorldPosition();
    return Phaser.Math.Distance.Between(x, y, door.x, door.y) <= radius;
  }

  getDoorWorldPosition(): { x: number; y: number } {
    return {
      x: this.house.x + this.definition.doorOffset.x,
      y: this.house.y + this.definition.doorOffset.y,
    };
  }

  getFootprint(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      this.house.x - this.definition.footprint.w / 2,
      this.house.y - this.definition.footprint.h / 2,
      this.definition.footprint.w,
      this.definition.footprint.h,
    );
  }

  destroy(): void {
    for (const blocker of this.blockers) blocker.destroy();
    this.blockers.length = 0;
    this.image.destroy();
  }

  private createCollision(): void {
    for (const box of this.definition.collisionBoxes) {
      const blocker = createObstacleBlock(
        this.scene,
        this.scene.obstacles,
        this.house.x + box.x + box.w / 2,
        this.house.y + box.y + box.h / 2,
        box.w,
        box.h,
      );
      this.blockers.push(blocker);
    }
  }
}
