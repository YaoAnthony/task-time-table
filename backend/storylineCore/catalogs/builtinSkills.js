const { actionSkills } = require('../skills/actionSkills');
const { audioSkills } = require('../skills/audioSkills');
const { cameraSkills } = require('../skills/cameraSkills');
const { conditionSkills } = require('../skills/conditionSkills');
const { cutsceneSkills } = require('../skills/cutsceneSkills');
const { directorSkills } = require('../skills/directorSkills');
const { dialogueSkills } = require('../skills/dialogueSkills');
const { memorySkills } = require('../skills/memorySkills');
const { petSkills } = require('../skills/petSkills');
const { sequenceSkills } = require('../skills/sequenceSkills');
const { timeSkills } = require('../skills/timeSkills');
const { vehicleSkills } = require('../skills/vehicleSkills');

const SKILL_GROUPS = {
  condition: conditionSkills,
  time: timeSkills,
  action: actionSkills,
  audio: audioSkills,
  cutscene: cutsceneSkills,
  director: directorSkills,
  dialogue: dialogueSkills,
  memory: memorySkills,
  pet: petSkills,
  vehicle: vehicleSkills,
  camera: cameraSkills,
  sequence: sequenceSkills,
};

const BUILTIN_STORYLINE_SKILLS = Object.values(SKILL_GROUPS).flat();

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function listBuiltinSkills() {
  return BUILTIN_STORYLINE_SKILLS.map(clone);
}

function listBuiltinSkillGroups() {
  return clone(SKILL_GROUPS);
}

module.exports = {
  BUILTIN_STORYLINE_SKILLS,
  SKILL_GROUPS,
  listBuiltinSkills,
  listBuiltinSkillGroups,
};
