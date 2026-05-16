export type GameEventStatus = 'queued' | 'active' | 'completed' | 'failed';

export type GameEventDefinitionId =
  | 'npc_arrival_vehicle'
  | 'random_chest_spawn';

export interface GameEventInstance {
  instanceId: string;
  definitionId: GameEventDefinitionId;
  status: GameEventStatus;
  triggerTick: number;
  createdAtTick: number;
  startedAtTick?: number | null;
  completedAtTick?: number | null;
  payload?: Record<string, unknown>;
}

export interface GameEventHistoryEntry {
  instanceId: string;
  definitionId: GameEventDefinitionId;
  status: Extract<GameEventStatus, 'completed' | 'failed'>;
  completedAtTick: number;
  payload?: Record<string, unknown>;
  reason?: string;
}

export interface GameEventSaveState {
  schemaVersion: 1;
  queued: GameEventInstance[];
  active: GameEventInstance[];
  cooldowns: Record<string, number>;
  flags: Record<string, unknown>;
  history: GameEventHistoryEntry[];
}

export type EventAction =
  | { type: 'wait'; ticks: number }
  | { type: 'lock_player_control' }
  | { type: 'unlock_player_control' }
  | { type: 'camera_pan_to'; target: 'player' | 'bus_station' | 'arrival_entry' | { x: number; y: number }; durationMs?: number }
  | { type: 'camera_follow'; target: 'player' | 'vehicle' }
  | { type: 'spawn_vehicle'; vehicleId: string; routeId: 'npc_arrival_bus' }
  | { type: 'move_vehicle'; vehicleId: string; to: 'bus_station'; durationMs?: number }
  | { type: 'vehicle_open_door'; vehicleId: string }
  | { type: 'vehicle_close_door'; vehicleId: string }
  | { type: 'despawn_vehicle'; vehicleId: string }
  | { type: 'spawn_npc_from_vehicle'; npcId: string }
  | { type: 'unlock_npc'; npcId: string }
  | { type: 'npc_say'; npcId: string; text?: string; textKey?: string; durationMs?: number }
  | { type: 'add_npc_memory'; npcId: string; text?: string; textKey?: string }
  | { type: 'spawn_random_chest' }
  | { type: 'set_flag'; key: string; value: unknown };

export interface GameEventDefinition {
  id: GameEventDefinitionId;
  repeatable: boolean;
  actions: EventAction[];
}
