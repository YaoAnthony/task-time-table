/**
 * FarmSystem — manages all FarmTile entities.
 * Handles tile creation, state updates, interaction dispatch, backend sync,
 * and per-frame crop visual updates.
 */

import Phaser from 'phaser';
import type { FarmTileStateType } from '../types';
import {
  FarmTile,
  registerFarmTileTextures,
  registerCropTextures,
  type CropData,
} from '../entities/FarmTile';
import { T } from '../world/utils';
import { gameBus } from '../shared/EventBus';
import { WorldGrid, ObjectType } from '../shared/WorldGrid';
import { WorldStateManager } from '../shared/WorldStateManager';
import type { WorldActionDispatcher } from './WorldActionSystem';

export interface FarmTileBackendData {
  tx:        number;
  ty:        number;
  state:     string;
  cropId?:   string | null;
  plantRow?: number;
  numStages?: number;
  plantedAt?: number | null;
  readyAt?:  number | null;
  waterExpiry?: number | null;
}

export class FarmSystem {
  private tiles       = new Map<string, FarmTile>();
  private scene:      Phaser.Scene;
  private grid:       WorldGrid | null;
  private worldState: WorldStateManager | null;
  private actionDispatcher: WorldActionDispatcher | null = null;
  /** Set of tile keys whose sensor is currently overlapping the player */
  private overlapping = new Set<string>();

  constructor(scene: Phaser.Scene, grid?: WorldGrid | null, worldState?: WorldStateManager | null) {
    this.scene = scene;
    this.grid  = grid ?? null;
    this.worldState = worldState ?? null;
    registerFarmTileTextures(scene);
    registerCropTextures(scene);
  }

  setActionDispatcher(dispatcher: WorldActionDispatcher | null): void {
    this.actionDispatcher = dispatcher;
  }

  /**
   * Register a Phaser Arcade overlap between all existing (and future) tile
   * sensors and the player sprite so the farm knows which tiles the player
   * is currently standing on (passthrough — no blocking).
   *
   * Call once from GameScene.create() AFTER the player is created.
   */
  registerPlayerSensors(playerSprite: Phaser.Physics.Arcade.Sprite): void {
    for (const [k, tile] of this.tiles) {
      this._addSensorOverlap(k, tile, playerSprite);
    }
    // Store so newly-created tiles can also register
    (this as any)._playerSprite = playerSprite;
  }

  private _addSensorOverlap(
    key:    string,
    tile:   FarmTile,
    player: Phaser.Physics.Arcade.Sprite,
  ): void {
    const zone = tile.sensorZone;
    if (!zone) return;
    this.scene.physics.add.overlap(player, zone,
      () => { this.overlapping.add(key); },
    );
  }

  private key(tx: number, ty: number): string {
    return `${tx},${ty}`;
  }

  private makeCropData(d: FarmTileBackendData): CropData | null {
    if (!d.cropId || d.plantedAt == null || d.readyAt == null) return null;
    return {
      cropId:    d.cropId,
      plantRow:  d.plantRow ?? 0,
      numStages: d.numStages ?? 4,
      plantedAt: d.plantedAt,
      readyAt:   d.readyAt,
    };
  }

  // ── Tile management ────────────────────────────────────────────────────────

  createTile(
    tx: number,
    ty: number,
    state: FarmTileStateType,
    cropData?: CropData | null,
  ): FarmTile {
    const k = this.key(tx, ty);
    const existing = this.tiles.get(k);
    if (existing) {
      existing.updateState(state, cropData);
      return existing;
    }
    const tile = new FarmTile(this.scene, tx, ty, state, cropData);
    this.tiles.set(k, tile);
    this.grid?.setObject(tx, ty, ObjectType.FARM_TILLED);  // farm tiles don't block pathfinding
    this.syncTileState(tx, ty, state, cropData);
    // If player already registered, wire up the new tile's sensor immediately
    const player = (this as any)._playerSprite as Phaser.Physics.Arcade.Sprite | undefined;
    if (player) this._addSensorOverlap(k, tile, player);
    return tile;
  }

  updateTileState(tx: number, ty: number, state: string, cropData?: CropData | null): void {
    const validState = state as FarmTileStateType;
    const tile = this.tiles.get(this.key(tx, ty));
    if (tile) {
      tile.updateState(validState, cropData);
      this.syncTileState(tx, ty, validState, cropData);
    } else {
      this.createTile(tx, ty, validState, cropData);
    }
  }

