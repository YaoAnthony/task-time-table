const STORYLINE_DEFINITION_SCHEMA_VERSION = 1;

const STORYLINE_DEFINITION_SHAPE = {
  id: 'string',
  title: 'string',
  version: 'number',
  startState: 'string',
  states: 'string[]',
  triggers: 'StorylineTrigger[]',
  events: 'Record<string, StorylineSkillStep[]>',
};

module.exports = {
  STORYLINE_DEFINITION_SCHEMA_VERSION,
  STORYLINE_DEFINITION_SHAPE,
};
