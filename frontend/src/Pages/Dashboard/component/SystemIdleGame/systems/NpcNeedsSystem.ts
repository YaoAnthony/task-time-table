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
import { canNeedsSpeak } from './NpcBehaviorPolicy';

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

type NeedKind = 'energy' | 'hunger' | 'social';

const NPC_NEED_LINES: Record<string, Partial<Record<NeedKind, string[]>>> = {
  '老李': {
    hunger: [
      '到饭点了，肚子一响，农活都得先放一放。',
      '闻着饭香我就想回屋，吃饱了再接着干。',
      '先垫一口吧，空着肚子下地可不成。',
    ],
    energy: [
      '今天这腿有点沉，我在旁边歇一小会儿。',
      '先让我缓口气，等会儿再去地里看看。',
    ],
  },
  '王村长': {
    hunger: [
      '午饭时间到了，村里的安排也该暂停一下。',
      '先吃饭，再巡村，秩序也得靠体力撑着。',
      '我去简单吃点，下午还要看路口和池塘。',
    ],
    social: [
      '正好遇见你，有件村里的安排想和你确认。',
      '你今天的路线还顺吗？我可以帮你看看安排。',
    ],
  },
  '张雪峰': {
    hunger: [
      '到饭点就吃饭，补资源不是偷懒。',
      '别硬扛，先吃一口，下午效率才上得去。',
      '普通人别拿空腹拼意志力，先把状态补回来。',
    ],
    energy: [
      '先停一下，体力见底还硬冲，这选择不划算。',
      '休息不是摆烂，是为了下一轮行动别变形。',
    ],
    social: [
      '你先别闷头走，目标没说清楚，路就容易跑偏。',
      '来，讲讲你现在卡在哪儿，我帮你拆一下。',
    ],
  },
};

function stableHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function pick<T>(arr: T[], gameTick: number, seed = ''): T {
  const idx = Math.abs(Math.floor(gameTick * 13.37) + stableHash(seed)) % arr.length;
  return arr[idx];
}

function linesFor(npcId: string, kind: NeedKind, fallback: string[]): string[] {
  return NPC_NEED_LINES[npcId]?.[kind] ?? fallback;
}

function defaultNeedsFor(npcId: string, minute: number): NpcNeeds {
  const seed = stableHash(npcId);
  return {
    ...DEFAULT_NEEDS,
    energy:              clamp(DEFAULT_NEEDS.energy - (seed % 9)),
    hunger:              clamp(DEFAULT_NEEDS.hunger - ((seed >> 3) % 13)),
    social:              clamp(DEFAULT_NEEDS.social - ((seed >> 6) % 11)),
    lastTickMinuteOfDay: minute,
    lastUtteranceTick:   DEFAULT_NEEDS.lastUtteranceTick - (seed % 17),
  };
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
      if (npc.isConversationLocked()) continue;
      const mind = this.npcMemorySystem.ensureNpcMindState(id, gameTick);
      const needs = mind.needs ?? defaultNeedsFor(id, minute);
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
      if (canNeedsSpeak(activity)
        && realSecsSince > UTTERANCE_COOLDOWN_REAL_SECS
        && !npc.isThinking()
        && !npc.hasPlannedActions()
        && !npc.isNavigating()) {
        const triggered = this.maybeSpeak(id, npc, gameTick, energy, hunger, social);
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
    npcId: string,
    npc: Npc,
    gameTick: number,
    energy: number,
    hunger: number,
    social: number,
  ): boolean {
    // Pick the most pressing need (lowest score below threshold).
    const candidates: Array<{ score: number; lines: string[]; kind: 'energy' | 'hunger' | 'social' }> = [];
    if (energy < THRESHOLD) candidates.push({ score: energy, lines: linesFor(npcId, 'energy', ENERGY_LINES), kind: 'energy' });
    if (hunger < THRESHOLD) candidates.push({ score: hunger, lines: linesFor(npcId, 'hunger', HUNGER_LINES), kind: 'hunger' });
    if (social < THRESHOLD) candidates.push({ score: social, lines: linesFor(npcId, 'social', SOCIAL_LINES), kind: 'social' });
    if (candidates.length === 0) return false;

    candidates.sort((a, b) => a.score - b.score);
    const winner = candidates[0];
    const line = pick(winner.lines, gameTick, `${npcId}:${winner.kind}`);

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
      : { ...defaultNeedsFor(npcId, this.dayCycle.getCurrentMinute()), social: clamp(55 + amount) };
    this.worldStateManager.patchNpcMindState(npcId, { needs });
  }
}
