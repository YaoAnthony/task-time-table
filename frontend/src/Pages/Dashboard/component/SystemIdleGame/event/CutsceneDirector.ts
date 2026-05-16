import Phaser from 'phaser';
import { VILLAGE_LAYOUT } from '../world/layouts/villageLayout';
import type { VehicleSystem } from './VehicleSystem';

export class CutsceneDirector {
  constructor(
    private readonly scene: Phaser.Scene & { player?: { sprite: Phaser.Physics.Arcade.Sprite }; _chatOpen?: boolean },
    private readonly vehicles: VehicleSystem,
  ) {}

  lockPlayer(): void {
    this.scene._chatOpen = true;
    const body = this.scene.player?.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setVelocity(0, 0);
  }

  unlockPlayer(): void {
    this.scene._chatOpen = false;
  }

  async panTo(
    target: 'player' | 'bus_station' | 'arrival_entry' | { x: number; y: number },
    durationMs = 650,
  ): Promise<void> {
    const point = this.resolveTarget(target);
    this.scene.cameras.main.stopFollow();
    await new Promise<void>((resolve) => {
      let resolved = false;
      const finish = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      this.scene.cameras.main.pan(point.x, point.y, durationMs, 'Sine.easeInOut', false, (_camera, progress) => {
        if (progress >= 1) finish();
      });
      this.scene.time.delayedCall(durationMs + 80, finish);
    });
  }

  follow(target: 'player' | 'vehicle', vehicleId = 'arrival-bus'): void {
    const followTarget = target === 'player'
      ? this.scene.player?.sprite
      : this.vehicles.getVehicle(vehicleId);
    if (!followTarget) return;
    this.scene.cameras.main.startFollow(followTarget, true, 0.1, 0.1);
  }

  private resolveTarget(target: 'player' | 'bus_station' | 'arrival_entry' | { x: number; y: number }): { x: number; y: number } {
    if (typeof target === 'object') return target;
    if (target === 'player' && this.scene.player?.sprite) {
      return { x: this.scene.player.sprite.x, y: this.scene.player.sprite.y };
    }
    if (target === 'arrival_entry') {
      return VILLAGE_LAYOUT.busStation.arrivalRoute.entry;
    }
    return { x: VILLAGE_LAYOUT.busStation.x, y: VILLAGE_LAYOUT.busStation.y };
  }
}
