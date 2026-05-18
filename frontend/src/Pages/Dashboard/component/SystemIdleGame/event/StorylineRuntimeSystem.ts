import { GAME_MINS_PER_SEC, MINS_PER_DAY } from '../constants';
import type { NpcAction } from '../types';
import { GAME_NPC_CATALOG } from '../shared/GameNpcCatalog';
import { gameBus } from '../shared/EventBus';
import { VILLAGE_LAYOUT } from '../world/layouts/villageLayout';
import {
  LAOLI_CAT_ENTITY_ID,
  LAOLI_CAT_ITEM_ID,
  LAOLI_CAT_MEMORY_SEEDS,
  LAOLI_CAT_PET_ID,
  PetView,
  type PetMemorySeed,
} from '../features/pets';
import { createDefaultStorylineSkillRegistry } from './storyline/defaultStorylineSkillHandlers';
import {
  DEFAULT_STORYLINE_START_STATE,
  StorylineStateStore,
} from './storyline/StorylineStateStore';
import type {
  StorylineCameraTarget,
  StorylineChoiceOption,
  StorylineDefinition,
  StorylineDirectorState,
  StorylineExecutionContext,
  StorylinePoint,
  StorylineRuntimeServices,
  StorylineSkillArgs,
  StorylineStep,
  StorylineStepSource,
} from './storyline/StorylineRuntimeTypes';

const CHECK_INTERVAL_TICKS = 1;
const OFFER_EVENT_ID = 'offer_to_player';

export class StorylineRuntimeSystem {
  private storylines: StorylineDefinition[] = [];
  private lastCheckTick = -CHECK_INTERVAL_TICKS;
  private readonly runningEvents = new Set<string>();
  private readonly registry = createDefaultStorylineSkillRegistry();
  private readonly stateStore: StorylineStateStore;
  private readonly services: StorylineRuntimeServices;
  private readonly directorStates = new Map<string, StorylineDirectorState>();
  private nextChoiceId = 1;

  constructor(private readonly scene: any) {
    this.stateStore = new StorylineStateStore(
      (key) => this.scene.eventSystem?.getFlag?.(key),
      (key, value) => this.scene.eventSystem?.setFlag?.(key, value),
    );
    for (const state of this.stateStore.getActiveDirectorStates()) {
      this.directorStates.set(this.directorKey(state.storylineId, state.eventId), state);
    }
    this.services = this.createServices();
  }

  setStorylines(storylines: unknown[]): void {
    this.storylines = Array.isArray(storylines)
      ? storylines.filter(isStorylineDefinition)
      : [];
  }

  update(gameTick: number): void {
    if (!this.storylines.length) return;
    if (gameTick - this.lastCheckTick < CHECK_INTERVAL_TICKS) return;
    this.lastCheckTick = gameTick;

    for (const storyline of this.storylines) {
      this.evaluateStoryline(storyline, gameTick);
    }
  }

  private evaluateStoryline(storyline: StorylineDefinition, gameTick: number): void {
    const storylineId = storyline.id;
    if (!storylineId) return;

    for (const trigger of storyline.triggers ?? []) {
      const triggerId = trigger.id ?? 'trigger';
      const firedKey = this.stateStore.triggerFiredKey(storylineId, triggerId);
      if (this.stateStore.getFlag(firedKey) === true) continue;

      const expectedState = trigger.fromState ?? storyline.startState ?? DEFAULT_STORYLINE_START_STATE;
      if (this.stateStore.getQuestState(storyline) !== expectedState) continue;
      if (!this.conditionsPass(storyline, trigger.when ?? [], gameTick)) continue;

      const actionsByNpc = new Map<string, NpcAction[]>();
      const context = this.createExecutionContext(storyline, gameTick, actionsByNpc, { triggerId });
      for (const step of trigger.then ?? []) {
        void this.registry.executeAction(context, step);
      }
      this.flushNpcActions(actionsByNpc);
      this.stateStore.setFlag(firedKey, true);

      if (this.stateStore.getQuestState(storyline) === 'eligible' && storyline.events?.[OFFER_EVENT_ID]) {
        void this.runStorylineEvent(storyline, OFFER_EVENT_ID, gameTick);
      }

      gameBus.emit('game:save_requested', { reason: `storyline:${storylineId}:${triggerId}` });
    }
  }

  private conditionsPass(storyline: StorylineDefinition, conditions: StorylineStep[], gameTick: number): boolean {
    const context = { storyline, gameTick, services: this.services };
    return conditions.every((condition) => this.registry.evaluateCondition(context, condition));
  }

  private async runStorylineEvent(storyline: StorylineDefinition, eventId: string, gameTick: number): Promise<void> {
    const storylineId = storyline.id;
    if (!storylineId || !eventId) return;

    const eventKey = this.stateStore.eventStartedKey(storylineId, eventId);
    if (this.stateStore.getFlag(eventKey) === true || this.runningEvents.has(eventKey)) return;
    const steps = storyline.events?.[eventId] ?? [];
    if (!steps.length) return;

    this.stateStore.setFlag(eventKey, true);
    this.runningEvents.add(eventKey);
    const actionsByNpc = new Map<string, NpcAction[]>();
    const context = this.createExecutionContext(storyline, gameTick, actionsByNpc, { eventId });

    try {
      await this.executeNestedSteps(context, steps);
      this.flushNpcActions(actionsByNpc);
      gameBus.emit('game:save_requested', { reason: `storyline:${storylineId}:${eventId}` });
    } catch (error) {
      console.error('[StorylineRuntimeSystem] event failed', { storylineId, eventId, error });
      this.stateStore.setFlag(`storyline:${storylineId}:event:${eventId}:failed`, true);
      this.scene.cutsceneDirector?.unlockPlayer?.();
    } finally {
      this.runningEvents.delete(eventKey);
    }
  }

