import type { FacingDirection, IdleGameState } from '../../../../../../Types/Profile';
import type { GameSettingsState } from '../../../../../../Redux/Features/gameSlice';
import { createInitialWorldState } from '../../state';
import type { NpcMemoryEntry } from '../../types';
import type { EntityState, NpcMindState, WorldState } from '../../shared/worldStateTypes';
import type { GameSaveV1, GameSaveSettings, NpcSave, PlayerSave, RuntimeInventorySnapshot } from './GameSaveTypes';
import { NPC_CATALOG_VERSION, normalizeUnlockedNpcIds } from '../../shared/GameNpcCatalog';
import { normalizeEventSaveState } from '../../event/EventState';
import type { GameEventSaveState } from '../../event/EventTypes';
import type { HouseContractSave, HouseInstanceSave } from '../../housing/HouseTypes';
import type { StorageChestSave } from '../../storage/StorageChestTypes';

const DEFAULT_ROOM_ID = 'solo';
const DEFAULT_USER_ID = 'player';
const DEFAULT_WORLD_ID = 'world:village';

export function normalizeGameSaveSettings(settings?: Partial<GameSettingsState & { shadowEnabled?: boolean }>): GameSaveSettings {
  return {
    timeMinute: typeof settings?.timeMinute === 'number'
      ? Math.max(0, Math.min(1439, Math.round(settings.timeMinute)))
      : 360,
    weather: settings?.weather === 'rain' ? 'rain' : 'clear',
    physicsDebug: Boolean(settings?.physicsDebug),
    pathLineEnabled: Boolean(settings?.pathLineEnabled),
    sleepThreshold: typeof settings?.sleepThreshold === 'number'
      ? Math.max(0, Math.min(1, settings.sleepThreshold))
      : 0,
    agentBrainEnabled: settings?.agentBrainEnabled !== false,
    shadowEnabled: settings?.shadowEnabled !== false,
  };
}

function normalizeInventory(input?: Partial<RuntimeInventorySnapshot>): RuntimeInventorySnapshot {
  return {
    gameInventory: Array.isArray(input?.gameInventory) ? input.gameInventory : [],
    hotbarSlots: Array.isArray(input?.hotbarSlots) ? input.hotbarSlots : Array(10).fill(null),
    backpackSlots: Array.isArray(input?.backpackSlots) ? input.backpackSlots : Array(40).fill(null),
  };
}

function normalizeWorldId(input: unknown): string {
  const value = typeof input === 'string' ? input.trim() : '';
  return value || DEFAULT_WORLD_ID;
}

function normalizePlayerSave(player: PlayerSave, fallbackName: string): PlayerSave {
  return {
    ...player,
    name: player.name || fallbackName || 'player',
    position: {
      worldId: normalizeWorldId(player.position?.worldId),
      x: typeof player.position?.x === 'number' ? player.position.x : 400,
      y: typeof player.position?.y === 'number' ? player.position.y : 1000,
      facing: player.position?.facing ?? 'down',
    },
    inventory: normalizeInventory(player.inventory),
  };
}

function normalizeNpcSave(npc: NpcSave): NpcSave {
  return {
    ...npc,
    position: {
      worldId: normalizeWorldId(npc.position?.worldId),
      x: typeof npc.position?.x === 'number' ? npc.position.x : 0,
      y: typeof npc.position?.y === 'number' ? npc.position.y : 0,
      facing: npc.position?.facing,
    },
    inventory: npc.inventory ?? {},
    memory: Array.isArray(npc.memory) ? npc.memory : [],
    mind: npc.mind ?? null,
  };
}

function createDefaultPlayer(
  userId: string,
  username: string,
  inventory?: Partial<RuntimeInventorySnapshot>,
  permissionLevel: PlayerSave['permissionLevel'] = 'op',
): PlayerSave {
  return {
    id: userId,
    name: username || 'player',
    position: { worldId: DEFAULT_WORLD_ID, x: 400, y: 1000, facing: 'down' },
    inventory: normalizeInventory(inventory),
    permissionLevel,
    sleeping: false,
  };
}

export function normalizeGameSave(
  input: Partial<GameSaveV1> | null | undefined,
  fallback: {
    roomId?: string | null;
    userId?: string | null;
    username?: string | null;
    inventory?: Partial<RuntimeInventorySnapshot>;
    settings?: Partial<GameSettingsState & { shadowEnabled?: boolean }>;
  } = {},
): GameSaveV1 {
  if (input?.worldStatus && input.worldStatus.npcCatalogVersion !== NPC_CATALOG_VERSION) {
    input = undefined;
  }
  const userId = fallback.userId || DEFAULT_USER_ID;
  const roomId = fallback.roomId || input?.worldStatus?.roomId || DEFAULT_ROOM_ID;
  const username = fallback.username || 'player';
  const gameTick = typeof input?.worldStatus?.gameTick === 'number' ? input.worldStatus.gameTick : 0;
  const entities = input?.worldStatus?.entities;
  const players = { ...(input?.players ?? {}) };

  if (!players[userId]) {
    players[userId] = createDefaultPlayer(
      userId,
      username,
      fallback.inventory,
      userId === roomId ? 'op' : 'guest',
    );
  }
  Object.keys(players).forEach((id) => {
    players[id] = normalizePlayerSave(players[id] as PlayerSave, id === userId ? username : 'player');
  });

  const npcs = Object.fromEntries(
    Object.entries(input?.worldStatus?.npcs ?? {}).map(([id, npc]) => [id, normalizeNpcSave(npc as NpcSave)]),
  ) as Record<string, NpcSave>;

  return {
    schemaVersion: 1,
    saveVersion: Number(input?.saveVersion ?? 1),
    updatedAt: input?.updatedAt || new Date().toISOString(),
    worldStatus: {
      roomId,
      gameTick,
      settings: normalizeGameSaveSettings(input?.worldStatus?.settings ?? fallback.settings),
      entities: {
        worldState: entities?.worldState ?? createInitialWorldState(0, 0, { tick: gameTick }),
        farmTiles: Array.isArray(entities?.farmTiles) ? entities.farmTiles : [],
        chests: Array.isArray(entities?.chests) ? entities.chests.filter((chest) => !chest.opened) : [],
        worldItems: Array.isArray(entities?.worldItems) ? entities.worldItems : [],
        creatures: Array.isArray(entities?.creatures) ? entities.creatures : [],
        houses: Array.isArray(entities?.houses) ? entities.houses : [],
        houseContracts: Array.isArray(entities?.houseContracts) ? entities.houseContracts : [],
        storageChests: Array.isArray(entities?.storageChests) ? entities.storageChests : [],
      },
      npcCatalogVersion: NPC_CATALOG_VERSION,
      unlockedNpcs: normalizeUnlockedNpcIds(input?.worldStatus?.unlockedNpcs),
      npcs,
      events: normalizeEventSaveState(input?.worldStatus?.events),
    },
    players,
  };
}

