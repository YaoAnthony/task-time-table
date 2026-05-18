const directorSkills = [
  {
    id: 'director.begin_event',
    kind: 'director',
    description: 'Begin a directed event state, lock participating NPCs away from normal schedule/agent thinking, and record the current phase.',
    argsSchema: {
      eventId: 'string?',
      phase: 'string?',
      participants: 'string[]?',
      locks: 'string[]?',
      reason: 'string?',
    },
    usage: 'Use at the start of any multi-step cutscene or agent-driven storyline beat. Put important NPCs in locks so daily schedule, needs chatter, and autonomous thinking do not interrupt the scene.',
    example: {
      eventId: 'accepted_departure',
      phase: 'leaving_home',
      participants: ['laoli', 'player'],
      locks: ['laoli'],
      reason: '老李准备离村接猫',
    },
  },
  {
    id: 'director.set_phase',
    kind: 'director',
    description: 'Update the current directed event phase without ending the event.',
    argsSchema: { eventId: 'string?', phase: 'string' },
    usage: 'Use when an event changes from waiting, travel, choice, arrival, or aftermath. This gives the event a resumable state instead of being only a flat step list.',
    example: { eventId: 'accepted_departure', phase: 'waiting_for_player_in_village' },
  },
  {
    id: 'director.end_event',
    kind: 'director',
    description: 'Complete a directed event state and release NPC locks.',
    argsSchema: { eventId: 'string?', phase: 'string?' },
    usage: 'Use at the end of a cutscene or storyline beat after memories/world changes have been applied.',
    example: { eventId: 'accepted_departure', phase: 'completed' },
  },
];

module.exports = { directorSkills };
