const memorySkills = [
  {
    id: 'action.add_npc_memory',
    kind: 'memory',
    description: 'Add a memory entry to an NPC.',
    argsSchema: { npcId: 'string', text: 'string', importance: 'number?' },
  },
];

module.exports = { memorySkills };
