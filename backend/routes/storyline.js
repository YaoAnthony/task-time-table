const express = require('express');
const authenticateToken = require('../middlewares/authenticateToken');
const {
  addDraftRevision,
  appendAssistantMessage,
  appendMessage,
  applyStorylineChatEdit,
  compileDraftDefinition,
  createDraft,
  createDraftFromDefinition,
  deleteDraft,
  deleteStoryline,
  generateStorylineAssistantReply,
  getDraft,
  getStorylinePackage,
  iterateStorylineDraft,
  listDrafts,
  listEnabledStorylines,
  listStorylineSkills,
  reviewStorylineDefinition,
  updateDraftDefinition,
  updateDraftReview,
} = require('../storylineCore');
const { writeStorylineDefinition } = require('../storylineCore/services/storylineFileStore');

const router = express.Router();

function sendError(res, err, fallback) {
  const status = Number(err.status || err.statusCode || 500);
  console.error(fallback, err);
  return res.status(status).json({ message: err.message || fallback, details: err.details });
}

router.get('/storylines', authenticateToken, async (_req, res) => {
  try {
    return res.json({
      success: true,
      storylines: listEnabledStorylines(),
      skills: listStorylineSkills(),
    });
  } catch (err) {
    return sendError(res, err, 'Failed to load storylines');
  }
});

router.delete('/storylines/:storylineId', authenticateToken, async (req, res) => {
  try {
    deleteStoryline(req.params.storylineId);
    return res.json({ success: true, storylines: listEnabledStorylines() });
  } catch (err) {
    return sendError(res, err, 'Failed to delete storyline');
  }
});

router.post('/storylines/:storylineId/import-draft', authenticateToken, async (req, res) => {
  try {
    const definition = getStorylinePackage(req.params.storylineId);
    if (!definition) return res.status(404).json({ message: 'Storyline not found' });
    const draft = createDraftFromDefinition({ userId: req.user.id, definition });
    return res.json({ success: true, draft });
  } catch (err) {
    return sendError(res, err, 'Failed to import storyline draft');
  }
});

router.get('/drafts', authenticateToken, async (req, res) => {
  try {
    return res.json({ success: true, drafts: listDrafts(req.user.id) });
  } catch (err) {
    return sendError(res, err, 'Failed to load storyline drafts');
  }
});

router.post('/drafts', authenticateToken, async (req, res) => {
  try {
    const draft = createDraft({
      userId: req.user.id,
      title: req.body?.title || '新剧情',
    });
    return res.json({ success: true, draft });
  } catch (err) {
    return sendError(res, err, 'Failed to create storyline draft');
  }
});

router.get('/drafts/:draftId', authenticateToken, async (req, res) => {
  try {
    const draft = getDraft(req.user.id, req.params.draftId);
    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    return res.json({ success: true, draft });
  } catch (err) {
    return sendError(res, err, 'Failed to load storyline draft');
  }
});

router.delete('/drafts/:draftId', authenticateToken, async (req, res) => {
  try {
    const deleted = deleteDraft(req.user.id, req.params.draftId);
    if (!deleted) return res.status(404).json({ message: 'Draft not found' });
    return res.json({ success: true, drafts: listDrafts(req.user.id) });
  } catch (err) {
    return sendError(res, err, 'Failed to delete storyline draft');
  }
});

router.post('/drafts/:draftId/messages', authenticateToken, async (req, res) => {
  try {
    const content = String(req.body?.content || '').trim();
    const context = normalizeMessageContext(req.body);
    if (!content) return res.status(400).json({ message: 'Message content is required' });
    let draft = appendMessage(req.user.id, req.params.draftId, { role: 'user', content, contextLabel: context.label });
    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    const edit = applyStorylineChatEdit(draft, content, context);
    if (edit.changed) {
      draft = addDraftRevision(req.user.id, req.params.draftId, {
        definition: edit.definition,
        review: edit.review,
        source: 'chat_edit',
      });
    }
    const reply = edit.reply || await generateStorylineAssistantReply({ draft, userMessage: buildUserMessageWithContext(content, context) });
    draft = appendMessage(req.user.id, req.params.draftId, { role: 'assistant', content: reply });
    return res.json({ success: true, draft });
  } catch (err) {
    return sendError(res, err, 'Failed to chat with storyline assistant');
  }
});

