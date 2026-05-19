const createSystemRouteMiddlewares = require('./shared/createSystemRouteMiddlewares');
const profileEventBus = require('./shared/profileEventBus');
const {
    loadOrCreateGameSave,
    persistGameSave,
    getChests,
    setChests,
} = require('../../shared/gameSaveService');

function registerSystemMemberTaskRoutes(router, deps) {
    const {
        authenticateToken,
        findSystemForParticipant,
        findSystemForUser,
        findMemberByUserId,
        findMissionListById,
        findMemberMissionListState,
        hasMemberCompletedNode,
        hasMemberFailedNode,
        normalizeAttributeName,
        applyTaskRewardsToProfile,
        applyMissionFailurePenaltyToProfile,
        findNodeByNodeId,
        emitSystemTaskEvent,
        Profile,   // injected so we can load/save profile for chest creation
    } = deps;

    const {
        loadParticipantSystem,
        requireMember,
    } = createSystemRouteMiddlewares({
        findSystemForUser,
        findSystemForParticipant,
        findMemberByUserId,
    });

    const getNodePrerequisiteIds = (node) => {
        const ids = [];
        if (node.parentNodeId) ids.push(node.parentNodeId);
        if (Array.isArray(node.prerequisiteNodeIds)) ids.push(...node.prerequisiteNodeIds);
        return [...new Set(ids.filter(Boolean))];
    };

    const cloneRewardEntries = (entries = []) => entries.map((entry) => ({ ...entry }));

    const getMergeNodeMeta = (node) => {
        const prerequisiteNodeIds = getNodePrerequisiteIds(node);
        const mergeSourceCount = prerequisiteNodeIds.length;
        const isMergeNode = mergeSourceCount > 1;
        const nodeRewards = node?.rewards || {};

        if (!isMergeNode) {
            return {
                isMergeNode: false,
                mergeSourceCount,
                mergeTier: null,
                bonusCoins: 0,
                bonusExperience: [],
            };
        }

        const mergeTier = mergeSourceCount >= 3 ? 'boss' : 'milestone';
        const baseCoins = Number(nodeRewards.coins || 0);
        const bonusCoins = Math.max(
            mergeTier === 'boss' ? 80 : 40,
            Math.round(baseCoins * (mergeTier === 'boss' ? 0.8 : 0.5)) + (mergeSourceCount - 1) * 25,
        );
        const bonusExperience = cloneRewardEntries(nodeRewards.experience || []).map((entry) => ({
            ...entry,
            value: Math.max(1, Math.round(Number(entry.value || 0) * (mergeTier === 'boss' ? 0.5 : 0.25))),
        })).filter((entry) => entry.value > 0);

        return {
            isMergeNode,
            mergeSourceCount,
            mergeTier,
            bonusCoins,
            bonusExperience,
        };
    };

    router.get('/:systemId/member/tasks', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { system, member } = req;

            const missionLists = (system.missionLists || []).map((list) => {
                const listState = findMemberMissionListState(member, list._id);
                const accepted = !!listState;
                const hasFailed = !!listState?.hasFailed;

                const nodes = (list.taskTree || []).map((node) => {
                    const completed = hasMemberCompletedNode(member, list._id, node.nodeId);
                    const failed = !completed && hasMemberFailedNode(member, list._id, node.nodeId);
                    const isActive = member.activeTask
                        && String(member.activeTask.missionListId) === String(list._id)
                        && member.activeTask.nodeId === node.nodeId;

                    const prerequisiteNodeIds = getNodePrerequisiteIds(node);
                    const mergeMeta = getMergeNodeMeta(node);
                    const blockedByNodeIds = prerequisiteNodeIds.filter(
                        (prerequisiteNodeId) => !hasMemberCompletedNode(member, list._id, prerequisiteNodeId)
                    );
                    const blockedByTitles = blockedByNodeIds.map((blockedNodeId) => {
                        const blockedNode = findNodeByNodeId(list, blockedNodeId);
                        return blockedNode?.title || blockedNodeId;
                    });
                    const completedPrerequisiteNodeIds = prerequisiteNodeIds.filter(
                        (prerequisiteNodeId) => hasMemberCompletedNode(member, list._id, prerequisiteNodeId)
                    );
                    const completedPrerequisiteTitles = completedPrerequisiteNodeIds.map((completedNodeId) => {
                        const completedNode = findNodeByNodeId(list, completedNodeId);
                        return completedNode?.title || completedNodeId;
                    });
                    const canStart = accepted && !hasFailed && !completed && !failed && !isActive && blockedByNodeIds.length === 0 && !member.activeTask;
                    const canRestart = accepted && !hasFailed && failed && !isActive && !member.activeTask && !!node.allowRetryAfterFailure;

                    return {
                        nodeId: node.nodeId,
                        parentNodeId: node.parentNodeId,
                        prerequisiteNodeIds,
                        title: node.title,
                        description: node.description,
                        content: node.content,
                        notice: node.notice,
                        timeCostMinutes: node.timeCostMinutes,
                        canInterrupt: node.canInterrupt,
                        rewards: node.rewards,
                        childrenNodeIds: node.childrenNodeIds || [],
                        completed,
                        failed,
                        isActive,
                        isLocked: !completed && !failed && !isActive && blockedByNodeIds.length > 0,
                        blockedByNodeIds,
                        blockedByTitles,
                        completedPrerequisiteNodeIds,
                        completedPrerequisiteTitles,
                        totalPrerequisiteCount: prerequisiteNodeIds.length,
                        completedPrerequisiteCount: completedPrerequisiteNodeIds.length,
                        remainingPrerequisiteCount: blockedByNodeIds.length,
                        isMergeNode: mergeMeta.isMergeNode,
                        mergeSourceCount: mergeMeta.mergeSourceCount,
                        mergeTier: mergeMeta.mergeTier,
                        mergeBonusPreview: mergeMeta.isMergeNode
                            ? {
                                coins: mergeMeta.bonusCoins,
                                experience: mergeMeta.bonusExperience,
                              }
                            : null,
                        canStart,
                        canRestart,
                    };
                });

                return {
                    _id: list._id,
                    listType: list.listType,
                    title: list.title,
                    image: list.image,
                    description: list.description,
                    unlockCondition: list.unlockCondition,
                    accepted,
                    hasFailed,
                    completedAt: listState?.completedAt || null,
                    nodes,
                };
            });

            return res.json({
                success: true,
                missionLists,
                activeTask: member.activeTask || null,
                history: member.taskHistory || [],
                completedCount: (member.taskCompletions || []).length,
            });
        } catch (error) {
            console.error('Get member task center error:', error);
            return res.status(500).json({ message: 'Failed to get member tasks', error: error.message });
        }
    });

    router.post('/:systemId/member/mission-lists/:missionListId/accept', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { missionListId } = req.params;
            const { system, profile, member } = req;

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            const missionList = missionResult.list;
            const exists = findMemberMissionListState(member, missionList._id);
            if (exists) {
                return res.status(400).json({ message: 'Mission list already accepted.' });
            }

            if (missionList.unlockCondition?.type === 'attributeLevel') {
                const key = normalizeAttributeName(missionList.unlockCondition.attributeName);
                if (!key) {
                    return res.status(400).json({ message: 'Unlock condition attribute is invalid.' });
                }
                const requiredLevel = Number(missionList.unlockCondition.minLevel || 0);
                const currentLevel = Number(profile.attributes?.[key]?.level || 0);
                if (currentLevel < requiredLevel) {
                    return res.status(400).json({ message: `Unlock requires ${missionList.unlockCondition.attributeName} level >= ${requiredLevel}.` });
                }
            }

            member.acceptedMissionLists.push({
                missionListId: missionList._id,
                acceptedAt: new Date().toISOString(),
                hasFailed: false,
                completedAt: null,
            });

            member.taskHistory.push({
                eventType: 'accept_list',
                missionListId: missionList._id,
                nodeId: null,
                taskTitle: missionList.title,
                timestamp: new Date().toISOString(),
            });

            await system.save();

            emitSystemTaskEvent(String(system._id), {
                type: 'member_accept_list',
                systemId: String(system._id),
                memberUserId: String(member.user),
                memberProfileId: String(member.profile),
                missionListId: String(missionList._id),
                missionListTitle: missionList.title,
                timestamp: new Date().toISOString(),
            });

            return res.status(201).json({ success: true, missionListId: missionList._id });
        } catch (error) {
            console.error('Accept mission list error:', error);
            return res.status(500).json({ message: 'Failed to accept mission list', error: error.message });
        }
    });

    router.post('/:systemId/member/mission-lists/:missionListId/nodes/:nodeId/start', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { missionListId, nodeId } = req.params;
            const { system, member } = req;

            if (member.activeTask) {
                return res.status(400).json({ message: 'You already have an active task. Complete it first.' });
            }

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            const missionList = missionResult.list;
            const listState = findMemberMissionListState(member, missionList._id);
            if (!listState) {
                return res.status(400).json({ message: 'Please accept this mission list first.' });
            }
            if (listState.hasFailed) {
                return res.status(400).json({ message: 'This mission list has failed for you. Rejoin is required.' });
            }

            const node = findNodeByNodeId(missionList, nodeId);
            if (!node) {
                return res.status(404).json({ message: 'Task node not found.' });
            }

            if (hasMemberCompletedNode(member, missionList._id, node.nodeId)) {
                return res.status(400).json({ message: 'Task already completed.' });
            }

            const blockedByNodeIds = getNodePrerequisiteIds(node).filter(
                (prerequisiteNodeId) => !hasMemberCompletedNode(member, missionList._id, prerequisiteNodeId)
            );
            if (blockedByNodeIds.length > 0) {
                return res.status(400).json({
                    message: 'Prerequisite tasks must be completed first.',
                    blockedByNodeIds,
                });
            }

            member.activeTask = {
                missionListId: missionList._id,
                nodeId: node.nodeId,
                startedAt: new Date().toISOString(),
            };

            member.taskHistory.push({
                eventType: 'start_task',
                missionListId: missionList._id,
                nodeId: node.nodeId,
                taskTitle: node.title,
                timestamp: new Date().toISOString(),
            });

            await system.save();

            emitSystemTaskEvent(String(system._id), {
                type: 'member_start_task',
                systemId: String(system._id),
                memberUserId: String(member.user),
                memberProfileId: String(member.profile),
                missionListId: String(missionList._id),
                missionListTitle: missionList.title,
                nodeId: node.nodeId,
                nodeTitle: node.title,
                startedAt: new Date().toISOString(),
            });

            return res.status(201).json({
                success: true,
                activeTask: member.activeTask,
                node: {
                    nodeId: node.nodeId,
                    title: node.title,
                    description: node.description,
                    content: node.content,
                    notice: node.notice,
                    timeCostMinutes: node.timeCostMinutes,
                },
            });
        } catch (error) {
            console.error('Start member task error:', error);
            return res.status(500).json({ message: 'Failed to start task', error: error.message });
        }
    });

    router.post('/:systemId/member/mission-lists/:missionListId/nodes/:nodeId/complete', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { missionListId, nodeId } = req.params;
            const { system, member } = req;

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            const missionList = missionResult.list;
            const node = findNodeByNodeId(missionList, nodeId);
            if (!node) {
                return res.status(404).json({ message: 'Task node not found.' });
            }

            if (!member.activeTask) {
                return res.status(400).json({ message: 'No active task to complete.' });
            }

            if (
                String(member.activeTask.missionListId) !== String(missionList._id)
                || member.activeTask.nodeId !== node.nodeId
            ) {
                return res.status(400).json({ message: 'Active task does not match this node.' });
            }

            if (hasMemberCompletedNode(member, missionList._id, node.nodeId)) {
                return res.status(400).json({ message: 'Task already completed.' });
            }

            const rewards = node.rewards || {};
            const mergeMeta = getMergeNodeMeta(node);
            const finalRewards = {
                ...rewards,
                coins: Number(rewards.coins || 0) + (mergeMeta.isMergeNode ? mergeMeta.bonusCoins : 0),
                experience: [
                    ...cloneRewardEntries(rewards.experience || []),
                    ...(mergeMeta.isMergeNode ? cloneRewardEntries(mergeMeta.bonusExperience) : []),
                ],
            };

            // Apply ONLY experience immediately; coins + items go into the chest
            await applyTaskRewardsToProfile({
                profileId: member.profile,
                system,
                rewards: { experience: finalRewards.experience || [] },
            });

            // ── Spawn treasure chest with coins + item rewards ─────────────
            let spawnedChest = null;
            try {
                const { v4: uuidv4 } = require('uuid');
                const profile = await Profile.findById(member.profile);
                if (profile) {
                    const chestItems = (finalRewards.items || []).map(r => {
                        const itemKey = String(r.itemKey || '').trim();
                        const prod = (system.storeProducts || []).find(p => String(p._id) === itemKey);
                        const obt  = (system.obtainableItems || []).find(i => i.itemKey === itemKey);
                        return {
                            inventoryKey: itemKey,
                            name:         prod?.name || obt?.name || itemKey,
                            description:  prod?.description || '',
                            rarity:       prod?.rarity || obt?.rarity || 'common',
                            imageUrl:     prod?.image || obt?.image || '',
                            quantity:     Math.max(1, Number(r.quantity || 1)),
                        };
                    });

                    const gameState = await loadOrCreateGameSave(String(member.user));
                    const playerSave = gameState.gameSave?.players?.[String(member.user)] || {};
                    const saved = playerSave.position || {};
                    const angle = Math.random() * Math.PI * 2;
                    const dist  = 150 + Math.random() * 250;
                    const cx = Math.round(Math.max(200, Math.min(2200, (saved.x || 400)  + Math.cos(angle) * dist)));
                    const cy = Math.round(Math.max(200, Math.min(1400, (saved.y || 1000) + Math.sin(angle) * dist)));

                    spawnedChest = {
                        id:        uuidv4(),
                        x:         cx,
                        y:         cy,
                        rewards:   { coins: Number(finalRewards.coins || 0), items: chestItems },
                        opened:    false,
                        createdAt: saved.gameTick || 0,
                    };

                    const chests = getChests(gameState.gameSave);
                    chests.push(spawnedChest);
                    setChests(gameState.gameSave, chests);
                    await persistGameSave({
                        profile: gameState.profile,
                        room: gameState.room,
                        gameSave: gameState.gameSave,
                        userId: String(member.user),
                        username: gameState.user?.username || gameState.user?.email || 'player',
                        roomId: gameState.roomId,
                    });

                    profileEventBus.emit(String(member.user), 'game_chest_spawned', { chest: spawnedChest });
                }
            } catch (chestErr) {
                console.error('Chest creation error (non-fatal):', chestErr.message);
            }

            member.taskCompletions.push({
                missionListId: missionList._id,
                nodeId: node.nodeId,
                completedAt: new Date().toISOString(),
                rewards: finalRewards,
            });

            member.taskHistory.push({
                eventType: 'complete_task',
                missionListId: missionList._id,
                nodeId: node.nodeId,
                taskTitle: node.title,
                timestamp: new Date().toISOString(),
                rewards: finalRewards,
            });

            member.activeTask = null;

            const listState = findMemberMissionListState(member, missionList._id);
            const allNodeIds = (missionList.taskTree || []).map((taskNode) => taskNode.nodeId);
            const completedNodeIds = new Set(
                (member.taskCompletions || [])
                    .filter((entry) => String(entry.missionListId) === String(missionList._id))
                    .map((entry) => entry.nodeId)
            );
            const allCompleted = allNodeIds.length > 0 && allNodeIds.every((id) => completedNodeIds.has(id));
            if (listState && allCompleted) {
                listState.completedAt = new Date().toISOString();
            }

            const unlockedMergeNodes = (missionList.taskTree || [])
                .filter((taskNode) => taskNode.nodeId !== node.nodeId)
                .filter((taskNode) => getMergeNodeMeta(taskNode).isMergeNode)
                .filter((taskNode) => !hasMemberCompletedNode(member, missionList._id, taskNode.nodeId))
                .filter((taskNode) => !hasMemberFailedNode(member, missionList._id, taskNode.nodeId))
                .filter((taskNode) => {
                    const prerequisiteNodeIds = getNodePrerequisiteIds(taskNode);
                    return prerequisiteNodeIds.includes(node.nodeId)
                        && prerequisiteNodeIds.every((prerequisiteNodeId) => completedNodeIds.has(prerequisiteNodeId));
                })
                .map((taskNode) => ({
                    nodeId: taskNode.nodeId,
                    title: taskNode.title,
                    mergeTier: getMergeNodeMeta(taskNode).mergeTier,
                }));

            await system.save();

            emitSystemTaskEvent(String(system._id), {
                type: 'member_complete_task',
                systemId: String(system._id),
                memberUserId: String(member.user),
                memberProfileId: String(member.profile),
                missionListId: String(missionList._id),
                missionListTitle: missionList.title,
                nodeId: node.nodeId,
                nodeTitle: node.title,
                rewards: finalRewards,
                completedAt: new Date().toISOString(),
            });

            return res.json({
                success: true,
                rewards: finalRewards,
                completedNodeId: node.nodeId,
                missionListCompleted: !!listState?.completedAt,
                mergeBonus: mergeMeta.isMergeNode
                    ? {
                        tier: mergeMeta.mergeTier,
                        coins: mergeMeta.bonusCoins,
                        experience: mergeMeta.bonusExperience,
                      }
                    : null,
                unlockedMergeNodes,
            });
        } catch (error) {
            console.error('Complete member task error:', error);
            return res.status(500).json({ message: 'Failed to complete task', error: error.message });
        }
    });

    router.post('/:systemId/member/mission-lists/:missionListId/nodes/:nodeId/fail', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { missionListId, nodeId } = req.params;
            const { system, member } = req;

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            const missionList = missionResult.list;
            const node = findNodeByNodeId(missionList, nodeId);
            if (!node) {
                return res.status(404).json({ message: 'Task node not found.' });
            }

            if (!member.activeTask) {
                return res.status(400).json({ message: 'No active task to fail.' });
            }

            if (
                String(member.activeTask.missionListId) !== String(missionList._id)
                || member.activeTask.nodeId !== node.nodeId
            ) {
                return res.status(400).json({ message: 'Active task does not match this node.' });
            }

            if (node.canInterrupt === false) {
                return res.status(400).json({ message: 'This task cannot be interrupted.' });
            }

            await applyMissionFailurePenaltyToProfile({
                profileId: member.profile,
                system,
                failureMechanism: missionList.failureMechanism,
            });

            member.activeTask = null;
            member.taskHistory.push({
                eventType: 'fail_task',
                missionListId: missionList._id,
                nodeId: node.nodeId,
                taskTitle: node.title,
                timestamp: new Date().toISOString(),
            });

            await system.save();

            emitSystemTaskEvent(String(system._id), {
                type: 'member_fail_task',
                systemId: String(system._id),
                memberUserId: String(member.user),
                memberProfileId: String(member.profile),
                missionListId: String(missionList._id),
                missionListTitle: missionList.title,
                nodeId: node.nodeId,
                nodeTitle: node.title,
                failedAt: new Date().toISOString(),
            });

            return res.json({ success: true, failedNodeId: node.nodeId });
        } catch (error) {
            console.error('Fail member task error:', error);
            return res.status(500).json({ message: 'Failed to fail task', error: error.message });
        }
    });

    router.post('/:systemId/member/mission-lists/:missionListId/nodes/:nodeId/restart', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { missionListId, nodeId } = req.params;
            const { system, member } = req;

            if (member.activeTask) {
                return res.status(400).json({ message: 'You already have an active task.' });
            }

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            const missionList = missionResult.list;
            const listState = findMemberMissionListState(member, missionList._id);
            if (!listState) {
                return res.status(400).json({ message: 'Please accept this mission list first.' });
            }
            if (listState.hasFailed) {
                return res.status(400).json({ message: 'This mission list has failed for you. Rejoin is required.' });
            }

            const node = findNodeByNodeId(missionList, nodeId);
            if (!node) {
                return res.status(404).json({ message: 'Task node not found.' });
            }

            if (!node.allowRetryAfterFailure) {
                return res.status(400).json({ message: 'This node does not allow retry.' });
            }

            if (!hasMemberFailedNode(member, missionList._id, node.nodeId)) {
                return res.status(400).json({ message: 'This task is not in failed state.' });
            }

            member.activeTask = {
                missionListId: missionList._id,
                nodeId: node.nodeId,
                startedAt: new Date().toISOString(),
            };

            member.taskHistory.push({
                eventType: 'start_task',
                missionListId: missionList._id,
                nodeId: node.nodeId,
                taskTitle: `${node.title} (重开)`,
                timestamp: new Date().toISOString(),
            });

            await system.save();

            emitSystemTaskEvent(String(system._id), {
                type: 'member_restart_task',
                systemId: String(system._id),
                memberUserId: String(member.user),
                memberProfileId: String(member.profile),
                missionListId: String(missionList._id),
                missionListTitle: missionList.title,
                nodeId: node.nodeId,
                nodeTitle: node.title,
                restartedAt: new Date().toISOString(),
            });

            return res.status(201).json({ success: true, activeTask: member.activeTask });
        } catch (error) {
            console.error('Restart member task error:', error);
            return res.status(500).json({ message: 'Failed to restart task', error: error.message });
        }
    });

    router.get('/:systemId/member/tasks/current', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { system, member } = req;

            if (!member.activeTask) {
                return res.json({ success: true, activeTask: null });
            }

            const missionResult = findMissionListById(system, member.activeTask.missionListId);
            const missionList = missionResult?.list;
            const node = missionList ? findNodeByNodeId(missionList, member.activeTask.nodeId) : null;

            return res.json({
                success: true,
                activeTask: {
                    missionListId: member.activeTask.missionListId,
                    missionListTitle: missionList?.title || '',
                    nodeId: member.activeTask.nodeId,
                    nodeTitle: node?.title || '',
                    description: node?.description || '',
                    timeCostMinutes: node?.timeCostMinutes || 0,
                    startedAt: member.activeTask.startedAt,
                },
            });
        } catch (error) {
            console.error('Get current task error:', error);
            return res.status(500).json({ message: 'Failed to get current task', error: error.message });
        }
    });

    router.get('/:systemId/member/tasks/history', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { member } = req;

            return res.json({
                success: true,
                history: (member.taskHistory || []).slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)),
            });
        } catch (error) {
            console.error('Get member task history error:', error);
            return res.status(500).json({ message: 'Failed to get member task history', error: error.message });
        }
    });
}

module.exports = registerSystemMemberTaskRoutes;
