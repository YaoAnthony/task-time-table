import Phaser from 'phaser';
import type { LightConfig } from '../systems/LightingSystem';
import { VILLAGE_LAYOUT } from '../world/layouts/villageLayout';

interface VehicleRuntime {
  id: string;
  sprite: Phaser.GameObjects.Image;
  direction: 'left_to_right' | 'right_to_left';
}

export class VehicleSystem {
  private readonly vehicles = new Map<string, VehicleRuntime>();

  constructor(private readonly scene: Phaser.Scene) {}

  spawnArrivalBus(vehicleId: string): Phaser.GameObjects.Image {
    this.remove(vehicleId);
    const route = VILLAGE_LAYOUT.busStation.arrivalRoute;
    console.log('[DEBUG-event-flow] VehicleSystem.spawnArrivalBus', {
      vehicleId,
      route,
      textureExists: this.scene.textures.exists('bus'),
    });
    const sprite = this.scene.add.image(route.entry.x, route.entry.y, 'bus')
      .setOrigin(0.5, 0.72)
      .setScale(route.busScale)
      .setDepth(route.entry.y + 120)
      .setFlipX(route.direction === 'left_to_right');

    this.vehicles.set(vehicleId, {
      id: vehicleId,
      sprite,
      direction: route.direction,
    });
    return sprite;
  }

  getVehicle(vehicleId: string): Phaser.GameObjects.Image | null {
    return this.vehicles.get(vehicleId)?.sprite ?? null;
  }

  getLightConfigs(): LightConfig[] {
    const lights: LightConfig[] = [];
    for (const vehicle of this.vehicles.values()) {
      const sprite = vehicle.sprite;
      if (!sprite.active) continue;
      const forward = vehicle.direction === 'left_to_right' ? 1 : -1;
      const frontX = sprite.x + forward * sprite.displayWidth * 0.42;
      const rearX = sprite.x - forward * sprite.displayWidth * 0.4;
      const lampY = sprite.y - sprite.displayHeight * 0.28;

      lights.push(
        {
          id: `vehicle:${vehicle.id}:headlight:upper`,
          x: frontX + forward * 22,
          y: lampY - 8,
          radius: 150,
          color: 0xfff0b0,
          intensity: 0.72,
          flicker: 0.012,
          verticalScale: 0.42,
          coreScale: 0.34,
        },
        {
          id: `vehicle:${vehicle.id}:headlight:lower`,
          x: frontX + forward * 24,
          y: lampY + 14,
          radius: 118,
          color: 0xffdf86,
          intensity: 0.52,
          flicker: 0.012,
          verticalScale: 0.38,
          coreScale: 0.3,
        },
        {
          id: `vehicle:${vehicle.id}:cabin`,
          x: sprite.x - forward * sprite.displayWidth * 0.05,
          y: sprite.y - sprite.displayHeight * 0.36,
          radius: 105,
          color: 0xffbf88,
          intensity: 0.34,
          flicker: 0.018,
          verticalScale: 0.5,
          coreScale: 0.42,
        },
        {
          id: `vehicle:${vehicle.id}:tail`,
          x: rearX,
          y: lampY + 8,
          radius: 56,
          color: 0xff4d45,
          intensity: 0.28,
          flicker: 0.008,
          verticalScale: 0.48,
          coreScale: 0.36,
        },
      );
    }
    return lights;
  }

  async moveToStation(vehicleId: string, durationMs = 2600): Promise<void> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;
    const route = VILLAGE_LAYOUT.busStation.arrivalRoute;
    console.log('[DEBUG-event-flow] VehicleSystem.moveToStation start', {
      vehicleId,
      from: { x: vehicle.sprite.x, y: vehicle.sprite.y },
      to: route.stop,
      durationMs,
    });
    await new Promise<void>((resolve) => {
      this.scene.tweens.add({
        targets: vehicle.sprite,
        x: route.stop.x,
        y: route.stop.y,
        duration: durationMs,
        ease: 'Sine.easeInOut',
        onUpdate: () => vehicle.sprite.setDepth(vehicle.sprite.y + 120),
        onComplete: () => {
          console.log('[DEBUG-event-flow] VehicleSystem.moveToStation complete', {
            vehicleId,
            at: { x: vehicle.sprite.x, y: vehicle.sprite.y },
          });
          resolve();
        },
      });
    });
  }

  async playDoor(vehicleId: string, mode: 'open' | 'close'): Promise<void> {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;
    const frames = mode === 'open'
      ? ['bus-open1', 'bus-open2', 'bus-open3']
      : ['bus-open2', 'bus-open1', 'bus'];

    console.log('[DEBUG-event-flow] VehicleSystem.playDoor', {
      vehicleId,
      mode,
      frames,
      textureStatus: frames.map((frame) => [frame, this.scene.textures.exists(frame)]),
    });
    for (const frame of frames) {
      vehicle.sprite.setTexture(frame);
      vehicle.sprite.setFlipX(vehicle.direction === 'left_to_right');
      await this.wait(130);
    }
  }

  remove(vehicleId: string): void {
    const vehicle = this.vehicles.get(vehicleId);
    if (!vehicle) return;
    console.log('[DEBUG-event-flow] VehicleSystem.remove', { vehicleId });
    vehicle.sprite.destroy();
    this.vehicles.delete(vehicleId);
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.scene.time.delayedCall(ms, () => resolve());
    });
  }
}