export function idleGameStateFromGameSave(save: GameSaveV1, userId: string): Partial<IdleGameState> {
  const player = save.players[userId] ?? Object.values(save.players)[0];
  return {
    x: player?.position.x,
    y: player?.position.y,
    facing: (player?.position.facing ?? 'down') as FacingDirection,
    gameTick: save.worldStatus.gameTick,
    worldState: {
      schemaVersion: 1,
      beds: [],
      nests: [],
      npcMinds: save.worldStatus.entities.worldState.npcMinds,
      settings: save.worldStatus.settings,
    },
  };
}

export function buildNpcSaves(input: {
  entities: Record<string, EntityState>;
  minds: Record<string, NpcMindState>;
  memories: Record<string, NpcMemoryEntry[]>;
  inventories: Record<string, Record<string, number>>;
  getWorldId?: (entity: EntityState) => string;
}): Record<string, NpcSave> {
  const ids = new Set([
    ...Object.keys(input.entities).filter((id) => input.entities[id]?.kind === 'npc'),
    ...Object.keys(input.minds),
    ...Object.keys(input.memories),
    ...Object.keys(input.inventories),
  ]);
  const result: Record<string, NpcSave> = {};
  ids.forEach((id) => {
    const entity = input.entities[id];
    result[id] = {
      id,
      name: entity?.displayName || id,
      position: {
        worldId: entity ? input.getWorldId?.(entity) ?? DEFAULT_WORLD_ID : DEFAULT_WORLD_ID,
        x: entity?.x ?? 0,
        y: entity?.y ?? 0,
        facing: entity?.facing,
      },
      inventory: input.inventories[id] ?? {},
      mind: input.minds[id] ?? null,
      memory: input.memories[id] ?? [],
    };
  });
  return result;
}

export function buildGameSaveFromRuntime(input: {
  previousSave?: GameSaveV1 | null;
  roomId?: string | null;
  userId?: string | null;
  username?: string | null;
  player: { worldId: string; x: number; y: number; facing: FacingDirection };
  gameTick: number;
  settings: Partial<GameSettingsState & { shadowEnabled?: boolean }>;
  inventory: RuntimeInventorySnapshot;
  worldState: WorldState;
  farmTiles: GameSaveV1['worldStatus']['entities']['farmTiles'];
  chests: GameSaveV1['worldStatus']['entities']['chests'];
  worldItems: GameSaveV1['worldStatus']['entities']['worldItems'];
  creatures: GameSaveV1['worldStatus']['entities']['creatures'];
  houses?: HouseInstanceSave[];
  houseContracts?: HouseContractSave[];
  storageChests?: StorageChestSave[];
  npcs: Record<string, NpcSave>;
  events?: GameEventSaveState;
  unlockedNpcs?: string[];
}): GameSaveV1 {
  const normalized = normalizeGameSave(input.previousSave, {
    roomId: input.roomId,
    userId: input.userId,
    username: input.username,
    inventory: input.inventory,
    settings: input.settings,
  });
  const userId = input.userId || DEFAULT_USER_ID;
  const player = normalized.players[userId]
    ?? createDefaultPlayer(userId, input.username || 'player', input.inventory, userId === normalized.worldStatus.roomId ? 'op' : 'guest');

  normalized.players[userId] = {
    ...player,
    id: userId,
    name: input.username || player.name,
    position: input.player,
    inventory: normalizeInventory(input.inventory),
  };
  normalized.worldStatus = {
    roomId: input.roomId || normalized.worldStatus.roomId,
    gameTick: input.gameTick,
    settings: normalizeGameSaveSettings(input.settings),
    entities: {
      worldState: input.worldState,
      farmTiles: input.farmTiles,
      chests: input.chests.filter((chest) => !chest.opened),
      worldItems: input.worldItems,
      creatures: input.creatures,
      houses: input.houses ?? normalized.worldStatus.entities.houses,
      houseContracts: input.houseContracts ?? normalized.worldStatus.entities.houseContracts,
      storageChests: input.storageChests ?? normalized.worldStatus.entities.storageChests,
    },
    npcCatalogVersion: NPC_CATALOG_VERSION,
    unlockedNpcs: normalizeUnlockedNpcIds(input.unlockedNpcs ?? normalized.worldStatus.unlockedNpcs),
    npcs: input.npcs,
    events: normalizeEventSaveState(input.events ?? normalized.worldStatus.events),
  };
  normalized.saveVersion += 1;
  normalized.updatedAt = new Date().toISOString();
  return normalized;
}
