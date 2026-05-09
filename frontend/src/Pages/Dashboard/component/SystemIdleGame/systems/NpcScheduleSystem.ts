/**
 * NpcScheduleSystem — drives daily routines for NPCs.
 *
 * Each NPC has a list of slots `{ startMin, endMin, activity, locationId, line }`.
 * On every update tick we compute the current in-game minute, find the active
 * slot, and when it differs from the NPC's last-applied slot we:
 *   1. Queue a `say` action with a flavored line
 *   2. Queue a `move` action toward the slot's named location
 *   3. Patch `mind.schedule.currentActivity` so we don't fire again until the
 *      next slot transition
 *
 * Schedule ticks completely independently from the existing rule-based
 * NpcThinkSystem — both push into the same `npc.queueActions(...)` queue, so
 * the player still sees a single NPC walking around, with daily structure.
 */
import type { NpcAction } from '../types';
import type { Npc } from '../entities/Npc';
import type { DayCycle } from './DayCycle';
import { WORLD_LOCATION_MAP } from '../shared/WorldLocations';
import { WorldStateManager } from '../shared/WorldStateManager';
import { NpcMemorySystem } from './NpcMemorySystem';
import type { NpcDailyActivity } from '../shared/worldStateTypes';

export interface ScheduleSlot {
  startMin: number;        // 0-1439 inclusive
  endMin:   number;        // exclusive
  activity: NpcDailyActivity;
  locationId?: string;     // key into WORLD_LOCATION_MAP
  line?:     string;       // flavored line spoken on transition
}

interface NpcRegistration {
  id: string;
  npc: Npc;
}

export interface NpcScheduleSystemOptions {
  worldStateManager: WorldStateManager;
  dayCycle:          DayCycle;
  npcMemorySystem:   NpcMemorySystem;
  getNpcRegistrations: () => NpcRegistration[];
  /** Optional: override the default 老李 schedule for testing. */
  schedules?: Record<string, ScheduleSlot[]>;
}

// ── 老李 default daily schedule ────────────────────────────────────────────────
// All times in in-game minutes (0..1439).
export const DEFAULT_LAOLI_SCHEDULE: ScheduleSlot[] = [
  { startMin:    0, endMin:  360, activity: 'sleep',       locationId: 'room', line: '夜深了，先回去歇着了。' },
  { startMin:  360, endMin:  480, activity: 'breakfast',   locationId: 'door', line: '天亮了，又是新的一天。' },
  { startMin:  480, endMin:  720, activity: 'work_farm',   locationId: 'farm', line: '走，下地干点活去。' },
  { startMin:  720, endMin:  780, activity: 'lunch',       locationId: 'room', line: '到饭点了，回去吃口饭。' },
  { startMin:  780, endMin: 1080, activity: 'work_forest', locationId: 'pond', line: '下午到林子边上转转。' },
  { startMin: 1080, endMin: 1140, activity: 'dinner',      locationId: 'room', line: '该回去做晚饭了。' },
  { startMin: 1140, endMin: 1440, activity: 'sleep',       locationId: 'room', line: '今天就到这儿吧，回家歇了。' },
];

export class NpcScheduleSystem {
  private readonly worldStateManager: WorldStateManager;
  private readonly dayCycle:          DayCycle;
  private readonly npcMemorySystem:   NpcMemorySystem;
  private readonly getNpcRegistrations: () => NpcRegistration[];
  private readonly schedules:         Record<string, ScheduleSlot[]>;

  constructor(opts: NpcScheduleSystemOptions) {
    this.worldStateManager = opts.worldStateManager;
    this.dayCycle          = opts.dayCycle;
    this.npcMemorySystem   = opts.npcMemorySystem;
    this.getNpcRegistrations = opts.getNpcRegistrations;
    // Default: 老李 gets the canonical schedule; other NPCs are free-roam unless
    // an explicit schedule is registered for them.
    this.schedules = opts.schedules ?? { '老李': DEFAULT_LAOLI_SCHEDULE };
  }

  /** Per-NPC schedule, or null if this NPC isn't on a fixed routine. */
  private scheduleFor(npcId: string): ScheduleSlot[] | null {
    return this.schedules[npcId] ?? null;
  }

  /** Find the slot that contains the given minute (binary-tree-style not needed; small list). */
  private findSlot(slots: ScheduleSlot[], minute: number): ScheduleSlot | null {
    for (const slot of slots) {
      if (minute >= slot.startMin && minute < slot.endMin) return slot;
    }
    // Defensive: should never happen since slots cover 0..1440, but guard anyway.
    return slots[0] ?? null;
  }

  /**
   * Called every frame from GameScene.update. Cheap — just a minute lookup
   * plus a single equality check for most ticks.
   */
  update(_dtSeconds: number, gameTick: number): void {
    void _dtSeconds;
    const minute = this.dayCycle.getCurrentMinute();
    const registrations = this.getNpcRegistrations();
    for (const { id, npc } of registrations) {
      const slots = this.scheduleFor(id);
      if (!slots) continue;          // free-roam NPC, no schedule
      const slot  = this.findSlot(slots, minute);
      if (!slot) continue;

      const mind = this.npcMemorySystem.ensureNpcMindState(id, gameTick);
      const currentActivity = mind.schedule?.currentActivity ?? null;
      if (currentActivity === slot.activity) continue;

      // ── New slot — queue say + move and patch mind ──────────────────────
      this.applySlotTransition(id, npc, slot, gameTick);
    }
  }

  private applySlotTransition(npcId: string, npc: Npc, slot: ScheduleSlot, gameTick: number): void {
    const actions: NpcAction[] = [];

    if (slot.line) {
      actions.push({ type: 'say', text: slot.line, duration: 4 });
    }

    if (slot.locationId) {
      const loc = WORLD_LOCATION_MAP[slot.locationId];
      if (loc) {
        actions.push({
          type:     'move',
          target:   { kind: 'coords', x: loc.worldX, y: loc.worldY },
          duration: 6,
        });
      }
    }

    // For sleep slots tack on an idle hold so the NPC actually loiters at the bed
    if (slot.activity === 'sleep') {
      actions.push({ type: 'idle', duration: 30 });
    }

    if (actions.length > 0) {
      npc.queueActions(actions, gameTick);
    }

    // Patch schedule state
    this.worldStateManager.patchNpcMindState(npcId, {
      schedule: {
        currentActivity:       slot.activity,
        startedAtMinuteOfDay:  slot.startMin,
        startedAtTick:         gameTick,
      },
    });

    // Push a small memory record so chat retrieval can surface "I just started lunch"
    // when the player asks what they're doing.
    const mind = this.worldStateManager.getNpcMindState(npcId);
    if (mind) {
      const recentMemories = { ...(mind.recentMemories ?? {}) };
      const key = `schedule:${slot.activity}`;
      recentMemories[key] = {
        key,
        kind:         'landmark',
        type:         'schedule',
        label:        slot.activity,
        x:            0,
        y:            0,
        lastSeenTick: gameTick,
        meta: {
          activity:    slot.activity,
          locationId:  slot.locationId ?? null,
          startMinute: slot.startMin,
        },
      };
      this.worldStateManager.patchNpcMindState(npcId, { recentMemories });
    }
  }

  /** Public read — current activity for any NPC (used by Needs system + chat prompt). */
  getCurrentActivity(npcId: string): NpcDailyActivity | null {
    const mind = this.worldStateManager.getNpcMindState(npcId);
    return mind?.schedule?.currentActivity ?? null;
  }
}
