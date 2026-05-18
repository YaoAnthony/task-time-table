const { v4: uuidv4 } = require('uuid');
const { deleteDraftFile, listDraftFiles, readDraftFile, writeDraftFile } = require('./storylineFileStore');

const drafts = new Map();

function createDraft({ userId, title = '未命名剧情' }) {
  const now = new Date().toISOString();
  const draft = normalizeDraft({
    id: `draft_${uuidv4()}`,
    userId: String(userId),
    title,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: `msg_${uuidv4()}`,
        role: 'assistant',
        content: '我们先把剧情目标说清楚：触发条件是什么、哪些角色参与、演出要发生什么、最后要写入哪些记忆？',
        createdAt: now,
      },
    ],
    revisions: [],
    currentRevisionId: null,
  });
  saveDraft(draft);
  return cloneDraft(draft);
}

function createDraftFromDefinition({ userId, definition }) {
  const now = new Date().toISOString();
  const review = null;
  const revision = createRevision({ definition, review, source: 'import' });
  const draft = normalizeDraft({
    id: `draft_${uuidv4()}`,
    userId: String(userId),
    title: definition.title || definition.id || '导入剧情',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
    messages: [
      {
        id: `msg_${uuidv4()}`,
        role: 'assistant',
        content: `已导入已发布剧情 **${definition.title || definition.id}**。你可以直接修改 JSON，或者继续让我迭代。`,
        createdAt: now,
      },
    ],
    revisions: [revision],
    currentRevisionId: revision.id,
  });
  saveDraft(draft);
  return cloneDraft(draft);
}

function listDrafts(userId) {
  const fileDrafts = listDraftFiles(userId).map(normalizeDraft);
  for (const draft of fileDrafts) drafts.set(draft.id, draft);
  return [...dedupeDrafts([...drafts.values(), ...fileDrafts]).values()]
    .filter((draft) => draft.userId === String(userId))
    .filter((draft) => draft.status !== 'deleted')
    .map(cloneDraftSummary)
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function getDraft(userId, draftId) {
  const draft = getCachedOrStoredDraft(draftId);
  if (!draft || draft.status === 'deleted' || draft.userId !== String(userId)) return null;
  return cloneDraft(draft);
}

function appendMessage(userId, draftId, message) {
  const draft = getCachedOrStoredDraft(draftId);
  if (!draft || draft.status === 'deleted' || draft.userId !== String(userId)) return null;
  const entry = {
    id: `msg_${uuidv4()}`,
    role: message.role,
    content: String(message.content || ''),
    contextLabel: message.contextLabel ? String(message.contextLabel) : undefined,
    createdAt: new Date().toISOString(),
  };
  draft.messages.push(entry);
  draft.updatedAt = entry.createdAt;
  saveDraft(draft);
  return cloneDraft(draft);
}

function appendAssistantMessage(userId, draftId, content) {
  return appendMessage(userId, draftId, { role: 'assistant', content });
}

function addDraftRevision(userId, draftId, { definition, review = null, source = 'manual' }) {
  const draft = getCachedOrStoredDraft(draftId);
  if (!draft || draft.status === 'deleted' || draft.userId !== String(userId)) return null;
  const revision = createRevision({ definition, review, source });
  draft.revisions.push(revision);
  draft.currentRevisionId = revision.id;
  draft.title = definition.title || draft.title;
  draft.updatedAt = revision.createdAt;
  saveDraft(draft);
  return cloneDraft(draft);
}

function updateDraftDefinition(userId, draftId, definition) {
  return addDraftRevision(userId, draftId, { definition, source: 'manual_edit' });
}

function updateDraftReview(userId, draftId, review) {
  const draft = getCachedOrStoredDraft(draftId);
  if (!draft || draft.status === 'deleted' || draft.userId !== String(userId)) return null;
  const current = getCurrentRevision(draft);
  if (!current) return null;
  current.review = review;
  current.score = review?.score ?? current.score ?? 0;
  draft.updatedAt = new Date().toISOString();
  saveDraft(draft);
  return cloneDraft(draft);
}

function deleteDraft(userId, draftId) {
  const draft = getCachedOrStoredDraft(draftId);
  if (!draft || draft.status === 'deleted' || draft.userId !== String(userId)) return false;
  draft.status = 'deleted';
  draft.deletedAt = new Date().toISOString();
  saveDraft(draft);
  drafts.delete(String(draftId));
  try {
    deleteDraftFile(draftId);
  } catch (err) {
    console.warn(`[StorylineDraftService] Failed to remove draft file ${draftId}:`, err.message);
  }
  return true;
}

function getCachedOrStoredDraft(draftId) {
  let draft = drafts.get(String(draftId));
  if (!draft) {
    draft = readDraftFile(draftId);
    if (draft) {
      draft = normalizeDraft(draft);
      drafts.set(draft.id, draft);
    }
  }
  return draft;
}

function saveDraft(draft) {
  const normalized = normalizeDraft(draft);
  drafts.set(normalized.id, normalized);
  writeDraftFile(normalized);
}

function normalizeDraft(draft) {
  const normalized = {
    ...draft,
    userId: String(draft.userId),
    messages: Array.isArray(draft.messages) ? draft.messages : [],
    revisions: Array.isArray(draft.revisions) ? draft.revisions : [],
    currentRevisionId: draft.currentRevisionId || null,
  };
  if (!normalized.currentRevisionId && normalized.revisions.length > 0) {
    normalized.currentRevisionId = normalized.revisions[normalized.revisions.length - 1].id;
  }
  return normalized;
}

function createRevision({ definition, review, source }) {
  const now = new Date().toISOString();
  return {
    id: `rev_${uuidv4()}`,
    source,
    definition: cloneJsonValue(definition),
    review: review ? cloneJsonValue(review) : null,
    score: review?.score ?? null,
    createdAt: now,
  };
}

function getCurrentRevision(draft) {
  if (!draft.currentRevisionId) return draft.revisions[draft.revisions.length - 1] || null;
  return draft.revisions.find((revision) => revision.id === draft.currentRevisionId) || null;
}

function dedupeDrafts(items) {
  const byId = new Map();
  for (const draft of items) {
    if (!draft?.id) continue;
    byId.set(draft.id, normalizeDraft(draft));
  }
  return byId;
}

function cloneDraftSummary(draft) {
  const currentRevision = getCurrentRevision(draft);
  return {
    id: draft.id,
    title: draft.title,
    status: draft.status,
    createdAt: draft.createdAt,
    updatedAt: draft.updatedAt,
    currentRevisionId: draft.currentRevisionId,
    revisionCount: draft.revisions.length,
    score: currentRevision?.score ?? null,
  };
}

function cloneDraft(draft) {
  return {
    ...cloneDraftSummary(draft),
    messages: draft.messages.map((message) => ({ ...message })),
    revisions: draft.revisions.map((revision) => cloneJsonValue(revision)),
  };
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  addDraftRevision,
  appendAssistantMessage,
  appendMessage,
  createDraft,
  createDraftFromDefinition,
  deleteDraft,
  getDraft,
  listDrafts,
  updateDraftDefinition,
  updateDraftReview,
};
