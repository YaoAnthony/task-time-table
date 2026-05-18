import type { NpcAction } from '../../types';

export type StorylineSkillArgs = Record<string, unknown>;

export type StorylineStep = {
  skill?: string;
  args?: StorylineSkillArgs;
};

export type StorylineDirectorState = {
  storylineId: string;
  eventId: string;
  status: 'running' | 'completed';
  phase: string;
  participants: string[];
  locks: string[];
  startedAtTick: number;
  updatedAtTick: number;
  completedAtTick?: number;
  reason?: string;
};

export type StorylineChoiceOption = {
  id: string;
  label: string;
  reply?: string;
  nextEvent?: string;
  effects?: StorylineStep[];
};

export type StorylineTrigger = {
  id?: string;
  fromState?: string;
  when?: StorylineStep[];
  then?: StorylineStep[];
};

export type StorylineDefinition = {
  id?: string;
  title?: string;
  startState?: string;
  triggers?: StorylineTrigger[];
  events?: Record<string, StorylineStep[]>;
};

export type StorylineStepSource = {
  eventId?: string;
  triggerId?: string;
};

export type StorylinePoint = { x: number; y: number };

export type StorylineCameraTarget =
  | 'player'
  | 'bus_station'
  | 'arrival_entry'
  | StorylinePoint;

export type StorylineChoiceRequestPayload = {
  requestId: string;
  storylineId: string;
  eventId: string;
  npcName: string;
  prompt: string;
  choices: Array<{ id: string; label: string }>;
};

export type StorylineChoiceSelectedPayload = {
  requestId: string;
  choiceId: string;
};

export type StorylineExecutionContext = {
  storyline: StorylineDefinition;
  gameTick: number;
  eventId?: string;
  triggerId?: string;
  actionsByNpc: Map<string, NpcAction[]>;
  services: StorylineRuntimeServices;
};

export type StorylineConditionContext = {
  storyline: StorylineDefinition;
  gameTick: number;
  services: StorylineRuntimeServices;
};

export type StorylineRuntimeServices = {
  currentMinute(gameTick: number): number;
  getFlag(key: string): unknown;
  setFlag(key: string, value: unknown): void;
  getQuestState(storyline: StorylineDefinition): string;
  setQuestState(questId: string, state: string, gameTick: number, args?: StorylineSkillArgs): void;
  getDirectorPhase(storyline: StorylineDefinition, eventId?: string): string | null;
  beginDirectorEvent(storyline: StorylineDefinition, eventId: string | undefined, gameTick: number, args: StorylineSkillArgs): void;
  setDirectorPhase(storyline: StorylineDefinition, eventId: string | undefined, gameTick: number, args: StorylineSkillArgs): void;
  endDirectorEvent(storyline: StorylineDefinition, eventId: string | undefined, gameTick: number, args: StorylineSkillArgs): void;
  npcArrivalCompleted(npcId: string): boolean;
  npcUnlocked(npcId: string): boolean;
  hasHouseResident(npcId: string): boolean;
  playerInWorld(worldId: string): boolean;
  petExists(petId: string): boolean;
  flushNpcActions(actionsByNpc: Map<string, NpcAction[]>): void;
  queueNpcAction(args: StorylineSkillArgs, actionsByNpc: Map<string, NpcAction[]>, action: NpcAction): void;
  ensureNpcInWorld(args: StorylineSkillArgs): Promise<boolean>;
  addNpcMemory(
    storyline: StorylineDefinition,
    args: StorylineSkillArgs,
    gameTick: number,
    source: StorylineStepSource,
  ): void;
  approachNpcForDialogue(args: StorylineSkillArgs): Promise<boolean>;
  runStorylineEvent(storyline: StorylineDefinition, eventId: string, gameTick: number): Promise<void>;
  executeNestedSteps(context: StorylineExecutionContext, steps: StorylineStep[]): Promise<void>;
  requestPlayerChoice(
    storyline: StorylineDefinition,
    eventId: string,
    args: StorylineSkillArgs,
    choices: StorylineChoiceOption[],
  ): Promise<StorylineChoiceOption | null>;
  recordChoice(storylineId: string, eventId: string, choiceId: string): void;
  resolveNpcName(npcId: string): string | null;
  resolveCameraTarget(target: unknown): StorylineCameraTarget;
  placePlayer(args: StorylineSkillArgs): void;
  placeNpc(args: StorylineSkillArgs): void;
  setPlayerVisible(visible: boolean): void;
  setNpcVisible(args: StorylineSkillArgs, visible: boolean): void;
  makeNpcSay(npcId: string, text: string): void;
  makePlayerSay(text: string): void;
  wait(ms: number): Promise<void>;
  waitForPlayerWorld(worldId: string, timeoutMs?: number, pollMs?: number): Promise<boolean>;
  setTimeOfDay(minute: number): void;
  lockPlayer(): void;
  unlockPlayer(): void;
  panTo(target: StorylineCameraTarget, durationMs: number): Promise<void>;
  follow(target: string, vehicleId?: string): void;
  spawnBus(vehicleId: string): void;
  moveBusToStation(vehicleId: string, durationMs: number): Promise<void>;
  playBusDoor(vehicleId: string, state: 'open' | 'close'): Promise<void>;
  moveBusOffscreen(vehicleId: string, direction: 'left' | 'right', durationMs: number): Promise<void>;
  despawnBus(vehicleId: string): void;
  dropOffPassengers(args: StorylineSkillArgs): Promise<void>;
  pickUpPassengers(args: StorylineSkillArgs): Promise<void>;
  spawnPet(args: StorylineSkillArgs, gameTick: number): void;
  setPetHome(args: StorylineSkillArgs): void;
  addPetMemory(args: StorylineSkillArgs, gameTick: number): void;
  playAudio(key: string, args?: StorylineSkillArgs): void;
  playMusic(key: string, args?: StorylineSkillArgs): void;
  stopAudioTag(tag: string, fadeMs?: number): void;
};
