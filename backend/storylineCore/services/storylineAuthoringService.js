const { listBuiltinSkills } = require('../catalogs/builtinSkills');
const { compileStorylineDefinition } = require('../storylineCompiler');
const { validateStorylineDefinition } = require('../storylineValidator');

const skillIds = new Set(listBuiltinSkills().map((skill) => skill.id));

function iterateStorylineDraft(draft, note = '', maxPasses = 3) {
  const current = getCurrentDefinition(draft);
  let definition = current
    ? reviseDefinition(current, note)
    : createInitialDefinition(draft, note);
  let review = reviewStorylineDefinition(definition);
  const history = [{ pass: 1, score: review.score, verdict: review.verdict }];

  for (let pass = 2; pass <= maxPasses && review.score < 86; pass += 1) {
    definition = repairDefinition(definition, review);
    review = reviewStorylineDefinition(definition);
    history.push({ pass, score: review.score, verdict: review.verdict });
  }

  return { definition, review, history };
}

function applyStorylineChatEdit(draft, userMessage = '', context = null) {
  const current = getCurrentDefinition(draft) || createInitialDefinition(draft, userMessage);
  const edit = reviseDefinitionForUserRequest(current, userMessage, context);
  const definition = edit.definition;
  const review = reviewStorylineDefinition(definition);
  const changes = describeDefinitionChanges(current, definition, userMessage, context, edit.appliedChanges);
  return {
    definition,
    review,
    reply: edit.changed ? buildEditReply(definition, changes, review) : null,
    changes,
    changed: edit.changed,
  };
}

function reviewStorylineDefinition(definition) {
  const findings = [];
  const strengths = [];
  const risks = [];
  const validation = validateStorylineDefinition(definition);

  for (const error of validation.errors) {
    findings.push({ severity: 'error', area: 'schema', message: error });
  }

  const triggerSteps = flattenSteps((definition.triggers || []).flatMap((trigger) => [...(trigger.when || []), ...(trigger.then || [])]));
  const eventSteps = flattenSteps(Object.values(definition.events || {}).flat());
  const allSteps = [...triggerSteps, ...eventSteps];

  if ((definition.triggers || []).length > 0) strengths.push('有明确触发器，剧情可以由世界状态自然启动。');
  else findings.push({ severity: 'warning', area: 'trigger', message: '缺少 trigger，运行时不知道什么时候自动进入这条剧情。' });

  if (allSteps.some((step) => step.skill === 'action.set_quest_state')) strengths.push('使用 quest state 锁住流程，能避免重复触发。');
  else findings.push({ severity: 'error', area: 'state', message: '缺少 action.set_quest_state，剧情状态不可追踪。' });

  if (allSteps.some((step) => step.skill === 'action.add_npc_memory')) strengths.push('会写入 NPC 记忆，agent 之后能自然提到这件事。');
  else risks.push('没有 NPC 记忆写入，主线完成后角色可能像什么都没发生。');

  if (allSteps.some((step) => step.skill === 'action.add_pet_memory')) strengths.push('会写入宠物记忆，适合后续宠物 agent 行为。');
  if (allSteps.some((step) => step.skill === 'dialogue.approach_choice')) {
    strengths.push('NPC 会先被镜头聚焦、走到主角面前、说出问题，再打开选择框。');
  } else if (allSteps.some((step) => step.skill === 'action.approach_player')) strengths.push('NPC 会先走到主角面前再谈话，演出更像 agent 主动行动。');
  else risks.push('没有 dialogue.approach_choice 或 action.approach_player，重要对话可能显得像凭空弹窗。');
  if (allSteps.some((step) => step.skill === 'dialogue.choice')) strengths.push('包含玩家抉择，剧情能根据玩家选择进入不同后续动作。');
  else risks.push('没有 dialogue.choice，主线缺少玩家参与感。');
  if (allSteps.some((step) => step.skill === 'director.begin_event')) {
    strengths.push('Uses director event phases and actor locks, so staged NPCs are less likely to be interrupted by daily AI.');
  }
  if (!allSteps.some((step) => step.skill === 'camera.pan_to')) risks.push('没有镜头步骤，演出存在感可能偏弱。');
  if (!allSteps.some((step) => step.skill === 'sequence.wait_ticks') && !allSteps.some((step) => step.args?.dueInTicks)) {
    risks.push('没有等待 tick 或 dueInTicks，离开/归来可能显得过于瞬时。');
  }

  for (const step of allSteps) {
    if (!skillIds.has(step.skill)) {
      findings.push({ severity: 'error', area: 'skill', message: `未知 skill：${step.skill}` });
    }
  }

  const errorCount = findings.filter((finding) => finding.severity === 'error').length;
  const warningCount = findings.filter((finding) => finding.severity === 'warning').length;
  const score = Math.max(0, Math.min(100, 100 - errorCount * 24 - warningCount * 10 - risks.length * 6));

  return {
    score,
    verdict: score >= 86 ? 'ready' : score >= 65 ? 'needs_polish' : 'blocked',
    findings,
    strengths,
    risks,
    checkedAt: new Date().toISOString(),
  };
}

