const OpenAI = require('openai');
const { listBuiltinSkills } = require('../catalogs/builtinSkills');
const { listNpcDefinitions } = require('../../shared/gameNpcCatalog');

const NPC_AUTHORING_ALIASES = [
  { id: 'laoli', aliases: ['laoli', '\u8001\u674e'] },
  { id: 'farmer_tian_xiaohe', aliases: ['tian xiaohe', '\u7530\u5c0f\u79be'] },
  { id: 'carpenter_liang_musheng', aliases: ['liang musheng', '\u6881\u6728\u751f', '\u6728\u751f'] },
  { id: 'merchant_su_ling', aliases: ['su ling', '\u82cf\u94c3'] },
  { id: 'scholar_ji_wenqiu', aliases: ['ji wenqiu', '\u7eaa\u95fb\u79cb'] },
  { id: 'rancher_mu_aqing', aliases: ['mu aqing', '\u7267\u963f\u9752', '\u963f\u9752'] },
];

function createOpenAiClient() {
  if (process.env.DEEPSEEK_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' }),
      model: 'deepseek-chat',
    };
  }
  if (process.env.OPENAI_API_KEY) {
    return {
      client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
      model: 'gpt-4o-mini',
    };
  }
  return null;
}

async function generateStorylineAssistantReply({ draft, userMessage }) {
  const ai = createOpenAiClient();
  if (!ai) return fallbackReply(userMessage);

  const skills = listBuiltinSkills();
  const system = [
    'You are the Storyline Core assistant for a top-down idle farming game.',
    'Help the designer turn a quest idea into a safe StorylineDefinition draft.',
    'Use only the provided storyline skills. Do not invent executable code.',
    'Prefer dialogue.approach_choice for important NPC-initiated dialogue; it handles camera focus, NPC walking to the player, speaking the prompt, and then showing choices.',
    'Use action.approach_player only for low-level movement when no choice/modal follows.',
    'Use dialogue.choice when the player should accept, refuse, promise, choose a route, or make a story decision. Keep choices to 2-3.',
    'A dialogue.choice can include choice.reply, choice.nextEvent, and choice.effects; put persistent consequences in memory or quest-state effects.',
    'Use audio.play_sfx/audio.play_music/audio.stop_tag for authored sound beats. Audio keys must come from the frontend AudioRegistry rather than raw URLs in storyline JSON.',
    'When the designer mentions buying/purchasing an NPC, do not ask for internal npcId. Resolve the NPC from the NPC catalog and aliases below.',
    'For "after buying NPC X" storylines, prefer trigger condition.npc_arrival_completed with the catalog npcId. This means the standard first arrival bus event finished. Add condition.player_in_world if the follow-up dialogue should happen only in the village.',
    'Use condition.npc_unlocked only when the bus arrival itself does not matter.',
    'If the NPC name is ambiguous, ask which NPC by display name/title, not by npcId.',
    'The current StorylineDefinition JSON is authoritative. Before asking a clarifying question, inspect it for existing event names, actors, dialogue lines, triggers, and sequence order.',
    'If the user references a line that already exists in the JSON, infer the target event and insertion point from that line.',
    'Ask concise clarifying questions when trigger, actors, sequence, or memory effects are missing.',
    'Do not paste the full StorylineDefinition JSON in chat; the editor preview already shows it. Summarize changes and include only tiny JSON snippets when the user explicitly asks.',
    `Allowed skills: ${skills.map((skill) => skill.id).join(', ')}`,
    buildNpcAuthoringContext(),
    `Skill manual: ${JSON.stringify(skills)}`,
  ].join('\n');

  const messages = [
    { role: 'system', content: system },
    { role: 'system', content: buildCurrentDefinitionContext(draft) },
    ...draft.messages.slice(-12).map((message) => ({
      role: message.role === 'user' ? 'user' : 'assistant',
      content: message.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const completion = await ai.client.chat.completions.create({
    model: ai.model,
    messages,
    temperature: 0.45,
  });

  return completion.choices?.[0]?.message?.content || fallbackReply(userMessage);
}

function buildNpcAuthoringContext() {
  const definitions = listNpcDefinitions().map((npc) => ({
    id: npc.id,
    name: npc.name,
    role: npc.role,
    title: npc.title,
    price: npc.price,
    ownedByDefault: Boolean(npc.ownedByDefault),
    aliases: NPC_AUTHORING_ALIASES.find((entry) => entry.id === npc.id)?.aliases ?? [],
  }));
  return [
    'NPC catalog for authoring. Use these ids in npcId fields; never ask the designer to provide them.',
    JSON.stringify(definitions),
    'Common pattern: "\u8d2d\u4e70NPC\u6881\u6728\u751f\u4e4b\u540e..." => condition.npc_arrival_completed { npcId: "carpenter_liang_musheng" }.',
  ].join('\n');
}

function buildCurrentDefinitionContext(draft) {
  const revision = draft?.revisions?.find((item) => item.id === draft.currentRevisionId)
    || draft?.revisions?.[draft.revisions.length - 1];
  if (!revision?.definition) return 'Current StorylineDefinition JSON: null';
  return [
    'Current StorylineDefinition JSON. Use this as the source of truth; do not ask about facts visible here.',
    JSON.stringify(revision.definition, null, 2),
  ].join('\n');
}

function fallbackReply(userMessage) {
  return [
    '我先按剧情核心的格式帮你拆一下。',
    '',
    '目前可以确认：这会是一条 StorylineDefinition，运行时由条件触发，然后生成一段 EventSequence。',
    '',
    '建议你下一步补充这四点：',
    '1. 触发条件：例如“老李拥有房子”。',
    '2. 玩家选择：是否需要接受、拒绝。',
    '3. 演出步骤：谁说话、镜头去哪里、大巴何时来。',
    '4. 记忆写入：哪些记忆写给 NPC，哪些写给宠物。',
    '',
    '可用技能会限制在 condition/action/camera/vehicle/memory/pet 这些白名单里，剧情编辑器不会生成任意代码。',
    '',
    `你刚才说的是：${String(userMessage || '').slice(0, 280)}`,
  ].join('\n');
}

module.exports = {
  generateStorylineAssistantReply,
};
