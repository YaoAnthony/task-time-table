import { gameBus } from '../shared/EventBus';
import { getGameEventDefinition, NPC_ARRIVAL_EVENT_ID, RANDOM_CHEST_EVENT_ID } from './EventDefinitions';
import type { EventActionExecutor } from './EventActionExecutor';
import { createDefaultEventSaveState, hasPendingEvent, normalizeEventSaveState } from './EventState';
import type { GameEventHistoryEntry, GameEventInstance, GameEventSaveState } from './EventTypes';

const HISTORY_LIMIT = 80;
const RANDOM_CHEST_CHECK_INTERVAL_TICKS = 120;
const RANDOM_CHEST_COOLDOWN_TICKS = 900;
const RANDOM_CHEST_CHANCE = 0.08;

export class EventSystem {
  private state: GameEventSaveState;
  private readonly running = new Set<string>();
  private readonly unlockedNpcIds = new Set<string>();
  private lastRandomChestCheckTick = 0;
  private lastDebugSnapshot = '';

  constructor(
    initialState: unknown,
    unlockedNpcIds: string[],
    private readonly executor: EventActionExecutor,
    private readonly getGameTick: () => number,
  ) {
    this.state = normalizeEventSaveState(initialState);
    unlockedNpcIds.forEach((id) => this.unlockedNpcIds.add(id));
  }

  update(gameTick: number): void {
    this.maybeQueueRandomChest(gameTick);

    const debugSnapshot = `${Math.floor(gameTick)}|q:${this.state.queued.length}|a:${this.state.active.length}|r:${this.running.size}`;
    if (debugSnapshot !== this.lastDebugSnapshot) {
      this.lastDebugSnapshot = debugSnapshot;
      if (this.state.queued.length || this.state.active.length || this.running.size) {
        console.log('[DEBUG-event-flow] EventSystem.update snapshot', {
          gameTick,
          queued: this.state.queued,
          active: this.state.active,
          running: [...this.running],
        });
      }
    }

    const ready = this.state.queued
      .filter((event) => event.triggerTick <= gameTick)
      .sort((a, b) => a.triggerTick - b.triggerTick);
    for (const event of ready) {
      if (this.running.has(event.instanceId)) continue;
      void this.startEvent(event, gameTick);
      break;
    }
  }

