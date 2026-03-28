/**
 * ActionExecutor — Registry-pattern NPC action dispatcher.
 *
 * Responsibilities:
 *  1. Resolve semantic ActionTarget → world pixel coordinates at execution time
 *  2. Dispatch each NpcAction to its registered executor function
 *  3. Handle say+move sequencing (queue vs immediate)
 *
 * Extensibility: call `executor.register('eat', fn)` to add new animal
 * behaviours without touching any other file.
 */

import type { NpcAction, ActionTarget } from '../types';
import type { Npc } from '../entities/Npc';
import type { Player } from '../entities/Player';
import type { WorldItem } from '../entities/WorldItem';
import { WORLD_LOCATION_MAP } from '../shared/WorldLocations';

// ─── WorldContext — implemented by GameScene ──────────────────────────────────
/**
 * Interface that GameScene implements so ActionExecutor can interact with
 * the game world (trees, items on the ground) without a direct scene reference.
 */
export interface WorldContext {
  /** Find the nearest live (un-chopped) tree from position (x, y). */
  findNearestTree(x: number, y: number): { id: string; x: number; y: number } | null;
  /** Trigger a tree chop by tree entity ID. */
  chopTreeById(id: string): void;
  /** Find the first live WorldItem with the given itemId. */
  findWorldItem(itemId: string): WorldItem | null;
  /** Create a WorldItem at (x, y) for the NPC dropping an item. */
  dropWorldItem(x: number, y: number, itemId: string, npcName: string): void;
  /** Remove a WorldItem from the world (NPC picked it up); fires onNpcPickupWorldItem. */
  claimWorldItem(itemId: string, npcName: string): void;
}

// Named locations are now defined in shared/WorldLocations.ts

// ─── Executor function signature ──────────────────────────────────────────────
type ActionExecutorFn = (
  action:   NpcAction,
  npc:      Npc,
  player:   Player,
  gameTick: number,
  world?:   WorldContext,
) => void;

// ─── Default action registry ──────────────────────────────────────────────────
const ACTION_REGISTRY: Partial<Record<string, ActionExecutorFn>> = {
  say: (action, npc, _player, gameTick) => {
    if (action.text) npc.say(action.text, gameTick);
  },

  move: (action, npc, player) => {
    if (!action.target) return;
    const coords = resolveTarget(action.target, npc, player);
    if (coords) npc.navigateTo(coords.x, coords.y);
  },

  idle: (_action, npc) => {
    npc.clearNavigation();
  },

  // ── Future stubs (register real implementations when features are ready) ──
  water: (action, npc, player) => {
    // Move to target, then TODO: play watering animation on arrival
    if (action.target) {
      const coords = resolveTarget(action.target, npc, player);
      if (coords) npc.navigateTo(coords.x, coords.y);
    }
  },
  eat:    () => { /* TODO: play eat animation, update hunger stat */ },
  drink:  () => { /* TODO: play drink animation, update thirst stat */ },
  nuzzle: () => { /* TODO: play nuzzle/affection animation */ },
  emote:  () => { /* TODO: play emote animation by action.emote key */ },

  // ── Agent actions ──────────────────────────────────────────────────────
  pickup_item: (action, npc, _player, _gameTick, world) => {
    if (!world || !action.itemId) {
      if (!action.itemId) console.warn('[ActionExecutor] pickup_item missing itemId');
      return;
    }
    const item = world.findWorldItem(action.itemId);
    if (!item) {
      console.warn('[ActionExecutor] pickup_item: item not found:', action.itemId);
      return;
    }
    const { worldX: x, worldY: y } = item;
    npc.navigateTo(x, y, () => {
      world.claimWorldItem(action.itemId!, npc.name);
    });
  },

  drop_item: (action, npc, _player, _gameTick, world) => {
    if (!world || !action.itemId) return;
    world.dropWorldItem(npc.sprite.x, npc.sprite.y, action.itemId, npc.name);
  },

  chop_tree: (_action, npc, _player, gameTick, world) => {
    console.log(`[ActionExecutor] chop_tree handler: world=${!!world} npcPos=(${Math.round(npc.sprite.x)},${Math.round(npc.sprite.y)})`);
    if (!world) { console.warn('[ActionExecutor] chop_tree: world context missing!'); return; }
    const nearest = world.findNearestTree(npc.sprite.x, npc.sprite.y);
    console.log(`[ActionExecutor] chop_tree: nearest=`, nearest);
    if (!nearest) {
      npc.say('附近没有可以砍的树。', gameTick);
      return;
    }
    npc.navigateTo(nearest.x, nearest.y, () => {
      console.log(`[ActionExecutor] chop_tree onArrive: chopping tree id=${nearest.id}`);
      world.chopTreeById(nearest.id);
    });
  },

  ask_confirm: (action, npc, _player, gameTick) => {
    const question = action.question ?? action.text ?? '确认吗？';
    npc.say(question, gameTick);
    npc.pauseForConfirm(question);   // fires onAskConfirm callback → React dialog
  },

  // ── Follow / dispatch ─────────────────────────────────────────────────
  follow_player: (_action, npc) => { npc.startFollowing(); },
  stop_follow:   (_action, npc) => { npc.stopFollowing();  },
  dispatch:      (_action, npc) => {
    // Carry whatever is in NPC inventory; startDispatch reads it via callback
    npc.startDispatch();
  },
};

