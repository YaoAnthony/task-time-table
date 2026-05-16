import Phaser from 'phaser';
import type { Interactable } from '../types';
import { CHEST_INTERACT_RADIUS } from '../constants';
import { gameBus } from '../shared/EventBus';
import { cloneStorageChestSave, type StorageChestSave } from './StorageChestTypes';

export class StorageChestView implements Interactable {
  readonly id: string;
  readonly sprite: Phaser.GameObjects.Sprite;

  private readonly label: Phaser.GameObjects.Text;
  private chest: StorageChestSave;

  constructor(private readonly scene: Phaser.Scene, chest: StorageChestSave) {
    this.id = chest.id;
    this.chest = cloneStorageChestSave(chest);
    this.sprite = scene.add.sprite(chest.x, chest.y, 'chest', 0);
    this.sprite.setScale(0.72).setDepth(chest.y + 44);
    this.label = scene.add.text(chest.x, chest.y - 18, 'Storage', {
      fontSize: '8px',
      color: '#fff0a8',
      backgroundColor: '#00000088',
      padding: { x: 3, y: 2 },
      fontFamily: '"Courier New", monospace',
    }).setOrigin(0.5, 1).setDepth(chest.y + 45);
  }

  updateChest(chest: StorageChestSave): void {
    this.chest = cloneStorageChestSave(chest);
    this.sprite.setPosition(chest.x, chest.y).setDepth(chest.y + 44);
    this.label.setPosition(chest.x, chest.y - 18).setDepth(chest.y + 45);
  }

  get data(): StorageChestSave {
    return cloneStorageChestSave(this.chest);
  }

  isNearPlayer(px: number, py: number, radius = CHEST_INTERACT_RADIUS): boolean {
    const dx = px - this.sprite.x;
    const dy = py - this.sprite.y;
    return dx * dx + dy * dy <= radius * radius;
  }

  interact(): void {
    gameBus.emit('game:storage_chest_open_requested', {
      chestId: this.id,
      roomId: (this.scene as any).roomId || (this.scene as any).currentRoomId || undefined,
    });
  }

  destroy(): void {
    this.label.destroy();
    this.sprite.destroy();
  }
}
