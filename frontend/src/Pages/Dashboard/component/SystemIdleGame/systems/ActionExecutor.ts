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
import { resolveActorLocationTarget } from '../shared/locationSlots';
import { PLAYER_HOUSE_DOOR } from '../shared/WorldLocations';
import type { FarmActionKind, FarmActionTarget } from './FarmSystem';

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
  claimWorldItem(itemId: string, npcName: string, target?: { x: number; y: number; worldId?: string }): void;
  /** Resolve which logical world/room contains a point. */
  getWorldIdAt?(x: number, y: number): string;
  /** Resolve an NPC's current logical world/room. */
  getNpcWorldId?(npcName: string): string;
  /** Navigate across room/village boundaries before walking to the final point. */
  navigateNpcToWorldPosition?(
    npcName: string,
    target: { x: number; y: number; worldId?: string },
    onArrive?: () => void,
  ): boolean;
  /** Find a farm tile/cell target for a semantic farm action. */
  findFarmTarget(action: FarmActionKind, x: number, y: number, maxRadiusCells?: number, actorId?: string): FarmActionTarget | null;
  /** Apply a farm action through the same world-action path used by the player. */
  performFarmAction(actorId: string, action: FarmActionKind, target: Pick<FarmActionTarget, 'tx' | 'ty' | 'cropId'>, itemId?: string): boolean;
  /** Execute a durable NPC knowledge skill, including any navigation it requires. */
  executeKnowledgeSkill(
    npcName: string,
    skillId: string,
    origin: { x: number; y: number },
    navigate: (x: number, y: number, worldId?: string, onArrive?: () => void) => void,
    gameTick: number,
  ): boolean;
  /** Resolve a named NPC for social actions. */
  findNpcByName(name: string): Npc | null;
  /** Pick a walkable adjacent spot for one NPC to stand while talking to another. */
  findConversationSpotForNpc(sourceName: string, targetName: string): { x: number; y: number } | null;
  /** Resolve a house door target for an NPC, preferring their remembered/contracted home when possible. */
  findHouseEntryTarget(houseId?: string, npcName?: string): {
    houseId: string;
    roomId: string;
    x: number;
    y: number;
    worldId?: string;
    entryWorldId?: string;
  } | null;
  /** Move the NPC into the matching room instance after they reached the door. */
  enterHouseForNpc(npcName: string, houseId: string): boolean;
  /** Persist a house as the NPC's remembered home. */
  rememberHomeHouseForNpc(npcName: string, houseId: string, gameTick: number): boolean;
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

type ResolvedCoords = { x: number; y: number; worldId?: string };

const REMEMBER_HOME_SKILL_IDS = new Set([
  'remember_home_house',
  'remember_home',
  'remember_house',
  'home_house',
  'set_home',
  'assign_home',
  'learn_home',
  'this_is_your_house',
]);

const ENTER_HOUSE_SKILL_IDS = new Set([
  'enter_house',
  'go_home',
  'go_to_house',
  'go_inside_house',
]);

