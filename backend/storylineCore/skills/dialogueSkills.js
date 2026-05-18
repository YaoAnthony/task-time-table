const dialogueSkills = [
  {
    id: 'dialogue.approach_choice',
    kind: 'dialogue',
    description: 'Run the standard NPC-initiated conversation beat: if NPC and player are in the same world, pan the camera to the NPC, move the NPC to the player, have the NPC speak the prompt, then show player choices.',
    argsSchema: {
      npcId: 'string',
      prompt: 'string',
      choices: 'Array<{id:string,label:string,reply?:string,nextEvent?:string,effects?:StorylineSkillStep[]}>',
      timeoutChoiceId: 'string?',
      timeoutMs: 'number?',
      cameraDurationMs: 'number?',
      promptDurationMs: 'number?',
      replyDurationMs: 'number?',
    },
    usage: 'Prefer this for mainline moments where an NPC actively comes to ask the player something. Do not pair it with action.approach_player; this skill already handles camera, walking, speech, and the choice modal.',
    example: {
      npcId: 'laoli',
      prompt: 'I want to bring my cat here. Can you help me watch the new house?',
      cameraDurationMs: 650,
      promptDurationMs: 2400,
      choices: [
        {
          id: 'accept',
          label: 'I will help.',
          reply: 'Thank you. I will head to the station now.',
          nextEvent: 'accepted_departure',
          effects: [{ skill: 'action.set_quest_state', args: { questId: 'laoli_cat_homecoming', state: 'accepted' } }],
        },
        {
          id: 'decline',
          label: 'Not today.',
          reply: 'That is alright. I will ask later.',
          effects: [{ skill: 'action.set_quest_state', args: { questId: 'laoli_cat_homecoming', state: 'eligible' } }],
        },
      ],
    },
  },
  {
    id: 'dialogue.choice',
    kind: 'dialogue',
    description: 'Ask the player a question with two or three choices, then apply choice-specific replies and effects.',
    argsSchema: {
      npcId: 'string',
      prompt: 'string',
      choices: 'Array<{id:string,label:string,reply?:string,nextEvent?:string,effects?:StorylineSkillStep[]}>',
      timeoutChoiceId: 'string?',
      timeoutMs: 'number?',
      replyDurationMs: 'number?',
    },
    usage: 'Use when an NPC asks the player to accept, refuse, promise, choose a route, or otherwise make a story decision. Keep choices to 2-3.',
    example: {
      npcId: 'laoli',
      prompt: 'I want to bring my cat here. Can you help me watch the new house?',
      choices: [
        {
          id: 'accept',
          label: 'I will help.',
          reply: 'Thank you. I will head to the station now.',
          nextEvent: 'accepted_departure',
          effects: [{ skill: 'action.set_quest_state', args: { questId: 'laoli_cat_homecoming', state: 'accepted' } }],
        },
        {
          id: 'decline',
          label: 'Not today.',
          reply: 'That is alright. I will ask later.',
          effects: [{ skill: 'action.set_quest_state', args: { questId: 'laoli_cat_homecoming', state: 'eligible' } }],
        },
      ],
    },
  },
];

module.exports = { dialogueSkills };
