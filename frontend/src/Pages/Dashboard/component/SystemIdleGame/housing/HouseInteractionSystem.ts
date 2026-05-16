import Phaser from 'phaser';
import { gameBus } from '../shared/EventBus';

const HOUSE_KEY_ITEM_ID = 'house_key';
const HOUSE_TP_RADIUS = 28;

export class HouseInteractionSystem {
  private readonly scene: any;

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
      if (Phaser.Math.Distance.Between(x, y, door.x, door.y) <= HOUSE_TP_RADIUS) return view;
    }
    return null;
  }

  private isHoldingMatchingKey(house: any): boolean {
    const held = this.scene.player?.heldSlotItem;
    if (!held || held.itemId !== HOUSE_KEY_ITEM_ID) return false;
    const meta = held.instanceData?.customMeta || {};
    return meta.houseId === house.id || meta.instanceId === house.access?.keyItemInstanceId;
  }
}