  removeTile(tx: number, ty: number): void {
    const tile = this.tiles.get(this.key(tx, ty));
    if (tile) {
      tile.destroy();
      this.tiles.delete(this.key(tx, ty));
      this.grid?.setObject(tx, ty, ObjectType.EMPTY);
      this.worldState?.unregisterCrop(this.key(tx, ty));
      this.worldState?.unregisterObject(this.key(tx, ty));
    }
  }

  canTill(tx: number, ty: number): boolean {
    return !this.tiles.has(this.key(tx, ty));
  }

  /** Restore persisted tiles from backend on game ready. */
  loadFromBackend(tiles: FarmTileBackendData[]): void {
    for (const t of tiles) {
      if (t.state === 'harvested') continue;
      const validState = t.state as FarmTileStateType;
      const cropData = this.makeCropData(t);
      this.createTile(t.tx, t.ty, validState, cropData);
    }
  }

  // ── Per-frame update ───────────────────────────────────────────────────────

  /** Called every frame from GameScene.update(). Updates crop visuals + clears overlap set. */
  update(gameTick: number): void {
    this.overlapping.clear();   // Phaser overlap fires each frame; cleared so only current frame counts
    for (const tile of this.tiles.values()) {
      const prevState = tile.state;
      tile.updateCropVisual(gameTick);
      if (tile.state !== prevState) {
        this.syncTileState(tile.tx, tile.ty, tile.state, tile.cropData);
      }
    }
  }

  // ── Player interaction ─────────────────────────────────────────────────────

  /** Collect candidate tile keys: sensor-overlapping first, then adjacent. */
  private getCandidateKeys(tx: number, ty: number, _playerX: number, _playerY: number): string[] {
    const sensorKeys = [...this.overlapping];
    const nearbyKeys = ([
      [tx, ty], [tx - 1, ty], [tx + 1, ty], [tx, ty - 1], [tx, ty + 1],
    ] as [number, number][])
      .map(([cx, cy]) => this.key(cx, cy))
      .filter(k => !this.overlapping.has(k));
    return [...sensorKeys, ...nearbyKeys];
  }

  /**
   * Space key — TOOL USE: scythe→till, watering can→water, seed in hand→plant.
   * Does NOT handle harvest (that belongs to F / interact).
   */
  handleToolUse(
    playerX: number,
    playerY: number,
    currentTool: string,
    heldItemId?: string,
  ): boolean {
    const tx = Math.floor(playerX / T);
    const ty = Math.floor(playerY / T);

    // Scythe on bare ground → till (pass 'scythe' so backend validates capability)
    if (currentTool === 'scythe' && this.canTill(tx, ty)) {
      if (this.actionDispatcher) {
        return this.actionDispatcher.dispatchAction({
          type: 'TILL_TILE',
          actorId: 'player',
          tx,
          ty,
          itemId: 'scythe',
        }).ok;
      }
      return this.applyTillTile('player', tx, ty, 'scythe');
    }

    const keys = this.getCandidateKeys(tx, ty, playerX, playerY);
    for (const k of keys) {
      const tile = this.tiles.get(k);
      if (!tile) continue;
      if (!this.overlapping.has(k) && !tile.isNearPlayer(playerX, playerY, 56)) continue;

      const state = tile.state;
      const [cx, cy] = [tile.tx, tile.ty];

      // Watering can (currentTool 'water' → itemId 'watering_can' for backend validation)
      if (currentTool === 'water' && ['tilled', 'seeded', 'growing', 'watered'].includes(state)) {
        if (this.actionDispatcher) {
          return this.actionDispatcher.dispatchAction({
            type: 'WATER_TILE',
            actorId: 'player',
            tx: cx,
            ty: cy,
            itemId: 'watering_can',
          }).ok;
        }
        return this.applyWaterTile('player', cx, cy, 'watering_can');
      }

      // Seed in hand → plant
      if (heldItemId?.endsWith('_seed') && ['tilled', 'watered'].includes(state)) {
        if (this.actionDispatcher) {
          return this.actionDispatcher.dispatchAction({
            type: 'PLANT_CROP',
            actorId: 'player',
            tx: cx,
            ty: cy,
            itemId: heldItemId,
          }).ok;
        }
        return this.applyPlantCrop('player', cx, cy, heldItemId);
      }
    }
    return false;
  }

