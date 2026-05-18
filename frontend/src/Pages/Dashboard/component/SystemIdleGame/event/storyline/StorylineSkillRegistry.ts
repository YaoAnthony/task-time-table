import type {
  StorylineConditionContext,
  StorylineExecutionContext,
  StorylineSkillArgs,
  StorylineStep,
} from './StorylineRuntimeTypes';

type StorylineConditionHandler = (
  context: StorylineConditionContext,
  args: StorylineSkillArgs,
  step: StorylineStep,
) => boolean;

type StorylineActionHandler = (
  context: StorylineExecutionContext,
  args: StorylineSkillArgs,
  step: StorylineStep,
) => void | Promise<void>;

export class StorylineSkillRegistry {
  private readonly conditionHandlers = new Map<string, StorylineConditionHandler>();
  private readonly actionHandlers = new Map<string, StorylineActionHandler>();

  registerCondition(skillId: string, handler: StorylineConditionHandler): this {
    this.conditionHandlers.set(skillId, handler);
    return this;
  }

  registerAction(skillId: string, handler: StorylineActionHandler): this {
    this.actionHandlers.set(skillId, handler);
    return this;
  }

  evaluateCondition(context: StorylineConditionContext, step: StorylineStep): boolean {
    if (!step.skill) return true;
    const handler = this.conditionHandlers.get(step.skill);
    if (!handler) {
      console.warn('[StorylineSkillRegistry] unsupported condition', step.skill);
      return false;
    }
    return handler(context, step.args ?? {}, step);
  }

  async executeAction(context: StorylineExecutionContext, step: StorylineStep): Promise<void> {
    if (!step.skill) return;
    const handler = this.actionHandlers.get(step.skill);
    if (!handler) {
      console.warn('[StorylineSkillRegistry] unsupported action', step.skill);
      return;
    }
    await handler(context, step.args ?? {}, step);
  }
}
