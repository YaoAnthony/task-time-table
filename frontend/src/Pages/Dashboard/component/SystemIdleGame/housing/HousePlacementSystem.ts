import Phaser from 'phaser';
import { gameBus } from '../shared/EventBus';
import { getHouseDefinition } from './HouseCatalog';

type HousePlacementFacing = 'up' | 'down' | 'left' | 'right';

interface HousePlacementActor {
  id: string;
  x: number;
  y: number;
  facing: HousePlacementFacing;
  heldItemId?: string;
}

interface ActiveHousePlacement {
  actorId: string;
  definitionId: string;
  blueprintItemId: string;
  preview: Phaser.GameObjects.Graphics;
  target: { x: number; y: number };
}

export class HousePlacementSystem {
  private readonly scene: any;
  private readonly activePlacements = new Map<string, ActiveHousePlacement>();

  constructor(scene: any) {
    this.scene = scene;
  }

  previewTarget(actorId = 'player'): { x: number; y: number } | null {
    const actor = this.resolveActor(actorId);
    if (!actor) return null;
    const facing = actor.facing;
    const offsets: Record<typeof facing, { x: number; y: number }> = {
      up: { x: 0, y: -128 },
      down: { x: 0, y: 128 },
      left: { x: -160, y: 0 },
      right: { x: 160, y: 0 },
    };
    const offset = offsets[facing] || offsets.down;
    return { x: actor.x + offset.x, y: actor.y + offset.y };
  }

  requestPlacement(
    definitionId = 'greenhouse',
    blueprintItemId = 'house_blueprint_greenhouse',
    actorId = 'player',
  ): boolean {
    const active = this.activePlacements.get(actorId);
    if (active?.definitionId === definitionId && active.blueprintItemId === blueprintItemId) {
      return this.confirmPlacement(actorId);
    }
    return this.beginPlacement({ actorId, definitionId, blueprintItemId });
  }

  beginPlacement(input: {
    actorId?: string;
    definitionId?: string;
    blueprintItemId?: string;
  } = {}): boolean {
    const actorId = input.actorId ?? 'player';
    const definitionId = input.definitionId ?? 'greenhouse';
    const blueprintItemId = input.blueprintItemId ?? 'house_blueprint_greenhouse';
    const definition = getHouseDefinition(definitionId);
    const target = this.previewTarget(actorId);
    if (!definition || !target) return false;

    this.cancelPlacement(actorId);
    const preview = this.scene.add.graphics();
    preview.setDepth(750);
    const placement: ActiveHousePlacement = {
      actorId,
      definitionId,
      blueprintItemId,
      preview,
      target,
    };
    this.activePlacements.set(actorId, placement);
    this.drawPreview(placement);
    this.scene.ui?.toast?.('再次按 F 确认放置房屋');
    return true;
  }

