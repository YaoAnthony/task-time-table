import { gameBus } from '../shared/EventBus';
import { getHouseDefinition } from './HouseCatalog';

export class HousePlacementSystem {
  private readonly scene: any;

  constructor(scene: any) {
    this.scene = scene;
  }

  previewTarget(): { x: number; y: number } | null {
    const player = this.scene.player;
    if (!player?.sprite) return null;
    const facing = (player.facing || 'down') as 'up' | 'down' | 'left' | 'right';
    const offsets: Record<typeof facing, { x: number; y: number }> = {
      up: { x: 0, y: -128 },
      down: { x: 0, y: 128 },
      left: { x: -160, y: 0 },
      right: { x: 160, y: 0 },
    };
    const offset = offsets[facing] || offsets.down;
    return { x: player.sprite.x + offset.x, y: player.sprite.y + offset.y };
  }

  requestPlacement(definitionId = 'greenhouse', blueprintItemId = 'house_blueprint_greenhouse'): boolean {
    const definition = getHouseDefinition(definitionId);
    const target = this.previewTarget();
    if (!definition || !target) return false;
    if (!this.scene.houseSaveAdapter?.canPlace(definitionId, target.x, target.y)) {
      this.scene.ui?.toast?.('这里放不下房子。');
      console.warn('[HousePlacementSystem] placement blocked', { definitionId, target });
      return false;
    }

    gameBus.emit('game:house_place_requested', {
      definitionId,
      blueprintItemId,
      x: target.x,
      y: target.y,
      roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
      placementProof: {
        requestedAtTick: this.scene.dayCycle?.gameTick ?? 0,
        footprint: {
          x: target.x - definition.footprint.w / 2,
          y: target.y - definition.footprint.h / 2,
          w: definition.footprint.w,
          h: definition.footprint.h,
        },
      },
    });
    return true;
  }
}
