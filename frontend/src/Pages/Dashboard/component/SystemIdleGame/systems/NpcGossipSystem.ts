/**
 * NpcGossipSystem — when one NPC speaks, nearby NPCs can chime in.
 *
 * Subscribes to the global `npc:speak` event. Whenever a speak fires:
 *   1. Find all OTHER NPCs within `hearingRadius` of the speaker.
 *   2. Pick at most one of them (random) and queue a brief canned interjection
 *      after a short delay so it feels like a reply, not a chorus.
 *
 * Canned reactions are intentionally short and generic (no GPT calls), so the
 * village feels alive without burning API quota. The gossip line goes through
 * `npc.say(...)` → `npc:speak` → React DialogBox just like any other speech.
 *
 * Re-entrancy guard: gossip-driven speech does NOT trigger another gossip pass
 * (otherwise NPCs would echo each other forever).
 */

import type Phaser from 'phaser';
import type { Npc } from '../entities/Npc';
import { gameBus } from '../shared/EventBus';
import type { NpcDailyActivity } from '../shared/worldStateTypes';
import { canGossip } from './NpcBehaviorPolicy';

interface NpcRegistration {
  id: string;
  npc: Npc;
}

export interface NpcGossipSystemOptions {
  scene: Phaser.Scene;
  getNpcRegistrations: () => NpcRegistration[];
  /** Hearing range (px). Default 280 ≈ 9 tiles. */
  hearingRadius?: number;
  /** Probability 0..1 a nearby NPC actually chimes in. Default 0.55. */
  reactChance?: number;
  getNpcActivity?: (npcId: string) => NpcDailyActivity | null;
  isEnabled?: () => boolean;
}

const REACTIONS_GENERIC = [
  '嗯嗯，我也听见啦。',
  '你们聊着呢？真热闹呀。',
  '嘿嘿，我也来凑个小热闹。',
  '这话听着挺有意思的。',
  '哎呀，真的吗？',
  '我在旁边听得可认真了。',
  '说到这个，我也有点在意呢。',
  '小镇里有人聊天就不冷清啦。',
];

const REACTIONS_DISTANT = [
  '我在这边也点点头哦。',
  '我听见啦，嘿嘿。',
  '那边在聊什么有趣的事呀？',
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class NpcGossipSystem {
  private readonly scene: Phaser.Scene;
  private readonly getNpcRegistrations: () => NpcRegistration[];
  private readonly hearingRadius: number;
  private readonly reactChance: number;
  private readonly getNpcActivity: (npcId: string) => NpcDailyActivity | null;
  private readonly isEnabled: () => boolean;
  private readonly cooldowns = new Map<string, number>();   // npcId -> wallclock ms
  private readonly lineCooldowns = new Map<string, number>();
  private unsub: (() => void) | null = null;
  private inGossip = false;   // re-entrancy guard

  constructor(opts: NpcGossipSystemOptions) {
    this.scene               = opts.scene;
    this.getNpcRegistrations = opts.getNpcRegistrations;
    this.hearingRadius       = opts.hearingRadius ?? 160;
    this.reactChance         = opts.reactChance ?? 0.18;
    this.getNpcActivity      = opts.getNpcActivity ?? (() => null);
    this.isEnabled           = opts.isEnabled ?? (() => true);
  }

  start(): void {
    if (this.unsub) return;
    this.unsub = gameBus.on('npc:speak', (payload: { text: string; npcName: string }) => {
      this.onSpeak(payload.npcName, payload.text);
    });
  }

  stop(): void {
    this.unsub?.();
    this.unsub = null;
  }

  private onSpeak(speakerName: string, text: string): void {
    if (this.inGossip) return;     // don't gossip about gossip
    if (!this.isEnabled()) return;
    const normalized = text.trim();
    if (!normalized || normalized === '-' || normalized === '...' || normalized.length < 4) return;

    const registrations = this.getNpcRegistrations();
    const speaker = registrations.find(r => r.id === speakerName)?.npc;
    if (!speaker) return;
    if (!canGossip(this.getNpcActivity(speakerName))) return;

    const sx = speaker.sprite.x;
    const sy = speaker.sprite.y;

    // Collect listeners within hearing radius
    const listeners: Array<{ npc: Npc; dist: number }> = [];
    for (const { id, npc } of registrations) {
      if (id === speakerName) continue;
      if (!npc.sprite) continue;
      if (npc.isOnDispatch?.()) continue;
      if (npc.isThinking?.()) continue;
      if (npc.isSpeaking?.()) continue;
      if (!canGossip(this.getNpcActivity(id))) continue;
      const dx = npc.sprite.x - sx;
      const dy = npc.sprite.y - sy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= this.hearingRadius) listeners.push({ npc, dist });
    }
    if (listeners.length === 0) return;

    // Probabilistic chime — at most ONE listener reacts per speak event
    if (Math.random() > this.reactChance) return;

    listeners.sort((a, b) => a.dist - b.dist);
    // Bias toward closer listeners (60% closest, else random of rest)
    const responder = (Math.random() < 0.6 || listeners.length === 1)
      ? listeners[0]
      : listeners[1 + Math.floor(Math.random() * (listeners.length - 1))];

    // Cooldown: same NPC can't chime too often.
    const now = this.scene.time?.now ?? Date.now();
    const last = this.cooldowns.get(responder.npc.name) ?? 0;
    if (now - last < 20_000) return;
    this.cooldowns.set(responder.npc.name, now);

    const isClose = responder.dist < this.hearingRadius * 0.5;
    const pool = (isClose ? REACTIONS_GENERIC : REACTIONS_DISTANT)
      .filter(line => now - (this.lineCooldowns.get(line) ?? 0) > 30_000);
    if (pool.length === 0) return;
    const line = pick(pool);
    this.lineCooldowns.set(line, now);

    // Delay the chime so it lands AFTER the speaker's bubble shows
    const delay = 700 + Math.floor(Math.random() * 600);
    this.scene.time.delayedCall(delay, () => {
      // Re-entrancy guard so this say() doesn't itself trigger a gossip cascade
      this.inGossip = true;
      try {
        // Use a synthetic gameTick from the scene if available; 0 fallback is fine
        const gameTick = (this.scene as unknown as { dayCycle?: { gameTick: number } }).dayCycle?.gameTick ?? 0;
        responder.npc.say(line, gameTick);
      } finally {
        this.inGossip = false;
      }
    });
  }
}
