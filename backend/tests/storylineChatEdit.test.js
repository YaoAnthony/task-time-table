const assert = require('assert');

process.env.STORYLINE_DISABLE_DRAFT_FILE_STORE = 'true';

const {
  addDraftRevision,
  appendMessage,
  applyStorylineChatEdit,
  createDraft,
  deleteDraft,
  getDraft,
  iterateStorylineDraft,
  listStorylineSkills,
  listDrafts,
  validateStorylineDefinition,
} = require('../storylineCore');

const TEST_USER_ID = 'storyline_chat_edit_test_user';
const REQUEST = '猫咪应该和老李一起下车，最好站在老李旁边，然后老李带着猫慢慢的去他的新家（添加记忆）';

function getCurrentRevision(draft) {
  return draft.revisions.find((revision) => revision.id === draft.currentRevisionId)
    || draft.revisions[draft.revisions.length - 1];
}

function getReturnSteps(definition) {
  return definition.events.return_with_cat || [];
}

function findStep(definition, skill) {
  return getReturnSteps(definition).find((step) => step.skill === skill);
}

function assertOfferChoice(definition) {
  const offerSteps = definition.events.offer_to_player || [];
  const choice = offerSteps.find((step) => step.skill === 'dialogue.approach_choice');
  assert.ok(choice, 'offer_to_player should focus Lao Li, approach the player, speak, then ask a choice');
  assert.equal(choice.args.npcId, 'laoli');
  assert.ok(String(choice.args.prompt).includes('猫'), 'choice prompt should mention the cat');
  assert.ok(Array.isArray(choice.args.choices), 'choice should include choices');
  assert.equal(choice.args.choices.length, 2, 'choice should have two options in this quest');
  assert.ok(choice.args.choices.some((item) => item.id === 'accept' && item.nextEvent === 'accepted_departure'));
  assert.ok(choice.args.choices.some((item) => item.id === 'decline'));
}

function assertLaoliCatEdit(definition) {
  const spawnPet = findStep(definition, 'action.spawn_pet');
  assert.ok(spawnPet, 'return_with_cat should spawn the cat');
  assert.equal(spawnPet.args.spawnNearNpcId, 'laoli');
  assert.equal(spawnPet.args.placement, 'beside_owner');
  assert.equal(spawnPet.args.arrivalPose, 'stand_together');

  const laoliLine = getReturnSteps(definition).find((step) => (
    step.skill === 'action.npc_say'
    && step.args.npcId === 'laoli'
    && String(step.args.text).includes('下车')
  ));
  assert.ok(laoliLine, 'return_with_cat should add Lao Li dialogue before the cat appears');

  const petMemory = findStep(definition, 'action.add_pet_memory');
  assert.ok(petMemory, 'return_with_cat should write cat memory');
  assert.ok(String(petMemory.args.text).includes('站在他身边'), 'cat memory should mention standing beside Lao Li');
  assert.ok(Number(petMemory.args.importance) >= 8, 'cat memory should stay important');

  const npcMemory = getReturnSteps(definition).find((step) => (
    step.skill === 'action.add_npc_memory'
    && step.args.npcId === 'laoli'
    && String(step.args.text).includes('一起下了大巴')
  ));
  assert.ok(npcMemory, 'return_with_cat should write Lao Li memory about arriving together');
  assert.ok(Number(npcMemory.args.importance) >= 9, 'Lao Li memory should stay highly important');
}

function assertGenericNpcSayEdit(definition, expectedText) {
  const line = getReturnSteps(definition).find((step) => (
    step.skill === 'action.npc_say'
    && step.args.npcId === 'laoli'
    && step.args.text === expectedText
  ));
  assert.ok(line, 'generic chat edit should insert the requested Lao Li dialogue');
  assert.equal(line.args.durationMs, 2400);
}

function assertAnchoredIntroDialogueEdit(definition) {
  const steps = definition.events.intro_arrival || [];
  const anchorIndex = steps.findIndex((step) => (
    step.skill === 'action.npc_say'
    && step.args?.text === '路途折腾死我这老骨头了。'
  ));
  assert.ok(anchorIndex >= 0, 'intro_arrival should contain the Lao Li anchor line');
  assert.equal(steps[anchorIndex + 1]?.skill, 'action.player_say');
  assert.equal(steps[anchorIndex + 1]?.args?.text, '我去四处逛一下');
  assert.equal(steps[anchorIndex + 2]?.skill, 'action.npc_say');
  assert.equal(steps[anchorIndex + 2]?.args?.npcId, 'laoli');
  assert.equal(steps[anchorIndex + 2]?.args?.text, '应该的');
  assert.equal(
    steps.filter((step) => step.args?.text === '我去四处逛一下').length,
    1,
    'moved player line should not be duplicated later in the sequence',
  );
}

