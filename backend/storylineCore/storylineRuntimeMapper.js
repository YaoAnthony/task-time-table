function toRuntimeStorylineSummary(storyline) {
  return {
    id: storyline.id,
    title: storyline.title,
    status: storyline.status || 'draft',
    version: storyline.version || 1,
    summary: storyline.summary || '',
    tags: Array.isArray(storyline.tags) ? storyline.tags : [],
    updatedAt: storyline.updatedAt || new Date().toISOString(),
  };
}

function toRuntimeStorylinePackage(storyline) {
  return {
    ...toRuntimeStorylineSummary(storyline),
    schemaVersion: storyline.schemaVersion || 1,
    startState: storyline.startState || storyline.states?.[0] || 'locked',
    states: Array.isArray(storyline.states) ? [...storyline.states] : [],
    triggers: cloneJsonValue(storyline.triggers || []),
    events: cloneJsonValue(storyline.events || {}),
  };
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  toRuntimeStorylineSummary,
  toRuntimeStorylinePackage,
};
