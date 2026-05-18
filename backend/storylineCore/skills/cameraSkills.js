const cameraSkills = [
  {
    id: 'camera.pan_to',
    kind: 'camera',
    description: 'Pan camera to player, bus station, arrival entry, an NPC id, or coordinates.',
    argsSchema: { target: 'string|point', durationMs: 'number?' },
  },
  {
    id: 'camera.follow',
    kind: 'camera',
    description: 'Follow player or current event vehicle.',
    argsSchema: { target: 'string', vehicleId: 'string?' },
  },
];

module.exports = { cameraSkills };
