const createSystemRouteMiddlewares = require('./shared/createSystemRouteMiddlewares');

/**
 * Daily Quest Routes
 *
 * Owner endpoints:
 *   GET  /:systemId/daily-quests/settings          — get settings
 *   PATCH/:systemId/daily-quests/settings          — update settings
 *   GET  /:systemId/daily-quests/pool              — list quest pool
 *   POST /:systemId/daily-quests/pool              — create quest
 *   PATCH/:systemId/daily-quests/pool/:questId     — update quest
 *   DELETE/:systemId/daily-quests/pool/:questId    — delete quest
 *
 * Member endpoints:
 *   GET  /:systemId/member/daily-quests            — get today's quests (auto-generate)
 *   POST /:systemId/member/daily-quests/:questId/complete — complete a quest
 */

function getTodayDateStr() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function pickRandom(arr, n) {
    const shuffled = [...arr].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(n, shuffled.length));
}

function registerSystemDailyQuestRoutes(router, deps) {
    const {
        authenticateToken,
        Profile,
        findSystemForUser,
        findSystemForParticipant,
        findMemberByUserId,
        applyTaskRewardsToProfile,
        emitSystemUpdateEvent,
    } = deps;

    const {
        loadOwnerSystem,
        loadParticipantSystem,
        requireMember,
    } = createSystemRouteMiddlewares({
        findSystemForUser,
        findSystemForParticipant,
        findMemberByUserId,
    });

    // ── Owner: get settings ──────────────────────────────────────────────────
    router.get('/:systemId/daily-quests/settings', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { system } = req;
            return res.json({
                success: true,
                settings: system.dailyQuestSettings || { dailyCount: 3, enabled: true },
            });
        } catch (err) {
            return res.status(500).json({ message: err.message });
        }
    });

    // ── Owner: update settings ───────────────────────────────────────────────
    router.patch('/:systemId/daily-quests/settings', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { system } = req;
            const { dailyCount, enabled } = req.body;

            if (!system.dailyQuestSettings) {
                system.dailyQuestSettings = { dailyCount: 3, enabled: true };
            }

            if (dailyCount !== undefined) {
                const n = Number(dailyCount);
                if (!Number.isInteger(n) || n < 1 || n > 20) {
                    return res.status(400).json({ message: 'dailyCount must be an integer between 1 and 20.' });
                }
                system.dailyQuestSettings.dailyCount = n;
            }
            if (enabled !== undefined) {
                system.dailyQuestSettings.enabled = Boolean(enabled);
            }

            system.markModified('dailyQuestSettings');
            await system.save();

            emitSystemUpdateEvent?.(String(system._id), {
                type: 'daily_quest_settings_updated',
                settings: system.dailyQuestSettings,
            });

            return res.json({ success: true, settings: system.dailyQuestSettings });
        } catch (err) {
            return res.status(500).json({ message: err.message });
        }
    });

    // ── Owner: list quest pool ───────────────────────────────────────────────
    router.get('/:systemId/daily-quests/pool', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            return res.json({ success: true, pool: req.system.dailyQuestPool || [] });
        } catch (err) {
            return res.status(500).json({ message: err.message });
        }
    });

    // ── Owner: create quest ──────────────────────────────────────────────────
    router.post('/:systemId/daily-quests/pool', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { system } = req;
            const { title, description, rewards, isUnlimited, maxCompletions, isActive } = req.body;

            if (!title || !String(title).trim()) {
                return res.status(400).json({ message: 'title is required.' });
            }

            if (!system.dailyQuestPool) system.dailyQuestPool = [];

            system.dailyQuestPool.push({
                title: String(title).trim(),
                description: String(description || ''),
                rewards: rewards || { experience: [], coins: 0, items: [], unlockMissions: [] },
                isUnlimited: Boolean(isUnlimited),
                maxCompletions: Math.max(1, Number(maxCompletions) || 1),
                totalCompletions: 0,
                isActive: isActive !== false,
            });

            await system.save();

            emitSystemUpdateEvent?.(String(system._id), {
                type: 'daily_quest_pool_updated',
                pool: system.dailyQuestPool,
            });

            return res.json({ success: true, pool: system.dailyQuestPool });
        } catch (err) {
            return res.status(500).json({ message: err.message });
        }
    });

    // ── Owner: update quest ──────────────────────────────────────────────────
    router.patch('/:systemId/daily-quests/pool/:questId', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { system } = req;
            const { questId } = req.params;
            const quest = system.dailyQuestPool?.id(questId);

            if (!quest) {
                return res.status(404).json({ message: 'Quest not found.' });
            }

            const { title, description, rewards, isUnlimited, maxCompletions, isActive } = req.body;

            if (title !== undefined) quest.title = String(title).trim();
            if (description !== undefined) quest.description = String(description);
            if (rewards !== undefined) quest.rewards = rewards;
            if (isUnlimited !== undefined) quest.isUnlimited = Boolean(isUnlimited);
            if (maxCompletions !== undefined) quest.maxCompletions = Math.max(1, Number(maxCompletions) || 1);
            if (isActive !== undefined) quest.isActive = Boolean(isActive);

            system.markModified('dailyQuestPool');
            await system.save();

            emitSystemUpdateEvent?.(String(system._id), {
                type: 'daily_quest_pool_updated',
                pool: system.dailyQuestPool,
            });

            return res.json({ success: true, pool: system.dailyQuestPool });
        } catch (err) {
            return res.status(500).json({ message: err.message });
        }
    });

    // ── Owner: delete quest ──────────────────────────────────────────────────
    router.delete('/:systemId/daily-quests/pool/:questId', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { system } = req;
            const { questId } = req.params;
            const quest = system.dailyQuestPool?.id(questId);

            if (!quest) {
                return res.status(404).json({ message: 'Quest not found.' });
            }

            quest.deleteOne();
            await system.save();

            emitSystemUpdateEvent?.(String(system._id), {
                type: 'daily_quest_pool_updated',
                pool: system.dailyQuestPool,
            });

            return res.json({ success: true, pool: system.dailyQuestPool });
        } catch (err) {
            return res.status(500).json({ message: err.message });
        }
    });

    // ── Member: get today's daily quests (auto-generate) ────────────────────
    router.get('/:systemId/member/daily-quests', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { system, member } = req;
            const today = getTodayDateStr();

            const settings = system.dailyQuestSettings || { dailyCount: 3, enabled: true };

            if (!settings.enabled) {
                return res.json({ success: true, quests: [], date: today, message: '每日任务功能未开启' });
            }

            // Check if today's quests already generated
            let todayStatus = (member.dailyQuestStatus || []).find(s => s.date === today);

            if (!todayStatus) {
                // Draw random quests from active pool
                const activePool = (system.dailyQuestPool || []).filter(q => q.isActive);
                const drawn = pickRandom(activePool, settings.dailyCount);

                const quests = drawn.map(q => ({
                    questId: String(q._id),
                    title: q.title,
                    description: q.description,
                    rewards: q.rewards,
                    isUnlimited: q.isUnlimited,
                    maxCompletions: q.maxCompletions,
                    completedCount: 0,
                    completed: false,
                }));

                if (!member.dailyQuestStatus) member.dailyQuestStatus = [];
                member.dailyQuestStatus.push({ date: today, quests });
                // Keep only last 7 days
                if (member.dailyQuestStatus.length > 7) {
                    member.dailyQuestStatus.splice(0, member.dailyQuestStatus.length - 7);
                }

                system.markModified('members');
                await system.save();

                return res.json({ success: true, quests, date: today });
            }

            return res.json({ success: true, quests: todayStatus.quests, date: today });
        } catch (err) {
            return res.status(500).json({ message: err.message });
        }
    });

    // ── Member: complete a daily quest ───────────────────────────────────────
    router.post('/:systemId/member/daily-quests/:questId/complete', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { system, member } = req;
            const { questId } = req.params;
            const today = getTodayDateStr();

            const todayStatus = (member.dailyQuestStatus || []).find(s => s.date === today);
            if (!todayStatus) {
                return res.status(400).json({ message: '今日任务尚未生成，请先获取每日任务。' });
            }

            const questStatus = todayStatus.quests.find(q => q.questId === questId);
            if (!questStatus) {
                return res.status(404).json({ message: '任务不在今日列表中。' });
            }

            if (questStatus.completed && !questStatus.isUnlimited) {
                return res.status(400).json({ message: '该任务今日已完成。' });
            }

            if (!questStatus.isUnlimited && questStatus.completedCount >= questStatus.maxCompletions) {
                return res.status(400).json({ message: '该任务已达到今日完成上限。' });
            }

            // Apply rewards
            const profile = await Profile.findById(member.profile);
            if (!profile) {
                return res.status(404).json({ message: 'Profile not found.' });
            }

            await applyTaskRewardsToProfile({
                profileId: member.profile,
                system,
                rewards: questStatus.rewards || {},
            });

            // Update quest status
            questStatus.completedCount += 1;
            if (!questStatus.isUnlimited && questStatus.completedCount >= questStatus.maxCompletions) {
                questStatus.completed = true;
            }

            // Increment global pool counter
            const poolQuest = system.dailyQuestPool?.id(questId);
            if (poolQuest) {
                poolQuest.totalCompletions = (poolQuest.totalCompletions || 0) + 1;
                system.markModified('dailyQuestPool');
            }

            system.markModified('members');
            await system.save();

            emitSystemUpdateEvent?.(String(system._id), {
                type: 'daily_quest_completed',
                memberUserId: String(req.user.id),
                questId,
                questTitle: questStatus.title,
            });

            return res.json({
                success: true,
                quests: todayStatus.quests,
                rewards: questStatus.rewards,
            });
        } catch (err) {
            return res.status(500).json({ message: err.message });
        }
    });
}

module.exports = registerSystemDailyQuestRoutes;