  /**
   * F key — INTERACT: harvest mature crop only.
   * Picking up WorldItems and talking to NPCs is handled by GameScene separately.
   */
  handleInteract(playerX: number, playerY: number): boolean {
    const tx = Math.floor(playerX / T);
    const ty = Math.floor(playerY / T);
    const keys = this.getCandidateKeys(tx, ty, playerX, playerY);

    for (const k of keys) {
      const tile = this.tiles.get(k);
      if (!tile) continue;
      if (!this.overlapping.has(k) && !tile.isNearPlayer(playerX, playerY, 56)) continue;

      if (tile.state === 'ready') {
        gameBus.emit('farm:action', { action: 'harvest', tx: tile.tx, ty: tile.ty });
        tile.updateState('harvested', null);
        return true;
      }
    }
    return false;
  }

  harvestTile(tx: number, ty: number): boolean {
    const cropId = this.worldState?.getCrop(this.key(tx, ty))?.id ?? this.key(tx, ty);
    if (this.actionDispatcher) {
      return this.actionDispatcher.dispatchAction({
        type: 'HARVEST_CROP',
        actorId: 'player',
        cropId,
        tx,
        ty,
      }).ok;
    }
    return this.applyHarvestCrop('player', tx, ty, cropId);
  }

  applyHarvestCrop(_actorId: string, tx: number, ty: number, cropId: string): boolean {
    const tile = this.tiles.get(this.key(tx, ty));
    if (!tile || tile.state !== 'ready') return false;

    gameBus.emit('farm:action', { action: 'harvest', tx: tile.tx, ty: tile.ty });
    tile.updateState('harvested', null);
    this.syncTileState(tx, ty, 'harvested', null);
    this.worldState?.patchCrop(cropId, {
      state: 'harvested',
      readyAt: null,
    });
    return true;
  }

  applyTillTile(_actorId: string, tx: number, ty: number, itemId?: string): boolean {
    if (!this.canTill(tx, ty)) return false;
    gameBus.emit('farm:action', { action: 'till', tx, ty, itemId });
    this.createTile(tx, ty, 'tilled', null);
    return true;
  }

  applyWaterTile(_actorId: string, tx: number, ty: number, itemId?: string): boolean {
    const tile = this.tiles.get(this.key(tx, ty));
    if (!tile || !['tilled', 'seeded', 'growing', 'watered'].includes(tile.state)) return false;
    gameBus.emit('farm:action', { action: 'water', tx, ty, itemId });
    return true;
  }

  applyPlantCrop(_actorId: string, tx: number, ty: number, itemId: string): boolean {
    const tile = this.tiles.get(this.key(tx, ty));
    if (!tile || !['tilled', 'watered'].includes(tile.state)) return false;
    gameBus.emit('farm:action', { action: 'plant', tx, ty, itemId });
    return true;
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  getTile(tx: number, ty: number): FarmTile | undefined {
    return this.tiles.get(this.key(tx, ty));
  }

  getAllTiles(): FarmTile[] {
    return [...this.tiles.values()];
  }

  private syncTileState(
    tx: number,
    ty: number,
    state: FarmTileStateType,
    cropData?: CropData | null,
  ): void {
    if (!this.worldState) return;

    const key = this.key(tx, ty);
    const { cx, cy } = this.grid?.cellToWorld(tx, ty) ?? { cx: tx * T + T / 2, cy: ty * T + T / 2 };

    this.worldState.registerObject({
      id: key,
      kind: 'farm_tile',
      x: cx,
      y: cy,
      blocking: false,
      interactable: state === 'ready',
      state,
      meta: {
        tx,
        ty,
      },
    });

    this.worldState.registerCrop({
      id: key,
      tileKey: key,
      tx,
      ty,
      cropId: cropData?.cropId ?? 'empty',
      state,
      plantedAt: cropData?.plantedAt ?? null,
      readyAt: cropData?.readyAt ?? null,
      numStages: cropData?.numStages,
      plantRow: cropData?.plantRow,
    });
  }
}
