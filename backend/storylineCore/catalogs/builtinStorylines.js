const BUILTIN_STORYLINES = [
  {
    id: 'laoli_cat_homecoming',
    title: '老李的猫',
    status: 'enabled',
    version: 1,
    summary: '老李拥有自己的房子后，离开一段时间把猫接回新家。',
    startState: 'locked',
    states: ['locked', 'eligible', 'offered', 'accepted', 'laoli_away', 'returning', 'completed'],
    tags: ['mainline', 'laoli', 'pet'],
    updatedAt: new Date(0).toISOString(),
    triggers: [],
    events: {},
  },
];

function listBuiltinStorylines() {
  return BUILTIN_STORYLINES.map((storyline) => ({
    ...storyline,
    states: [...storyline.states],
    tags: [...storyline.tags],
    triggers: JSON.parse(JSON.stringify(storyline.triggers || [])),
    events: JSON.parse(JSON.stringify(storyline.events || {})),
  }));
}

module.exports = {
  BUILTIN_STORYLINES,
  listBuiltinStorylines,
};