function compileDraftDefinition(definition) {
  return compileStorylineDefinition(definition);
}

function createInitialDefinition(draft, note) {
  const now = new Date().toISOString();
  const text = `${draft.title || ''}\n${note || ''}\n${(draft.messages || []).map((message) => message.content).join('\n')}`;
  const isLaoliCat = /老李|laoli|猫|cat/i.test(text);
  if (isLaoliCat) return createLaoliCatDefinition(now);

  const id = toStorylineId(draft.title || 'storyline');
  return {
    schemaVersion: 1,
    id,
    title: draft.title || '新剧情',
    status: 'draft',
    version: 1,
    summary: note || '从剧情编辑器生成的剧情草稿。',
    startState: 'locked',
    states: ['locked', 'eligible', 'completed'],
    tags: ['draft'],
    updatedAt: now,
    triggers: [
      {
        id: `${id}_trigger`,
        fromState: 'locked',
        when: [{ skill: 'condition.quest_state_is', args: { questId: id, state: 'locked' } }],
        then: [{ skill: 'action.set_quest_state', args: { questId: id, state: 'eligible' } }],
      },
    ],
    events: {
      complete: [
        { skill: 'action.npc_say', args: { npcId: 'laoli', text: '这件事我记住了。', durationMs: 2200 } },
        { skill: 'action.add_npc_memory', args: { npcId: 'laoli', text: '和主角一起经历了一件重要的事。', importance: 5 } },
        { skill: 'action.set_quest_state', args: { questId: id, state: 'completed' } },
      ],
    },
  };
}

function reviseDefinition(definition, note) {
  const next = cloneJsonValue(definition);
  next.version = Number(next.version || 1) + 1;
  next.status = 'draft';
  next.updatedAt = new Date().toISOString();
  if (note) next.summary = `${next.summary || ''}\n\n编辑备注：${note}`.trim();
  return next;
}

function reviseDefinitionForUserRequest(definition, userMessage, context) {
  const next = reviseDefinition(definition, '');
  const text = `${userMessage || ''}\n${context?.text || ''}`;
  const normalized = text.toLowerCase();
  const appliedChanges = [];

  if (/一起|站在一起|身边|旁边|一起下车|下车/.test(text) || /together|beside|near/.test(normalized)) {
    applyTogetherArrivalEdit(next);
    appliedChanges.push('Updated the return sequence so the cat appears beside Lao Li and both memories describe arriving together.');
  }

  if (/下午|午後|afternoon/.test(text) || /afternoon/.test(normalized)) {
    applyAfternoonTimingEdit(next);
    appliedChanges.push('Added afternoon timing hints to the return/departure sequence.');
  }

  if (/自然|更自然|节奏|演出/.test(text) || /natural|pacing/.test(normalized)) {
    applyNaturalPacingEdit(next);
    appliedChanges.push('Added pacing beats so the directed sequence breathes before the next action.');
  }

  const movedByStepNumberEdit = applyMoveStepNumberEdit(next, userMessage, context);
  if (movedByStepNumberEdit) appliedChanges.push(movedByStepNumberEdit);

  const movedDialogueEdit = movedByStepNumberEdit ? null : applyMoveExistingDialogueEdit(next, userMessage, context);
  if (movedDialogueEdit) appliedChanges.push(movedDialogueEdit);

  const anchoredDialogueEdit = (movedByStepNumberEdit || movedDialogueEdit) ? null : applyAnchoredDialogueEdit(next, userMessage, context);
  if (anchoredDialogueEdit) appliedChanges.push(anchoredDialogueEdit);

  const npcSayEdit = (movedByStepNumberEdit || movedDialogueEdit || anchoredDialogueEdit) ? null : applyGenericNpcSayEdit(next, userMessage, context);
  if (npcSayEdit) appliedChanges.push(npcSayEdit);

  next.updatedAt = new Date().toISOString();
  if (!appliedChanges.length) return { definition, appliedChanges, changed: false };
  return { definition: next, appliedChanges, changed: true };
}

