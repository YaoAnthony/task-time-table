/**
 * NpcNeedsSystem — internal drives that make the NPC feel alive even when
 * nobody is talking to it.
 *
 * Tracks three counters per NPC:
 *   energy (drains during work, restores during sleep)
 *   hunger (drains slowly, restored by meal slots)
 *   social (drains slowly, restored by player chat)
 *
 * When a counter crosses its threshold and the NPC hasn't spoken in a while,
 * we call npc.say(...) — which goes through the existing `npc:speak` →
 * React DialogBox path, so the player sees the line on screen.
 *
 * The needs counters are stored on `NpcMindState.needs` so they survive
 * scene-level state queries; they are NOT yet persisted to the backend DB
 * (out of scope per plan).
 */

import type { Npc } from '../entities/Npc';
import type { DayCycle } from './DayCycle';
import { WorldStateManager } from '../shared/WorldStateManager';
import { NpcMemorySystem } from './NpcMemorySystem';
import type { NpcDailyActivity, NpcNeeds } from '../shared/worldStateTypes';

interface NpcRegistration {
  id: string;
  npc: Npc;
}

export interface NpcNeedsSystemOptions {
  worldStateManager: WorldStateManager;
  dayCycle:          DayCycle;
  npcMemorySystem:   NpcMemorySystem;
  getNpcRegistrations: () => NpcRegistration[];
  getPlayerPosition: () => { x: number; y: number } | null;
}

const DEFAULT_NEEDS: NpcNeeds = {
  energy:               80,
  hunger:               70,
  social:               55,
  lastTickMinuteOfDay:  0,
  lastUtteranceTick:    -9999,
};

const THRESHOLD = 25;

// Ratelimit: gameTick is in real-seconds (see DayCycle). 60 in-game minutes
// is ~12 real seconds; pick that so the NPC isn't a chatterbox.
const UTTERANCE_COOLDOWN_REAL_SECS = 12;

const ENERGY_LINES = [
  '哎呀，今天忙得脚底都软啦，我想在树荫下歇一小会儿。',
  '呼，先让我慢慢喘口气，等会儿再接着帮你。',
  '今天的小镇也太热闹了，我的力气快被用光啦。',
];
const HUNGER_LINES = [
  '肚子咕咕叫了，等会儿我想弄点热乎乎的吃。',
  '嘿嘿，到了饭点啦，闻到一点香味我就走不动路。',
  '先去找点小点心吧，吃饱了才有精神逛小镇。',
];
const SOCIAL_LINES = [
  '一个人待久了有点安静，来陪我说两句嘛。',
  '我刚好没事，咱们在这儿聊会儿天吧。',
  '看见你路过我就安心了，今天过得还顺利吗？',
];

function pick<T>(arr: T[], gameTick: number): T {
  const idx = Math.abs(Math.floor(gameTick * 13.37)) % arr.length;
  return arr[idx];
}

function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}

export class NpcNeedsSystem {
  private readonly worldStateManager:   WorldStateManager;
  private readonly dayCycle:            DayCycle;
  private readonly npcMemorySystem:     NpcMemorySystem;
  private readonly getNpcRegistrations: () => NpcRegistration[];
  private readonly getPlayerPosition:   () => { x: number; y: number } | null;

  constructor(opts: NpcNeedsSystemOptions) {
    this.worldStateManager   = opts.worldStateManager;
    this.dayCycle            = opts.dayCycle;
    this.npcMemorySystem     = opts.npcMemorySystem;
    this.getNpcRegistrations = opts.getNpcRegistrations;
    this.getPlayerPosition   = opts.getPlayerPosition;
  }

