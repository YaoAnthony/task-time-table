const petSkills = [
  {
    id: 'action.spawn_pet',
    kind: 'pet',
    description: 'Spawn a silent pet world entity during a storyline sequence.',
    argsSchema: {
      petId: 'string',
      ownerNpcId: 'string',
      entityId: 'string?',
      spawnNearNpcId: 'string?',
      placement: 'beside_owner|string?',
      target: 'string|point?',
      offsetX: 'number?',
      offsetY: 'number?',
      arrivalMemory: 'string?',
    },
  },
  {
    id: 'action.set_pet_home',
    kind: 'pet',
    description: 'Assign a home anchor to a pet.',
    argsSchema: { petId: 'string', homeOfNpcId: 'string?', houseId: 'string?', x: 'number?', y: 'number?', worldId: 'string?' },
  },
  {
    id: 'action.add_pet_memory',
    kind: 'pet',
    description: 'Add a memory entry to a pet agent. Pets keep memory but cannot speak.',
    argsSchema: { petId: 'string', text: 'string', importance: 'number?' },
  },
];

module.exports = { petSkills };