function applyTogetherArrivalEdit(definition) {
  const returnSteps = ensureEvent(definition, 'return_with_cat');
  const spawnPet = findStep(returnSteps, 'action.spawn_pet');
  if (spawnPet) {
    spawnPet.args = {
      ...spawnPet.args,
      spawnNearNpcId: 'laoli',
      placement: 'beside_owner',
      arrivalPose: 'stand_together',
    };
  }

  insertStepBefore(returnSteps, 'action.spawn_pet', {
    skill: 'action.npc_say',
    args: {
      npcId: 'laoli',
      text: '咪咪，下车吧。我们到新家了。',
      durationMs: 2600,
    },
  }, (step) => step.skill === 'action.npc_say' && String(step.args?.text || '').includes('下车'));

  insertStepBefore(returnSteps, 'action.spawn_pet', {
    skill: 'camera.pan_to',
    args: {
      target: 'laoli',
      durationMs: 700,
    },
  }, (step) => step.skill === 'camera.pan_to' && step.args?.target === 'laoli');

  const petMemory = findStep(returnSteps, 'action.add_pet_memory');
  if (petMemory) {
    petMemory.args = {
      ...petMemory.args,
      text: '跟着老李一起从大巴下车，站在他身边来到新家。',
      importance: Math.max(Number(petMemory.args?.importance || 0), 8),
    };
  }

  const npcMemory = findLastStep(returnSteps, 'action.add_npc_memory');
  if (npcMemory) {
    npcMemory.args = {
      ...npcMemory.args,
      text: '我和猫一起下了大巴，它站在我身边，我们一起回到了新家。',
      importance: Math.max(Number(npcMemory.args?.importance || 0), 9),
    };
  }
}

function applyAfternoonTimingEdit(definition) {
  definition.runtimeHints = {
    ...(definition.runtimeHints || {}),
    preferredReturnTime: 'afternoon',
  };
  const departureSteps = ensureEvent(definition, 'accepted_departure');
  const returnSteps = ensureEvent(definition, 'return_with_cat');
  for (const step of [...departureSteps, ...returnSteps]) {
    if (step.skill === 'action.set_quest_state' || step.skill.startsWith('vehicle.') || step.skill.startsWith('camera.')) {
      step.args = {
        ...step.args,
        timeOfDay: 'afternoon',
      };
    }
  }
}

function applyNaturalPacingEdit(definition) {
  const returnSteps = ensureEvent(definition, 'return_with_cat');
  insertStepBefore(returnSteps, 'action.spawn_pet', {
    skill: 'sequence.wait_ticks',
    args: {
      ticks: 30,
      reason: 'let_bus_arrival_breathe',
    },
  }, (step) => step.skill === 'sequence.wait_ticks' && step.args?.reason === 'let_bus_arrival_breathe');
}

function applyGenericNpcSayEdit(definition, userMessage = '', context = null) {
  const requestText = String(userMessage || '');
  const combined = `${requestText}\n${context?.text || ''}`;
  if (!/(npc_say|says?|say|line|dialogue|加一句|新增|添加|台词|说|對白|对白)/i.test(combined)) return null;

  const line = extractRequestedNpcLine(requestText);
  if (!line) return null;

  const npcId = resolveRequestedNpcId(combined);
  const eventName = resolveRequestedEventName(definition, combined);
  const steps = ensureEvent(definition, eventName);
  const alreadyExists = steps.some((step) => (
    step.skill === 'action.npc_say'
    && step.args?.npcId === npcId
    && step.args?.text === line
  ));
  if (alreadyExists) return null;

  const step = {
    skill: 'action.npc_say',
    args: {
      npcId,
      text: line,
      durationMs: 2400,
    },
  };
  const finalStateIndex = findFinalQuestStateIndex(steps);
  if (finalStateIndex >= 0) steps.splice(finalStateIndex, 0, step);
  else steps.push(step);

  return `Added ${npcId} dialogue to event "${eventName}": "${line}".`;
}

function applyAnchoredDialogueEdit(definition, userMessage = '', context = null) {
  const requestText = String(userMessage || '');
  const combined = `${requestText}\n${context?.text || ''}`;
  if (!/(后面|之后|after|following|放到|插到|插入|改到)/i.test(combined)) return null;

  const eventName = resolveRequestedEventName(definition, combined);
  const steps = ensureEvent(definition, eventName);
  const anchor = findMentionedDialogueStep(steps, combined);
  if (!anchor) return null;

  const playerLine = extractPlayerLineBeforeAnchorRequest(requestText, anchor.text);
  const npcReplyLine = extractNpcReplyLine(requestText);
  if (!playerLine && !npcReplyLine) return null;

  removeDuplicateDialogueSteps(steps, [playerLine, npcReplyLine].filter(Boolean));
  const anchorIndex = Math.max(0, steps.indexOf(anchor.step));
  const insertSteps = [];
  if (playerLine) {
    insertSteps.push({
      skill: 'action.player_say',
      args: { text: playerLine, durationMs: 2200 },
    });
  }
  if (npcReplyLine) {
    insertSteps.push({
      skill: 'action.npc_say',
      args: { npcId: resolveRequestedNpcId(combined), text: npcReplyLine, durationMs: 2200 },
    });
  }
  steps.splice(anchorIndex + 1, 0, ...insertSteps);
  return `Inserted authored dialogue after "${anchor.text}" in event "${eventName}".`;
}