  private async executeNestedSteps(context: StorylineExecutionContext, steps: StorylineStep[]): Promise<void> {
    for (const step of steps) {
      await this.registry.executeAction(context, step);
    }
  }

  private createExecutionContext(
    storyline: StorylineDefinition,
    gameTick: number,
    actionsByNpc: Map<string, NpcAction[]>,
    source: StorylineStepSource,
  ): StorylineExecutionContext {
    return {
      storyline,
      gameTick,
      eventId: source.eventId,
      triggerId: source.triggerId,
      actionsByNpc,
      services: this.services,
    };
  }

  private createServices(): StorylineRuntimeServices {
    return {
      currentMinute: (gameTick) => this.currentMinute(gameTick),
      getFlag: (key) => this.stateStore.getFlag(key),
      setFlag: (key, value) => this.stateStore.setFlag(key, value),
      getQuestState: (storyline) => this.stateStore.getQuestState(storyline),
      setQuestState: (questId, state, gameTick, args) => this.stateStore.setQuestState(questId, state, gameTick, args),
      getDirectorPhase: (storyline, eventId) => this.getDirectorPhase(storyline, eventId),
      beginDirectorEvent: (storyline, eventId, gameTick, args) => this.beginDirectorEvent(storyline, eventId, gameTick, args),
      setDirectorPhase: (storyline, eventId, gameTick, args) => this.setDirectorPhase(storyline, eventId, gameTick, args),
      endDirectorEvent: (storyline, eventId, gameTick, args) => this.endDirectorEvent(storyline, eventId, gameTick, args),
      npcArrivalCompleted: (npcId) => this.npcArrivalCompleted(npcId),
      npcUnlocked: (npcId) => this.npcUnlocked(npcId),
      hasHouseResident: (npcId) => this.hasHouseResident(npcId),
      playerInWorld: (worldId) => this.playerInWorld(worldId),
      petExists: (petId) => this.petExists(petId),
      flushNpcActions: (actionsByNpc) => this.flushNpcActions(actionsByNpc),
      queueNpcAction: (args, actionsByNpc, action) => this.queueNpcAction(args, actionsByNpc, action),
      ensureNpcInWorld: (args) => this.ensureNpcInWorld(args),
      addNpcMemory: (storyline, args, gameTick, source) => this.addNpcMemory(storyline, args, gameTick, source),
      approachNpcForDialogue: (args) => this.approachNpcForDialogue(args),
      runStorylineEvent: (storyline, eventId, gameTick) => this.runStorylineEvent(storyline, eventId, gameTick),
      executeNestedSteps: (context, steps) => this.executeNestedSteps(context, steps),
      requestPlayerChoice: (storyline, eventId, args, choices) => this.requestPlayerChoice(storyline, eventId, args, choices),
      recordChoice: (storylineId, eventId, choiceId) => this.stateStore.recordChoice(storylineId, eventId, choiceId),
      resolveNpcName: (npcId) => this.resolveNpcName(npcId),
      resolveCameraTarget: (target) => this.resolveCameraTarget(target),
      placePlayer: (args) => this.placePlayer(args),
      placeNpc: (args) => this.placeNpc(args),
      setPlayerVisible: (visible) => this.setPlayerVisible(visible),
      setNpcVisible: (args, visible) => this.setNpcVisible(args, visible),
      makeNpcSay: (npcId, text) => this.makeNpcSay(npcId, text),
      makePlayerSay: (text) => this.makePlayerSay(text),
      wait: (ms) => this.wait(ms),
      waitForPlayerWorld: (worldId, timeoutMs, pollMs) => this.waitForPlayerWorld(worldId, timeoutMs, pollMs),
      setTimeOfDay: (minute) => this.scene.dayCycle?.setTimeOfDay?.(minute),
      lockPlayer: () => this.scene.cutsceneDirector?.lockPlayer?.(),
      unlockPlayer: () => this.scene.cutsceneDirector?.unlockPlayer?.(),
      panTo: async (target, durationMs) => this.scene.cutsceneDirector?.panTo?.(target, durationMs),
      follow: (target, vehicleId) => this.scene.cutsceneDirector?.follow?.(target, vehicleId),
      spawnBus: (vehicleId) => this.scene.vehicleSystem?.spawnArrivalBus?.(vehicleId),
      moveBusToStation: async (vehicleId, durationMs) => this.scene.vehicleSystem?.moveToStation?.(vehicleId, durationMs),
      playBusDoor: async (vehicleId, state) => this.scene.vehicleSystem?.playDoor?.(vehicleId, state),
      moveBusOffscreen: async (vehicleId, direction, durationMs) => this.scene.vehicleSystem?.moveOffscreen?.(vehicleId, direction, durationMs),
      despawnBus: (vehicleId) => this.scene.vehicleSystem?.remove?.(vehicleId),
      dropOffPassengers: (args) => this.dropOffPassengers(args),
      pickUpPassengers: (args) => this.pickUpPassengers(args),
      spawnPet: (args, gameTick) => this.spawnPet(args, gameTick),
      setPetHome: (args) => this.setPetHome(args),
      addPetMemory: (args, gameTick) => this.addPetMemory(args, gameTick),
      playAudio: (key, args) => this.scene.audioSystem?.play?.(key, args as any),
      playMusic: (key, args) => this.scene.audioSystem?.playMusic?.(key, args as any),
      stopAudioTag: (tag, fadeMs) => this.scene.audioSystem?.stopByTag?.(tag, fadeMs),
    };
  }

