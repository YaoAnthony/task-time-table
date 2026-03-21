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

export interface NpcPlannedAction {
  type:      'say' | 'move' | 'chop' | 'water' | 'idle';
  text?:     string;   // for 'say'
  x?:        number;   // for 'move'
  y?:        number;
  duration?: number;   // real seconds
}

export interface NpcPlan {
  actions: NpcPlannedAction[];
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
