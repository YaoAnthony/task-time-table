/**
 * World-state layer types.
 *
 * These types describe world logic/state, not Phaser presentation objects.
 * Sprites can mirror these records, but should not be treated as the source of truth.
 */

export type TileTerrain =
  | 'grass'
  | 'path'
  | 'water'
  | 'border'
  | 'pond'
  | 'foliage';

export type TileSurface =
  | 'none'
  | 'soil'
  | 'tilled'
  | 'watered'
  | 'seeded'
  | 'growing'
  | 'ready'
  | 'harvested';

export type TileMoisture = 'dry' | 'wet' | 'submerged';

export interface TileCellFlags {
  walkable: boolean;
  transparent: boolean;
  interactable: boolean;
}

export interface TileCell {
  terrain: TileTerrain;
  surface: TileSurface;
  moisture: TileMoisture;
  cropId: string | null;
  objectId: string | null;
  dropIds: string[];
  entityIds: string[];
  flags: TileCellFlags;
}

export type WorldEntityKind =
  | 'player'
  | 'npc'
  | 'remote_player'
  | 'chicken';

export interface EntityState {
  id: string;
  kind: WorldEntityKind;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  facing?: 'up' | 'down' | 'left' | 'right';
  displayName?: string;
  state?: string;
  meta?: Record<string, unknown>;
}

export type WorldObjectKind =
  | 'tree'
  | 'chest'
  | 'bed'
  | 'nest'
  | 'farm_tile'
  | 'bush'
  | 'rock'
  | 'house'
  | 'decoration';

export interface ObjectState {
  id: string;
  kind: WorldObjectKind;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  blocking?: boolean;
  interactable?: boolean;
  state?: string;
  meta?: Record<string, unknown>;
}

export interface DropState {
  id: string;
  itemId: string;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  claimed: boolean;
  meta?: Record<string, unknown>;
}

export interface CropState {
  id: string;
  tileKey: string;
  tx: number;
  ty: number;
  cropId: string;
  state: TileSurface;
  plantedAt?: number | null;
  readyAt?: number | null;
  numStages?: number;
  plantRow?: number;
  meta?: Record<string, unknown>;
}

export type ChickenBehaviorState =
  | 'wandering'
  | 'moving_to_water'
  | 'drinking'
  | 'moving_to_nest'
  | 'laying';

export interface ChickenState {
  id: string;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  facing?: 'up' | 'down' | 'left' | 'right';
  state: ChickenBehaviorState;
  thirst: number;
  growth: number;
  nextThirstAt: number;
  nextWanderAt: number;
  stopAt: number;
  actionUntil: number | null;
  nestId: string | null;
  targetX: number | null;
  targetY: number | null;
  meta?: Record<string, unknown>;
}

export type TreeGrowthStage = 'A' | 'B' | 'C' | 'chopA' | 'chopBC';

export interface TreeState {
  id: string;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  treeType?: string;
  stage: TreeGrowthStage;
  hasFruit: boolean;
  isChopped: boolean;
  nextStageAt: number | null;
  respawnAt: number | null;
  meta?: Record<string, unknown>;
}

export type NestLifecycleState = 'empty' | 'occupied' | 'has_egg';

export interface NestState {
  id: string;
  x: number;
  y: number;
  cellX: number;
  cellY: number;
  state: NestLifecycleState;
  occupiedByChickenId: string | null;
  hasEgg: boolean;
  hatchAt: number | null;
  laidAt: number | null;
  removed: boolean;
  meta?: Record<string, unknown>;
}

export type NpcMemoryKind =
  | 'object'
  | 'drop'
  | 'entity'
  | 'crop'
  | 'landmark'
  | 'water';

export interface NpcMemoryRecord {
  key: string;
  sourceId?: string;
  kind: NpcMemoryKind;
  type: string;
  label?: string;
  x: number;
  y: number;
  lastSeenTick: number;
  distance?: number;
  meta?: Record<string, unknown>;
}

export type NpcIntentKind =
  | 'idle'
  | 'explore'
  | 'seek_drop'
  | 'follow_player'
  | 'move_to_landmark'
  | 'wait';

export interface NpcIntentState {
  kind: NpcIntentKind;
  targetKey?: string;
  targetId?: string;
  targetType?: string;
  targetX?: number;
  targetY?: number;
  reason?: string;
  updatedAtTick: number;
}

export interface NpcNeeds {
  /** 0-100. Drains during work, restored by sleep. <30 = tired. */
  energy: number;
  /** 0-100. Drains over time, restored by meals. <30 = hungry. */
  hunger: number;
  /** 0-100. Drains over time, restored by chatting with player. <30 = lonely. */
  social: number;
  /** Last in-game minute the needs were ticked, used so resume after pause is correct. */
  lastTickMinuteOfDay: number;
  /** Last gameTick an autonomous needs-utterance fired (rate-limit). */
  lastUtteranceTick: number;
}

export interface NpcRelationshipEntry {
  /** 0-100 familiarity score. Increments per chat, decays slowly when not interacted. */
  familiarity: number;
  /** Last gameTick the actor (usually 'player') chatted with this NPC. */
  lastChatTick: number;
  /** Total number of chat exchanges. */
  chatCount: number;
}

export type NpcDailyActivity =
  | 'sleep'
  | 'breakfast'
  | 'work_farm'
  | 'lunch'
  | 'work_forest'
  | 'dinner'
  | 'relax';

export interface NpcScheduleState {
  /** Activity currently in progress (last slot the schedule system applied). */
  currentActivity: NpcDailyActivity | null;
  /** Game minute (0-1439) when the current activity started. */
  startedAtMinuteOfDay: number;
  /** gameTick when the current activity started (used for "I've been here for X minutes" memory). */
  startedAtTick: number;
}

export interface NpcMindState {
  npcId: string;
  lastPerceivedTick: number;
  lastThoughtTick: number;
  lastPlannedTick: number;
  pausedUntilTick: number;
  currentIntent: NpcIntentState;
  recentMemories: Record<string, NpcMemoryRecord>;
  knownLandmarks: Record<string, NpcMemoryRecord>;
  /** Internal drives — energy/hunger/social. */
  needs?: NpcNeeds;
  /** Relationship counters keyed by actor id ('player', or other npc id). */
  relationships?: Record<string, NpcRelationshipEntry>;
  /** Daily routine progress. */
  schedule?: NpcScheduleState;
  meta?: Record<string, unknown>;
}

export interface WorldMetaState {
  tick: number;
  dayTime: string;
  version: number;
}

export interface WorldState {
  grid: {
    cols: number;
    rows: number;
  };
  entities: Record<string, EntityState>;
  objects: Record<string, ObjectState>;
  drops: Record<string, DropState>;
  crops: Record<string, CropState>;
  chickens: Record<string, ChickenState>;
  trees: Record<string, TreeState>;
  nests: Record<string, NestState>;
  npcMinds: Record<string, NpcMindState>;
  meta: WorldMetaState;
}

export const createDefaultTileCell = (): TileCell => ({
  terrain: 'grass',
  surface: 'none',
  moisture: 'dry',
  cropId: null,
  objectId: null,
  dropIds: [],
  entityIds: [],
  flags: {
    walkable: true,
    transparent: true,
    interactable: false,
  },
});
