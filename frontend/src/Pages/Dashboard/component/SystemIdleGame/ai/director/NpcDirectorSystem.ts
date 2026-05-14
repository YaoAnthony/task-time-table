import type { Npc } from '../../entities/Npc';
import type { NpcMindState } from '../../shared/worldStateTypes';
import type { NpcNeedsSystem } from '../../systems/NpcNeedsSystem';
import type { NpcScheduleSystem } from '../../systems/NpcScheduleSystem';
import type { NpcThinkSystem } from '../../systems/NpcThinkSystem';

export interface NpcDirectorRegistration {
  id: string;
  npc: Npc;
}

export interface NpcDirectorSystemOptions {
  thinkSystem: NpcThinkSystem;
  scheduleSystem?: NpcScheduleSystem;
  needsSystem?: NpcNeedsSystem;
  getNpcRegistrations: () => NpcDirectorRegistration[];
  enabled?: boolean;
}

/**
 * Single autonomous-control gateway for NPCs.
 *
 * Schedule, needs, and free thinking are still separate systems, but GameScene
 * talks to this director instead of letting each subsystem become another
 * top-level control path.
 */
export class NpcDirectorSystem {
  private enabled: boolean;

  constructor(private readonly options: NpcDirectorSystemOptions) {
    this.enabled = options.enabled ?? true;
    this.applyBrainFlag();
  }

  update(dtSeconds: number, gameTick: number): void {
    if (!this.enabled) return;
    this.options.scheduleSystem?.update(dtSeconds, gameTick);
    this.options.needsSystem?.update(dtSeconds, gameTick);
    this.options.thinkSystem.update(dtSeconds, gameTick);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.applyBrainFlag();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  pauseNpc(npcId: string, gameTick: number, seconds?: number, reason?: string): void {
    this.options.thinkSystem.pauseNpc(npcId, gameTick, seconds, reason);
  }

  bumpSocial(npcId: string, gameTick: number, amount?: number): void {
    this.options.needsSystem?.bumpSocial(npcId, gameTick, amount);
  }

  getMindState(npcId: string): NpcMindState | null {
    return this.options.thinkSystem.getMindState(npcId);
  }

  private applyBrainFlag(): void {
    for (const { npc } of this.options.getNpcRegistrations()) {
      npc.setBrainEnabled(this.enabled);
    }
  }
}