// ─── Target resolution (pure function, no side effects) ───────────────────────
function resolveTarget(
  target: ActionTarget,
  npc:    Npc,
  player: Player,
): { x: number; y: number } | null {
  switch (target.kind) {
    case 'coords':
      return { x: target.x, y: target.y };

    case 'named': {
      const loc = WORLD_LOCATION_MAP[target.place];
      if (!loc) {
        console.warn(`[ActionExecutor] Unknown named location: "${target.place}"`);
        return null;
      }
      return { x: loc.worldX, y: loc.worldY };
    }

    case 'entity':
      if (target.ref === 'player') {
        // Offset slightly below player so NPC doesn't overlap
        return { x: player.sprite.x, y: player.sprite.y + 40 };
      }
      if (target.ref === 'npc') {
        return { x: npc.sprite.x, y: npc.sprite.y };
      }
      return null;

    case 'relative':
      return { x: npc.sprite.x + target.dx, y: npc.sprite.y + target.dy };

    default:
      return null;
  }
}

// ─── ActionExecutor class ─────────────────────────────────────────────────────
export class ActionExecutor {
  constructor(
    private readonly player: Player,
    private world?: WorldContext,
  ) {}

  /** Update the world context reference (e.g. when GameScene finishes creating). */
  setWorld(world: WorldContext): void { this.world = world; }

  /**
   * Execute a sequence of NpcActions on the given NPC.
   *
   * Sequencing rule:
   *  - If there are multiple actions AND at least one involves navigation
   *    (move / chop_tree / pickup_item), ALL actions are QUEUED so they run
   *    one-after-another (arrive first, then do the next thing).
   *  - Single actions, or multi-action plans that are purely say/idle/drop,
   *    execute immediately.
   *
   * This fixes the "NPC comes but immediately wanders off" bug where two
   * simultaneous navigateTo() calls would cancel each other.
   */
  execute(npc: Npc, actions: NpcAction[], gameTick: number): void {
    if (!actions || actions.length === 0) return;
    console.log(`[ActionExecutor] execute: npc=${npc.name} actions=`, JSON.stringify(actions));

    const NAVIGATION_TYPES = ['move', 'chop_tree', 'pickup_item', 'dispatch'];
    const hasNavigation = actions.some(a => NAVIGATION_TYPES.includes(a.type));

    // Queue when multiple actions include navigation — ensures proper sequencing
    const needsSequencing = hasNavigation && actions.length > 1;

    if (needsSequencing) {
      // Resolve all targets now; queue into NPC's plannedActions for sequential execution
      const resolved = actions.map(a => this.resolveActionTarget(a, npc));
      npc.queueActions(resolved, gameTick);
    } else {
      // Execute immediately in order (single action, or no navigation involved)
      for (const action of actions) {
        const resolved = this.resolveActionTarget(action, npc);
        const fn = ACTION_REGISTRY[resolved.type];
        if (fn) {
          fn(resolved, npc, this.player, gameTick, this.world);
        } else {
          console.warn(`[ActionExecutor] No executor for action type: "${resolved.type}"`);
        }
      }
    }
  }

  /**
   * Register or override an action executor at runtime.
   * Useful for adding animal behaviours, new tools, etc. without touching this file.
   *
   * @example
   *   executor.register('eat', (action, npc) => { npc.playAnim('eat'); });
   */
  register(type: string, fn: ActionExecutorFn): void {
    ACTION_REGISTRY[type] = fn;
  }

  /**
   * Resolve the target of a move-type action to coords form so the NPC's
   * plannedActions queue (which only understands coords) can execute it.
   */
  private resolveActionTarget(action: NpcAction, npc: Npc): NpcAction {
    // chop_tree: resolve to nearest tree coords + embed treeId in itemId field
    if (action.type === 'chop_tree') {
      const tree = this.world?.findNearestTree(npc.sprite.x, npc.sprite.y);
      if (!tree) return action;
      return { ...action, target: { kind: 'coords', x: tree.x, y: tree.y }, itemId: tree.id };
    }
    // pickup_item: resolve itemId → world item coords
    if (action.type === 'pickup_item' && action.itemId) {
      const item = this.world?.findWorldItem(action.itemId);
      if (!item) return action;
      return { ...action, target: { kind: 'coords', x: item.worldX, y: item.worldY } };
    }
    // dispatch: always head to the door
    if (action.type === 'dispatch') {
      return { ...action, target: { kind: 'coords', x: 502, y: 336 } };
    }
    if (!action.target || action.target.kind === 'coords') return action;
    const coords = resolveTarget(action.target, npc, this.player);
    if (!coords) return { ...action, target: undefined };
    return { ...action, target: { kind: 'coords', x: coords.x, y: coords.y } };
  }
}
