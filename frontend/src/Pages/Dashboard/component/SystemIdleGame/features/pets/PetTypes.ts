import type { PetMemorySeed } from './PetCatalog';
import type { PetView } from './PetView';

export type PetBehaviorMode =
  | 'idle'
  | 'sit'
  | 'sleep'
  | 'wander_near_home'
  | 'follow_owner'
  | 'approach_player'
  | 'inspect_interest'
  | 'return_home';

export interface PetNeeds {
  sleepiness: number;
  curiosity: number;
  affection: number;
  comfort: number;
}

export interface PetHomeAnchor {
  x: number;
  y: number;
  worldId?: string;
  houseId?: string;
}

export interface PetTarget {
  x: number;
  y: number;
  radius: number;
  speed: number;
}

export interface PetAgentState {
  id: string;
  petId: string;
  ownerNpcId: string;
  displayName: string;
  canSpeak: false;
  view: PetView;
  home: PetHomeAnchor;
  needs: PetNeeds;
  behavior: PetBehaviorMode;
  target: PetTarget | null;
  memories: PetMemorySeed[];
  nextDecisionAt: number;
  lastMemoryAtTick: number;
}

export interface PetPerceptionContext {
  gameTick: number;
  currentMinute: number;
  player: { x: number; y: number } | null;
  owner: { x: number; y: number } | null;
}