function assertMovedNpcDialogueEdit(definition) {
  const steps = definition.events.intro_arrival || [];
  const anchorIndex = steps.findIndex((step) => (
    step.skill === 'action.npc_say'
    && step.args?.text === '路途折腾死我这老骨头了。'
  ));
  assert.ok(anchorIndex >= 0, 'intro_arrival should contain the Lao Li anchor line');
  assert.equal(steps[anchorIndex + 1]?.skill, 'action.npc_say');
  assert.equal(steps[anchorIndex + 1]?.args?.npcId, 'laoli');
  assert.equal(steps[anchorIndex + 1]?.args?.text, '我去四处逛一下');
  assert.equal(
    steps.filter((step) => step.args?.text === '我去四处逛一下').length,
    1,
    'moved NPC line should appear exactly once',
  );
  assert.equal(
    steps.some((step) => String(step.args?.text || '').includes('NPC说的我去四处逛一下改到')),
    false,
    'stale request-shaped dialogue should be removed',
  );
}

function assertMovedByPreviewNumberEdit(definition) {
  const steps = definition.events.intro_arrival || [];
  const anchorIndex = steps.findIndex((step) => (
    step.skill === 'action.npc_say'
    && step.args?.text === '路途折腾死我这老骨头了。'
  ));
  assert.ok(anchorIndex >= 0, 'intro_arrival should contain the target numbered anchor');
  assert.equal(steps[anchorIndex + 1]?.skill, 'action.npc_say');
  assert.equal(steps[anchorIndex + 1]?.args?.text, '我去四处逛一下');
  assert.equal(
    steps.some((step) => step.skill === 'action.player_say' && step.args?.text === '4的'),
    false,
    'stale UI-number fragment should be removed',
  );
}

function createIntroDefinitionFixture() {
  return {
    schemaVersion: 1,
    id: 'default_intro_bus_arrival',
    title: '默认开场：大巴抵达',
    status: 'draft',
    version: 6,
    summary: '新游戏开始时大巴抵达。',
    startState: 'locked',
    states: ['locked', 'playing', 'completed'],
    tags: ['intro'],
    updatedAt: new Date().toISOString(),
    triggers: [
      {
        id: 'new_game_0800_bus_intro',
        fromState: 'locked',
        when: [{ skill: 'condition.game_tick_between', args: { minTick: 0, maxTick: 60 } }],
        then: [{ skill: 'action.set_quest_state', args: { questId: 'default_intro_bus_arrival', state: 'playing' } }],
      },
    ],
    events: {
      intro_arrival: [
        { skill: 'action.npc_say', args: { npcId: 'laoli', text: '路途折腾死我这老骨头了。', durationMs: 2600 } },
        { skill: 'vehicle.close_bus_door', args: { vehicleId: 'intro_arrival_bus' } },
        { skill: 'action.set_quest_state', args: { questId: 'default_intro_bus_arrival', state: 'completed' } },
        { skill: 'action.npc_say', args: { npcId: 'laoli', text: '我去四处逛一下', durationMs: 2400 } },
        { skill: 'action.player_say', args: { text: '4的', durationMs: 2200 } },
        { skill: 'action.npc_say', args: { npcId: 'laoli', text: 'NPC说的我去四处逛一下改到路途折腾死我这老骨头的构面', durationMs: 2200 } },
      ],
    },
  };
}

