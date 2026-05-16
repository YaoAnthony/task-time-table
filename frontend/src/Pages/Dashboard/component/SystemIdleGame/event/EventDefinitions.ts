import type { GameEventDefinition } from './EventTypes';

export const NPC_ARRIVAL_EVENT_ID = 'npc_arrival_vehicle' as const;
export const RANDOM_CHEST_EVENT_ID = 'random_chest_spawn' as const;

export const GAME_EVENT_DEFINITIONS: Record<string, GameEventDefinition> = {
  [NPC_ARRIVAL_EVENT_ID]: {
    id: NPC_ARRIVAL_EVENT_ID,
    repeatable: true,
    actions: [
      { type: 'lock_player_control' },
      { type: 'camera_pan_to', target: 'arrival_entry', durationMs: 700 },
      { type: 'spawn_vehicle', vehicleId: 'arrival-bus', routeId: 'npc_arrival_bus' },
      { type: 'camera_follow', target: 'vehicle' },
      { type: 'move_vehicle', vehicleId: 'arrival-bus', to: 'bus_station', durationMs: 2600 },
      { type: 'vehicle_open_door', vehicleId: 'arrival-bus' },
      { type: 'spawn_npc_from_vehicle', npcId: '$npcId' },
      { type: 'unlock_npc', npcId: '$npcId' },
      { type: 'add_npc_memory', npcId: '$npcId', textKey: 'arrival_by_bus' },
      { type: 'npc_say', npcId: '$npcId', textKey: 'arrival_line', durationMs: 2400 },
      { type: 'vehicle_close_door', vehicleId: 'arrival-bus' },
      { type: 'despawn_vehicle', vehicleId: 'arrival-bus' },
      { type: 'camera_pan_to', target: 'player', durationMs: 700 },
      { type: 'camera_follow', target: 'player' },
      { type: 'unlock_player_control' },
    ],
  },
  [RANDOM_CHEST_EVENT_ID]: {
    id: RANDOM_CHEST_EVENT_ID,
    repeatable: true,
    actions: [
      { type: 'spawn_random_chest' },
    ],
  },
};

export function getGameEventDefinition(id: string): GameEventDefinition | null {
  return GAME_EVENT_DEFINITIONS[id] ?? null;
}