function normalizeSkillId(skillId: string | undefined): string {
  return String(skillId ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export function normalizeNpcActionForRuntime(action: NpcAction): NpcAction {
  if (action.type !== 'use_skill') return action;
  const skillId = normalizeSkillId(action.skillId);
  if (REMEMBER_HOME_SKILL_IDS.has(skillId)) {
    return {
      ...action,
      type: 'remember_home_house',
      skillId: undefined,
    };
  }
  if (ENTER_HOUSE_SKILL_IDS.has(skillId)) {
    return {
      ...action,
      type: 'enter_house',
      skillId: undefined,
    };
  }
  return action;
}

function withWorldId(world: WorldContext | undefined, coords: { x: number; y: number; worldId?: string }): ResolvedCoords {
  return {
    ...coords,
    worldId: coords.worldId ?? world?.getWorldIdAt?.(coords.x, coords.y),
  };
}

function navigateNpcTo(
  npc: Npc,
  coords: ResolvedCoords,
  world?: WorldContext,
  onArrive?: () => void,
): void {
  const routed = world?.navigateNpcToWorldPosition?.(npc.name, coords, onArrive);
  if (routed) return;
  npc.navigateTo(coords.x, coords.y, onArrive);
}

// ─── Default action registry ──────────────────────────────────────────────────
const ACTION_REGISTRY: Partial<Record<string, ActionExecutorFn>> = {
  say: (action, npc, _player, gameTick) => {
    if (action.text) npc.say(action.text, gameTick);
  },

  move: (action, npc, player, _gameTick, world) => {
    if (!action.target) return;
    const coords = resolveTarget(action.target, npc, player, world);
    if (coords) navigateNpcTo(npc, coords, world);
  },

  idle: (_action, npc) => {
    npc.clearNavigation();
  },

  // ── Future stubs (register real implementations when features are ready) ──
  water: (action, npc, player, _gameTick, world) => {
    // Move to target, then TODO: play watering animation on arrival
    if (action.target) {
      const coords = resolveTarget(action.target, npc, player, world);
      if (coords) navigateNpcTo(npc, coords, world);
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
    const resolvedTarget = action.target?.kind === 'coords' ? action.target : null;
    const item = resolvedTarget ? null : world.findWorldItem(action.itemId);
    if (!resolvedTarget && !item) {
      console.warn('[ActionExecutor] pickup_item: item not found:', action.itemId);
      return;
    }
    const x = resolvedTarget?.x ?? item!.worldX;
    const y = resolvedTarget?.y ?? item!.worldY;
    const target = withWorldId(world, { x, y, worldId: resolvedTarget?.worldId });
    navigateNpcTo(npc, target, world, () => {
      world.claimWorldItem(action.itemId!, npc.name, target);
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
    navigateNpcTo(npc, withWorldId(world, nearest), world, () => {
      console.log(`[ActionExecutor] chop_tree onArrive: chopping tree id=${nearest.id}`);
      world.chopTreeById(nearest.id);
    });
  },

  use_skill: (action, npc, _player, gameTick, world) => {
    const aliased = normalizeNpcActionForRuntime(action);
    if (aliased.type !== 'use_skill') {
      const fn = ACTION_REGISTRY[aliased.type];
      if (fn) fn(aliased, npc, _player, gameTick, world);
      return;
    }
    if (!world || !action.skillId) return;
    const ok = world.executeKnowledgeSkill(
      npc.name,
      action.skillId,
      { x: npc.sprite.x, y: npc.sprite.y },
      (x, y, worldId, onArrive) => navigateNpcTo(npc, withWorldId(world, { x, y, worldId }), world, onArrive),
      gameTick,
    );
    if (!ok) npc.say('I do not know that skill yet.', gameTick);
  },

  talk_with: (action, npc, _player, gameTick, world) => {
    if (!world || !action.targetNpcName) return;
    const target = world.findNpcByName(action.targetNpcName);
    if (!target || target === npc) return;
    const standAt = world.findConversationSpotForNpc(npc.name, target.name) ?? {
      x: target.sprite.x + 42,
      y: target.sprite.y,
    };
    npc.talkWithNpc(target, standAt, gameTick, action.duration ?? 14, action.text);
  },

  enter_house: (action, npc, _player, gameTick, world) => {
    if (!world) return;
    const entry = world.findHouseEntryTarget(action.houseId, npc.name);
    if (!entry) {
      npc.say('I cannot find that house door.', gameTick);
      return;
    }
    const approach = withWorldId(world, { x: entry.x, y: entry.y + 40, worldId: 'world:village' });
    navigateNpcTo(npc, approach, world, () => {
      const ok = world.enterHouseForNpc(npc.name, entry.houseId);
      if (!ok) npc.say('I could not enter the house.', gameTick);
    });
  },

  remember_home_house: (action, npc, _player, gameTick, world) => {
    if (!world) return;
    const entry = world.findHouseEntryTarget(action.houseId, npc.name);
    if (!entry) {
      npc.say('I cannot tell which house is mine yet.', gameTick);
      return;
    }
    const ok = world.rememberHomeHouseForNpc(npc.name, entry.houseId, gameTick);
    if (ok) npc.say('I will remember this as my home.', gameTick);
  },

  till_tile: (action, npc, _player, gameTick, world) => {
    executeFarmAction('till', action, npc, gameTick, world, 'scythe');
  },

  water_tile: (action, npc, _player, gameTick, world) => {
    executeFarmAction('water', action, npc, gameTick, world, 'watering_can');
  },

  plant_crop: (action, npc, _player, gameTick, world) => {
    executeFarmAction('plant', action, npc, gameTick, world, action.itemId ?? 'wheat_seed');
  },

  harvest_crop: (action, npc, _player, gameTick, world) => {
    executeFarmAction('harvest', action, npc, gameTick, world);
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
function executeFarmAction(
  kind: FarmActionKind,
  action: NpcAction,
  npc: Npc,
  gameTick: number,
  world?: WorldContext,
  itemId?: string,
): void {
  if (!world) return;
  const target = typeof action.tx === 'number' && typeof action.ty === 'number'
    ? {
        tx: action.tx,
        ty: action.ty,
        x: action.tx * 32 + 16,
        y: action.ty * 32 + 16,
      }
    : world.findFarmTarget(kind, npc.sprite.x, npc.sprite.y, 12, npc.name);

  if (!target) {
    npc.say('No valid farm target nearby.', gameTick);
    return;
  }

  navigateNpcTo(npc, withWorldId(world, target), world, () => {
    const ok = world.performFarmAction(npc.name, kind, target, itemId);
    if (!ok) npc.say('That farm action failed.', gameTick);
  });
}

function resolveTarget(
  target: ActionTarget,
  npc:    Npc,
  player: Player,
  world?: WorldContext,
): ResolvedCoords | null {
  switch (target.kind) {
    case 'coords':
      return withWorldId(world, { x: target.x, y: target.y, worldId: target.worldId });

    case 'named': {
      const loc = resolveActorLocationTarget(target.place, npc.name);
      if (!loc) {
        console.warn(`[ActionExecutor] Unknown named location: "${target.place}"`);
        return null;
      }
      return withWorldId(world, loc);
    }

    case 'entity':
      if (target.ref === 'player') {
        // Offset slightly below player so NPC doesn't overlap
        return withWorldId(world, { x: player.sprite.x, y: player.sprite.y + 40 });
      }
      if (target.ref === 'npc') {
        return withWorldId(world, { x: npc.sprite.x, y: npc.sprite.y });
      }
      return null;

    case 'relative':
      return withWorldId(world, { x: npc.sprite.x + target.dx, y: npc.sprite.y + target.dy });

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
    const normalizedActions = actions.map(normalizeNpcActionForRuntime);
    console.log(`[ActionExecutor] execute: npc=${npc.name} actions=`, JSON.stringify(normalizedActions));

    const NAVIGATION_TYPES = [
      'move',
      'chop_tree',
      'pickup_item',
      'dispatch',
      'talk_with',
      'enter_house',
      'use_skill',
      'till_tile',
      'water_tile',
      'plant_crop',
      'harvest_crop',
    ];
    const hasNavigation = normalizedActions.some(a => NAVIGATION_TYPES.includes(a.type));

    // Queue when multiple actions include navigation — ensures proper sequencing
    const needsSequencing = hasNavigation && normalizedActions.length > 1;

    if (needsSequencing) {
      // Resolve all targets now; queue into NPC's plannedActions for sequential execution
      const resolved = normalizedActions.map(a => this.resolveActionTarget(a, npc));
      npc.queueActions(resolved, gameTick);
    } else {
      // Execute immediately in order (single action, or no navigation involved)
      for (const action of normalizedActions) {
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
      const target = withWorldId(this.world, tree);
      return { ...action, target: { kind: 'coords', x: target.x, y: target.y, worldId: target.worldId }, itemId: tree.id };
    }
    // pickup_item: resolve itemId → world item coords
    if (action.type === 'pickup_item' && action.itemId) {
      if (action.target?.kind === 'coords') return action;
      const item = this.world?.findWorldItem(action.itemId);
      if (!item) return action;
      const target = withWorldId(this.world, { x: item.worldX, y: item.worldY });
      return { ...action, target: { kind: 'coords', x: target.x, y: target.y, worldId: target.worldId } };
    }
    if (action.type === 'enter_house') {
      const entry = this.world?.findHouseEntryTarget(action.houseId, npc.name);
      if (!entry) return action;
      return {
        ...action,
        houseId: entry.houseId,
        roomId: entry.roomId,
        target: { kind: 'coords', x: entry.x, y: entry.y, worldId: entry.entryWorldId ?? entry.worldId ?? 'world:village' },
      };
    }
    // dispatch: always head to the door
    if (action.type === 'dispatch') {
      return { ...action, target: { kind: 'coords', x: PLAYER_HOUSE_DOOR.x, y: PLAYER_HOUSE_DOOR.y, worldId: 'world:village' } };
    }
    if (!action.target || action.target.kind === 'coords') return action;
    const coords = resolveTarget(action.target, npc, this.player, this.world);
    if (!coords) return { ...action, target: undefined };
    return { ...action, target: { kind: 'coords', x: coords.x, y: coords.y, worldId: coords.worldId } };
  }
}
