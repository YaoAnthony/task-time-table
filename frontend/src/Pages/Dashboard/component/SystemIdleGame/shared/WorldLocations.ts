/**
 * WorldLocations — named world locations for NPC navigation and perception.
 *
 * Single source of truth that replaces:
 *  - NAMED_LOCATIONS dict in ActionExecutor.ts
 *  - Hard-coded landmark strings in PerceptionSystem.ts
 *
 * Add new places here; ActionExecutor and PerceptionSystem read them automatically.
 */

export interface NamedLocation {
  /** Key used in NPC action targets: { kind: 'named', place: id } */
  id:       string;
  /** Human-readable label shown in perception context (Chinese). */
  label:    string;
  worldX:   number;
  worldY:   number;
  /** Optional description for the LLM perception context. */
  desc?:    string;
}

export const WORLD_LOCATIONS: NamedLocation[] = [
  {
    id: 'room', label: '木屋内部',
    worldX: 550, worldY: 240,
    desc: '东侧有一座木屋（大门约 x:502,y:336；内部约 x:550,y:240）',
  },
  {
    id: 'door', label: '木屋大门',
    worldX: 502, worldY: 336,
  },
  {
    id: 'pond', label: '池塘',
    worldX: 560, worldY: 390,
    desc: '右下方有一个池塘（约 x:560,y:390），旁边有鸡和鸡窝',
  },
  {
    id: 'farm', label: '耕地',
    worldX: 320, worldY: 320,
    desc: '地图中央有耕地区域可种植作物',
  },
];

/** Fast lookup by id. */
export const WORLD_LOCATION_MAP: Readonly<Record<string, NamedLocation>> =
  Object.fromEntries(WORLD_LOCATIONS.map(loc => [loc.id, loc]));