  private queueNpcAction(args: StorylineSkillArgs, actionsByNpc: Map<string, NpcAction[]>, action: NpcAction): void {
    const npcName = this.resolveNpcName(String(args.npcId ?? ''));
    if (!npcName) return;
    const actions = actionsByNpc.get(npcName) ?? [];
    actions.push(action);
    actionsByNpc.set(npcName, actions);
  }

  isNpcLocked(npcId: string): boolean {
    const normalized = this.resolveNpcName(npcId) ?? npcId;
    for (const state of this.directorStates.values()) {
      if (state.status !== 'running') continue;
      for (const lock of state.locks) {
        const lockName = this.resolveNpcName(lock) ?? lock;
        if (lock === npcId || lock === normalized || lockName === npcId || lockName === normalized) {
          return true;
        }
      }
    }
    return false;
  }

  getDirectorStates(): StorylineDirectorState[] {
    return [...this.directorStates.values()];
  }

  private getDirectorPhase(storyline: StorylineDefinition, eventId?: string): string | null {
    const storylineId = storyline.id ?? '';
    const state = this.directorStates.get(this.directorKey(storylineId, eventId ?? 'event'))
      ?? this.stateStore.getDirectorState(storylineId, eventId ?? 'event');
    return state?.status === 'running' ? state.phase : null;
  }

  private beginDirectorEvent(
    storyline: StorylineDefinition,
    eventId: string | undefined,
    gameTick: number,
    args: StorylineSkillArgs,
  ): void {
    const storylineId = storyline.id ?? '';
    const resolvedEventId = this.resolveDirectorEventId(eventId, args);
    if (!storylineId || !resolvedEventId) return;

    const participants = this.normalizeDirectorActors(args.participants);
    const requestedLocks = this.normalizeDirectorActors(args.locks);
    const locks = requestedLocks.length ? requestedLocks : participants;
    const state: StorylineDirectorState = {
      storylineId,
      eventId: resolvedEventId,
      status: 'running',
      phase: String(args.phase ?? 'running'),
      participants,
      locks,
      startedAtTick: gameTick,
      updatedAtTick: gameTick,
      reason: typeof args.reason === 'string' ? args.reason : undefined,
    };
    this.storeDirectorState(state);
    for (const npcId of locks) {
      const npcName = this.resolveNpcName(npcId);
      const npc = npcName ? this.scene.findNpcByName?.(npcName) : null;
      npc?.clearNavigation?.();
      npc?.replaceActions?.([], gameTick);
    }
  }

  private setDirectorPhase(
    storyline: StorylineDefinition,
    eventId: string | undefined,
    gameTick: number,
    args: StorylineSkillArgs,
  ): void {
    const storylineId = storyline.id ?? '';
    const resolvedEventId = this.resolveDirectorEventId(eventId, args);
    if (!storylineId || !resolvedEventId) return;
    const existing = this.directorStates.get(this.directorKey(storylineId, resolvedEventId))
      ?? this.stateStore.getDirectorState(storylineId, resolvedEventId);
    if (!existing) {
      this.beginDirectorEvent(storyline, resolvedEventId, gameTick, args);
      return;
    }
    this.storeDirectorState({
      ...existing,
      phase: String(args.phase ?? existing.phase),
      updatedAtTick: gameTick,
    });
  }

  private endDirectorEvent(
    storyline: StorylineDefinition,
    eventId: string | undefined,
    gameTick: number,
    args: StorylineSkillArgs,
  ): void {
    const storylineId = storyline.id ?? '';
    const resolvedEventId = this.resolveDirectorEventId(eventId, args);
    if (!storylineId || !resolvedEventId) return;
    const key = this.directorKey(storylineId, resolvedEventId);
    const existing = this.directorStates.get(key) ?? this.stateStore.getDirectorState(storylineId, resolvedEventId);
    if (!existing) return;
    const completed: StorylineDirectorState = {
      ...existing,
      status: 'completed',
      phase: String(args.phase ?? 'completed'),
      updatedAtTick: gameTick,
      completedAtTick: gameTick,
    };
    this.directorStates.delete(key);
    this.stateStore.setDirectorState(completed);
    this.persistActiveDirectorStates();
  }

  private storeDirectorState(state: StorylineDirectorState): void {
    this.directorStates.set(this.directorKey(state.storylineId, state.eventId), state);
    this.stateStore.setDirectorState(state);
    this.persistActiveDirectorStates();
  }

  private persistActiveDirectorStates(): void {
    this.stateStore.setActiveDirectorStates([...this.directorStates.values()].filter((state) => state.status === 'running'));
  }

  private directorKey(storylineId: string, eventId: string): string {
    return `${storylineId}:${eventId}`;
  }

  private resolveDirectorEventId(eventId: string | undefined, args: StorylineSkillArgs): string {
    return String(args.eventId ?? eventId ?? 'event');
  }