function applyMoveExistingDialogueEdit(definition, userMessage = '', context = null) {
  const requestText = String(userMessage || '');
  const combined = `${requestText}\n${context?.text || ''}`;
  if (!/(改到|移动到|移到|挪到|放到|插到|move|after|behind)/i.test(combined)) return null;

  const eventName = resolveRequestedEventName(definition, combined);
  const steps = ensureEvent(definition, eventName);
  const movedLine = extractMovedDialogueLine(requestText);
  const anchorHint = extractMoveAnchorHint(requestText);
  if (!movedLine || !anchorHint) return null;

  const moved = findBestDialogueStepByText(steps, movedLine);
  const anchor = findBestDialogueStepByText(steps, anchorHint, moved?.step);
  if (!moved || !anchor || moved.step === anchor.step) return null;

  removeStaleRequestDialogueSteps(steps, moved.text, anchorHint);
  const currentIndex = steps.indexOf(moved.step);
  if (currentIndex >= 0) steps.splice(currentIndex, 1);

  const anchorIndex = steps.indexOf(anchor.step);
  if (anchorIndex < 0) return null;
  steps.splice(anchorIndex + 1, 0, moved.step);

  const npcReplyLine = extractNpcReplyLine(requestText);
  if (npcReplyLine) {
    steps.splice(anchorIndex + 2, 0, {
      skill: 'action.npc_say',
      args: { npcId: resolveRequestedNpcId(combined), text: npcReplyLine, durationMs: 2200 },
    });
  }
  return `Moved existing dialogue "${moved.text}" after "${anchor.text}" in event "${eventName}".`;
}

function applyMoveStepNumberEdit(definition, userMessage = '', context = null) {
  const requestText = String(userMessage || '');
  const combined = `${requestText}\n${context?.text || ''}`;
  const refs = extractStepNumberMoveRefs(requestText);
  if (!refs) return null;

  const eventName = resolveRequestedEventName(definition, combined);
  const steps = ensureEvent(definition, eventName);
  const sourceStep = steps[refs.sourceIndex - 1];
  const targetStep = steps[refs.targetIndex - 1];
  if (!sourceStep || !targetStep || sourceStep === targetStep) return null;

  const sourceText = String(sourceStep.args?.text ?? sourceStep.skill ?? refs.sourceIndex);
  const targetText = String(targetStep.args?.text ?? targetStep.skill ?? refs.targetIndex);
  const currentIndex = steps.indexOf(sourceStep);
  if (currentIndex >= 0) steps.splice(currentIndex, 1);

  const targetIndex = steps.indexOf(targetStep);
  if (targetIndex < 0) return null;
  steps.splice(targetIndex + 1, 0, sourceStep);
  removeStaleStepNumberRequestSteps(steps, refs.sourceIndex);

  return `Moved preview step #${refs.sourceIndex} after #${refs.targetIndex} in event "${eventName}" (${sourceText} -> ${targetText}).`;
}

function extractStepNumberMoveRefs(text) {
  const source = String(text || '');
  const match = source.match(/(?:第?\s*)?(\d{1,3})\s*(?:号|条|步|的)?[\s\S]{0,80}?(?:改到|移动到|移到|挪到|放到|插到|move(?:\s+it)?\s+after)\s*(?:第?\s*)?(\d{1,3})\s*(?:号|条|步|的)?\s*(?:后面|之后|后|$)/i);
  if (!match) return null;
  const sourceIndex = Number(match[1]);
  const targetIndex = Number(match[2]);
  if (!Number.isInteger(sourceIndex) || !Number.isInteger(targetIndex)) return null;
  if (sourceIndex <= 0 || targetIndex <= 0) return null;
  return { sourceIndex, targetIndex };
}

function removeStaleStepNumberRequestSteps(steps, sourceIndex) {
  const staleText = `${sourceIndex}的`;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step.skill !== 'action.player_say' && step.skill !== 'action.npc_say') continue;
    const text = String(step.args?.text || '').trim();
    if (text === String(sourceIndex) || text === staleText) steps.splice(index, 1);
  }
}

function extractMovedDialogueLine(text) {
  const source = String(text || '').trim();
  const explicit = source.match(/(?:NPC|npc|老李|laoli)?\s*说的\s*(.+?)\s*(?:改到|移动到|移到|挪到|放到|插到|move)/i);
  if (explicit?.[1]) return cleanLineText(explicit[1].replace(/^的/, ''));

  const loose = source.match(/(?:把|将)\s*(.+?)\s*(?:改到|移动到|移到|挪到|放到|插到|move)/i);
  if (!loose?.[1]) return null;
  const candidate = cleanLineText(loose[1].replace(/^(?:NPC|npc|老李|laoli)\s*(?:说|说的)?/, ''));
  if (/后面|之后|这句话|路途|折腾/.test(candidate)) return null;
  return candidate;
}