  confirmPlacement(actorId = 'player'): boolean {
    const placement = this.activePlacements.get(actorId);
    if (!placement) return false;
    const definition = getHouseDefinition(placement.definitionId);
    const target = this.previewTarget(actorId);
    if (!definition || !target) return false;
    placement.target = target;
    this.drawPreview(placement);

    if (!this.scene.houseSaveAdapter?.canPlace(placement.definitionId, target.x, target.y)) {
      this.scene.ui?.toast?.('这里放不下房子');
      console.warn('[HousePlacementSystem] placement blocked', {
        actorId,
        definitionId: placement.definitionId,
        target,
      });
      return false;
    }

    gameBus.emit('game:house_place_requested', {
      definitionId: placement.definitionId,
      blueprintItemId: placement.blueprintItemId,
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
    this.cancelPlacement(actorId);
    return true;
  }

  cancelPlacement(actorId = 'player'): void {
    const placement = this.activePlacements.get(actorId);
    if (!placement) return;
    placement.preview.destroy();
    this.activePlacements.delete(actorId);
  }

  update(): void {
    for (const placement of [...this.activePlacements.values()]) {
      const actor = this.resolveActor(placement.actorId);
      if (!actor) {
        this.cancelPlacement(placement.actorId);
        continue;
      }
      if (placement.actorId === 'player' && actor.heldItemId !== placement.blueprintItemId) {
        this.cancelPlacement(placement.actorId);
        continue;
      }
      const target = this.previewTarget(placement.actorId);
      if (!target) continue;
      placement.target = target;
      this.drawPreview(placement);
    }
  }

  destroy(): void {
    for (const actorId of [...this.activePlacements.keys()]) {
      this.cancelPlacement(actorId);
    }
  }

  private drawPreview(placement: ActiveHousePlacement): void {
    const definition = getHouseDefinition(placement.definitionId);
    if (!definition) return;
    const { x, y } = placement.target;
    const rect = new Phaser.Geom.Rectangle(
      x - definition.footprint.w / 2,
      y - definition.footprint.h / 2,
      definition.footprint.w,
      definition.footprint.h,
    );
    const canPlace = this.scene.houseSaveAdapter?.canPlace?.(placement.definitionId, x, y) !== false;
    placement.preview.clear();
    placement.preview.fillStyle(0xff3333, canPlace ? 0.08 : 0.16);
    placement.preview.fillRect(rect.x, rect.y, rect.width, rect.height);
    placement.preview.lineStyle(3, 0xff3333, canPlace ? 0.95 : 1);
    this.strokeDashedRect(placement.preview, rect, 14, 8);
  }

  private strokeDashedRect(
    graphics: Phaser.GameObjects.Graphics,
    rect: Phaser.Geom.Rectangle,
    dash = 14,
    gap = 8,
  ): void {
    this.strokeDashedLine(graphics, rect.left, rect.top, rect.right, rect.top, dash, gap);
    this.strokeDashedLine(graphics, rect.right, rect.top, rect.right, rect.bottom, dash, gap);
    this.strokeDashedLine(graphics, rect.right, rect.bottom, rect.left, rect.bottom, dash, gap);
    this.strokeDashedLine(graphics, rect.left, rect.bottom, rect.left, rect.top, dash, gap);
  }

  private strokeDashedLine(
    graphics: Phaser.GameObjects.Graphics,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    dash: number,
    gap: number,
  ): void {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    if (length <= 0) return;
    const stepX = dx / length;
    const stepY = dy / length;
    let cursor = 0;
    while (cursor < length) {
      const segment = Math.min(dash, length - cursor);
      const sx = x1 + stepX * cursor;
      const sy = y1 + stepY * cursor;
      const ex = x1 + stepX * (cursor + segment);
      const ey = y1 + stepY * (cursor + segment);
      graphics.lineBetween(sx, sy, ex, ey);
      cursor += dash + gap;
    }
  }

  private resolveActor(actorId: string): HousePlacementActor | null {
    if (actorId === 'player') {
      const player = this.scene.player;
      if (!player?.sprite) return null;
      return {
        id: actorId,
        x: player.sprite.x,
        y: player.sprite.y,
        facing: this.normalizeFacing(player.facing),
        heldItemId: player.heldItemId,
      };
    }

    const npc = this.scene.findNpcByName?.(actorId)
      ?? this.scene.getNpcRegistrations?.()
        ?.find(({ id, npc: entry }: { id: string; npc: any }) => id === actorId || entry?.name === actorId)
        ?.npc;
    if (!npc?.sprite) return null;
    return {
      id: actorId,
      x: npc.sprite.x,
      y: npc.sprite.y,
      facing: this.getFacingFromAnimation(npc.sprite),
    };
  }

  private normalizeFacing(value: unknown): HousePlacementFacing {
    return value === 'up' || value === 'down' || value === 'left' || value === 'right'
      ? value
      : 'down';
  }

  private getFacingFromAnimation(sprite: Phaser.Physics.Arcade.Sprite): HousePlacementFacing {
    const key = sprite.anims?.currentAnim?.key ?? '';
    const suffix = key.split('-').pop();
    return this.normalizeFacing(suffix);
  }
}
