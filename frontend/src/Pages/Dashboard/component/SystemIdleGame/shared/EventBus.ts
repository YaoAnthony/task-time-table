/**
 * EventBus — typed publish/subscribe event bus for the idle game.
 *
 * Replaces the 20-callback GameCallbacks interface with a decoupled,
 * type-safe event system. Systems and entities emit events; React and
 * other systems subscribe without tight coupling.
 *
 * Usage:
 *   // Emit from Phaser side:
 *   gameBus.emit('npc:speak', { text: '你好', npcName: '老李' });
 *
 *   // Subscribe from React side:
 *   const unsub = gameBus.on('npc:speak', ({ text, npcName }) => { ... });
 *   // Call unsub() to remove listener (e.g. in useEffect cleanup).
 */

import type { ToolType, FarmTileStateType } from '../types';
import type { ChestRewardItem }             from '../../../../../Types/Profile';
import type { RemoteGameEvent, WorldSnapshot, MultiplayRoomPlayer } from '../systems/MultiplaySystem';
import type { WorldAction, WorldActionResult } from '../systems/WorldActionSystem';
import type { WorldSyncSource } from '../sync/syncPolicy';

// ─── Event payload map ────────────────────────────────────────────────────────
export interface GameEventMap {
  // ── Time / Day cycle ──────────────────────────────────────────────────────
  /** Fired every frame (throttled to ~1s) with current game time. */
  'tick:update':          { gameTick: number; timeStr: string };
  /** Night was skipped by sleeping. */
  'day:night_skip':       { fromTime: string; toTime: string };
  /** Sleep vote count changed (for multiplayer "waiting for X players" UI). */
  'day:sleep_vote':       { sleeping: number; total: number };

  // ── Player ────────────────────────────────────────────────────────────────
  /** Active hotbar tool changed. */
  'player:tool_change':   { tool: ToolType };
  /** Player picked up a world item (add to inventory). */
  'player:item_pickup':   { itemKey: string; quantity: number };
  /** Player consumed an item (decrement inventory). */
  'player:consume_item':  { itemId: string; qty: number };

  // ── NPC ───────────────────────────────────────────────────────────────────
  /** NPC spoke — show speech bubble. */
  'npc:speak':             { text: string; npcName: string };
  /** Player pressed E near an NPC — open chat input. */
  'npc:interact':          { npcName: string; initialValue?: string };
  /** NPC is asking the player for confirmation before proceeding. */
  'npc:ask_confirm':       { npcName: string; question: string };
  /** NPC chopped a tree — Phaser should apply chop visuals. */
  'npc:chop_tree':         { npcName: string; treeId: string };
  /** NPC picked up a world item — update NPC inventory in Redux. */
  'npc:pickup_world_item': { npcName: string; itemId: string; qty: number };
  /** NPC dropped an item — update NPC inventory in Redux. */
  'npc:drop_item':         { npcName: string; itemId: string; qty: number; x?: number; y?: number };
  /** NPC left on a dispatch mission carrying these items. */
  'npc:dispatch':          { npcName: string; carriedItems: Record<string, number> };
  /** NPC returned from dispatch — React should call backend for story + rewards. */
  'npc:dispatch_return':   { npcName: string; carriedItems: Record<string, number> };
  /**
   * React → Phaser: make a named NPC say something.
   * (Opposite direction — React fires this after async LLM call.)
   */
  'npc:say':               { npcName: string; text: string };

  // ── Farm ──────────────────────────────────────────────────────────────────
  /** Player performed a farming action (till, water, plant, harvest). */
  'farm:action':           { action: 'till' | 'water' | 'plant' | 'harvest'; tx: number; ty: number; itemId?: string };
  /** A farm tile's state changed (from server confirmation or remote peer). */
  'farm:tile_change':      { tx: number; ty: number; state: FarmTileStateType; cropId?: string };

  // ── World items ───────────────────────────────────────────────────────────
  /** A world item was spawned (for multiplayer relay and future persistence). */
  'world:item_spawned':    { itemId: string; x: number; y: number; spawnId: string; actorId?: string; source?: WorldSyncSource };
  /** A world item was picked up by the local player (for multiplayer relay). */
  'world:item_picked_up':  { itemId: string; x: number; y: number; actorId?: string; source?: WorldSyncSource };
  /** A world action was applied to WorldState/WorldGrid. */
  'world:action_applied':  { action: WorldAction; result: WorldActionResult; source: WorldSyncSource };
  /** Local player movement snapshot that may need room broadcast. */
  'world:position_broadcast_requested': {
    x: number;
    y: number;
    facing: 'up' | 'down' | 'left' | 'right';
    velX: number;
    velY: number;
  };
  /** Local sleep state changed and may need room broadcast. */
  'world:sleep_state_changed': { sleeping: boolean };

  // ── Chest ─────────────────────────────────────────────────────────────────
  /** Player opened a chest — show reward UI. */
  'chest:interact':        { chestId: string; rewards: { coins: number; items: ChestRewardItem[] } };

  // ── UI messages ───────────────────────────────────────────────────────────
  /** Show a transient HUD message to the local player. */
  'ui:show_message':       { text: string };

  // ── Multiplayer: incoming events from peers ───────────────────────────────
  /** Socket.IO room joined (host or guest). */
  'mp:room_joined':         { isHost: boolean; roomId: string; players: MultiplayRoomPlayer[] };
  /** A peer joined the room. */
  'mp:peer_joined':         { userId: string; displayName: string };
  /** A peer left the room. */
  'mp:peer_left':           { userId: string };
  /** A relay game_event arrived from a peer. */
  'mp:game_event':          RemoteGameEvent;
  /** Socket.IO error. */
  'mp:error':               { message: string };
  /** Host is requesting our world snapshot. */
  'mp:snapshot_requested':  Record<string, never>;
  /** We received a world snapshot from the host. */
  'mp:world_snapshot':      WorldSnapshot;
  /**
   * Phaser → MultiplaySystem relay.
   * Any system can emit this to have MultiplaySystem forward the event to peers.
   */
  'mp:relay':               { type: string; payload: Record<string, unknown> };
  /** Local player changed sleep state (for multiplayer sleep sync). */
  'mp:sleep_state':         { sleeping: boolean };

  // ── Game lifecycle ────────────────────────────────────────────────────────
  /** GameScene.create() finished — safe to access NPC entities. */
  'game:ready':             Record<string, never>;
}

// ─── Type helpers ─────────────────────────────────────────────────────────────
export type EventKey = keyof GameEventMap;
type Handler<K extends EventKey> = (payload: GameEventMap[K]) => void;

// ─── EventBus class ───────────────────────────────────────────────────────────
export class EventBus {
  private listeners = new Map<EventKey, Set<Handler<EventKey>>>();

  /**
   * Subscribe to an event.
   * @returns An unsubscribe function — call it to remove the listener.
   */
  on<K extends EventKey>(event: K, handler: Handler<K>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(handler as Handler<EventKey>);
    return () => {
      this.listeners.get(event)?.delete(handler as Handler<EventKey>);
    };
  }

  /** Emit an event to all subscribers. */
  emit<K extends EventKey>(event: K, payload: GameEventMap[K]): void {
    this.listeners.get(event)?.forEach(h => h(payload));
  }

  /** Remove all listeners (call on scene shutdown). */
  destroy(): void {
    this.listeners.clear();
  }
}

// ─── Singleton ────────────────────────────────────────────────────────────────
/**
 * Module-level singleton used by all Phaser systems and React components.
 * Phaser systems import this directly; React uses it inside useEffect.
 */
export const gameBus = new EventBus();
