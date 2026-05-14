import { VILLAGE_LAYOUT } from '../world/layouts/villageLayout';

const TILE = 32;
const playerHouse = VILLAGE_LAYOUT.playerHouse;
const pond = VILLAGE_LAYOUT.pond;

export const PLAYER_HOUSE_DOOR = {
  x: playerHouse.x + playerHouse.doorCol * TILE + TILE / 2,
  y: playerHouse.y + (playerHouse.rows - 1) * TILE + TILE / 2,
} as const;

export const PLAYER_HOUSE_ROOM = {
  x: playerHouse.x + (playerHouse.cols * TILE) / 2,
  y: playerHouse.y + (playerHouse.rows * TILE) / 2,
} as const;

export const POND_CENTER = {
  x: pond.x + (pond.cols * TILE) / 2,
  y: pond.y + (pond.rows * TILE) / 2,
} as const;

export interface NamedLocation {
  id: string;
  label: string;
  worldX: number;
  worldY: number;
  desc?: string;
}

export const WORLD_LOCATIONS: NamedLocation[] = [
  {
    id: 'room',
    label: 'Player house interior',
    worldX: PLAYER_HOUSE_ROOM.x,
    worldY: PLAYER_HOUSE_ROOM.y,
    desc: `Interior of the left player house. Door is around (${PLAYER_HOUSE_DOOR.x}, ${PLAYER_HOUSE_DOOR.y}).`,
  },
  {
    id: 'door',
    label: 'Player house door',
    worldX: PLAYER_HOUSE_DOOR.x,
    worldY: PLAYER_HOUSE_DOOR.y,
    desc: `Door of the left player house at (${PLAYER_HOUSE_DOOR.x}, ${PLAYER_HOUSE_DOOR.y}).`,
  },
  {
    id: 'pond',
    label: 'Pond',
    worldX: POND_CENTER.x,
    worldY: POND_CENTER.y,
    desc: `Pond center around (${POND_CENTER.x}, ${POND_CENTER.y}).`,
  },
  {
    id: 'farm',
    label: 'Farm',
    worldX: 320,
    worldY: 320,
    desc: 'Central farm area for crops.',
  },
];

export const WORLD_LOCATION_MAP: Readonly<Record<string, NamedLocation>> =
  Object.fromEntries(WORLD_LOCATIONS.map((loc) => [loc.id, loc]));