  private normalizeDirectorActors(value: unknown): string[] {
    if (Array.isArray(value)) {
      return [...new Set(value.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
    }
    if (typeof value === 'string') {
      return [...new Set(value.split(',').map((entry) => entry.trim()).filter(Boolean))];
    }
    return [];
  }

  private flushNpcActions(actionsByNpc: Map<string, NpcAction[]>): void {
    for (const [npcName, actions] of actionsByNpc.entries()) {
      if (actions.length) this.scene.executeNpcActions?.(npcName, actions);
    }
    actionsByNpc.clear();
  }

  private ensureNpcInWorld(args: StorylineSkillArgs): Promise<boolean> {
    const npcName = this.resolveNpcName(String(args.npcId ?? ''));
    const npc = npcName ? this.scene.findNpcByName?.(npcName) : null;
    if (!npc?.sprite || !npcName) return Promise.resolve(false);

    const targetWorldId = this.normalizeWorldId(String(args.worldId ?? 'world:village'));
    const currentWorldId = this.getNpcWorldId(npcName);
    const explicitTarget = this.resolvePoint(args.target, args);
    const timeoutMs = this.numberArg(args.timeoutMs, 12000);

    if (currentWorldId === targetWorldId && !explicitTarget) {
      return Promise.resolve(true);
    }

    if (targetWorldId === 'world:village' && currentWorldId !== 'world:village' && !explicitTarget) {
      return this.exitNpcRoomToVillage(npc, currentWorldId, timeoutMs);
    }

    const target = explicitTarget ?? this.defaultWorldTarget(targetWorldId);
    if (!target) return Promise.resolve(false);
    return this.navigateNpcToWorldTarget(npcName, { ...target, worldId: targetWorldId }, timeoutMs);
  }

  private exitNpcRoomToVillage(npc: any, roomWorldId: string, timeoutMs: number): Promise<boolean> {
    const exit = this.scene.locationSystem?.getRoomExitApproachTarget?.(roomWorldId);
    if (!exit) return Promise.resolve(false);

    return new Promise((resolve) => {
      let settled = false;
      let timer: { remove?: (dispatchCallback?: boolean) => void } | null = null;
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        timer?.remove?.(false);
        resolve(success);
      };

      if (timeoutMs > 0) {
        timer = this.scene.time?.delayedCall?.(timeoutMs, () => finish(false)) ?? null;
      }

      npc.navigateTo?.(exit.x, exit.y, () => {
        this.scene.locationSystem?.exitNpcToVillage?.(npc, roomWorldId, {
          onComplete: () => finish(true),
        });
      });
    });
  }

  private navigateNpcToWorldTarget(
    npcName: string,
    target: { x: number; y: number; worldId: string },
    timeoutMs: number,
  ): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      let timer: { remove?: (dispatchCallback?: boolean) => void } | null = null;
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        timer?.remove?.(false);
        resolve(success);
      };

      if (timeoutMs > 0) {
        timer = this.scene.time?.delayedCall?.(timeoutMs, () => finish(false)) ?? null;
      }