function run() {
  let draftId = null;
  try {
    const skillIds = listStorylineSkills().map((skill) => skill.id);
    assert.ok(skillIds.includes('action.approach_player'), 'skill catalog should expose action.approach_player');
    assert.ok(skillIds.includes('dialogue.choice'), 'skill catalog should expose dialogue.choice');
    assert.ok(skillIds.includes('action.player_say'), 'skill catalog should expose action.player_say');
    assert.ok(skillIds.includes('action.ensure_npc_in_world'), 'skill catalog should expose action.ensure_npc_in_world');
    assert.ok(skillIds.includes('sequence.wait_for_player_world'), 'skill catalog should expose sequence.wait_for_player_world');
    assert.ok(skillIds.includes('condition.player_in_world'), 'skill catalog should expose condition.player_in_world');
    assert.ok(skillIds.includes('condition.npc_arrival_completed'), 'skill catalog should expose condition.npc_arrival_completed');
    assert.ok(skillIds.includes('condition.npc_unlocked'), 'skill catalog should expose condition.npc_unlocked');

    const draft = createDraft({ userId: TEST_USER_ID, title: '老李的猫' });
    draftId = draft.id;

    const firstPass = iterateStorylineDraft(draft, '老李的猫');
    assertOfferChoice(firstPass.definition);
    assert.deepEqual(validateStorylineDefinition(firstPass.definition), { ok: true, errors: [] });
    let persisted = addDraftRevision(TEST_USER_ID, draft.id, {
      definition: firstPass.definition,
      review: firstPass.review,
      source: 'test_seed',
    });

    persisted = appendMessage(TEST_USER_ID, draft.id, {
      role: 'user',
      content: REQUEST,
      contextLabel: '演出流程',
    });
    assert.equal(persisted.messages[persisted.messages.length - 1].contextLabel, '演出流程');

    const edit = applyStorylineChatEdit(persisted, REQUEST, {
      label: '演出流程',
      text: 'Event: return_with_cat',
    });
    assertOfferChoice(edit.definition);
    assertLaoliCatEdit(edit.definition);
    assert.deepEqual(validateStorylineDefinition(edit.definition), { ok: true, errors: [] });
    const requestedLine = 'The new house is ahead. Walk slowly with me.';
    const sayEdit = applyStorylineChatEdit({
      ...persisted,
      currentRevisionId: 'generic_edit_seed',
      revisions: [{ id: 'generic_edit_seed', definition: edit.definition, review: edit.review, source: 'test_seed' }],
    }, `Add a line in return_with_cat: laoli says "${requestedLine}"`, {
      label: '演出流程',
      text: 'Event: return_with_cat',
    });
    assert.equal(sayEdit.changed, true, 'generic NPC line request should be treated as a structural edit');
    assertGenericNpcSayEdit(sayEdit.definition, requestedLine);
    assert.deepEqual(validateStorylineDefinition(sayEdit.definition), { ok: true, errors: [] });
    assert.ok(!edit.reply.includes('```json'), 'assistant reply should not include the full JSON block');
    assert.ok(edit.reply.includes('右侧结构化预览'), 'assistant reply should point the designer to the preview panel');

    const introDefinition = createIntroDefinitionFixture();
    const anchoredEdit = applyStorylineChatEdit({
      ...persisted,
      currentRevisionId: 'intro_edit_seed',
      revisions: [{ id: 'intro_edit_seed', definition: introDefinition, review: null, source: 'test_seed' }],
    }, '我去四处逛一下，应该改到路途折腾死我这老骨头了”这句话的后面，然后让 NPC 回复“应该的”', {
      label: '演出流程',
      text: [
        'Event: intro_arrival',
        '1. action.npc_say {"npcId":"laoli","text":"路途折腾死我这老骨头了。"}',
        '2. vehicle.close_bus_door {"vehicleId":"intro_arrival_bus"}',
      ].join('\n'),
    });
    assert.equal(anchoredEdit.changed, true, 'anchored dialogue request should be a structural edit');
    assertAnchoredIntroDialogueEdit(anchoredEdit.definition);
    assert.deepEqual(validateStorylineDefinition(anchoredEdit.definition), { ok: true, errors: [] });

    const movedEdit = applyStorylineChatEdit({
      ...persisted,
      currentRevisionId: 'intro_move_seed',
      revisions: [{ id: 'intro_move_seed', definition: introDefinition, review: null, source: 'test_seed' }],
    }, 'NPC说的我去四处逛一下改到 路途折腾死我这老骨头的 构面', {
      label: '演出流程',
      text: [
        'Event: intro_arrival',
        '15. action.npc_say {"npcId":"laoli","text":"路途折腾死我这老骨头了。"}',
        '23. action.npc_say {"npcId":"laoli","text":"我去四处逛一下"}',
      ].join('\n'),
    });
    assert.equal(movedEdit.changed, true, 'move request should move an existing dialogue step');
    assertMovedNpcDialogueEdit(movedEdit.definition);
    assert.deepEqual(validateStorylineDefinition(movedEdit.definition), { ok: true, errors: [] });

    const numberedMoveEdit = applyStorylineChatEdit({
      ...persisted,
      currentRevisionId: 'intro_number_move_seed',
      revisions: [{ id: 'intro_number_move_seed', definition: introDefinition, review: null, source: 'test_seed' }],
    }, '4的我去四处逛一下，应该放到1的后面', {
      label: '演出流程',
      text: [
        'Event: intro_arrival',
        '1. action.npc_say {"npcId":"laoli","text":"路途折腾死我这老骨头了。"}',
        '4. action.npc_say {"npcId":"laoli","text":"我去四处逛一下"}',
      ].join('\n'),
    });
    assert.equal(numberedMoveEdit.changed, true, 'preview number request should move by displayed step numbers');
    assertMovedByPreviewNumberEdit(numberedMoveEdit.definition);
    assert.deepEqual(validateStorylineDefinition(numberedMoveEdit.definition), { ok: true, errors: [] });

    persisted = addDraftRevision(TEST_USER_ID, draft.id, {
      definition: sayEdit.definition,
      review: sayEdit.review,
      source: 'chat_edit',
    });

    const reloaded = getDraft(TEST_USER_ID, draft.id);
    const currentRevision = getCurrentRevision(reloaded);
    assert.equal(currentRevision.source, 'chat_edit');
    assert.equal(currentRevision.definition.version, sayEdit.definition.version);
    assertLaoliCatEdit(currentRevision.definition);
    assertGenericNpcSayEdit(currentRevision.definition, requestedLine);

    assert.ok(listDrafts(TEST_USER_ID).some((item) => item.id === draft.id), 'draft should exist before publish cleanup');
    assert.equal(deleteDraft(TEST_USER_ID, draft.id), true, 'publish cleanup should remove the draft');
    draftId = null;
    assert.ok(!listDrafts(TEST_USER_ID).some((item) => item.id === draft.id), 'draft should disappear after publish cleanup');

    console.log('storyline chat edit test passed');
  } finally {
    if (draftId) {
      deleteDraft(TEST_USER_ID, draftId);
    }
  }
}

run();
