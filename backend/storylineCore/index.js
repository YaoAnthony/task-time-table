const { listBuiltinSkills } = require('./catalogs/builtinSkills');
const {
  deleteStoryline,
  getStorylinePackage,
  listEnabledStorylines,
  listEnabledStorylinePackages,
  listStorylineSkills,
} = require('./services/storylineLoadService');
const {
  addDraftRevision,
  appendAssistantMessage,
  appendMessage,
  createDraft,
  createDraftFromDefinition,
  deleteDraft,
  getDraft,
  listDrafts,
  updateDraftDefinition,
  updateDraftReview,
} = require('./services/storylineDraftService');
const {
  applyStorylineChatEdit,
  compileDraftDefinition,
  iterateStorylineDraft,
  reviewStorylineDefinition,
} = require('./services/storylineAuthoringService');
const { generateStorylineAssistantReply } = require('./services/storylineChatService');
const { compileStorylineDefinition } = require('./storylineCompiler');
const { validateStorylineDefinition } = require('./storylineValidator');

module.exports = {
  addDraftRevision,
  appendAssistantMessage,
  listBuiltinSkills,
  deleteStoryline,
  getStorylinePackage,
  listEnabledStorylines,
  listEnabledStorylinePackages,
  listStorylineSkills,
  createDraft,
  createDraftFromDefinition,
  deleteDraft,
  listDrafts,
  getDraft,
  appendMessage,
  updateDraftDefinition,
  updateDraftReview,
  applyStorylineChatEdit,
  compileDraftDefinition,
  iterateStorylineDraft,
  reviewStorylineDefinition,
  generateStorylineAssistantReply,
  compileStorylineDefinition,
  validateStorylineDefinition,
};
