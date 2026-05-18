import Phaser from 'phaser';
import { WORLD_H, WORLD_W, SPAWN_X, SPAWN_Y, ZOOM } from '../constants';
import { createObstacleBlock, LAYER } from '../world/utils';
import type { GameSaveV1 } from '../persistence/save/GameSaveTypes';
import { getHouseDefinition } from '../housing/HouseCatalog';
import { buildRoomObservationObjects } from './RoomObservationAdapter';

type EnterRoomOptions = {
  templateId?: string;
  returnTo?: { x: number; y: number };
  entryPoint?: { x: number; y: number };
  transition?: boolean;
  onComplete?: () => void;
};

type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

type RoomInstance = {
  id: string;
  label: string;
  templateId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  spawn: { x: number; y: number };
};

const BASE_ROOM = {
  id: '001',
  label: 'Two Bedroom House',
  templateId: 'two_bedroom_living_room',
  x: 2240,
  y: 144,
  w: 704,
  h: 512,
  spawn: { x: 2592, y: 574 },
} satisfies RoomInstance;

const ROOM_GAP_X = 160;
const ROOM_GAP_Y = 160;
const ROOM_COLUMNS = 3;
const TELEPORT_RADIUS = 28;
const TELEPORT_COOLDOWN_MS = 1100;
const ROOM_EXIT_Y_OFFSET = 36;
const ROOM_ENTRY_SAFE_OFFSET = 96;
const VILLAGE_WORLD_ID = 'world:village';
const TP_DEBUG_COLOR = 0x33a6ff;

function stableOffset(input: string): { x: number; y: number } {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) hash = ((hash << 5) - hash) + input.charCodeAt(i);
  const n = Math.abs(hash);
  return {
    x: [-64, -32, 0, 32, 64][n % 5],
    y: -24 - (Math.floor(n / 5) % 3) * 28,
  };
}

export class RoomLocationSystem {
  private readonly builtRoomIds = new Set<string>();
  private readonly roomInstances = new Map<string, RoomInstance>();
  private readonly roomObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly roomReturnPositions = new Map<string, { x: number; y: number }>();
  private readonly teleportCooldownUntil = new Map<string, number>();
  private debugGraphics: Phaser.GameObjects.Graphics | null = null;
  private returnPosition: { x: number; y: number } | null = null;
  private nextDynamicRoomIndex = 1;
  private transitioning = false;

  constructor(private readonly scene: Phaser.Scene & any) {}

  teleport(target: string | undefined): string {
    const normalized = (target ?? '').trim().toLowerCase();
    if (normalized === '001') return this.teleportToRoom001();
    if (normalized === 'village' || normalized === 'home') return this.teleportToVillage();
    return 'Usage: /tp 001 | /tp village';
  }

  teleportToRoom001(): string {
    const room = this.ensureRoom('001');
    this.movePlayerTo(room.spawn.x, room.spawn.y, 'up');
    this.focusRoom(room);
    return 'Teleported to room 001';
  }

  teleportToVillage(): string {
    const target = this.returnPosition ?? { x: SPAWN_X, y: SPAWN_Y };
    this.returnPosition = null;
    this.movePlayerTo(target.x, target.y, 'down');
    this.scene.cameras.main.setZoom(ZOOM);
    this.scene.cameras.main.setBounds(0, 0, this.getWorldWidth(), this.getWorldHeight());
    return 'Teleported back to the village';
  }

  enterRoom(roomId: string, options: EnterRoomOptions = {}): string {
    if (this.transitioning) return `Entering ${roomId}`;
    this.returnPosition = options.returnTo ?? {
      x: this.scene.player?.sprite?.x ?? SPAWN_X,
      y: this.scene.player?.sprite?.y ?? SPAWN_Y,
    };
    const room = this.ensureRoom(roomId, options.templateId);
    this.roomReturnPositions.set(room.id, this.returnPosition);
    this.markTeleport('player');
    if (options.transition === false) {
      this.movePlayerTo(room.spawn.x, room.spawn.y, 'up');
      this.focusRoom(room);
    } else {
      this.transitionPlayerIntoRoom(room, options.entryPoint);
    }
    return `Entered ${roomId}`;
  }

