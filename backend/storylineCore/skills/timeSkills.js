const timeSkills = [
  {
    id: 'time.set_time_of_day',
    kind: 'time',
    description: 'Set the in-game clock to a specific minute of day before a sequence. 08:00 is minute 480.',
    argsSchema: { minute: 'number' },
  },
];

module.exports = { timeSkills };
