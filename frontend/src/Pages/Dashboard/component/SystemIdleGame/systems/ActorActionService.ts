import type { ToolType } from '../types';
import {
  findNpcKnowledgeSkill,
  resolveKnowledgeMoveTarget,
} from '../shared/NpcKnowledge';
import { resolveActorLocationTarget } from '../shared/locationSlots';
import type {
  FarmActionKind,
  FarmActionTarget,
  FarmSystem,
} from './FarmSystem';
import type { WorldActionDispatcher, WorldActionResult } from './WorldActionSystem';
import { defaultActionCatalog, type ActionCatalog } from '../actions/catalog/ActionCatalog';

export type ActorNavigator = (x: number, y: number, worldId?: string, onArrive?: () => void) => void;

export interface ExecuteKnowledgeSkillInput {
  actorId: string;
  skillId: string;
  originX: number;
  originY: number;
  gameTick: number;
  navigate: ActorNavigator;
}

/**
 * Shared actor action surface.
 *
 * Player input and NPC skills should call this layer instead of duplicating
 * player-only logic. WASD movement remains player-specific; world mutations do
 * not.
 */
export class ActorActionService {
  private readonly farmReservations = new Map<string, { actorId: string; expiresAt: number }>();

  constructor(
    private readonly farmSystem: FarmSystem,
    private readonly dispatcher: WorldActionDispatcher,
    private readonly actionCatalog: ActionCatalog = defaultActionCatalog,
  ) {}

  useToolAt(
    actorId: string,
    x: number,
    y: number,
    tool: ToolType | string,
    heldItemId?: string,
  ): boolean {
    return this.farmSystem.handleToolUseAt(actorId, x, y, tool, heldItemId);
  }

  findFarmTarget(
    action: FarmActionKind,
    x: number,
    y: number,
    maxRadiusCells = 10,
    actorId?: string,
  ): FarmActionTarget | null {
    const ignored = new Set<string>();
    for (let i = 0; i < 12; i += 1) {
      const target = this.farmSystem.findNearestFarmTarget(action, x, y, maxRadiusCells, ignored);
      if (!target) return null;
      const key = this.tileKey(target);
      if (!actorId || !this.isReservedByOther(key, actorId)) {
        if (actorId) this.reserveFarmTarget(actorId, target);
        return target;
      }
      ignored.add(key);
    }
    return null;
  }

  performFarmAction(
    actorId: string,
    action: FarmActionKind,
    target: Pick<FarmActionTarget, 'tx' | 'ty' | 'cropId'>,
    itemId?: string,
  ): WorldActionResult {
    const worldAction = this.actionCatalog.toFarmWorldAction(actorId, action, target, itemId);
    const result = this.dispatcher.dispatchAction(worldAction);
    this.releaseFarmTarget(actorId, target);
    return result;
  }

  executeKnowledgeSkill(input: ExecuteKnowledgeSkillInput): boolean {
    void input.gameTick;
    const skill = findNpcKnowledgeSkill(input.skillId);
    if (!skill) return false;

    const firstMove = skill.steps.find((step) => step.kind === 'move_to');
    const farmStep = skill.steps.find((step) => step.kind === 'farm_action');

    if (!farmStep) {
      const target = firstMove ? resolveKnowledgeMoveTarget(firstMove, input.actorId) : null;
      if (!target) return false;
      input.navigate(target.x, target.y, target.worldId);
      return true;
    }

    const farmAnchor = resolveActorLocationTarget('farm', input.actorId);
    const anchorX = farmAnchor?.x ?? input.originX;
    const anchorY = farmAnchor?.y ?? input.originY;
    const farmAction = farmStep.action;

    let target = this.findFarmTarget(farmAction, anchorX, anchorY, 12, input.actorId);
    let actionToRun = farmAction;
    let itemId = farmStep.itemId;
    let plantAfterTill = false;

    if (!target && farmAction === 'plant') {
      target = this.findFarmTarget('till', anchorX, anchorY, 12, input.actorId);
      actionToRun = 'till';
      itemId = 'scythe';
      plantAfterTill = true;
    }

    if (!target) {
      target = this.findFarmTarget(farmAction, input.originX, input.originY, 12, input.actorId);
    }
    if (!target) return false;

    const selectedTarget = target;
    input.navigate(selectedTarget.x, selectedTarget.y, farmAnchor?.worldId ?? 'world:village', () => {
      const result = this.performFarmAction(input.actorId, actionToRun, selectedTarget, itemId);
      if (plantAfterTill && result.ok) {
        this.performFarmAction(input.actorId, 'plant', selectedTarget, farmStep.itemId ?? 'wheat_seed');
      }
    });
    return true;
  }

  private tileKey(target: Pick<FarmActionTarget, 'tx' | 'ty'>): string {
    return `${target.tx},${target.ty}`;
  }

  private reserveFarmTarget(actorId: string, target: Pick<FarmActionTarget, 'tx' | 'ty'>): void {
    this.farmReservations.set(this.tileKey(target), {
      actorId,
      expiresAt: Date.now() + 12_000,
    });
  }

  private releaseFarmTarget(actorId: string, target: Pick<FarmActionTarget, 'tx' | 'ty'>): void {
    const key = this.tileKey(target);
    const reservation = this.farmReservations.get(key);
    if (reservation?.actorId === actorId) {
      this.farmReservations.delete(key);
    }
  }

  private isReservedByOther(key: string, actorId: string): boolean {
    const reservation = this.farmReservations.get(key);
    if (!reservation) return false;
    if (reservation.expiresAt <= Date.now()) {
      this.farmReservations.delete(key);
      return false;
    }
    return reservation.actorId !== actorId;
  }
}
