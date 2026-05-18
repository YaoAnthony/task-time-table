const { validateStorylineDefinition } = require('./storylineValidator');

function compileStorylineDefinition(definition) {
  const validation = validateStorylineDefinition(definition);
  if (!validation.ok) {
    const err = new Error('Invalid storyline definition');
    err.status = 400;
    err.details = validation.errors;
    throw err;
  }
  return {
    ...definition,
    compiledAt: new Date().toISOString(),
  };
}

module.exports = {
  compileStorylineDefinition,
};
