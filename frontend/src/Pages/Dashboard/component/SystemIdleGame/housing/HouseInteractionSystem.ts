import Phaser from 'phaser';
import { gameBus } from '../shared/EventBus';
import { CHAR_FRAME_H } from '../constants';

const HOUSE_KEY_ITEM_ID = 'house_key';
const HOUSE_TP_RADIUS = 28;
const HOUSE_TP_HALF_WIDTH = 42;
const HOUSE_TP_DOWN_REACH = 64;
const HOUSE_TP_DEBUG_COLOR = 0x33a6ff;

export class HouseInteractionSystem {
  private readonly scene: any;
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(scene: any) {
    this.scene = scene;
  }

  interact(houseId: string): void {
    const view = this.scene.houseSaveAdapter?.getView(houseId);
    if (!view) return;
    const house = view.house;
    if (!String(house.stage).startsWith('ready')) {
      this.scene.ui?.toast?.('房子还在建造中。');
      return;
    }

    if (this.isHoldingMatchingKey(house)) {
      gameBus.emit('game:house_door_toggle_requested', {
        houseId,
        roomId: this.scene.roomId || this.scene.currentRoomId || undefined,
      });
      return;
    }

    if (house.doorState !== 'open') {
      gameBus.emit('ui:show_message', { text: '门锁着，需要对应的房屋钥匙。' });
      return;
    }

    const door = view.getDoorWorldPosition();
    this.scene.locationSystem?.enterRoom?.(house.roomId, {
      templateId: 'two_bedroom_living_room',
      entryPoint: door,
      returnTo: { x: door.x, y: door.y + 42 },
    });
  }

  update(timeMs = this.scene.time?.now ?? 0): void {
    const views = this.scene.houseSaveAdapter?.getViews?.() ?? [];
    this.updateDebugGraphics(views);
    if (!views.length) return;

    const playerSprite = this.scene.player?.sprite;
    if (playerSprite?.active && playerSprite.visible && !this.scene._chatOpen) {
      this.tryTeleportPlayer(playerSprite, views, timeMs);
    }

    for (const npc of this.scene.allNpcs?.() ?? []) {
      const sprite = npc?.sprite;
      if (!sprite?.active || !sprite.visible) continue;
      this.tryTeleportNpc(npc, sprite, views, timeMs);
    }
  }

  private tryTeleportPlayer(playerSprite: Phaser.Physics.Arcade.Sprite, views: any[], timeMs: number): void {
    if (!this.scene.locationSystem?.canUseTeleport?.('player', timeMs)) return;
    const view = this.findTouchedOpenHouseView(playerSprite.x, playerSprite.y, views);
    if (!view) return;
    const door = view.getDoorWorldPosition();
    this.scene.locationSystem.markTeleport('player', timeMs);
    this.scene.locationSystem.enterRoom(view.house.roomId, {
      templateId: 'two_bedroom_living_room',
      entryPoint: door,
      returnTo: { x: door.x, y: door.y + 58 },
    });
  }

  private tryTeleportNpc(npc: any, sprite: Phaser.Physics.Arcade.Sprite, views: any[], timeMs: number): void {
    const actorKey = `npc:${npc?.name ?? 'unknown'}`;
    if (!this.scene.locationSystem?.canUseTeleport?.(actorKey, timeMs)) return;
    const view = this.findTouchedOpenHouseView(sprite.x, sprite.y, views);
    if (!view) return;
    const door = view.getDoorWorldPosition();
    this.scene.locationSystem.markTeleport(actorKey, timeMs);
    this.scene.locationSystem.enterNpcRoom(npc, view.house.roomId, {
      templateId: 'two_bedroom_living_room',
      entryPoint: door,
      returnTo: { x: door.x, y: door.y + 58 },
    });
  }

  private findTouchedOpenHouseView(x: number, y: number, views: any[]): any | null {
    for (const view of views) {
      const house = view?.house;
      if (!house || house.doorState !== 'open' || !String(house.stage ?? '').startsWith('ready')) continue;
      const door = view.getDoorWorldPosition?.();
      if (!door) continue;
      if (this.getHouseTeleportRect(door).contains(x, y)) return view;
    }
    return null;
  }

  private getHouseTeleportRect(door: { x: number; y: number }): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(
      door.x - HOUSE_TP_HALF_WIDTH,
      door.y - CHAR_FRAME_H,
      HOUSE_TP_HALF_WIDTH * 2,
      CHAR_FRAME_H + HOUSE_TP_DOWN_REACH,
    );
  }

  private updateDebugGraphics(views: any[]): void {
    if (!this.scene.physicsDebugEnabled) {
      this.debugGraphics?.clear();
      this.debugGraphics?.setVisible(false);
      return;
    }
    const graphics = this.ensureDebugGraphics();
    graphics.clear();
    graphics.setVisible(true);
    graphics.lineStyle(2, HOUSE_TP_DEBUG_COLOR, 0.95);
    graphics.fillStyle(HOUSE_TP_DEBUG_COLOR, 0.08);

    for (const view of views) {
      const house = view?.house;
      if (!house || house.doorState !== 'open' || !String(house.stage ?? '').startsWith('ready')) continue;
      const door = view.getDoorWorldPosition?.();
      if (!door) continue;
      const rect = this.getHouseTeleportRect(door);
      graphics.fillRectShape(rect);
      graphics.strokeRectShape(rect);
      graphics.strokeCircle(door.x, door.y, HOUSE_TP_RADIUS);
    }
  }

  private ensureDebugGraphics(): Phaser.GameObjects.Graphics {
    if (!this.debugGraphics) {
      this.debugGraphics = this.scene.add.graphics().setDepth(9995);
    }
    return this.debugGraphics as Phaser.GameObjects.Graphics;
  }

  private isHoldingMatchingKey(house: any): boolean {
    const held = this.scene.player?.heldSlotItem;
    if (!held || held.itemId !== HOUSE_KEY_ITEM_ID) return false;
    const meta = held.instanceData?.customMeta || {};
    return meta.houseId === house.id || meta.instanceId === house.access?.keyItemInstanceId;
  }
}
