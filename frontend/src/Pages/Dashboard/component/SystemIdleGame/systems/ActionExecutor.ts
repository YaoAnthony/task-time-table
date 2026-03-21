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

// ─── Named world locations (px) — add new places here ────────────────────────
const NAMED_LOCATIONS: Record<string, { x: number; y: number }> = {
  room: { x: 550, y: 240 },
  door: { x: 502, y: 336 },
  // pond: { x: 150, y: 450 },   // future
  // barn: { x: 700, y: 500 },   // future
};

// ─── Executor function signature ──────────────────────────────────────────────
type ActionExecutorFn = (
  action:   NpcAction,
  npc:      Npc,
  player:   Player,
  gameTick: number,
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
      const loc = NAMED_LOCATIONS[target.place];
      if (!loc) {
        console.warn(`[ActionExecutor] Unknown named location: "${target.place}"`);
        return null;
      }
      return loc;
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
  constructor(private readonly player: Player) {}

  /**
   * Execute a sequence of NpcActions on the given NPC.
   *
   * Sequencing rule:
   *  - If the list contains a 'move' that follows a 'say', we QUEUE all
   *    actions so the NPC finishes speaking before it starts moving.
   *  - Otherwise we execute immediately (direct method calls, no timer gap).
   */
  execute(npc: Npc, actions: NpcAction[], gameTick: number): void {
    if (!actions || actions.length === 0) return;

    // Check if a move comes after a say (requires sequential execution)
    const hasMoveAfterSay = actions.some(
      (a, i) => a.type === 'move' && actions.slice(0, i).some(b => b.type === 'say'),
    );

    if (hasMoveAfterSay) {
      // Resolve all targets now; queue into NPC's plannedActions for sequential execution
      const resolved = actions.map(a => this.resolveActionTarget(a, npc));
      npc.queueActions(resolved, gameTick);
    } else {
      // Execute immediately in order
      for (const action of actions) {
        const resolved = this.resolveActionTarget(action, npc);
        const fn = ACTION_REGISTRY[resolved.type];
        if (fn) {
          fn(resolved, npc, this.player, gameTick);
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
    if (!action.target || action.target.kind === 'coords') return action;

    const coords = resolveTarget(action.target, npc, this.player);
    if (!coords) return { ...action, target: undefined };

    return { ...action, target: { kind: 'coords', x: coords.x, y: coords.y } };
  }
}
