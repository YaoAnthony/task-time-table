import type { CreatureState } from '../../../../../Redux/Features/gameSlice';

export function spawnRemotePlayer(scene: any, x: number, y: number, displayName: string) : void {
    scene.remotePlayer = scene.renderSyncSystem.spawnRemotePlayer(scene.remotePlayer, x, y, displayName);
    scene.multiplayActive = true;
    console.log('[GameScene] spawnRemotePlayer:', displayName);
  
}

export function removeRemotePlayer(scene: any) : void {
    scene.remotePlayer = scene.renderSyncSystem.removeRemotePlayer(scene.remotePlayer);
    scene.multiplayActive = false;
  
}

export function applyRemoteEvent(scene: any, type: string, payload: Record<string, unknown>) : void {
    scene.worldFacade.applyRemoteEvent(type, payload);
  
}

export function applyRemoteFarmEvent(scene: any, type: string, payload: Record<string, unknown>) : void {
    const tile = payload.tile as {
      tx?: number;
      ty?: number;
      state?: string;
      cropId?: string | null;
      plantRow?: number;
      numStages?: number;
      plantedAt?: number | null;
      readyAt?: number | null;
    } | undefined;
    const farmTiles = Array.isArray(payload.farmTiles) ? payload.farmTiles as Array<{
      tx: number;
      ty: number;
      state: string;
      cropId?: string | null;
      plantRow?: number;
      numStages?: number;
      plantedAt?: number | null;
      readyAt?: number | null;
    }> : [];

    if (type === 'farm_tick' && farmTiles.length > 0) {
      farmTiles.forEach((farmTile) => {
        const cropData = farmTile.cropId != null && farmTile.plantedAt != null && farmTile.readyAt != null ? {
          cropId: farmTile.cropId,
          plantRow: farmTile.plantRow ?? 0,
          numStages: farmTile.numStages ?? 4,
          plantedAt: farmTile.plantedAt,
          readyAt: farmTile.readyAt,
        } : null;
        scene.farmSystem.updateTileState(farmTile.tx, farmTile.ty, farmTile.state, cropData);
      });
      return;
    }

    if (tile?.tx != null && tile.ty != null && tile.state) {
      const cropData = tile.cropId != null && tile.plantedAt != null && tile.readyAt != null ? {
        cropId: tile.cropId,
        plantRow: tile.plantRow ?? 0,
        numStages: tile.numStages ?? 4,
        plantedAt: tile.plantedAt,
        readyAt: tile.readyAt,
      } : null;
      scene.farmSystem.updateTileState(tile.tx, tile.ty, tile.state, cropData);
    }

    if (type === 'farm_till') {
      const droppedSeed = payload.droppedSeed as { itemId?: string } | undefined;
      if (droppedSeed?.itemId && tile?.tx != null && tile.ty != null) {
        scene.spawnWorldItem(tile.tx * 32 + 16, tile.ty * 32 + 36, droppedSeed.itemId, 'room');
      }
      return;
    }

    if (type === 'farm_harvest') {
      const drops = Array.isArray(payload.drops) ? payload.drops as Array<{ itemId?: string }> : [];
      const tx = typeof payload.tx === 'number' ? payload.tx : tile?.tx;
      const ty = typeof payload.ty === 'number' ? payload.ty : tile?.ty;
      if (tx == null || ty == null || drops.length === 0) return;
      scene.farmSystem.updateTileState(tx, ty, 'harvested', null);
      const wx = tx * 32 + 16;
      const wy = ty * 32 + 16;
      drops.forEach((drop, i) => {
        if (!drop.itemId) return;
        const angle = (i / drops.length) * Math.PI * 2;
        scene.spawnWorldItem(
          wx + Math.cos(angle) * (20 + i * 10),
          wy + Math.sin(angle) * (20 + i * 10),
          drop.itemId,
          'room',
        );
      });
    }
  
}

export function buildWorldSnapshot(scene: any, hostDisplayName?: string) : import('../systems/MultiplaySystem').WorldSnapshot {
    return {
      choppedTreeIds: [...scene.trees.entries()]
        .filter(([, t]: [string, any]) => t.isChopped())
        .map(([id]: [string, any]) => id),
      worldItems: scene.drops
        .filter((d: any) => !d.gone)
        .map((d: any) => ({ itemId: d.itemId, x: d.worldX, y: d.worldY })),
      farmTiles: scene.farmSystem.getAllTiles().map((tile: any) => ({
        tx: tile.tx,
        ty: tile.ty,
        state: tile.state,
        cropId: tile.cropData?.cropId,
        plantRow: tile.cropData?.plantRow,
        numStages: tile.cropData?.numStages,
        plantedAt: tile.cropData?.plantedAt ?? null,
        readyAt: tile.cropData?.readyAt ?? null,
      })),
      creatureStates: scene.getCreatureStates().map((creature: any) => ({
        creatureId: creature.creatureId,
        type: creature.type,
        x: creature.x,
        y: creature.y,
        state: creature.state,
      })),
      hostX: scene.player?.sprite.x,
      hostY: scene.player?.sprite.y,
      hostDisplayName,
      // Sync game clock guest will snap to host's gameTick on join
      gameTick: scene.dayCycle?.gameTick,
    };
  
}

export function getWorldSnapshot(scene: any, hostDisplayName?: string) : import('../systems/MultiplaySystem').WorldSnapshot {
    return scene.buildWorldSnapshot(hostDisplayName);
  
}

export function setGameTick(scene: any, tick: number) : void {
    if (scene.dayCycle) scene.dayCycle.gameTick = tick;
  
}

export function applyWorldSnapshotData(scene: any, snapshot: {
    choppedTreeIds: string[];
    worldItems: Array<{ itemId: string; x: number; y: number }>;
    farmTiles?: Array<{
      tx: number;
      ty: number;
      state: string;
      cropId?: string;
      plantRow?: number;
      numStages?: number;
      plantedAt?: number | null;
      readyAt?: number | null;
    }>;
    creatureStates?: Array<{
      creatureId: string;
      type: string;
      x: number;
      y: number;
      state: string;
    }>;
  }) : void {
    scene.renderSyncSystem.applyWorldSnapshot(snapshot, scene.trees);
    if (snapshot.farmTiles) {
      const snapshotKeys = new Set(snapshot.farmTiles.map((tile: any) => `${tile.tx},${tile.ty}`));
      for (const tile of scene.farmSystem.getAllTiles()) {
        if (!snapshotKeys.has(`${tile.tx},${tile.ty}`)) {
          scene.farmSystem.removeTile(tile.tx, tile.ty);
        }
      }
      snapshot.farmTiles.forEach((tile: any) => {
        const cropData = tile.cropId != null && tile.plantedAt != null && tile.readyAt != null ? {
          cropId: tile.cropId,
          plantRow: tile.plantRow ?? 0,
          numStages: tile.numStages ?? 4,
          plantedAt: tile.plantedAt,
          readyAt: tile.readyAt,
        } : null;
        scene.farmSystem.updateTileState(tile.tx, tile.ty, tile.state, cropData);
      });
    }
    if (snapshot.creatureStates?.length) {
      scene.restoreCreatures(snapshot.creatureStates as CreatureState[]);
    }
  
}

export function applyWorldSnapshot(scene: any, snapshot: { choppedTreeIds: string[]; worldItems: Array<{ itemId: string; x: number; y: number }> }) : void {
    scene.worldFacade.applyWorldSnapshot(snapshot);
  
}
