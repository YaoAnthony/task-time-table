/** Shared TypeScript interfaces for the idle game. */

import type { ChestRewardItem } from '../../../../Types/Profile';

export type ToolType = 'empty' | 'water' | 'axe' | 'scythe';

// ─── General world-object interaction (F key) ─────────────────────────────────
/** Any object in the world that the player can interact with (F key). */
export interface Interactable {
  isNearPlayer(px: number, py: number, radius?: number): boolean;
  interact(): void;
}
export type Direction = 'down' | 'up' | 'left' | 'right';

// ─── Hotbar ──────────────────────────────────────────────────────────────────
export interface HotbarSlotDef {
  tool:   ToolType;
  label:  string;
  /** source x in Basic tools and meterials.png (-1 = no icon) */
  iconX:  number;
  iconY:  number;
}

export const HOTBAR_DEFS: HotbarSlotDef[] = [
  { tool: 'empty',  label: '空手',  iconX: -1, iconY: -1 },
  { tool: 'water',  label: '水壶',  iconX:  0, iconY:  0 },  // tool icon 1 = water
  { tool: 'axe',    label: '斧头',  iconX: 16, iconY:  0 },  // tool icon 2 = axe
  { tool: 'scythe', label: '镰刀',  iconX: 32, iconY:  0 },  // tool icon 3 = scythe
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
  { tool: 'empty', label: '',       iconX: -1, iconY: -1 },
];

// ─── NPC Memory / AI ─────────────────────────────────────────────────────────
export interface NpcMemoryEntry {
  /** Unique identifier (UUID). */
  id:           string;
  gameTick:     number;
  text:         string;
  source:       'npc' | 'player' | 'event' | 'reflection';
  /** Poignancy / importance score 1-10 (higher = more important). */
  importance:   number;
  /** Extracted keywords for relevance scoring. */
  keywords:     string[];
  /** gameTick when this memory was last retrieved. */
  lastAccessed: number;
}

// ─── NPC Action System (extensible) ─────────────────────────────────────────

/**
 * Where the NPC should move to.  Resolved at execution time by ActionExecutor
 * so the LLM only outputs semantic targets, not raw pixel coordinates.
 */
export type ActionTarget =
  | { kind: 'coords';   x: number; y: number }
  | { kind: 'named';    place: 'room' | 'door' | 'pond' | string }
  | { kind: 'entity';   ref: 'player' | 'npc' }
  | { kind: 'relative'; dx: number; dy: number };

export type NpcActionType =
  | 'say' | 'move' | 'idle'              // core
  | 'emote'                               // future: animation key
  | 'water' | 'eat' | 'drink' | 'nuzzle'; // future: tool / animal

export interface NpcAction {
  type:      NpcActionType;
  text?:     string;       // for 'say'
  target?:   ActionTarget; // for 'move' / 'water' etc.
  duration?: number;       // real seconds
  tool?:     string;       // future: 'watering_can' etc.
  emote?:    string;       // future: 'wave' | 'bow' etc.
}

/** Backend chat response — LLM decides both reply text and actions. */
export interface NpcChatResponse {
  reply:   string;
  actions: NpcAction[];
}

/** SSE npc_command event payload — server can push NPC behavior at any time. */
export interface NpcCommandPayload {
  npcName:       string;
  actions:       NpcAction[];
  announcement?: string;
}

/** @deprecated Use NpcAction instead */
export type NpcPlannedAction = NpcAction;

export interface NpcPlan {
  actions: NpcAction[];
}

// ─── Scene ↔ React bridge ─────────────────────────────────────────────────────
export interface GameCallbacks {
  onTickUpdate?: (gameTick: number, timeStr: string) => void;
  onNpcSpeak?:   (text: string, npcName: string)   => void;
  onToolChange?: (tool: ToolType)                  => void;
  /** Called when player presses E near an NPC */
  onInteract?:   (npcName: string)                 => void;
  /** Called once at the end of GameScene.create() — safe to access NPC entities */
  onGameReady?:  () => void;
  /** Called when player presses F near a chest — show reward UI */
  onChestInteract?: (chestId: string, rewards: { coins: number; items: ChestRewardItem[] }) => void;
  /** Returns the current auth token so Phaser entities can call authed APIs */
  getAuthToken?: () => string | null;
  /** Called when player picks up a world item (fruit, etc.) → add to inventory */
  onItemPickup?: (itemKey: string, quantity: number) => void;
}
