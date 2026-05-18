const cutsceneSkills = [
  {
    id: 'cutscene.lock_player_control',
    kind: 'cutscene',
    description: 'Temporarily lock player movement while a directed scene plays.',
    argsSchema: {},
  },
  {
    id: 'cutscene.unlock_player_control',
    kind: 'cutscene',
    description: 'Unlock player movement after a directed scene.',
    argsSchema: {},
  },
];

module.exports = { cutsceneSkills };
