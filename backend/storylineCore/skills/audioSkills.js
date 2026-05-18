const audioSkills = [
  {
    id: 'audio.play_sfx',
    kind: 'audio',
    description: 'Play a registered sound effect from the frontend audio registry.',
    argsSchema: {
      key: 'string',
      volume: 'number?',
      rate: 'number?',
      tag: 'string?',
    },
    usage: 'Use for authored beats such as bus sounds, door sounds, UI stingers, or small emotional accents. key must exist in frontend AudioRegistry.',
    example: { key: 'vehicle.bus_door', volume: 0.4 },
  },
  {
    id: 'audio.play_music',
    kind: 'audio',
    description: 'Start or crossfade to a registered music track.',
    argsSchema: {
      key: 'string',
      fadeMs: 'number?',
      volume: 'number?',
      tag: 'string?',
    },
    usage: 'Use when a cutscene or story state should control music deliberately. Prefer registered music keys rather than raw URLs in storyline JSON.',
    example: { key: 'music.village_morning', fadeMs: 1200 },
  },
  {
    id: 'audio.stop_tag',
    kind: 'audio',
    description: 'Stop all currently playing sounds with a tag.',
    argsSchema: {
      tag: 'string',
      fadeMs: 'number?',
    },
    usage: 'Use to clean up looping sounds started by vehicles, cutscenes, ambience, or tagged story moments.',
    example: { tag: 'vehicle:intro_arrival_bus', fadeMs: 400 },
  },
];

module.exports = { audioSkills };