function extractMoveAnchorHint(text) {
  const source = String(text || '');
  const match = source.match(/(?:改到|移动到|移到|挪到|放到|插到|move(?:\s+it)?\s+after)\s*(.+?)(?:这句话)?(?:的)?(?:后面|之后|构面|前面|$)/i);
  return match?.[1] ? cleanLineText(match[1]) : null;
}

function findBestDialogueStepByText(steps, text, excludeStep = null) {
  let best = null;
  for (const step of steps) {
    if (step === excludeStep) continue;
    if (step.skill !== 'action.npc_say' && step.skill !== 'action.player_say') continue;
    const line = String(step.args?.text || '').trim();
    const requestPenalty = /改到|移动到|移到|挪到|放到|插到|move/i.test(line) ? 500 : 0;
    const score = dialogueMatchScore(line, text) - requestPenalty;
    if (score <= 0) continue;
    if (!best || score > best.score) best = { step, text: line, score };
  }
  return best;
}

function dialogueMatchScore(line, hint) {
  const normalizedLine = normalizeDialogueText(line);
  const normalizedHint = normalizeDialogueText(hint);
  if (!normalizedLine || !normalizedHint) return 0;
  if (normalizedLine === normalizedHint) return 1000 + normalizedLine.length;
  if (normalizedLine.includes(normalizedHint) || normalizedHint.includes(normalizedLine)) {
    return 800 + Math.min(normalizedLine.length, normalizedHint.length);
  }
  const common = longestCommonSubstringLength(normalizedLine, normalizedHint);
  const shorter = Math.min(normalizedLine.length, normalizedHint.length);
  if (shorter >= 4 && common >= Math.max(4, shorter - 1)) return 600 + common;
  return 0;
}

function longestCommonSubstringLength(a, b) {
  let best = 0;
  const previous = new Array(b.length + 1).fill(0);
  const current = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = a[i - 1] === b[j - 1] ? previous[j - 1] + 1 : 0;
      if (current[j] > best) best = current[j];
    }
    for (let j = 0; j <= b.length; j += 1) {
      previous[j] = current[j];
      current[j] = 0;
    }
  }
  return best;
}

function removeStaleRequestDialogueSteps(steps, movedLine, anchorHint) {
  const moved = normalizeDialogueText(movedLine);
  const anchor = normalizeDialogueText(anchorHint);
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step.skill !== 'action.npc_say' && step.skill !== 'action.player_say') continue;
    const text = normalizeDialogueText(step.args?.text);
    const looksLikeRequest = text.includes('改到') || text.includes('移动到') || text.includes('挪到') || text.includes('放到');
    if (looksLikeRequest && text.includes(moved) && (!anchor || text.includes(anchor.slice(0, Math.min(6, anchor.length))))) {
      steps.splice(index, 1);
    }
  }
}

function findMentionedDialogueStep(steps, text) {
  const normalizedText = normalizeDialogueText(text);
  let best = null;
  for (const step of steps) {
    if (step.skill !== 'action.npc_say' && step.skill !== 'action.player_say') continue;
    const line = String(step.args?.text || '').trim();
    if (!line) continue;
    const normalizedLine = normalizeDialogueText(line);
    if (!normalizedLine || !normalizedText.includes(normalizedLine)) continue;
    if (!best || line.length > best.text.length) best = { step, text: line };
  }
  return best;
}

function extractPlayerLineBeforeAnchorRequest(text, anchorText) {
  const source = String(text || '').trim();
  const anchorIndex = source.indexOf(anchorText);
  const beforeAnchor = anchorIndex >= 0 ? source.slice(0, anchorIndex) : source;
  const split = beforeAnchor.split(/应该|应当|要|放到|插到|插入|改到|after|following/i)[0] || beforeAnchor;
  const explicit = split.match(/玩家(?:说|回复)?[：“":\s]+(.+)$/i);
  const candidate = cleanLineText(explicit?.[1] || split.split(/[，,。]/)[0]);
  if (!candidate) return null;
  if (/npc|NPC|老李|laoli|回复|后面|之后|这句话/.test(candidate)) return null;
  return candidate;
}

function extractNpcReplyLine(text) {
  const source = String(text || '');
  const match = source.match(/(?:NPC|npc|老李|laoli).{0,12}(?:回复|回应|说|reply|says?)\s*[：“":]?\s*["“”'‘’]?([^"“”'‘’。！？!?，,\n]{1,80})/i);
  return match?.[1] ? cleanLineText(match[1]) : null;
}

function removeDuplicateDialogueSteps(steps, lines) {
  const normalizedLines = new Set(lines.map(normalizeDialogueText).filter(Boolean));
  if (!normalizedLines.size) return;
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const step = steps[index];
    if (step.skill !== 'action.npc_say' && step.skill !== 'action.player_say') continue;
    if (normalizedLines.has(normalizeDialogueText(step.args?.text))) steps.splice(index, 1);
  }
}

