const { BUILTIN_STORYLINE_SKILLS } = require('./catalogs/builtinSkills');

const skillIds = new Set(BUILTIN_STORYLINE_SKILLS.map((skill) => skill.id));
const MAX_CHOICE_COUNT = 3;
const MIN_CHOICE_COUNT = 2;

function validateStorylineDefinition(definition) {
  const errors = [];
  if (!definition || typeof definition !== 'object') {
    return { ok: false, errors: ['definition must be an object'] };
  }
  if (!definition.id || typeof definition.id !== 'string') errors.push('id is required');
  if (!definition.title || typeof definition.title !== 'string') errors.push('title is required');
  if (!Array.isArray(definition.states) || definition.states.length === 0) errors.push('states must be a non-empty array');
  for (const trigger of definition.triggers || []) {
    for (const step of [...(trigger.when || []), ...(trigger.then || [])]) {
      validateStep(step, errors);
    }
  }
  for (const steps of Object.values(definition.events || {})) {
    if (!Array.isArray(steps)) continue;
    for (const step of steps) {
      validateStep(step, errors);
    }
  }
  return { ok: errors.length === 0, errors };
}

function validateStep(step, errors, path = 'step') {
  if (!step || typeof step !== 'object') {
    errors.push(`${path} must be an object`);
    return;
  }
  if (!skillIds.has(step.skill)) {
    errors.push(`Unknown skill: ${step.skill}`);
    return;
  }
  if (step.skill === 'dialogue.choice') validateDialogueChoice(step, errors, path);
}

function validateDialogueChoice(step, errors, path) {
  const args = step.args || {};
  const choices = Array.isArray(args.choices) ? args.choices : [];
  if (typeof args.npcId !== 'string' || !args.npcId) errors.push(`${path}.args.npcId is required for dialogue.choice`);
  if (typeof args.prompt !== 'string' || !args.prompt) errors.push(`${path}.args.prompt is required for dialogue.choice`);
  if (choices.length < MIN_CHOICE_COUNT || choices.length > MAX_CHOICE_COUNT) {
    errors.push(`${path}.args.choices must contain ${MIN_CHOICE_COUNT}-${MAX_CHOICE_COUNT} choices`);
  }

  const ids = new Set();
  choices.forEach((choice, choiceIndex) => {
    const choicePath = `${path}.args.choices[${choiceIndex}]`;
    if (!choice || typeof choice !== 'object') {
      errors.push(`${choicePath} must be an object`);
      return;
    }
    if (typeof choice.id !== 'string' || !choice.id) errors.push(`${choicePath}.id is required`);
    if (typeof choice.label !== 'string' || !choice.label) errors.push(`${choicePath}.label is required`);
    if (choice.id) {
      if (ids.has(choice.id)) errors.push(`${choicePath}.id must be unique`);
      ids.add(choice.id);
    }
    if (choice.effects !== undefined && !Array.isArray(choice.effects)) {
      errors.push(`${choicePath}.effects must be an array when provided`);
    }
    for (const effect of choice.effects || []) {
      validateStep(effect, errors, `${choicePath}.effects[]`);
    }
  });
}

module.exports = {
  validateStorylineDefinition,
};