router.post('/drafts/:draftId/messages/stream', authenticateToken, async (req, res) => {
  try {
    const content = String(req.body?.content || '').trim();
    const context = normalizeMessageContext(req.body);
    if (!content) return res.status(400).json({ message: 'Message content is required' });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    let draft = appendMessage(req.user.id, req.params.draftId, { role: 'user', content, contextLabel: context.label });
    if (!draft) {
      writeSse(res, 'error', { message: 'Draft not found' });
      return res.end();
    }
    writeSse(res, 'draft', { draft });

    const edit = applyStorylineChatEdit(draft, content, context);
    if (edit.changed) {
      draft = addDraftRevision(req.user.id, req.params.draftId, {
        definition: edit.definition,
        review: edit.review,
        source: 'chat_edit',
      });
      writeSse(res, 'draft', { draft });
    }

    const reply = edit.reply || await generateStorylineAssistantReply({ draft, userMessage: buildUserMessageWithContext(content, context) });
    for (const chunk of chunkText(reply, 28)) {
      writeSse(res, 'token', { content: chunk });
      await delay(12);
    }

    draft = appendAssistantMessage(req.user.id, req.params.draftId, reply);
    writeSse(res, 'draft', { draft });
    writeSse(res, 'done', { ok: true });
    return res.end();
  } catch (err) {
    writeSse(res, 'error', { message: err.message || 'Failed to stream storyline assistant' });
    return res.end();
  }
});

router.post('/drafts/:draftId/iterate', authenticateToken, async (req, res) => {
  try {
    const draft = getDraft(req.user.id, req.params.draftId);
    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    const { definition, review, history } = iterateStorylineDraft(draft, String(req.body?.note || ''), Number(req.body?.maxPasses || 3));
    const updated = addDraftRevision(req.user.id, req.params.draftId, { definition, review, source: 'iteration' });
    return res.json({ success: true, draft: updated, definition, review, history });
  } catch (err) {
    return sendError(res, err, 'Failed to iterate storyline draft');
  }
});

router.post('/drafts/:draftId/review', authenticateToken, async (req, res) => {
  try {
    const draft = getDraft(req.user.id, req.params.draftId);
    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    const definition = req.body?.definition || getCurrentDefinitionFromDraft(draft);
    if (!definition) return res.status(400).json({ message: 'No storyline definition to review' });
    const review = reviewStorylineDefinition(definition);
    const updated = updateDraftReview(req.user.id, req.params.draftId, review);
    return res.json({ success: true, draft: updated || draft, review });
  } catch (err) {
    return sendError(res, err, 'Failed to review storyline draft');
  }
});

router.put('/drafts/:draftId/definition', authenticateToken, async (req, res) => {
  try {
    const definition = req.body?.definition;
    if (!definition || typeof definition !== 'object') {
      return res.status(400).json({ message: 'definition is required' });
    }
    const draft = updateDraftDefinition(req.user.id, req.params.draftId, definition);
    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    return res.json({ success: true, draft });
  } catch (err) {
    return sendError(res, err, 'Failed to update storyline definition');
  }
});

router.post('/drafts/:draftId/publish', authenticateToken, async (req, res) => {
  try {
    const draft = getDraft(req.user.id, req.params.draftId);
    if (!draft) return res.status(404).json({ message: 'Draft not found' });
    const definition = req.body?.definition || getCurrentDefinitionFromDraft(draft);
    if (!definition) return res.status(400).json({ message: 'No storyline definition to publish' });
    const compiled = {
      ...compileDraftDefinition(definition),
      status: 'enabled',
      updatedAt: new Date().toISOString(),
    };
    writeStorylineDefinition(compiled);
    const review = reviewStorylineDefinition(compiled);
    deleteDraft(req.user.id, req.params.draftId);
    return res.json({
      success: true,
      draftId: req.params.draftId,
      storyline: compiled,
      storylines: listEnabledStorylines(),
      drafts: listDrafts(req.user.id),
      review,
    });
  } catch (err) {
    return sendError(res, err, 'Failed to publish storyline');
  }
});

function getCurrentDefinitionFromDraft(draft) {
  const revision = draft.revisions?.find((item) => item.id === draft.currentRevisionId)
    || draft.revisions?.[draft.revisions.length - 1];
  return revision?.definition || null;
}

function normalizeMessageContext(body) {
  const label = String(body?.contextLabel || '').trim();
  const text = String(body?.context || '').trim();
  return label && text ? { label, text } : { label: '', text: '' };
}

function buildUserMessageWithContext(content, context) {
  if (!context.text) return content;
  return [
    `用户正在针对「${context.label}」提问。`,
    '',
    '<selected_storyline_context>',
    context.text,
    '</selected_storyline_context>',
    '',
    `用户问题：${content}`,
  ].join('\n');
}

function writeSse(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function chunkText(text, size) {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = router;