function normalizeDialogueText(value) {
  return String(value || '')
    .replace(/[“”‘’"'。，、！？!?：:\s]/g, '')
    .trim()
    .toLowerCase();
}

function extractRequestedNpcLine(text) {
  const quoted = [...String(text || '').matchAll(/["“”']([^"“”']{2,160})["“”']/g)]
    .map((match) => match[1].trim())
    .filter(Boolean);
  if (quoted.length) return quoted[quoted.length - 1];

  const patterns = [
    /(?:says?|say|line|dialogue|npc_say)\s*[:：]\s*(.+)$/i,
    /(?:说|台词|对白|對白)\s*[:：]\s*(.+)$/i,
    /(?:加一句|新增一句|添加一句|插入一句).*(?:说|台词|对白|line)\s*[:：]\s*(.+)$/i,
    /(?:laoli|老李|npc).{0,24}(?:says?|说)\s+(.+)$/i,
  ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return cleanLineText(match[1]);
  }
  return null;
}

function cleanLineText(value) {
  return String(value || '')
    .replace(/^["“”']+|["“”']+$/g, '')
    .trim()
    .slice(0, 180);
}

function resolveRequestedNpcId(text) {
  if (/\blaoli\b|老李|鑰佹潕/i.test(String(text || ''))) return 'laoli';
  const explicit = String(text || '').match(/\bnpc(?:Id)?\s*[:=]\s*([a-zA-Z0-9_-]+)/i);
  return explicit?.[1] || 'laoli';
}

function resolveRequestedEventName(definition, text) {
  const allText = String(text || '');
  const explicit = allText.match(/\bEvent\s*[:：]\s*([a-zA-Z0-9_-]+)/i)
    || allText.match(/\bevent\s*[:=]\s*([a-zA-Z0-9_-]+)/i);
  if (explicit?.[1] && definition.events?.[explicit[1]]) return explicit[1];

  const eventNames = Object.keys(definition.events || {});
  const mentioned = eventNames.find((eventName) => allText.includes(eventName));
  if (mentioned) return mentioned;
  return eventNames.find((eventName) => eventName !== 'offer_to_player') || eventNames[0] || 'complete';
}

function findFinalQuestStateIndex(steps) {
  return steps.findIndex((step, index) => (
    index === steps.length - 1
    && step.skill === 'action.set_quest_state'
  ));
}

function ensureEvent(definition, eventName) {
  definition.events = definition.events && typeof definition.events === 'object' ? definition.events : {};
  definition.events[eventName] = Array.isArray(definition.events[eventName]) ? definition.events[eventName] : [];
  return definition.events[eventName];
}

function findStep(steps, skill) {
  return steps.find((step) => step.skill === skill);
}

function findLastStep(steps, skill) {
  return [...steps].reverse().find((step) => step.skill === skill);
}

function insertStepBefore(steps, beforeSkill, step, existsPredicate) {
  if (existsPredicate && steps.some(existsPredicate)) return;
  const index = steps.findIndex((item) => item.skill === beforeSkill);
  if (index === -1) steps.push(step);
  else steps.splice(index, 0, step);
}

function describeDefinitionChanges(previous, next, userMessage, context, appliedChanges = []) {
  const changes = [...appliedChanges];
  if (context?.label) changes.push(`根据 @${context.label} 的上下文修改当前剧情。`);
  if (/一起|站在一起|身边|旁边|一起下车|下车/.test(userMessage || '')) {
    changes.push('把猫的返场生成位置绑定到老李身边，并加入老李招呼猫下车的台词。');
    changes.push('更新老李和猫的记忆，让二者都记住“他们一起下车并回到新家”。');
  }
  if (/下午|午後|afternoon/i.test(userMessage || '')) {
    changes.push('为返场相关镜头、车辆和状态步骤加入 afternoon 时间提示。');
  }
  if (!changes.length) changes.push('已保存为新版本，并保持原有 skill 白名单结构。');
  changes.push(`版本从 v${previous.version || 1} 更新到 v${next.version || 1}。`);
  return changes;
}

function buildEditReply(definition, changes, review) {
  void definition;
  return [
    '已直接修改当前剧情 JSON，并保存为新的 revision。',
    '',
    '改动：',
    ...changes.map((change) => `- ${change}`),
    `- 当前审查分数：${review.score}（${review.verdict}）。`,
    '',
    '右侧结构化预览已经同步到最新版本；需要看完整内容时切到右侧 JSON tab。',
  ].join('\n');
}

function repairDefinition(definition, review) {
  const next = cloneJsonValue(definition);
  const questId = next.id;
  next.updatedAt = new Date().toISOString();
  next.version = Number(next.version || 1) + 1;
  next.triggers = Array.isArray(next.triggers) ? next.triggers : [];
  next.events = next.events && typeof next.events === 'object' ? next.events : {};
  if (!Array.isArray(next.states) || next.states.length === 0) next.states = ['locked', 'eligible', 'completed'];
  if (!next.startState) next.startState = next.states[0];

  if (next.triggers.length === 0) {
    next.triggers.push({
      id: `${questId}_trigger`,
      fromState: next.startState,
      when: [{ skill: 'condition.quest_state_is', args: { questId, state: next.startState } }],
      then: [{ skill: 'action.set_quest_state', args: { questId, state: next.states[1] || 'eligible' } }],
    });
  }

  const allEventSteps = Object.values(next.events).flat();
  const hasQuestState = [...next.triggers.flatMap((trigger) => trigger.then || []), ...allEventSteps]
    .some((step) => step.skill === 'action.set_quest_state');
  if (!hasQuestState) {
    const firstEventName = Object.keys(next.events)[0] || 'complete';
    next.events[firstEventName] = next.events[firstEventName] || [];
    next.events[firstEventName].push({ skill: 'action.set_quest_state', args: { questId, state: next.states[next.states.length - 1] || 'completed' } });
  }

  if (!allEventSteps.some((step) => step.skill === 'action.add_npc_memory')) {
    const firstEventName = Object.keys(next.events)[0] || 'complete';
    next.events[firstEventName] = next.events[firstEventName] || [];
    next.events[firstEventName].push({
      skill: 'action.add_npc_memory',
      args: { npcId: 'laoli', text: `经历了剧情：${next.title || questId}`, importance: 5 },
    });
  }

  if (!allEventSteps.some((step) => step.skill === 'camera.pan_to')) {
    const firstEventName = Object.keys(next.events)[0] || 'complete';
    next.events[firstEventName] = next.events[firstEventName] || [];
    next.events[firstEventName].unshift({ skill: 'camera.pan_to', args: { target: 'player', durationMs: 600 } });
  }

  if (review?.findings?.some((finding) => finding.area === 'skill')) {
    for (const trigger of next.triggers) {
      trigger.when = (trigger.when || []).filter((step) => skillIds.has(step.skill));
      trigger.then = (trigger.then || []).filter((step) => skillIds.has(step.skill));
    }
    for (const [eventName, steps] of Object.entries(next.events)) {
      next.events[eventName] = steps.filter((step) => skillIds.has(step.skill));
    }
  }

  return next;
}

function createLaoliCatDefinition(now) {
  return {
    schemaVersion: 1,
    id: 'laoli_cat_homecoming',
    title: '老李的猫',
    status: 'draft',
    version: 1,
    summary: '老李拥有自己的房子后，离开一段时间把猫接回新家。',
    startState: 'locked',
    states: ['locked', 'eligible', 'offered', 'accepted', 'laoli_away', 'returning', 'completed'],
    tags: ['mainline', 'laoli', 'pet'],
    updatedAt: now,
    triggers: [
      {
        id: 'laoli_house_ready',
        fromState: 'locked',
        when: [
          { skill: 'condition.has_house_resident', args: { npcId: 'laoli' } },
          { skill: 'condition.pet_not_exists', args: { petId: 'laoli_cat' } },
        ],
        then: [
          { skill: 'action.set_quest_state', args: { questId: 'laoli_cat_homecoming', state: 'eligible' } },
          {
            skill: 'action.add_npc_memory',
            args: { npcId: 'laoli', text: '我终于有了自己的房子，也许可以把猫接过来了。', importance: 7 },
          },
        ],
      },
    ],
    events: {
      offer_to_player: [
        {
          skill: 'dialogue.approach_choice',
          args: {
            npcId: 'laoli',
            prompt: '我想回去把猫接过来。你愿意帮我看着点新家吗？',
            cameraDurationMs: 650,
            promptDurationMs: 2600,
            timeoutMs: 8000,
            choices: [
              {
                id: 'accept',
                label: '我帮你看着',
                reply: '谢谢你，我这就去车站。',
                nextEvent: 'accepted_departure',
                effects: [
                  { skill: 'action.set_quest_state', args: { questId: 'laoli_cat_homecoming', state: 'accepted' } },
                ],
              },
              {
                id: 'decline',
                label: '今天不太方便',
                reply: '没关系，我晚点再来问你。',
                effects: [
                  { skill: 'action.set_quest_state', args: { questId: 'laoli_cat_homecoming', state: 'eligible' } },
                ],
              },
            ],
            timeoutChoiceId: 'decline',
          },
        },
      ],
      accepted_departure: [
        {
          skill: 'director.begin_event',
          args: {
            eventId: 'accepted_departure',
            phase: 'preparing_to_leave',
            participants: ['player', 'laoli'],
            locks: ['laoli'],
            reason: 'laoli prepares to leave the village to fetch his cat',
          },
        },
        { skill: 'action.set_quest_state', args: { questId: 'laoli_cat_homecoming', state: 'laoli_away', dueInTicks: 500 } },
        { skill: 'action.ensure_npc_in_world', args: { npcId: 'laoli', worldId: 'world:village', timeoutMs: 12000 } },
        { skill: 'director.set_phase', args: { eventId: 'accepted_departure', phase: 'waiting_for_player_in_village' } },
        { skill: 'sequence.wait_for_player_world', args: { worldId: 'world:village', timeoutMs: 30000, pollMs: 250 } },
        { skill: 'director.set_phase', args: { eventId: 'accepted_departure', phase: 'bus_departure' } },
        { skill: 'camera.pan_to', args: { target: 'bus_station', durationMs: 900 } },
        { skill: 'vehicle.spawn_bus', args: { vehicleId: 'laoli_departure_bus' } },
        { skill: 'vehicle.move_bus_to_station', args: { vehicleId: 'laoli_departure_bus', durationMs: 3200 } },
        { skill: 'vehicle.open_bus_door', args: { vehicleId: 'laoli_departure_bus' } },
        {
          skill: 'vehicle.pick_up_passengers',
          args: {
            vehicleId: 'laoli_departure_bus',
            passengers: ['laoli'],
            target: 'bus_exit',
            timeoutMs: 12000,
            boardDelayMs: 700,
            direction: 'left',
            durationMs: 5200,
          },
        },
        { skill: 'director.end_event', args: { eventId: 'accepted_departure' } },
      ],
      return_with_cat: [
        {
          skill: 'director.begin_event',
          args: {
            eventId: 'return_with_cat',
            phase: 'bus_returning',
            participants: ['player', 'laoli', 'laoli_cat'],
            locks: ['laoli'],
            reason: 'laoli returns with his cat',
          },
        },
        { skill: 'action.set_quest_state', args: { questId: 'laoli_cat_homecoming', state: 'returning' } },
        { skill: 'camera.pan_to', args: { target: 'bus_station', durationMs: 900 } },
        { skill: 'vehicle.spawn_bus', args: { vehicleId: 'laoli_return_bus' } },
        { skill: 'vehicle.move_bus_to_station', args: { vehicleId: 'laoli_return_bus', durationMs: 3200 } },
        { skill: 'vehicle.open_bus_door', args: { vehicleId: 'laoli_return_bus' } },
        { skill: 'director.set_phase', args: { eventId: 'return_with_cat', phase: 'cat_arrival' } },
        {
          skill: 'vehicle.drop_off_passengers',
          args: {
            vehicleId: 'laoli_return_bus',
            passengers: ['laoli'],
            target: 'bus_exit',
            staggerMs: 850,
            spacing: 42,
            offsetY: 28,
          },
        },
        { skill: 'action.spawn_pet', args: { petId: 'laoli_cat', ownerNpcId: 'laoli', entityId: 'pet_laoli_cat' } },
        { skill: 'action.set_pet_home', args: { petId: 'laoli_cat', homeOfNpcId: 'laoli' } },
        {
          skill: 'action.add_pet_memory',
          args: { petId: 'laoli_cat', text: '坐大巴来到老李的新家，记住这里有熟悉的人和安全的门口。', importance: 8 },
        },
        {
          skill: 'action.add_npc_memory',
          args: { npcId: 'laoli', text: '我把猫接到了新家，它以后会和我一起住在这里。', importance: 9 },
        },
        { skill: 'director.set_phase', args: { eventId: 'return_with_cat', phase: 'aftermath' } },
        { skill: 'action.set_quest_state', args: { questId: 'laoli_cat_homecoming', state: 'completed' } },
        { skill: 'vehicle.close_bus_door', args: { vehicleId: 'laoli_return_bus' } },
        { skill: 'vehicle.move_bus_offscreen', args: { vehicleId: 'laoli_return_bus', direction: 'left', durationMs: 5200 } },
        { skill: 'vehicle.despawn_bus', args: { vehicleId: 'laoli_return_bus' } },
        { skill: 'director.end_event', args: { eventId: 'return_with_cat' } },
      ],
    },
  };
}

function getCurrentDefinition(draft) {
  const currentRevision = (draft.revisions || []).find((revision) => revision.id === draft.currentRevisionId)
    || (draft.revisions || [])[draft.revisions.length - 1];
  return currentRevision?.definition || null;
}

function flattenSteps(steps) {
  return steps.filter(Boolean);
}

function toStorylineId(title) {
  const normalized = String(title || 'storyline')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || `storyline_${Date.now()}`;
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  applyStorylineChatEdit,
  compileDraftDefinition,
  iterateStorylineDraft,
  reviewStorylineDefinition,
};
