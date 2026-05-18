import type { NpcAction } from '../types';
import type { Npc } from '../entities/Npc';
import type { DayCycle } from './DayCycle';
import { resolveActorLocationTarget } from '../shared/locationSlots';
import { WorldStateManager } from '../shared/WorldStateManager';
import { NpcMemorySystem } from './NpcMemorySystem';
import type { NpcDailyActivity } from '../shared/worldStateTypes';
import { GAME_NPC_CATALOG, STARTER_NPC_ID } from '../shared/GameNpcCatalog';
import { autonomyModeForActivity } from './NpcBehaviorPolicy';

export interface ScheduleSlot {
  startMin: number;
  endMin: number;
  activity: NpcDailyActivity;
  locationId?: string;
  line?: string;
}

interface NpcRegistration {
  id: string;
  npc: Npc;
}

export interface NpcScheduleSystemOptions {
  worldStateManager: WorldStateManager;
  dayCycle: DayCycle;
  npcMemorySystem: NpcMemorySystem;
  getNpcRegistrations: () => NpcRegistration[];
  schedules?: Record<string, ScheduleSlot[]>;
  resolveNpcHome?: (npcId: string) => { houseId: string; roomId: string; x: number; y: number; worldId?: string; entryWorldId?: string } | null;
  isNpcLocked?: (npcId: string) => boolean;
}

const STARTER_NPC_NAME = GAME_NPC_CATALOG.find((npc) => npc.id === STARTER_NPC_ID)?.name ?? '老李';

export const DEFAULT_LAOLI_SCHEDULE: ScheduleSlot[] = [
  { startMin: 0, endMin: 360, activity: 'sleep', locationId: 'room', line: '夜深了，先回去歇着了。' },
  { startMin: 360, endMin: 480, activity: 'breakfast', locationId: 'door', line: '天亮了，又是新的活计。' },
  { startMin: 480, endMin: 720, activity: 'work_farm', locationId: 'farm', line: '走，下地干点活去。' },
  { startMin: 720, endMin: 780, activity: 'lunch', locationId: 'room', line: '到饭点了，回去吃口饭。' },
  { startMin: 780, endMin: 1080, activity: 'work_forest', locationId: 'pond', line: '下午到林子边上转转。' },
  { startMin: 1080, endMin: 1140, activity: 'dinner', locationId: 'room', line: '该回去做晚饭了。' },
  { startMin: 1140, endMin: 1440, activity: 'sleep', locationId: 'room', line: '今天就到这儿吧，回家歇了。' },
];

const FARMER_NPC = GAME_NPC_CATALOG.find((npc) => npc.role === 'farmer')?.name;
const CARPENTER_NPC = GAME_NPC_CATALOG.find((npc) => npc.role === 'carpenter')?.name;
const MERCHANT_NPC = GAME_NPC_CATALOG.find((npc) => npc.role === 'merchant')?.name;
const SCHOLAR_NPC = GAME_NPC_CATALOG.find((npc) => npc.role === 'scholar')?.name;
const RANCHER_NPC = GAME_NPC_CATALOG.find((npc) => npc.role === 'rancher')?.name;

export const DEFAULT_NPC_SCHEDULES: Record<string, ScheduleSlot[]> = {
  [STARTER_NPC_NAME]: DEFAULT_LAOLI_SCHEDULE,
  ...(FARMER_NPC ? {
    [FARMER_NPC]: [
      { startMin: 0, endMin: 420, activity: 'sleep', locationId: 'room', line: '先睡够，地才有力气种。' },
      { startMin: 420, endMin: 720, activity: 'work_farm', locationId: 'farm', line: '我去看看田。' },
      { startMin: 720, endMin: 800, activity: 'lunch', locationId: 'room', line: '吃口饭，再接着浇水。' },
      { startMin: 800, endMin: 1140, activity: 'work_farm', locationId: 'farm', line: '下午适合收拾地块。' },
      { startMin: 1140, endMin: 1440, activity: 'sleep', locationId: 'room', line: '今天的田先到这儿。' },
    ],
  } : {}),
  ...(CARPENTER_NPC ? {
    [CARPENTER_NPC]: [
      { startMin: 0, endMin: 420, activity: 'sleep', locationId: 'room' },
      { startMin: 420, endMin: 720, activity: 'work_forest', locationId: 'pond', line: '我去看看木料。' },
      { startMin: 720, endMin: 800, activity: 'lunch', locationId: 'room' },
      { startMin: 800, endMin: 1140, activity: 'work_forest', locationId: 'pond', line: '下午适合量木头。' },
      { startMin: 1140, endMin: 1440, activity: 'sleep', locationId: 'room' },
    ],
  } : {}),
  ...(MERCHANT_NPC ? {
    [MERCHANT_NPC]: [
      { startMin: 0, endMin: 420, activity: 'sleep', locationId: 'room' },
      { startMin: 420, endMin: 720, activity: 'relax', locationId: 'door', line: '我去看看今天的行情。' },
      { startMin: 720, endMin: 800, activity: 'lunch', locationId: 'room' },
      { startMin: 800, endMin: 1140, activity: 'relax', locationId: 'door', line: '下午适合补货。' },
      { startMin: 1140, endMin: 1440, activity: 'sleep', locationId: 'room' },
    ],
  } : {}),
  ...(SCHOLAR_NPC ? {
    [SCHOLAR_NPC]: [
      { startMin: 0, endMin: 420, activity: 'sleep', locationId: 'room' },
      { startMin: 420, endMin: 720, activity: 'relax', locationId: 'door', line: '我把昨天的记录理一理。' },
      { startMin: 720, endMin: 800, activity: 'lunch', locationId: 'room' },
      { startMin: 800, endMin: 1140, activity: 'relax', locationId: 'door', line: '下午适合整理任务。' },
      { startMin: 1140, endMin: 1440, activity: 'sleep', locationId: 'room' },
    ],
  } : {}),
  ...(RANCHER_NPC ? {
    [RANCHER_NPC]: [
      { startMin: 0, endMin: 420, activity: 'sleep', locationId: 'room' },
      { startMin: 420, endMin: 720, activity: 'work_farm', locationId: 'farm', line: '我去看看鸡和巢。' },
      { startMin: 720, endMin: 800, activity: 'lunch', locationId: 'room' },
      { startMin: 800, endMin: 1140, activity: 'work_farm', locationId: 'farm', line: '下午给牧场补点水。' },
      { startMin: 1140, endMin: 1440, activity: 'sleep', locationId: 'room' },
    ],
  } : {}),
};