  enterNpcRoom(npc: any, roomId: string, options: EnterRoomOptions = {}): string {
    const room = this.ensureRoom(roomId, options.templateId);
    const sprite = npc?.sprite as Phaser.Physics.Arcade.Sprite | undefined;
    if (!sprite) return `NPC missing for ${roomId}`;
    if (options.returnTo) this.roomReturnPositions.set(room.id, options.returnTo);
    this.markTeleport(this.actorKeyForNpc(npc));

    const offset = stableOffset(npc.name || roomId);
    const target = {
      x: room.spawn.x + offset.x,
      y: room.spawn.y + offset.y,
    };

    npc.stopFollowing?.();
    npc.clearNavigation?.();
    npc.facing = 'up';
    sprite.setVelocity?.(0, 0);
    const body = sprite.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) body.setVelocity(0, 0);

    const completeMove = () => {
      sprite.setPosition(target.x, target.y);
      body?.reset(target.x, target.y);
      sprite.setVelocity?.(0, 0);
      sprite.play?.('idle-up', true);
      sprite.setAlpha(1);
      this.scene.worldStateManager?.updateEntityPosition?.(npc.name, target.x, target.y);
      this.scene.worldStateManager?.patchEntity?.(npc.name, { facing: 'up' });
      options.onComplete?.();
    };

    if (options.transition === false) {
      completeMove();
      return `NPC entered ${roomId}`;
    }

