const { listBuiltinStorylines } = require('../catalogs/builtinStorylines');
const { listBuiltinSkills } = require('../catalogs/builtinSkills');
const { toRuntimeStorylineSummary, toRuntimeStorylinePackage } = require('../storylineRuntimeMapper');
const {
  archiveStorylineDefinition,
  listStorylineDefinitions,
  readStorylineDefinition,
} = require('./storylineFileStore');

function listEnabledStorylines() {
  return loadRuntimeStorylineDefinitions().map(toRuntimeStorylineSummary);
}

function listEnabledStorylinePackages() {
  return loadRuntimeStorylineDefinitions().map(toRuntimeStorylinePackage);
}

function listStorylineSkills() {
  return listBuiltinSkills();
}

function loadRuntimeStorylineDefinitions() {
  const byId = new Map();
  for (const storyline of listBuiltinStorylines()) byId.set(storyline.id, storyline);
  for (const storyline of listStorylineDefinitions()) byId.set(storyline.id, storyline);
  return [...byId.values()]
    .filter((storyline) => storyline.status !== 'archived')
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
}

function getStorylinePackage(storylineId) {
  const definition = readStorylineDefinition(storylineId)
    || loadRuntimeStorylineDefinitions().find((storyline) => storyline.id === String(storylineId));
  if (!definition || definition.status === 'archived') return null;
  return toRuntimeStorylinePackage(definition);
}

function deleteStoryline(storylineId) {
  return archiveStorylineDefinition(storylineId);
}

module.exports = {
  deleteStoryline,
  getStorylinePackage,
  listEnabledStorylines,
  listEnabledStorylinePackages,
  listStorylineSkills,
};
