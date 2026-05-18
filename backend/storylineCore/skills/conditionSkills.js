const conditionSkills = [
  {
    id: 'condition.game_tick_between',
    kind: 'condition',
    description: 'Check whether the current game tick is within an inclusive range. Useful for new-game intro scenes.',
    argsSchema: { minTick: 'number?', maxTick: 'number?' },
  },
  {
    id: 'condition.game_tick_at_least',
    kind: 'condition',
    description: 'Check whether the current game tick has reached a value.',
    argsSchema: { tick: 'number' },
  },
  {
    id: 'condition.time_of_day_at_or_after',
    kind: 'condition',
    description: 'Check whether the current in-game minute of day has reached a value. 08:00 is minute 480.',
    argsSchema: { minute: 'number' },
  },
  {
    id: 'condition.flag_not_set',
    kind: 'condition',
    description: 'Check that a persisted event flag has not been set.',
    argsSchema: { key: 'string' },
  },
  {
    id: 'condition.npc_arrival_completed',
    kind: 'condition',
    description: 'Check whether a purchased NPC has completed the standard first arrival bus event. Use catalog npcId values, for example carpenter_liang_musheng.',
    argsSchema: { npcId: 'string' },
    usage: 'Use this for storylines that should begin after buying an NPC and letting their bus arrival finish. The trigger is one-shot at the storyline level, so later bus scenes for the same NPC will not retrigger it.',
    example: { npcId: 'carpenter_liang_musheng' },
  },
  {
    id: 'condition.npc_unlocked',
    kind: 'condition',
    description: 'Check whether an NPC is already unlocked in the player save.',
    argsSchema: { npcId: 'string' },
    usage: 'Use npc_arrival_completed when the first bus arrival matters; use npc_unlocked when the storyline only cares that the NPC is owned/unlocked.',
    example: { npcId: 'carpenter_liang_musheng' },
  },
  {
    id: 'condition.has_house_resident',
    kind: 'condition',
    description: 'Check whether a ready house is occupied by a specific NPC.',
    argsSchema: { npcId: 'string' },
  },
  {
    id: 'condition.pet_not_exists',
    kind: 'condition',
    description: 'Check whether a pet entity is absent from world state.',
    argsSchema: { petId: 'string' },
  },
  {
    id: 'condition.quest_state_is',
    kind: 'condition',
    description: 'Check the current storyline quest state.',
    argsSchema: { questId: 'string', state: 'string' },
  },
  {
    id: 'condition.player_in_world',
    kind: 'condition',
    description: 'Check whether the player is currently in a world/location such as world:village or a room id.',
    argsSchema: { worldId: 'string' },
    usage: 'Use this when a trigger should only fire after the player has returned to the main village map.',
    example: { worldId: 'world:village' },
  },
  {
    id: 'condition.director_phase_is',
    kind: 'condition',
    description: 'Check that a directed event is currently in a specific phase.',
    argsSchema: { eventId: 'string?', phase: 'string' },
    usage: 'Use for resume/follow-up triggers that should only fire while a directed event is paused in a known phase.',
    example: { eventId: 'accepted_departure', phase: 'waiting_for_player_in_village' },
  },
];

module.exports = { conditionSkills };