    const entry = options.entryPoint ?? { x: sprite.x, y: sprite.y };
    this.scene.tweens.add({
      targets: sprite,
      x: entry.x,
      y: entry.y - 14,
      alpha: 0.08,
      duration: 520,
      ease: 'Sine.easeInOut',
      onComplete: completeMove,
    });
    return `NPC entered ${roomId}`;
  }

  update(timeMs = this.scene.time?.now ?? 0): void {
    this.updatePlayerExit(timeMs);
    this.updateNpcExits(timeMs);
    this.updateDebugGraphics();
  }

  getWorldIdAt(x: number, y: number): string {
    return this.findRoomContaining(x, y)?.id ?? VILLAGE_WORLD_ID;
  }

  getRoomExitTarget(roomId: string): { x: number; y: number; worldId: string } | null {
    const room = this.getOrCreateRoom(roomId);
    return { ...this.getRoomExitPoint(room), worldId: room.id };
  }

  getRoomExitApproachTarget(roomId: string): { x: number; y: number; worldId: string } | null {
    const exit = this.getRoomExitTarget(roomId);
    if (!exit) return null;
    return { x: exit.x, y: exit.y - TELEPORT_RADIUS - 12, worldId: exit.worldId };
  }

  exitNpcToVillage(npc: any, roomId?: string, options: { transition?: boolean; onComplete?: () => void } = {}): string {
    const sprite = npc?.sprite as Phaser.Physics.Arcade.Sprite | undefined;
    if (!sprite) return 'NPC missing';
    const room = roomId ? this.getOrCreateRoom(roomId) : this.findRoomContaining(sprite.x, sprite.y);
    if (!room) {
      options.onComplete?.();
      return 'NPC was not inside a room';
    }
    this.markTeleport(this.actorKeyForNpc(npc));
    this.exitNpcRoom(npc, room, options.onComplete, options.transition === false);
    return `NPC exited ${room.id}`;
  }

  restoreSavedLocations(save: GameSaveV1 | null | undefined, userId = 'player'): void {
    if (!save) return;
    this.prepareRoomsForSave(save);
    const playerSave = save.players[userId] ?? Object.values(save.players)[0];
    if (playerSave?.position) {
      const worldId = this.resolveSavedWorldId(playerSave.position.worldId, playerSave.position.x, playerSave.position.y);
      if (worldId !== VILLAGE_WORLD_ID) this.ensureRoom(worldId);
      this.movePlayerTo(playerSave.position.x, playerSave.position.y, playerSave.position.facing);
      if (worldId !== VILLAGE_WORLD_ID) {
        const room = this.ensureRoom(worldId);
        this.focusRoom(room);
        this.markTeleport('player');
      } else {
        this.scene.cameras.main.setZoom(ZOOM);
        this.scene.cameras.main.setBounds(0, 0, this.getWorldWidth(), this.getWorldHeight());
      }
    }

    Object.values(save.worldStatus?.npcs ?? {}).forEach((npcSave) => {
      const npc = this.scene.findNpcByName?.(npcSave.name || npcSave.id);
      const sprite = npc?.sprite as Phaser.Physics.Arcade.Sprite | undefined;
      if (!sprite || !npcSave.position) return;
      const worldId = this.resolveSavedWorldId(npcSave.position.worldId, npcSave.position.x, npcSave.position.y);
      if (worldId !== VILLAGE_WORLD_ID) this.ensureRoom(worldId);
      const facing = npcSave.position.facing ?? npc.facing ?? 'down';
      npc.stopFollowing?.();
      npc.clearNavigation?.();
      npc.facing = facing;
      sprite.setPosition(npcSave.position.x, npcSave.position.y);
      sprite.body?.reset(npcSave.position.x, npcSave.position.y);
      sprite.setVelocity?.(0, 0);
      sprite.play?.(`idle-${facing}`, true);
      this.scene.worldStateManager?.updateEntityPosition?.(npc.name, npcSave.position.x, npcSave.position.y);
      this.scene.worldStateManager?.patchEntity?.(npc.name, { facing });
      if (worldId !== VILLAGE_WORLD_ID) this.markTeleport(this.actorKeyForNpc(npc));
    });
  }

  canUseTeleport(actorKey: string, timeMs = this.scene.time?.now ?? 0): boolean {
    return timeMs >= (this.teleportCooldownUntil.get(actorKey) ?? 0);
  }

  markTeleport(actorKey: string, timeMs = this.scene.time?.now ?? 0, cooldownMs = TELEPORT_COOLDOWN_MS): void {
    this.teleportCooldownUntil.set(actorKey, timeMs + cooldownMs);
  }

  private ensureRoom(roomId: string, templateId = 'two_bedroom_living_room'): RoomInstance {
    const room = this.getOrCreateRoom(roomId, templateId);
    if (this.builtRoomIds.has(room.id)) {
      this.registerObservationObjects(room);
      return room;
    }
    this.builtRoomIds.add(room.id);
    this.extendWorldBounds();
    this.drawRoomShell(room);
    this.drawFurniture(room);
    this.addCollision(room);
    this.addLights(room);
    this.registerObservationObjects(room);
    return room;
  }

  private getOrCreateRoom(roomId: string, templateId = 'two_bedroom_living_room'): RoomInstance {
    const id = (roomId || '001').trim() || '001';
    const existing = this.roomInstances.get(id);
    if (existing) {
      existing.label = this.resolveRoomLabel(id, existing.label);
      return existing;
    }

    const slot = id === '001' ? 0 : this.nextDynamicRoomIndex++;
    const col = slot % ROOM_COLUMNS;
    const row = Math.floor(slot / ROOM_COLUMNS);
    const x = BASE_ROOM.x + col * (BASE_ROOM.w + ROOM_GAP_X);
    const y = BASE_ROOM.y + row * (BASE_ROOM.h + ROOM_GAP_Y);
    const room: RoomInstance = {
      ...BASE_ROOM,
      id,
      label: this.resolveRoomLabel(id, id === '001' ? BASE_ROOM.label : `Room ${id}`),
      templateId,
      x,
      y,
      spawn: { x: x + BASE_ROOM.w / 2, y: y + BASE_ROOM.h - ROOM_ENTRY_SAFE_OFFSET },
    };
    this.roomInstances.set(id, room);
    return room;
  }

  private resolveRoomLabel(roomId: string, fallback: string): string {
    if (roomId === '001') return fallback;
    const views = this.scene.houseSaveAdapter?.getViews?.() ?? [];
    const view = views.find((entry: any) => entry?.house?.roomId === roomId || entry?.house?.id === roomId);
    const house = view?.house;
    if (!house) return fallback;
    const displayId = house.displayId || house.id;
    return `${displayId} 室内`;
  }

  private prepareRoomsForSave(save: GameSaveV1): void {
    const positions = [
      ...Object.values(save.players ?? {}).map((player) => player.position),
      ...Object.values(save.worldStatus?.npcs ?? {}).map((npc) => npc.position),
    ];
    const hasLegacyRoomPosition = positions.some((position) => (
      position
      && !position.worldId
      && position.x >= BASE_ROOM.x - 128
      && position.y >= BASE_ROOM.y - 128
    ));
    if (hasLegacyRoomPosition) this.ensureRoom('001');

    for (const house of save.worldStatus?.entities?.houses ?? []) {
      const roomId = house.roomId || `room:${house.id}`;
      this.ensureRoom(roomId);
      const definition = getHouseDefinition(house.definitionId);
      this.roomReturnPositions.set(roomId, {
        x: house.x + (definition?.doorOffset.x ?? 0),
        y: house.y + (definition?.doorOffset.y ?? 80) + 44,
      });
    }
  }

  private resolveSavedWorldId(worldId: string | undefined, x: number, y: number): string {
    if (worldId && worldId !== VILLAGE_WORLD_ID) return worldId;
    return this.findRoomContaining(x, y)?.id ?? VILLAGE_WORLD_ID;
  }

  private extendWorldBounds(): void {
    this.scene.physics.world.setBounds(0, 0, this.getWorldWidth(), this.getWorldHeight());
  }

  private getWorldWidth(): number {
    const roomMax = Array.from(this.roomInstances.values())
      .reduce((max, room) => Math.max(max, room.x + room.w + 128), 0);
    return Math.max(WORLD_W, roomMax);
  }

  private getWorldHeight(): number {
    const roomMax = Array.from(this.roomInstances.values())
      .reduce((max, room) => Math.max(max, room.y + room.h + 128), 0);
    return Math.max(WORLD_H, roomMax);
  }

  private drawRoomShell(room: RoomInstance): void {
    const { x, y, w, h } = room;
    const g = this.scene.add.graphics().setDepth(LAYER.GRASS + 2);
    this.roomObjects.push(g);

    g.fillStyle(0x111827, 1);
    g.fillRect(x - 24, y - 24, w + 48, h + 48);

    g.fillStyle(0x7a4b5a, 1);
    g.fillRect(x, y, w, h);
    g.fillStyle(0xd9b58e, 1);
    g.fillRect(x + 28, y + 52, w - 56, h - 84);

    g.fillStyle(0xc59271, 1);
    for (let row = 0; row < 9; row += 1) {
      for (let col = 0; col < 20; col += 1) {
        const tx = x + 40 + col * 32;
        const ty = y + 72 + row * 32;
        if (tx > x + w - 64 || ty > y + h - 80) continue;
        g.lineStyle(1, 0xb78366, 0.7);
        g.strokeRect(tx, ty, 32, 32);
      }
    }

    // Top bedrooms and lower living room.
    this.wallRect(x + 28, y + 50, w - 56, 18);
    this.wallRect(x + 28, y + 50, 18, h - 82);
    this.wallRect(x + w - 46, y + 50, 18, h - 82);
    this.wallRect(x + 28, y + h - 50, 260, 18);
    this.wallRect(x + 416, y + h - 50, 260, 18);
    this.wallRect(x + 28, y + 246, 236, 18);
    this.wallRect(x + 440, y + 246, 236, 18);
    this.wallRect(x + 340, y + 68, 18, 178);

    this.trimRect(x + 290, y + h - 50, 124, 18);
    this.trimRect(x + 264, y + 246, 176, 18);
  }

  private drawFurniture(room: RoomInstance): void {
    const { x, y } = room;

    this.rug(x + 270, y + 330, 164, 92, 0x8f506c, 0xf0c080);
    this.sofa(x + 214, y + 372, 96, 42, 0x6ca27b);
    this.sofa(x + 394, y + 372, 96, 42, 0x6ca27b);
    this.table(x + 330, y + 378, 72, 48);
    this.bookshelf(x + 84, y + 306, 42, 122);
    this.counter(x + 548, y + 312, 80, 42);

    this.bed(x + 94, y + 124, 90, 126, 0xef9ab3);
    this.nightstand(x + 198, y + 144);
    this.desk(x + 94, y + 206, 126, 34);

    this.bed(x + 520, y + 124, 90, 126, 0x91b7ef);
    this.nightstand(x + 474, y + 144);
    this.wardrobe(x + 620, y + 104, 38, 126);
  }

  private addCollision(room: RoomInstance): void {
    const { x, y, w, h } = room;
    const blocks: Rect[] = [
      { x: x + w / 2, y: y + 43, w: w - 40, h: 34 },
      { x: x + 36, y: y + h / 2, w: 28, h: h - 96 },
      { x: x + w - 36, y: y + h / 2, w: 28, h: h - 96 },
      { x: x + 158, y: y + h - 42, w: 260, h: 30 },
      { x: x + 548, y: y + h - 42, w: 260, h: 30 },
      { x: x + 146, y: y + 255, w: 236, h: 24 },
      { x: x + 558, y: y + 255, w: 236, h: 24 },
      { x: x + 349, y: y + 158, w: 24, h: 180 },
      { x: x + 262, y: y + 393, w: 116, h: 48 },
      { x: x + 442, y: y + 393, w: 116, h: 48 },
      { x: x + 366, y: y + 402, w: 76, h: 48 },
      { x: x + 105, y: y + 367, w: 48, h: 132 },
      { x: x + 588, y: y + 332, w: 88, h: 48 },
      { x: x + 139, y: y + 186, w: 98, h: 132 },
      { x: x + 564, y: y + 186, w: 98, h: 132 },
      { x: x + 640, y: y + 167, w: 42, h: 132 },
    ];

    for (const block of blocks) {
      createObstacleBlock(this.scene, this.scene.obstacles, block.x, block.y, block.w, block.h);
    }
  }

  private addLights(room: RoomInstance): void {
    const lights = [
      { id: 'living', x: room.x + 352, y: room.y + 374, radius: 240, color: 0xffcf8a, intensity: 0.76 },
      { id: 'bed-left', x: room.x + 172, y: room.y + 166, radius: 160, color: 0xffd9a8, intensity: 0.48 },
      { id: 'bed-right', x: room.x + 532, y: room.y + 166, radius: 160, color: 0xbfdcff, intensity: 0.42 },
    ];
    for (const light of lights) {
      this.scene.lightingSystem?.upsertStaticLight({
        id: `room:${room.id}:${light.id}`,
        x: light.x,
        y: light.y,
        radius: light.radius,
        color: light.color,
        intensity: light.intensity,
        flicker: 0.04,
        verticalScale: 0.72,
        coreScale: 0.58,
      });
    }
  }

  private registerObservationObjects(room: RoomInstance): void {
    const register = this.scene.registerWorldObject?.bind(this.scene);
    if (!register) return;

    for (const objectItem of buildRoomObservationObjects(room)) {
      register(objectItem.id, objectItem.kind, objectItem.x, objectItem.y, {
        blocking: objectItem.blocking,
        interactable: objectItem.interactable,
        state: objectItem.state,
        meta: objectItem.meta,
      });
    }
  }

  private focusRoom(room: RoomInstance): void {
    this.scene.cameras.main.setZoom(ZOOM);
    this.scene.cameras.main.setBounds(room.x - 48, room.y - 48, room.w + 96, room.h + 96);
  }

  private transitionPlayerIntoRoom(room: RoomInstance, entryPoint?: { x: number; y: number }): void {
    const sprite = this.scene.player?.sprite as Phaser.Physics.Arcade.Sprite | undefined;
    if (!sprite) {
      this.movePlayerTo(room.spawn.x, room.spawn.y, 'up');
      this.focusRoom(room);
      return;
    }

    this.transitioning = true;
    this.scene.pauseInput?.();
    this.scene.player.isActing = true;
    this.scene.player.facing = 'up';
    sprite.play('walk-up', true);
    sprite.setVelocity?.(0, 0);

    const body = sprite.body as Phaser.Physics.Arcade.Body | undefined;
    const bodyWasEnabled = body?.enable ?? true;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }

    const target = entryPoint ?? { x: sprite.x, y: sprite.y - 40 };
    this.scene.tweens.add({
      targets: sprite,
      x: target.x,
      y: target.y - 14,
      alpha: 0.08,
      duration: 720,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (body) body.enable = bodyWasEnabled;
        this.movePlayerTo(room.spawn.x, room.spawn.y, 'up');
        this.focusRoom(room);
        sprite.setAlpha(0.08);
        this.scene.tweens.add({
          targets: sprite,
          alpha: 1,
          duration: 260,
          ease: 'Sine.easeOut',
          onComplete: () => {
            this.scene.player.isActing = false;
            this.scene.resumeInput?.();
            this.transitioning = false;
          },
        });
      },
    });
  }

  private updatePlayerExit(timeMs: number): void {
    if (this.transitioning) return;
    const sprite = this.scene.player?.sprite as Phaser.Physics.Arcade.Sprite | undefined;
    if (!sprite?.active || !this.canUseTeleport('player', timeMs)) return;
    const room = this.findRoomContaining(sprite.x, sprite.y);
    if (!room || !this.isNearRoomExit(sprite.x, sprite.y, room)) return;
    this.markTeleport('player', timeMs);
    this.transitionPlayerOutOfRoom(room);
  }

  private updateNpcExits(timeMs: number): void {
    const npcs = this.scene.allNpcs?.() ?? [];
    for (const npc of npcs) {
      const sprite = npc?.sprite as Phaser.Physics.Arcade.Sprite | undefined;
      if (!sprite?.active || !sprite.visible) continue;
      const actorKey = this.actorKeyForNpc(npc);
      if (!this.canUseTeleport(actorKey, timeMs)) continue;
      const room = this.findRoomContaining(sprite.x, sprite.y);
      if (!room || !this.isNearRoomExit(sprite.x, sprite.y, room)) continue;
      this.markTeleport(actorKey, timeMs);
      this.exitNpcRoom(npc, room);
    }
  }

  private transitionPlayerOutOfRoom(room: RoomInstance): void {
    const sprite = this.scene.player?.sprite as Phaser.Physics.Arcade.Sprite | undefined;
    if (!sprite) {
      this.movePlayerToReturn(room);
      return;
    }

    this.transitioning = true;
    this.scene.pauseInput?.();
    this.scene.player.isActing = true;
    this.scene.player.facing = 'down';
    sprite.play('walk-down', true);
    sprite.setVelocity?.(0, 0);

    const body = sprite.body as Phaser.Physics.Arcade.Body | undefined;
    const bodyWasEnabled = body?.enable ?? true;
    if (body) {
      body.setVelocity(0, 0);
      body.enable = false;
    }

    const exit = this.getRoomExitPoint(room);
    this.scene.tweens.add({
      targets: sprite,
      x: exit.x,
      y: exit.y + 12,
      alpha: 0.08,
      duration: 560,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (body) body.enable = bodyWasEnabled;
        this.movePlayerToReturn(room);
        sprite.setAlpha(0.08);
        this.scene.tweens.add({
          targets: sprite,
          alpha: 1,
          duration: 220,
          ease: 'Sine.easeOut',
          onComplete: () => {
            this.scene.player.isActing = false;
            this.scene.resumeInput?.();
            this.transitioning = false;
          },
        });
      },
    });
  }

  private exitNpcRoom(npc: any, room: RoomInstance, onComplete?: () => void, skipTransition = false): void {
    const sprite = npc?.sprite as Phaser.Physics.Arcade.Sprite | undefined;
    if (!sprite) return;
    const exit = this.getRoomExitPoint(room);
    const returnTo = this.getReturnPosition(room);
    const offset = stableOffset(npc.name || room.id);
    const target = {
      x: returnTo.x + Math.round(offset.x * 0.45),
      y: returnTo.y + 10,
    };
    npc.stopFollowing?.();
    npc.clearNavigation?.();
    npc.facing = 'down';
    sprite.setVelocity?.(0, 0);
    const body = sprite.body as Phaser.Physics.Arcade.Body | undefined;
    body?.setVelocity(0, 0);
    const completeMove = () => {
      sprite.setPosition(target.x, target.y);
      body?.reset(target.x, target.y);
      sprite.setVelocity?.(0, 0);
      sprite.play?.('idle-down', true);
      sprite.setAlpha(1);
      this.scene.worldStateManager?.updateEntityPosition?.(npc.name, target.x, target.y);
      this.scene.worldStateManager?.patchEntity?.(npc.name, { facing: 'down' });
      onComplete?.();
    };

    if (skipTransition) {
      completeMove();
      return;
    }

    this.scene.tweens.add({
      targets: sprite,
      x: exit.x,
      y: exit.y + 12,
      alpha: 0.08,
      duration: 440,
      ease: 'Sine.easeInOut',
      onComplete: completeMove,
    });
  }

  private movePlayerToReturn(room: RoomInstance): void {
    const target = this.getReturnPosition(room);
    this.returnPosition = null;
    this.movePlayerTo(target.x, target.y, 'down');
    this.scene.cameras.main.setZoom(ZOOM);
    this.scene.cameras.main.setBounds(0, 0, this.getWorldWidth(), this.getWorldHeight());
  }

  private getReturnPosition(room: RoomInstance): { x: number; y: number } {
    return this.roomReturnPositions.get(room.id) ?? this.returnPosition ?? { x: SPAWN_X, y: SPAWN_Y };
  }

  private findRoomContaining(x: number, y: number): RoomInstance | null {
    for (const room of this.roomInstances.values()) {
      if (x < room.x || x > room.x + room.w || y < room.y || y > room.y + room.h) continue;
      return room;
    }
    return null;
  }

  private getRoomExitPoint(room: RoomInstance): { x: number; y: number } {
    return { x: room.x + room.w / 2, y: room.y + room.h - ROOM_EXIT_Y_OFFSET };
  }

  private isNearRoomExit(x: number, y: number, room: RoomInstance): boolean {
    const exit = this.getRoomExitPoint(room);
    return Phaser.Math.Distance.Between(x, y, exit.x, exit.y) <= TELEPORT_RADIUS;
  }

  private updateDebugGraphics(): void {
    if (!this.scene.physicsDebugEnabled) {
      this.debugGraphics?.clear();
      this.debugGraphics?.setVisible(false);
      return;
    }

    const graphics = this.ensureDebugGraphics();
    graphics.clear();
    graphics.setVisible(true);
    graphics.lineStyle(2, TP_DEBUG_COLOR, 0.95);
    graphics.fillStyle(TP_DEBUG_COLOR, 0.08);

    for (const room of this.roomInstances.values()) {
      if (!this.builtRoomIds.has(room.id)) continue;
      const exit = this.getRoomExitPoint(room);
      const rect = new Phaser.Geom.Rectangle(
        exit.x - TELEPORT_RADIUS,
        exit.y - TELEPORT_RADIUS,
        TELEPORT_RADIUS * 2,
        TELEPORT_RADIUS * 2,
      );
      graphics.fillRectShape(rect);
      graphics.strokeRectShape(rect);
      graphics.strokeCircle(exit.x, exit.y, TELEPORT_RADIUS);
    }
  }

  private ensureDebugGraphics(): Phaser.GameObjects.Graphics {
    if (!this.debugGraphics) {
      this.debugGraphics = this.scene.add.graphics().setDepth(9995);
    }
    return this.debugGraphics as Phaser.GameObjects.Graphics;
  }

  private actorKeyForNpc(npc: any): string {
    return `npc:${npc?.name ?? 'unknown'}`;
  }

  private movePlayerTo(x: number, y: number, facing: 'up' | 'down' | 'left' | 'right'): void {
    const sprite = this.scene.player?.sprite;
    if (!sprite) return;
    sprite.setPosition(x, y);
    sprite.body?.reset(x, y);
    sprite.setVelocity?.(0, 0);
    if (this.scene.player) {
      this.scene.player.facing = facing;
      sprite.play(`idle-${facing}`, true);
    }
    this.scene.worldStateManager?.updateEntityPosition?.('player', x, y);
    this.scene.worldStateManager?.patchEntity?.('player', { facing });
    this.scene.cameras.main.startFollow(sprite, true, 0.1, 0.1);
  }

  private wallRect(x: number, y: number, w: number, h: number): void {
    const rect = this.scene.add.rectangle(x, y, w, h, 0x5f3c58, 1)
      .setOrigin(0, 0)
      .setDepth(LAYER.WALL(y));
    this.roomObjects.push(rect);
  }

  private trimRect(x: number, y: number, w: number, h: number): void {
    const rect = this.scene.add.rectangle(x, y, w, h, 0xbf8f5d, 1)
      .setOrigin(0, 0)
      .setDepth(LAYER.WALL(y) + 1);
    this.roomObjects.push(rect);
  }

  private rug(x: number, y: number, w: number, h: number, color: number, trim: number): void {
    const rect = this.scene.add.rectangle(x, y, w, h, color, 1)
      .setOrigin(0, 0)
      .setDepth(LAYER.DETAIL + 6);
    const border = this.scene.add.rectangle(x + 8, y + 8, w - 16, h - 16)
      .setOrigin(0, 0)
      .setStrokeStyle(3, trim, 0.8)
      .setDepth(LAYER.DETAIL + 7);
    this.roomObjects.push(rect, border);
  }

  private bed(x: number, y: number, w: number, h: number, blanket: number): void {
    const base = this.scene.add.rectangle(x, y, w, h, 0x7b4f3e, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y));
    const sheet = this.scene.add.rectangle(x + 10, y + 12, w - 20, h - 24, blanket, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y) + 1);
    const pillow = this.scene.add.rectangle(x + 18, y + 18, w - 36, 24, 0xfff2d2, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y) + 2);
    this.roomObjects.push(base, sheet, pillow);
  }

  private sofa(x: number, y: number, w: number, h: number, color: number): void {
    const body = this.scene.add.rectangle(x, y, w, h, color, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y));
    const back = this.scene.add.rectangle(x, y - 14, w, 18, 0x476d58, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y));
    this.roomObjects.push(body, back);
  }

  private table(x: number, y: number, w: number, h: number): void {
    const table = this.scene.add.rectangle(x, y, w, h, 0x8b5a3c, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y));
    const top = this.scene.add.rectangle(x + 6, y + 6, w - 12, h - 12, 0xb06f46, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y) + 1);
    this.roomObjects.push(table, top);
  }

  private bookshelf(x: number, y: number, w: number, h: number): void {
    const shelf = this.scene.add.rectangle(x, y, w, h, 0x6f4631, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y));
    this.roomObjects.push(shelf);
    for (let i = 0; i < 4; i += 1) {
      const row = this.scene.add.rectangle(x + 6, y + 16 + i * 26, w - 12, 5, 0xc99055, 1)
        .setOrigin(0, 0)
        .setDepth(LAYER.WALL(y) + 1);
      this.roomObjects.push(row);
    }
  }

  private counter(x: number, y: number, w: number, h: number): void {
    const counter = this.scene.add.rectangle(x, y, w, h, 0xb18b62, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y));
    const top = this.scene.add.rectangle(x, y, w, 10, 0xf0c995, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y) + 1);
    this.roomObjects.push(counter, top);
  }

  private nightstand(x: number, y: number): void {
    const stand = this.scene.add.rectangle(x, y, 36, 36, 0x8b5a3c, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y));
    this.roomObjects.push(stand);
  }

  private desk(x: number, y: number, w: number, h: number): void {
    const desk = this.scene.add.rectangle(x, y, w, h, 0x8b5a3c, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y));
    this.roomObjects.push(desk);
  }

  private wardrobe(x: number, y: number, w: number, h: number): void {
    const wardrobe = this.scene.add.rectangle(x, y, w, h, 0x6f4631, 1).setOrigin(0, 0).setDepth(LAYER.WALL(y));
    this.roomObjects.push(wardrobe);
  }
}
