import type Phaser from 'phaser';
import type { FacingDirection, IdleGameState, TreeSaveState } from '../../../../../Types/Profile';
import type { GameWorldState } from '../types';
import type { NpcMindState } from '../shared/worldStateTypes';
import type { WorldStateManager } from '../shared/WorldStateManager';
import type { Player } from '../entities/Player';
import type { Bed, BedColor } from '../entities/Bed';
import type { NestView } from '../entities/NestView';
import type { TreeView } from '../entities/TreeView';
import type { DayCycle } from './DayCycle';
import type { RenderSyncSystem } from './RenderSyncSystem';
import type { SleepManager } from './SleepManager';
import type { NestStateSystem } from './NestStateSystem';
import {
  normalizeGameWorldState,
  restoreNpcMindsFromSave,
  serializeNpcMindsForSave,
  serializeWorldForSave,
} from '../persistence/save/IdleGameSaveMapper';

export interface SavingSystemOptions {
  scene: Phaser.Scene;
  getPlayer: () => Player;
  getDayCycle: () => DayCycle;
  getTrees: () => Map<string, TreeView>;
  getBeds: () => Bed[];
  getNests: () => NestView[];
  getWorldStateManager: () => WorldStateManager;
  getActiveNpcIdSet: () => Set<string>;
  getSleepManager: () => SleepManager;
  getNestStateSystem: () => NestStateSystem;
  getRenderSyncSystem: () => RenderSyncSystem;
  nextNestId: () => string;
}

/**
 * Converts runtime Phaser/entity state to the serializable IdleGame save shape,
 * and restores saved world objects back into the scene.
 */
export class SavingSystem {
  constructor(private readonly options: SavingSystemOptions) {}

  init(): void {
    // Present for symmetry with other systems and future migration hooks.
  }

  getGameState(): IdleGameState {
    const playerState = this.options.getPlayer().getState();
    const facing = (['down', 'up', 'left', 'right'] as FacingDirection[]).includes(
      playerState.facing as FacingDirection,
    )
      ? playerState.facing as FacingDirection
      : 'down';

    const trees: TreeSaveState[] = [...this.options.getTrees().values()].map((tree) => tree.getState());

    return {
      x: playerState.x,
      y: playerState.y,
      gameTick: this.options.getDayCycle().gameTick,
      facing,
      trees,
      worldState: this.serializeWorld(),
    };
  }

  serializeNpcMinds(): Record<string, NpcMindState> {
    return serializeNpcMindsForSave(
      this.options.getWorldStateManager().getNpcMindStates(),
      this.options.getActiveNpcIdSet(),
    );
  }

  serializeWorld(): GameWorldState {
    return serializeWorldForSave({
      beds: this.options.getBeds().map((bed) => ({
        color: bed.color,
        x: bed.worldX,
        y: bed.worldY,
      })),
      nests: this.options.getWorldStateManager().getNestStates(),
      npcMinds: this.serializeNpcMinds(),
    });
  }

  loadWorldState(worldState: GameWorldState | null): void {
    const normalized = normalizeGameWorldState(worldState);
    if (!normalized) return;

    restoreNpcMindsFromSave(
      normalized,
      this.options.getActiveNpcIdSet(),
      (mind) => this.options.getWorldStateManager().registerNpcMindState(mind),
    );

    this.restoreBeds(normalized);
    this.restoreNests(normalized);
  }

  private restoreBeds(worldState: GameWorldState): void {
    if (!worldState.beds || worldState.beds.length === 0) return;

    const renderSyncSystem = this.options.getRenderSyncSystem();
    const beds = this.options.getBeds();
    renderSyncSystem.clearBeds(beds);

    for (const { color, x, y } of worldState.beds) {
      renderSyncSystem.createBed(
        x,
        y,
        color as BedColor,
        beds,
        this.options.getSleepManager(),
        this.options.getDayCycle(),
      );
    }
  }

  private restoreNests(worldState: GameWorldState): void {
    if (!worldState.nests || worldState.nests.length === 0) return;

    const threshold = 24;
    const nests = this.options.getNests();
    const renderSyncSystem = this.options.getRenderSyncSystem();
    const nestStateSystem = this.options.getNestStateSystem();
    const worldStateManager = this.options.getWorldStateManager();

    for (const saved of worldState.nests) {
      const match = nests.find((nest) =>
        !nest.gone &&
        Math.abs(nest.x - saved.x) < threshold &&
        Math.abs(nest.y - saved.y) < threshold,
      );

      if (match) {
        if (saved.state === 'has_egg') nestStateSystem.restoreEgg(match.id, this.options.scene.time.now);
        continue;
      }

      const nest = renderSyncSystem.createNest(this.options.nextNestId(), saved.x, saved.y, nests, {
        getState: (id) => worldStateManager.getNestState(id),
        onInteract: (id) => nestStateSystem.handleInteract(id),
      });
      nestStateSystem.registerNest(nest, {
        id: nest.id,
        x: saved.x,
        y: saved.y,
        state: 'empty',
        occupiedByChickenId: null,
        hasEgg: false,
        hatchAt: null,
        laidAt: null,
        removed: false,
      });
      if (saved.state === 'has_egg') nestStateSystem.restoreEgg(nest.id, this.options.scene.time.now);
    }
  }
}
