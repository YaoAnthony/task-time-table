const sequenceSkills = [
  {
    id: 'sequence.wait_ms',
    kind: 'sequence',
    description: 'Wait a number of real milliseconds before continuing.',
    argsSchema: { durationMs: 'number' },
  },
  {
    id: 'sequence.wait_ticks',
    kind: 'sequence',
    description: 'Wait a number of game ticks before continuing.',
    argsSchema: { ticks: 'number' },
  },
  {
    id: 'sequence.wait_for_player_world',
    kind: 'sequence',
    description: 'Wait until the player is in a requested world/location, such as world:village.',
    argsSchema: { worldId: 'string', timeoutMs: 'number?', pollMs: 'number?' },
    usage: 'Use after an NPC exits a house if the player also needs to return to the main village map before the scene continues.',
    example: { worldId: 'world:village', timeoutMs: 30000, pollMs: 250 },
  },
];

module.exports = { sequenceSkills };
