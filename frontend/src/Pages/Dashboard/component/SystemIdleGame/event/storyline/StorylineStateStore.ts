import type { StorylineDefinition, StorylineDirectorState, StorylineSkillArgs } from './StorylineRuntimeTypes';

export const DEFAULT_STORYLINE_START_STATE = 'locked';

export class StorylineStateStore {
  constructor(
    private readonly getFlagValue: (key: string) => unknown,
    private readonly setFlagValue: (key: string, value: unknown) => void,
  ) {}

  getFlag(key: string): unknown {
    return this.getFlagValue(key);
  }

  setFlag(key: string, value: unknown): void {
    this.setFlagValue(key, value);
  }

  getQuestState(storyline: StorylineDefinition): string {
    const id = storyline.id ?? '';
    return String(
      this.getFlag(this.questStateKey(id))
        ?? storyline.startState
        ?? DEFAULT_STORYLINE_START_STATE,
    );
  }

  setQuestState(
    questId: string,
    state: string,
    gameTick: number,
    args: StorylineSkillArgs = {},
  ): void {
    if (!questId || !state) return;
    this.setFlag(this.questStateKey(questId), state);
    if (typeof args.dueInTicks === 'number') {
      this.setFlag(`storyline:${questId}:dueAtTick`, gameTick + args.dueInTicks);
    }
  }

  recordChoice(storylineId: string, eventId: string, choiceId: string): void {
    if (!storylineId || !eventId || !choiceId) return;
    this.setFlag(`storyline:${storylineId}:event:${eventId}:choice`, choiceId);
    this.setFlag(`storyline:${storylineId}:choice:${choiceId}`, true);
  }

  getDirectorState(storylineId: string, eventId: string): StorylineDirectorState | null {
    const value = this.getFlag(this.directorStateKey(storylineId, eventId));
    if (!value || typeof value !== 'object') return null;
    return value as StorylineDirectorState;
  }

  setDirectorState(state: StorylineDirectorState): void {
    if (!state.storylineId || !state.eventId) return;
    this.setFlag(this.directorStateKey(state.storylineId, state.eventId), state);
  }

  setActiveDirectorStates(states: StorylineDirectorState[]): void {
    this.setFlag('storyline:director:active', states);
  }

  getActiveDirectorStates(): StorylineDirectorState[] {
    const value = this.getFlag('storyline:director:active');
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is StorylineDirectorState => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Partial<StorylineDirectorState>;
      return (
        typeof candidate.storylineId === 'string'
        && typeof candidate.eventId === 'string'
        && candidate.status === 'running'
      );
    });
  }

  questStateKey(storylineId: string): string {
    return `storyline:${storylineId}:state`;
  }

  triggerFiredKey(storylineId: string, triggerId: string): string {
    return `storyline:${storylineId}:trigger:${triggerId}:fired`;
  }

  eventStartedKey(storylineId: string, eventId: string): string {
    return `storyline:${storylineId}:event:${eventId}:started`;
  }

  directorStateKey(storylineId: string, eventId: string): string {
    return `storyline:${storylineId}:director:${eventId}`;
  }
}