  update(_dtSeconds: number, gameTick: number): void {
    void _dtSeconds;
    const minute = this.dayCycle.getCurrentMinute();

    for (const { id, npc } of this.getNpcRegistrations()) {
      const mind = this.npcMemorySystem.ensureNpcMindState(id, gameTick);
      const needs = mind.needs ?? { ...DEFAULT_NEEDS, lastTickMinuteOfDay: minute };
      const activity = mind.schedule?.currentActivity ?? null;

      // ── Compute elapsed in-game minutes since last tick (handles wrap) ──
      let elapsedMin = minute - needs.lastTickMinuteOfDay;
      if (elapsedMin < 0) elapsedMin += 1440;     // wrapped past midnight
      if (elapsedMin > 60) elapsedMin = 60;        // cap so a long pause doesn't crater needs

      let energy = needs.energy;
      let hunger = needs.hunger;
      let social = needs.social;

      if (elapsedMin > 0) {
        energy += this.energyDelta(activity) * elapsedMin;
        hunger += -0.3 * elapsedMin;
        social += -0.25 * elapsedMin;
      }

      // ── Activity-entry boosts (meal slots refill hunger) ──────────────────
      // Detect meal-slot entry by comparing previous activity from mind.
      // We can't easily read the previous activity from the patched mind, so
      // we rely on a simple "if hunger < 60 AND we're in a meal slot, top up".
      if (activity === 'breakfast' || activity === 'lunch' || activity === 'dinner') {
        if (hunger < 100) hunger = Math.min(100, hunger + 0.8 * elapsedMin);  // gradual eating
      }

      energy = clamp(energy);
      hunger = clamp(hunger);
      social = clamp(social);

      const nextNeeds: NpcNeeds = {
        energy,
        hunger,
        social,
        lastTickMinuteOfDay: minute,
        lastUtteranceTick:   needs.lastUtteranceTick,
      };

      // ── Threshold-driven autonomous utterance ────────────────────────────
      const realSecsSince = gameTick - needs.lastUtteranceTick;
      if (realSecsSince > UTTERANCE_COOLDOWN_REAL_SECS && !npc.isThinking() && !npc.hasPlannedActions()) {
        const triggered = this.maybeSpeak(npc, gameTick, energy, hunger, social);
        if (triggered) {
          nextNeeds.lastUtteranceTick = gameTick;
        }
      }

      this.worldStateManager.patchNpcMindState(id, { needs: nextNeeds });
    }
  }

  private energyDelta(activity: NpcDailyActivity | null): number {
    switch (activity) {
      case 'work_farm':
      case 'work_forest':
        return -0.6;
      case 'sleep':
        return +1.5;
      case 'lunch':
      case 'breakfast':
      case 'dinner':
        return +0.3;
      default:
        return -0.2;
    }
  }

  private maybeSpeak(
    npc: Npc,
    gameTick: number,
    energy: number,
    hunger: number,
    social: number,
  ): boolean {
    // Pick the most pressing need (lowest score below threshold).
    const candidates: Array<{ score: number; lines: string[]; kind: 'energy' | 'hunger' | 'social' }> = [];
    if (energy < THRESHOLD) candidates.push({ score: energy, lines: ENERGY_LINES, kind: 'energy' });
    if (hunger < THRESHOLD) candidates.push({ score: hunger, lines: HUNGER_LINES, kind: 'hunger' });
    if (social < THRESHOLD) candidates.push({ score: social, lines: SOCIAL_LINES, kind: 'social' });
    if (candidates.length === 0) return false;

    candidates.sort((a, b) => a.score - b.score);
    const winner = candidates[0];
    const line = pick(winner.lines, gameTick);

    npc.say(line, gameTick);

    // For social → walk toward the player so the line lands close
    if (winner.kind === 'social') {
      const ppos = this.getPlayerPosition();
      if (ppos) {
        const dx = ppos.x - npc.sprite.x;
        const dy = ppos.y - npc.sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 80 && dist < 600) {
          npc.queueActions([{
            type:   'move',
            target: { kind: 'coords', x: ppos.x, y: ppos.y },
            duration: 6,
          }], gameTick);
        }
      }
    }

    return true;
  }

  /** Public — called by GameScene when player chats with the NPC. */
  bumpSocial(npcId: string, gameTick: number, amount = 25): void {
    const mind = this.npcMemorySystem.ensureNpcMindState(npcId, gameTick);
    const needs: NpcNeeds = mind.needs
      ? { ...mind.needs, social: clamp(mind.needs.social + amount) }
      : { ...DEFAULT_NEEDS, social: clamp(55 + amount), lastTickMinuteOfDay: this.dayCycle.getCurrentMinute() };
    this.worldStateManager.patchNpcMindState(npcId, { needs });
  }
}
