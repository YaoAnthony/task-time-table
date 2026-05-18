const vehicleSkills = [
  {
    id: 'vehicle.spawn_bus',
    kind: 'vehicle',
    description: 'Spawn the bus at the configured arrival route.',
    argsSchema: { vehicleId: 'string' },
  },
  {
    id: 'vehicle.move_bus_to_station',
    kind: 'vehicle',
    description: 'Move a spawned bus to the bus station.',
    argsSchema: { vehicleId: 'string', durationMs: 'number?' },
  },
  {
    id: 'vehicle.open_bus_door',
    kind: 'vehicle',
    description: 'Play the bus door opening animation.',
    argsSchema: { vehicleId: 'string' },
  },
  {
    id: 'vehicle.close_bus_door',
    kind: 'vehicle',
    description: 'Play the bus door closing animation.',
    argsSchema: { vehicleId: 'string' },
  },
  {
    id: 'vehicle.move_bus_offscreen',
    kind: 'vehicle',
    description: 'Move a spawned bus out of the camera/world view before despawning it.',
    argsSchema: { vehicleId: 'string', direction: 'left|right?', durationMs: 'number?' },
  },
  {
    id: 'vehicle.despawn_bus',
    kind: 'vehicle',
    description: 'Remove a bus from the current scene.',
    argsSchema: { vehicleId: 'string' },
  },
  {
    id: 'vehicle.drop_off_passengers',
    kind: 'vehicle',
    description: 'Run the standard passenger drop-off beat: place hidden passengers at the bus exit one by one and make them visible.',
    argsSchema: {
      vehicleId: 'string?',
      passengers: 'string[]',
      target: 'string|point?',
      staggerMs: 'number?',
      spacing: 'number?',
      offsetX: 'number?',
      offsetY: 'number?',
    },
    usage: 'Use after vehicle.open_bus_door when a bus brings the player/NPCs into the village. Keep dialogue and memory steps after this skill.',
    example: {
      vehicleId: 'intro_arrival_bus',
      passengers: ['player', 'laoli'],
      target: 'bus_exit',
      staggerMs: 850,
    },
  },
  {
    id: 'vehicle.pick_up_passengers',
    kind: 'vehicle',
    description: 'Run the standard passenger pickup beat: move passengers to the bus exit, hide them as boarded, close the bus door, drive offscreen, and despawn the bus.',
    argsSchema: {
      vehicleId: 'string',
      passengers: 'string[]',
      target: 'string|point?',
      timeoutMs: 'number?',
      boardDelayMs: 'number?',
      direction: 'left|right?',
      durationMs: 'number?',
    },
    usage: 'Use after the bus has arrived and opened its door when an NPC should leave on the bus. This prevents authors from forgetting the hide/leave/despawn sequence.',
    example: {
      vehicleId: 'laoli_departure_bus',
      passengers: ['laoli'],
      target: 'bus_exit',
      direction: 'left',
      durationMs: 5200,
    },
  },
];

module.exports = { vehicleSkills };