export function getDefaultNpcSchedule(npcId: string): ScheduleSlot[] {
  return DEFAULT_NPC_SCHEDULES[npcId] ?? [];
}

function currentMinute(dayCycle: DayCycle): number {
  const tick = Math.max(0, dayCycle.gameTick);
  const gameMinsPerSec = 5;
  return Math.floor((tick * gameMinsPerSec) % 1440);
}

function findSlot(slots: ScheduleSlot[], minute: number): ScheduleSlot | null {
  return slots.find((slot) => minute >= slot.startMin && minute < slot.endMin) ?? null;
}

export class NpcScheduleSystem {
  private readonly worldStateManager: WorldStateManager;
  private readonly dayCycle: DayCycle;
  private readonly npcMemorySystem: NpcMemorySystem;
  private readonly getNpcRegistrations: () => NpcRegistration[];
  private readonly schedules: Record<string, ScheduleSlot[]>;
  private readonly resolveNpcHome?: (npcId: string) => { houseId: string; roomId: string; x: number; y: number; worldId?: string; entryWorldId?: string } | null;
  private readonly isNpcLocked: (npcId: string) => boolean;
  private lastSlotKeyByNpc = new Map<string, string>();

  constructor(opts: NpcScheduleSystemOptions) {
    this.worldStateManager = opts.worldStateManager;
    this.dayCycle = opts.dayCycle;
    this.npcMemorySystem = opts.npcMemorySystem;
    this.getNpcRegistrations = opts.getNpcRegistrations;
    this.schedules = opts.schedules ?? DEFAULT_NPC_SCHEDULES;
    this.resolveNpcHome = opts.resolveNpcHome;
    this.isNpcLocked = opts.isNpcLocked ?? (() => false);
  }

  update(_dtSeconds: number, gameTick: number): void {
    const minute = currentMinute(this.dayCycle);
    const registrations = this.getNpcRegistrations();

    for (const { id, npc } of registrations) {
      if (this.isNpcLocked(id)) continue;
      if (npc.isOnDispatch() || npc.isAwaitingConfirm()) continue;
      if (npc.hasPlannedActions() || npc.isNavigating()) continue;

      const slots = this.schedules[id] ?? [];
      const slot = findSlot(slots, minute);
      if (!slot) continue;

      const homeTarget = slot.locationId === 'room' || slot.activity === 'sleep'
        ? this.resolveNpcHome?.(id) ?? null
        : null;
      const slotKey = `${slot.startMin}:${slot.endMin}:${slot.activity}:${slot.locationId ?? ''}:${homeTarget?.houseId ?? ''}`;
      if (this.lastSlotKeyByNpc.get(id) === slotKey) continue;
      this.lastSlotKeyByNpc.set(id, slotKey);

      const currentMind = this.npcMemorySystem.ensureNpcMindState(id, gameTick);
      const autonomyMode = autonomyModeForActivity(slot.activity);
      npc.setAutonomyMode(autonomyMode);
      this.worldStateManager.registerNpcMindState({
        ...currentMind,
        schedule: {
          currentActivity: slot.activity,
          startedAtMinuteOfDay: minute,
          startedAtTick: gameTick,
        },
        meta: {
          ...(currentMind.meta ?? {}),
          autonomyMode,
        },
      });

      const actions: NpcAction[] = [];
      if (slot.line && slot.activity !== 'work_farm') actions.push({ type: 'say', text: slot.line, duration: 3.5 });
      if (homeTarget) {
        actions.push({
          type: 'enter_house',
          houseId: homeTarget.houseId,
          roomId: homeTarget.roomId,
          target: { kind: 'coords', x: homeTarget.x, y: homeTarget.y, worldId: homeTarget.entryWorldId ?? homeTarget.worldId ?? 'world:village' },
          duration: 4,
        });
      } else if (slot.locationId) {
        const target = resolveActorLocationTarget(slot.locationId, id);
        if (target) {
          actions.push({
            type: 'move',
            target: { kind: 'coords', x: target.x, y: target.y, worldId: target.worldId ?? 'world:village' },
            duration: 4,
          });
        }
      }
      if (slot.activity === 'work_farm') {
        actions.push({ type: 'use_skill', skillId: 'farm_till_day', duration: 1 });
      }
      if (actions.length) npc.queueActions(actions, gameTick);
    }
  }
}
