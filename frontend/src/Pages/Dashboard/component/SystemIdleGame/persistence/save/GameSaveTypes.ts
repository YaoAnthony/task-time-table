import type { GameChest } from '../../../../../../Types/Profile';
import type {
  CreatureState,
  FarmTile,
  GameInventoryItem,
  SlotItem,
} from '../../../../../../Redux/Features/gameSlice';
import type { Direction, NpcMemoryEntry } from '../../types';
import type { GameEventSaveState } from '../../event/EventTypes';
import type { HouseContractSave, HouseInstanceSave } from '../../housing/HouseTypes';
import type { StorageChestSave } from '../../storage/StorageChestTypes';
import type { DropState, NpcMindState, WorldState } from '../../shared/worldStateTypes';

export interface GameSaveSettings {
  timeMinute: number;
    weather: 'clear' | 'rain';
    audioEnabled: boolean;
    audioVolume: number;
    musicEnabled: boolean;
    musicVolume: number;
    physicsDebug: boolean;
    pathLineEnabled: boolean;
    sleepThreshold: number;
    agentBrainEnabled: boolean;
    shadowEnabled: boolean;
}

export interface PlayerSave {
  id: string;
  name: string;
  position: {
    worldId: string;
    x: number;
    y: number;
    facing: Direction;
  };
  inventory: {
    gameInventory: GameInventoryItem[];
    hotbarSlots: (SlotItem | null)[];
    backpackSlots: (SlotItem | null)[];
  };
  permissionLevel: 'op' | 'guest';
  sleeping?: boolean;
}

export interface NpcSave {
  id: string;
  name: string;
  catalogId?: string;
  role?: string;
  stressTest?: boolean;
  stressTestBatch?: string;
  position: {
    worldId: string;
    x: number;
    y: number;
    facing?: Direction;
  };
  inventory: Record<string, number>;
  mind: NpcMindState | null;
  memory: NpcMemoryEntry[];
}

export interface GameSaveV1 {
  schemaVersion: 1;
  saveVersion: number;
  updatedAt: string;
  worldStatus: {
    roomId: string;
    gameTick: number;
    settings: GameSaveSettings;
    entities: {
      worldState: WorldState;
      farmTiles: FarmTile[];
      chests: GameChest[];
      worldItems: DropState[];
      creatures: CreatureState[];
      houses: HouseInstanceSave[];
      houseContracts: HouseContractSave[];
      storageChests: StorageChestSave[];
    };
    npcCatalogVersion: number;
    unlockedNpcs: string[];
    npcs: Record<string, NpcSave>;
    events: GameEventSaveState;
  };
  players: Record<string, PlayerSave>;
}

export interface RuntimeInventorySnapshot {
  gameInventory: GameInventoryItem[];
  hotbarSlots: (SlotItem | null)[];
  backpackSlots: (SlotItem | null)[];
}