      const started = this.scene.navigateNpcToWorldPosition?.(npcName, target, () => finish(true));
      if (!started) finish(false);
    });
  }

  private waitForPlayerWorld(worldId: string, timeoutMs = 30000, pollMs = 250): Promise<boolean> {
    const targetWorldId = this.normalizeWorldId(worldId);
    const maxWaitMs = this.numberArg(timeoutMs, 30000);
    const intervalMs = Math.max(50, this.numberArg(pollMs, 250));
    const startedAt = this.scene.time?.now ?? Date.now();

    return new Promise((resolve) => {
      const tick = () => {
        if (this.playerInWorld(targetWorldId)) {
          resolve(true);
          return;
        }
        const now = this.scene.time?.now ?? Date.now();
        if (maxWaitMs > 0 && now - startedAt >= maxWaitMs) {
          resolve(false);
          return;
        }
        this.scene.time?.delayedCall?.(intervalMs, tick);
      };
      tick();
    });
  }

  private addNpcMemory(
    storyline: StorylineDefinition,
    args: StorylineSkillArgs,
    gameTick: number,
    source: StorylineStepSource,
  ): void {
    const storylineId = storyline.id;
    const npcName = this.resolveNpcName(String(args.npcId ?? ''));
    const text = String(args.text ?? '');
    if (!storylineId || !npcName || !text) return;

    const npc = this.scene.findNpcByName?.(npcName);
    this.scene.npcMemorySystem?.addStorylineMemory?.(npcName, gameTick, {
      storylineId,
      text,
      importance: Number(args.importance ?? 6),
      eventId: source.eventId,
      triggerId: source.triggerId,
      x: npc?.sprite?.x,
      y: npc?.sprite?.y,
      worldId: npc ? this.scene.getNpcWorldId?.(npcName) : undefined,
    });
  }

  private async approachNpcForDialogue(args: StorylineSkillArgs): Promise<boolean> {
    const npcName = this.resolveNpcName(String(args.npcId ?? ''));
    const npc = npcName ? this.scene.findNpcByName?.(npcName) : null;
    const playerSprite = this.scene.player?.sprite;
    if (!npc?.sprite || !playerSprite || !npcName) return false;

    const npcWorldId = this.getNpcWorldId(npcName);
    const playerWorldId = this.getPlayerWorldId();
    if (npcWorldId !== playerWorldId) return false;

    npc.clearNavigation?.();
    const cameraDurationMs = this.numberArg(args.cameraDurationMs, 650);
    await this.scene.cutsceneDirector?.panTo?.({ x: npc.sprite.x, y: npc.sprite.y }, cameraDurationMs);

    const target = this.findPlayerConversationSpot(npcName) ?? {
      x: playerSprite.x + this.numberArg(args.fallbackOffsetX, 44),
      y: playerSprite.y,
    };
    const arrived = await this.navigateNpcToWorldTarget(npcName, {
      x: target.x,
      y: target.y,
      worldId: playerWorldId,
    }, this.numberArg(args.timeoutMs, 8000));

    if (arrived) {
      npc.lockConversationWith?.(playerSprite, this.numberArg(args.lockSeconds, 14), false);
      await this.scene.cutsceneDirector?.panTo?.({ x: npc.sprite.x, y: npc.sprite.y }, Math.min(cameraDurationMs, 450));
    }
    return arrived;
  }

  private findPlayerConversationSpot(npcName: string): StorylinePoint | null {
    const npc = this.scene.findNpcByName?.(npcName);
    const playerSprite = this.scene.player?.sprite;
    if (!npc?.sprite || !playerSprite) return null;

    const offsets = [
      { x: -44, y: 0 },
      { x: 44, y: 0 },
      { x: 0, y: 44 },
      { x: 0, y: -44 },
      { x: -44, y: 32 },
      { x: 44, y: 32 },
      { x: -44, y: -32 },
      { x: 44, y: -32 },
    ].sort((a, b) => {
      const ax = playerSprite.x + a.x - npc.sprite.x;
      const ay = playerSprite.y + a.y - npc.sprite.y;
      const bx = playerSprite.x + b.x - npc.sprite.x;
      const by = playerSprite.y + b.y - npc.sprite.y;
      return (ax * ax + ay * ay) - (bx * bx + by * by);
    });

    for (const offset of offsets) {
      const x = playerSprite.x + offset.x;
      const y = playerSprite.y + offset.y;
      const cell = this.scene.worldGrid?.worldToCell?.(x, y);
      if (cell && this.scene.worldGrid?.getWeight?.(cell.col, cell.row) <= 0) continue;
      const occupied = this.scene.allNpcs?.().some((candidate: any) => {
        if (!candidate || candidate === npc) return false;
        const dx = candidate.sprite.x - x;
        const dy = candidate.sprite.y - y;
        return dx * dx + dy * dy < 28 * 28;
      });
      if (!occupied) return { x, y };
    }
    return null;
  }

  private requestPlayerChoice(
    storyline: StorylineDefinition,
    eventId: string,
    args: StorylineSkillArgs,
    choices: StorylineChoiceOption[],
  ): Promise<StorylineChoiceOption | null> {
    const storylineId = storyline.id ?? '';
    const prompt = String(args.prompt ?? '');
    const npcName = this.resolveNpcName(String(args.npcId ?? '')) ?? String(args.npcId ?? '');
    if (!storylineId || !eventId || !prompt || !npcName) return Promise.resolve(null);

    const requestId = `storyline-choice:${storylineId}:${eventId}:${this.nextChoiceId++}`;
    return new Promise((resolve) => {
      let timer: { remove?: (dispatchCallback?: boolean) => void } | null = null;
      let off = () => {};
      const finish = (choice: StorylineChoiceOption | null) => {
        off();
        timer?.remove?.(false);
        resolve(choice);
      };
      off = gameBus.on('storyline:choice_selected', ({ requestId: selectedRequestId, choiceId }) => {
        if (selectedRequestId !== requestId) return;
        finish(choices.find((choice) => choice.id === choiceId) ?? null);
      });

      const timeoutMs = Number(args.timeoutMs ?? 0);
      const timeoutChoiceId = String(args.timeoutChoiceId ?? '');
      if (Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutChoiceId) {
        timer = this.scene.time?.delayedCall?.(timeoutMs, () => {
          finish(choices.find((choice) => choice.id === timeoutChoiceId) ?? null);
        }) ?? null;
      }

      gameBus.emit('storyline:choice_requested', {
        requestId,
        storylineId,
        eventId,
        npcName,
        prompt,
        choices: choices.map(({ id, label }) => ({ id, label })),
      });
    });
  }

  private makeNpcSay(npcId: string, text: string): void {
    const npcName = this.resolveNpcName(npcId);
    if (npcName && text) this.scene.makeNpcSay?.(npcName, text);
  }

  private makePlayerSay(text: string): void {
    if (!text) return;
    gameBus.emit('npc:speak', { npcName: '玩家', text });
  }

  private placePlayer(args: StorylineSkillArgs): void {
    const point = this.resolvePoint(args.target, args);
    const sprite = this.scene.player?.sprite;
    if (!point || !sprite) return;
    this.placeSprite(sprite, point.x, point.y);
    this.setPlayerVisible(true);
    this.scene.cameras?.main?.startFollow?.(sprite, true, 0.1, 0.1);
  }

  private placeNpc(args: StorylineSkillArgs): void {
    const npcName = this.resolveNpcName(String(args.npcId ?? ''));
    const npc = npcName ? this.scene.findNpcByName?.(npcName) : null;
    const point = this.resolvePoint(args.target, args);
    if (!npc || !point) return;
    npc.clearNavigation?.();
    this.placeSprite(npc.sprite, point.x, point.y);
    this.setNpcRuntimeVisible(npc, true);
    this.scene.syncNpcAgentWorldContexts?.();
  }

  private placeSprite(sprite: any, x: number, y: number): void {
    sprite.setPosition?.(x, y);
    const body = sprite.body;
    if (body?.reset) body.reset(x, y);
    body?.setVelocity?.(0, 0);
  }

  private setPlayerVisible(visible: boolean): void {
    const sprite = this.scene.player?.sprite;
    if (!sprite) return;
    this.setSpriteVisible(sprite, visible);
  }

  private setNpcVisible(args: StorylineSkillArgs, visible: boolean): void {
    const npcName = this.resolveNpcName(String(args.npcId ?? ''));
    const npc = npcName ? this.scene.findNpcByName?.(npcName) : null;
    if (!npc) return;
    if (typeof npc.setRuntimeVisible === 'function') {
      npc.setRuntimeVisible(visible);
      return;
    }
    this.setSpriteVisible(npc.sprite, visible);
  }

  private setSpriteVisible(sprite: any, visible: boolean): void {
    sprite.setVisible?.(visible);
    sprite.setAlpha?.(visible ? 1 : 0);
    const body = sprite.body;
    if (body) {
      body.enable = visible;
      body.setVelocity?.(0, 0);
    }
  }

  private async dropOffPassengers(args: StorylineSkillArgs): Promise<void> {
    const passengers = this.normalizePassengerList(args.passengers);
    const staggerMs = this.numberArg(args.staggerMs, 800);
    const baseTarget = this.resolvePoint(args.target ?? 'bus_exit', args) ?? VILLAGE_LAYOUT.busStation.arrivalRoute.npcExit;

    for (const [index, passenger] of passengers.entries()) {
      const offset = this.passengerOffset(index, passengers.length, args);
      const target = {
        x: baseTarget.x + offset.x,
        y: baseTarget.y + offset.y,
      };
      this.placePassenger(passenger, target);
      if (index < passengers.length - 1 && staggerMs > 0) await this.wait(staggerMs);
    }
  }

  private async pickUpPassengers(args: StorylineSkillArgs): Promise<void> {
    const passengers = this.normalizePassengerList(args.passengers);
    const target = this.resolvePoint(args.target ?? 'bus_exit', args) ?? VILLAGE_LAYOUT.busStation.arrivalRoute.npcExit;
    const timeoutMs = this.numberArg(args.timeoutMs, 12000);
    const boardDelayMs = this.numberArg(args.boardDelayMs, 450);
    const vehicleId = String(args.vehicleId ?? 'arrival-bus');

    for (const passenger of passengers) {
      await this.movePassengerToPoint(passenger, { ...target, worldId: 'world:village' }, timeoutMs);
      if (boardDelayMs > 0) await this.wait(boardDelayMs);
      this.setPassengerVisible(passenger, false);
    }

    await this.scene.vehicleSystem?.playDoor?.(vehicleId, 'close');
    await this.scene.vehicleSystem?.moveOffscreen?.(
      vehicleId,
      args.direction === 'right' ? 'right' : 'left',
      this.numberArg(args.durationMs, 5200),
    );
    this.scene.vehicleSystem?.remove?.(vehicleId);
  }

  private placePassenger(passenger: string, point: StorylinePoint): void {
    if (passenger === 'player') {
      const sprite = this.scene.player?.sprite;
      if (!sprite) return;
      this.placeSprite(sprite, point.x, point.y);
      this.setPlayerVisible(true);
      return;
    }

    const npcName = this.resolveNpcName(passenger);
    const npc = npcName ? this.scene.findNpcByName?.(npcName) : null;
    if (!npc?.sprite) return;
    npc.clearNavigation?.();
    this.placeSprite(npc.sprite, point.x, point.y);
    this.setNpcRuntimeVisible(npc, true);
    this.scene.syncNpcAgentWorldContexts?.();
  }

  private async movePassengerToPoint(
    passenger: string,
    target: StorylinePoint & { worldId?: string },
    timeoutMs: number,
  ): Promise<boolean> {
    if (passenger === 'player') {
      this.placePassenger(passenger, target);
      return true;
    }

    const npcName = this.resolveNpcName(passenger);
    if (!npcName) return false;
    return this.navigateNpcToWorldTarget(npcName, {
      x: target.x,
      y: target.y,
      worldId: target.worldId ?? 'world:village',
    }, timeoutMs);
  }

  private setPassengerVisible(passenger: string, visible: boolean): void {
    if (passenger === 'player') {
      this.setPlayerVisible(visible);
      return;
    }
    this.setNpcVisible({ npcId: passenger }, visible);
  }

  private setNpcRuntimeVisible(npc: any, visible: boolean): void {
    if (typeof npc.setRuntimeVisible === 'function') {
      npc.setRuntimeVisible(visible);
    } else {
      this.setSpriteVisible(npc.sprite, visible);
    }
  }

  private normalizePassengerList(value: unknown): string[] {
    const raw = Array.isArray(value) ? value : [value ?? 'laoli'];
    return [...new Set(raw.map((entry) => String(entry ?? '').trim()).filter(Boolean))];
  }

  private passengerOffset(index: number, count: number, args: StorylineSkillArgs): StorylinePoint {
    const spacing = this.numberArg(args.spacing, 42);
    const centeredIndex = index - (count - 1) / 2;
    return {
      x: centeredIndex * spacing + Number(args.offsetX ?? 0),
      y: this.numberArg(args.offsetY, 28),
    };
  }

  private spawnPet(args: StorylineSkillArgs, gameTick: number): void {
    const petId = String(args.petId ?? LAOLI_CAT_PET_ID);
    const ownerNpcId = String(args.ownerNpcId ?? 'laoli');
    const entityId = petId === LAOLI_CAT_PET_ID
      ? LAOLI_CAT_ENTITY_ID
      : String(args.entityId ?? `pet-${petId}`);
    if (this.resolvePetEntityId(petId) || this.scene.pets?.has?.(entityId)) return;

    const spawnPoint = this.resolvePetSpawnPoint(args, ownerNpcId);
    if (!spawnPoint) return;

    if (!this.scene.pets) this.scene.pets = new Map<string, PetView>();
    const pet = new PetView(this.scene, spawnPoint.x, spawnPoint.y, {
      id: entityId,
      petId,
      ownerNpcId,
      displayName: typeof args.displayName === 'string' ? args.displayName : undefined,
      memories: petId === LAOLI_CAT_PET_ID ? LAOLI_CAT_MEMORY_SEEDS : [],
      canSpeak: false,
    });
    this.scene.pets.set(pet.id, pet);
    this.scene.physics?.add?.collider?.(pet.sprite, this.scene.obstacles);
    if (this.scene.player?.sprite) this.scene.physics?.add?.collider?.(this.scene.player.sprite, pet.sprite);
    this.scene.petSystem?.registerPet?.(pet, {
      itemId: petId === LAOLI_CAT_PET_ID ? LAOLI_CAT_ITEM_ID : petId,
      petId,
      ownerNpcId,
      displayName: pet.displayName,
      memories: pet.memories,
      home: {
        x: spawnPoint.x,
        y: spawnPoint.y,
        worldId: this.scene.locationSystem?.getWorldIdAt?.(spawnPoint.x, spawnPoint.y) ?? 'world:village',
      },
    });
    this.addPetMemory({
      petId,
      text: String(args.arrivalMemory ?? 'Arrived in the world during a storyline scene.'),
      importance: 0.7,
    }, gameTick);
  }

  private resolvePetSpawnPoint(args: StorylineSkillArgs, ownerNpcId: string): StorylinePoint | null {
    const spawnNearNpcId = String(args.spawnNearNpcId ?? ownerNpcId ?? '');
    const ownerName = this.resolveNpcName(spawnNearNpcId);
    const owner = ownerName ? this.scene.findNpcByName?.(ownerName) : null;
    if (owner?.sprite) {
      const offsetX = args.placement === 'beside_owner' ? 28 : Number(args.offsetX ?? 0);
      const offsetY = Number(args.offsetY ?? 8);
      return { x: owner.sprite.x + offsetX, y: owner.sprite.y + offsetY };
    }
    return this.resolvePoint(args.target, args);
  }

  private setPetHome(args: StorylineSkillArgs): void {
    const petEntityId = this.resolvePetEntityId(String(args.petId ?? ''));
    if (!petEntityId) return;

    const ownerNpcId = String(args.homeOfNpcId ?? args.ownerNpcId ?? '');
    const ownerName = this.resolveNpcName(ownerNpcId);
    const entry = ownerName ? this.scene.findHouseEntryTarget?.(undefined, ownerName) : null;
    const pet = this.scene.pets?.get?.(petEntityId);
    const x = Number(args.x ?? entry?.x ?? pet?.x ?? 0);
    const y = Number(args.y ?? entry?.y ?? pet?.y ?? 0);
    this.scene.petSystem?.setHome?.(petEntityId, {
      x,
      y,
      worldId: String(args.worldId ?? entry?.worldId ?? this.scene.locationSystem?.getWorldIdAt?.(x, y) ?? 'world:village'),
      houseId: typeof args.houseId === 'string' ? args.houseId : entry?.houseId,
    });
  }

  private addPetMemory(args: StorylineSkillArgs, gameTick: number): void {
    const petEntityId = this.resolvePetEntityId(String(args.petId ?? ''));
    const text = String(args.text ?? '');
    if (!petEntityId || !text) return;
    this.scene.rememberPet?.(petEntityId, {
      id: `storyline:${petEntityId}:${gameTick}:${Math.abs(hashText(text))}`,
      kind: 'quest',
      text,
      importance: Number(args.importance ?? 0.65),
      createdAtTick: gameTick,
      lastSeenTick: gameTick,
    } satisfies PetMemorySeed);
  }

  private resolvePetEntityId(petIdOrEntityId: string): string | null {
    if (!petIdOrEntityId) return null;
    const pets = this.scene.pets;
    if (pets instanceof Map) {
      if (pets.has(petIdOrEntityId)) return petIdOrEntityId;
      for (const [entityId, pet] of pets.entries()) {
        if (pet?.petId === petIdOrEntityId) return entityId;
      }
    }

    const state = this.scene.worldStateManager?.getState?.();
    const entities = Object.values(state?.entities ?? {}) as Array<any>;
    const entity = entities.find((candidate) => (
      candidate?.id === petIdOrEntityId
      || candidate?.meta?.petId === petIdOrEntityId
    ));
    return entity?.id ?? null;
  }

  private resolvePoint(target: unknown, args: StorylineSkillArgs): StorylinePoint | null {
    const base = (() => {
      if (target && typeof target === 'object') {
        const point = target as { x?: unknown; y?: unknown };
        if (typeof point.x === 'number' && typeof point.y === 'number') return { x: point.x, y: point.y };
      }
      if (target === 'player') {
        const sprite = this.scene.player?.sprite;
        return sprite ? { x: sprite.x, y: sprite.y } : null;
      }
      if (typeof target === 'string') {
        const npcName = this.resolveNpcName(target);
        const npc = npcName ? this.scene.findNpcByName?.(npcName) : null;
        if (npc?.sprite) return { x: npc.sprite.x, y: npc.sprite.y };
      }
      if (target === 'bus_exit') return VILLAGE_LAYOUT.busStation.arrivalRoute.npcExit;
      if (target === 'bus_station') return { x: VILLAGE_LAYOUT.busStation.x, y: VILLAGE_LAYOUT.busStation.y };
      if (target === 'arrival_entry') return VILLAGE_LAYOUT.busStation.arrivalRoute.entry;
      return null;
    })();
    if (!base) return null;
    return {
      x: base.x + Number(args.offsetX ?? 0),
      y: base.y + Number(args.offsetY ?? 0),
    };
  }

  private resolveCameraTarget(target: unknown): StorylineCameraTarget {
    if (target === 'player' || target === 'bus_station' || target === 'arrival_entry') return target;
    const point = this.resolvePoint(target, {});
    return point ?? 'player';
  }

  private hasHouseResident(npcId: string): boolean {
    const npcName = this.resolveNpcName(npcId) ?? npcId;
    const mind = this.scene.worldStateManager?.getNpcMindState?.(npcName)
      ?? this.scene.worldStateManager?.getNpcMindState?.(npcId);
    if (mind?.meta?.homeHouseId) return true;

    const houses = this.scene.houseSaveAdapter?.exportHouses?.() ?? [];
    return houses.some((house: any) => {
      const tenancy = house?.tenancy ?? {};
      return tenancy.residentNpcId === npcId
        || tenancy.residentNpcId === npcName
        || tenancy.residentNpcName === npcName
        || tenancy.residentNpcName === npcId;
    });
  }

  private npcArrivalCompleted(npcId: string): boolean {
    const catalogId = this.resolveNpcCatalogId(npcId);
    return Boolean(this.scene.eventSystem?.hasCompletedNpcArrival?.(catalogId));
  }

  private npcUnlocked(npcId: string): boolean {
    const catalogId = this.resolveNpcCatalogId(npcId);
    return Boolean(
      this.scene.eventSystem?.isNpcUnlocked?.(catalogId)
      || this.scene.eventSystem?.getUnlockedNpcIds?.().includes(catalogId),
    );
  }

  private playerInWorld(worldId: string): boolean {
    return this.getPlayerWorldId() === this.normalizeWorldId(worldId);
  }

  private getPlayerWorldId(): string {
    const sprite = this.scene.player?.sprite;
    if (!sprite) return 'world:village';
    return this.normalizeWorldId(this.scene.locationSystem?.getWorldIdAt?.(sprite.x, sprite.y) ?? 'world:village');
  }

  private getNpcWorldId(npcName: string): string {
    return this.normalizeWorldId(this.scene.getNpcWorldId?.(npcName) ?? 'world:village');
  }

  private petExists(petId: string): boolean {
    return Boolean(this.resolvePetEntityId(petId));
  }

  private resolveNpcName(npcId: string): string | null {
    if (!npcId) return null;
    if (this.scene.findNpcByName?.(npcId)) return npcId;
    const definition = GAME_NPC_CATALOG.find((npc) => npc.id === npcId || npc.name === npcId);
    if (definition && this.scene.findNpcByName?.(definition.name)) return definition.name;
    if (npcId === 'laoli') {
      const displayName = '\u8001\u674e';
      if (this.scene.findNpcByName?.(displayName)) return displayName;
    }
    return definition?.name ?? null;
  }

  private resolveNpcCatalogId(npcId: string): string {
    if (!npcId) return '';
    const definition = GAME_NPC_CATALOG.find((npc) => npc.id === npcId || npc.name === npcId);
    if (definition) return definition.id;
    const npcName = this.resolveNpcName(npcId);
    const definitionByResolvedName = GAME_NPC_CATALOG.find((npc) => npc.name === npcName);
    return definitionByResolvedName?.id ?? npcId;
  }

  private currentMinute(gameTick: number): number {
    return Math.floor(gameTick * GAME_MINS_PER_SEC) % MINS_PER_DAY;
  }

  private defaultWorldTarget(worldId: string): StorylinePoint | null {
    if (this.normalizeWorldId(worldId) === 'world:village') {
      return { x: VILLAGE_LAYOUT.busStation.x, y: VILLAGE_LAYOUT.busStation.y + 56 };
    }
    return null;
  }

  private normalizeWorldId(worldId: string): string {
    const normalized = String(worldId || '').trim();
    if (!normalized || normalized === 'village') return 'world:village';
    return normalized;
  }

  private numberArg(value: unknown, fallback: number): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  private wait(ms: number): Promise<void> {
    return new Promise((resolve) => {
      this.scene.time?.delayedCall?.(ms, () => resolve());
    });
  }
}

function isStorylineDefinition(value: unknown): value is StorylineDefinition {
  return Boolean(value && typeof value === 'object' && typeof (value as StorylineDefinition).id === 'string');
}

function hashText(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = ((value << 5) - value) + input.charCodeAt(i);
    value |= 0;
  }
  return value;
}