  enqueueNpcArrival(npcId: string, triggerTick: number, createdAtTick = triggerTick): GameEventInstance | null {
    if (this.unlockedNpcIds.has(npcId)) return null;
    if (this.hasPendingNpcArrival(npcId)) return null;
    const event: GameEventInstance = {
      instanceId: `npc-arrival-${npcId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      definitionId: NPC_ARRIVAL_EVENT_ID,
      status: 'queued',
      triggerTick,
      createdAtTick,
      payload: { npcId },
    };
    this.state.queued.push(event);
    console.log('[DEBUG-event-flow] enqueueNpcArrival', { npcId, triggerTick, createdAtTick, event });
    return event;
  }

  hasPendingNpcArrival(npcId: string): boolean {
    return hasPendingEvent(
      this.state,
      NPC_ARRIVAL_EVENT_ID,
      (event) => event.payload?.npcId === npcId,
    );
  }

  markNpcUnlocked(npcId: string): void {
    this.unlockedNpcIds.add(npcId);
  }

  getUnlockedNpcIds(): string[] {
    return [...this.unlockedNpcIds];
  }

  importSaveData(initialState: unknown, unlockedNpcIds: string[] = []): void {
    const nextState = normalizeEventSaveState(initialState);
    console.log('[DEBUG-event-flow] EventSystem.importSaveData before active reset', {
      input: initialState,
      normalized: nextState,
      unlockedNpcIds,
    });
    if (nextState.active.length) {
      const interrupted = nextState.active.map((event) => ({
        ...event,
        status: 'queued' as const,
        startedAtTick: null,
      }));
      nextState.queued = [...interrupted, ...nextState.queued];
      nextState.active = [];
    }
    this.state = nextState;
    this.unlockedNpcIds.clear();
    unlockedNpcIds.forEach((id) => this.unlockedNpcIds.add(id));
    console.log('[DEBUG-event-flow] EventSystem.importSaveData applied', {
      state: this.exportSaveData(),
      unlocked: this.getUnlockedNpcIds(),
    });
  }

  setFlag(key: string, value: unknown): void {
    this.state.flags[key] = value;
  }

  exportSaveData(): GameEventSaveState {
    return {
      schemaVersion: 1,
      queued: this.state.queued.map((event) => ({ ...event, payload: { ...(event.payload ?? {}) } })),
      active: this.state.active.map((event) => ({ ...event, payload: { ...(event.payload ?? {}) } })),
      cooldowns: { ...this.state.cooldowns },
      flags: { ...this.state.flags },
      history: this.state.history.slice(-HISTORY_LIMIT),
    };
  }

  private async startEvent(event: GameEventInstance, gameTick: number): Promise<void> {
    const definition = getGameEventDefinition(event.definitionId);
    if (!definition) {
      this.failEvent(event, gameTick, 'definition_missing');
      return;
    }

    console.log('[DEBUG-event-flow] EventSystem.startEvent', { event, gameTick, definition });
    this.running.add(event.instanceId);
    this.state.queued = this.state.queued.filter((entry) => entry.instanceId !== event.instanceId);
    const active: GameEventInstance = {
      ...event,
      status: 'active',
      startedAtTick: gameTick,
    };
    this.state.active.push(active);
    gameBus.emit('event:started', { event: active });
    gameBus.emit('ui:show_message', { text: this.describeEvent(active, 'started') });

    try {
      await this.executor.execute(active, definition.actions);
      this.completeEvent(active, this.getGameTick());
    } catch (error) {
      console.error('[DEBUG-event-flow] EventSystem.startEvent failed', { event: active, error });
      this.failEvent(active, this.getGameTick(), error instanceof Error ? error.message : 'event_failed');
    } finally {
      this.running.delete(event.instanceId);
    }
  }

  private completeEvent(event: GameEventInstance, gameTick: number): void {
    this.state.active = this.state.active.filter((entry) => entry.instanceId !== event.instanceId);
    const history = this.historyEntry(event, 'completed', gameTick);
    this.state.history.push(history);
    this.state.history = this.state.history.slice(-HISTORY_LIMIT);
    console.log('[DEBUG-event-flow] EventSystem.completeEvent', { event, history, gameTick, state: this.exportSaveData() });
    gameBus.emit('event:completed', { event: history });
    gameBus.emit('ui:show_message', { text: this.describeEvent(event, 'completed') });
    gameBus.emit('game:save_requested', { reason: `event:${event.definitionId}:completed` });
  }

  private failEvent(event: GameEventInstance, gameTick: number, reason: string): void {
    this.state.queued = this.state.queued.filter((entry) => entry.instanceId !== event.instanceId);
    this.state.active = this.state.active.filter((entry) => entry.instanceId !== event.instanceId);
    const history = { ...this.historyEntry(event, 'failed', gameTick), reason };
    this.state.history.push(history);
    this.state.history = this.state.history.slice(-HISTORY_LIMIT);
    console.error('[DEBUG-event-flow] EventSystem.failEvent', { event, reason, gameTick, state: this.exportSaveData() });
    gameBus.emit('event:failed', { event: history });
    gameBus.emit('ui:show_message', { text: `事件失败：${event.definitionId}` });
    gameBus.emit('game:save_requested', { reason: `event:${event.definitionId}:failed` });
  }

  private describeEvent(event: GameEventInstance, status: 'started' | 'completed'): string {
    if (event.definitionId === NPC_ARRIVAL_EVENT_ID) {
      return status === 'started' ? '车站那边有巴士来了。' : '新 NPC 已经到站。';
    }
    if (event.definitionId === RANDOM_CHEST_EVENT_ID) {
      return status === 'started' ? '世界里出现了奇怪的动静。' : '一个宝箱出现在地图上。';
    }
    return status === 'started' ? '事件开始。' : '事件完成。';
  }

  private historyEntry(
    event: GameEventInstance,
    status: GameEventHistoryEntry['status'],
    gameTick: number,
  ): GameEventHistoryEntry {
    return {
      instanceId: event.instanceId,
      definitionId: event.definitionId,
      status,
      completedAtTick: gameTick,
      payload: { ...(event.payload ?? {}) },
    };
  }

  private maybeQueueRandomChest(gameTick: number): void {
    if (this.state.flags.randomChestAutoEnabled !== true) return;
    if (gameTick - this.lastRandomChestCheckTick < RANDOM_CHEST_CHECK_INTERVAL_TICKS) return;
    this.lastRandomChestCheckTick = gameTick;
    const cooldownUntil = Number(this.state.cooldowns[RANDOM_CHEST_EVENT_ID] ?? 0);
    if (cooldownUntil > gameTick) return;
    if (Math.random() > RANDOM_CHEST_CHANCE) return;

    this.state.queued.push({
      instanceId: `random-chest-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      definitionId: RANDOM_CHEST_EVENT_ID,
      status: 'queued',
      triggerTick: gameTick,
      createdAtTick: gameTick,
      payload: {},
    });
    this.state.cooldowns[RANDOM_CHEST_EVENT_ID] = gameTick + RANDOM_CHEST_COOLDOWN_TICKS;
  }

}

export function createEmptyEventSystemState(): GameEventSaveState {
  return createDefaultEventSaveState();
}
