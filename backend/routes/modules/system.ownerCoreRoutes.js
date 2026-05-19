const {
    syncNodeParentDependency,
    removeDeletedNodeReferences,
    validateMissionGraphAcyclic,
} = require('./shared/systemTaskGraphUtils');
const { createObjectId } = require('../../db/objectIdCompat');
const { ANIMAL_CROSSING_ASSISTANT_STYLE } = require('./shared/animalCrossingAgentStyle');

function registerSystemOwnerCoreRoutes(router, deps) {
    const {
        authenticateToken,
        Profile,
        System,
        ATTRIBUTE_CATEGORIES,
        isValidObjectId,
        normalizeNodeId,
        ensureProfile,
        findSystemForUser,
        findSystemForParticipant,
        findMemberByUserId,
        findMissionListById,
        findNodeByNodeId,
        buildAllowedRewardItemKeys,
        validateRewardItemKeys,
        validateAgainstObtainableItems,
        buildProfileCleanupUpdateForSystemDeletion,
        emitSystemTaskEvent,
        emitSystemUpdateEvent,
    } = deps;

    const CLEAR_SYSTEM_INVENTORY_ON_DELETE = process.env.CLEAR_SYSTEM_INVENTORY_ON_DELETE !== 'false';

    const buildSystemRelationship = (system, profileId, userId) => {
        const isOwner = String(system?.profile || '') === String(profileId || '');
        const isMember = (system?.members || []).some((member) => String(member.user) === String(userId));
        return { isOwner, isMember };
    };

    const withSystemRelationship = (system, profileId, userId) => {
        const source = typeof system?.toObject === 'function' ? system.toObject() : { ...(system || {}) };
        const relationship = buildSystemRelationship(source, profileId, userId);
        const { members, ...publicSystem } = source;
        return {
            ...publicSystem,
            relationship,
            isOwner: relationship.isOwner,
            isMember: relationship.isMember,
        };
    };

    const normalizePrerequisiteNodeIds = (value, missionList, normalizedParentNodeId = null) => {
        const ids = Array.isArray(value) ? value.map((item) => normalizeNodeId(item)).filter(Boolean) : [];
        if (normalizedParentNodeId) {
            ids.push(normalizedParentNodeId);
        }
        const uniqueIds = [...new Set(ids)];
        for (const prerequisiteNodeId of uniqueIds) {
            const prerequisiteNode = findNodeByNodeId(missionList, prerequisiteNodeId);
            if (!prerequisiteNode) {
                return { error: `Prerequisite node not found: ${prerequisiteNodeId}` };
            }
        }
        return { prerequisiteNodeIds: uniqueIds };
    };

    const cleanupMemberProgressForMissionList = (system, missionListId) => {
        let affectedMembers = 0;
        let removedAcceptedStates = 0;
        let removedActiveTasks = 0;
        let removedTaskCompletions = 0;
        let removedTaskHistories = 0;

        for (const member of system.members || []) {
            const beforeAccepted = (member.acceptedMissionLists || []).length;
            member.acceptedMissionLists = (member.acceptedMissionLists || []).filter(
                (state) => String(state.missionListId) !== String(missionListId)
            );
            const removedAccepted = beforeAccepted - member.acceptedMissionLists.length;

            let removedActive = 0;
            if (member.activeTask && String(member.activeTask.missionListId) === String(missionListId)) {
                member.activeTask = null;
                removedActive = 1;
            }

            const beforeCompletions = (member.taskCompletions || []).length;
            member.taskCompletions = (member.taskCompletions || []).filter(
                (completion) => String(completion.missionListId) !== String(missionListId)
            );
            const removedCompletions = beforeCompletions - member.taskCompletions.length;

            const beforeHistory = (member.taskHistory || []).length;
            member.taskHistory = (member.taskHistory || []).filter(
                (history) => String(history.missionListId) !== String(missionListId)
            );
            const removedHistory = beforeHistory - member.taskHistory.length;

            const changed = removedAccepted > 0 || removedActive > 0 || removedCompletions > 0 || removedHistory > 0;
            if (changed) {
                affectedMembers += 1;
                removedAcceptedStates += removedAccepted;
                removedActiveTasks += removedActive;
                removedTaskCompletions += removedCompletions;
                removedTaskHistories += removedHistory;
            }
        }

        return {
            affectedMembers,
            removedAcceptedStates,
            removedActiveTasks,
            removedTaskCompletions,
            removedTaskHistories,
        };
    };

    // 清理成员在特定节点上的进度（用于节点删除）
    const cleanupMemberProgressForNodes = (system, missionListId, nodeIds) => {
        const nodeIdSet = new Set(nodeIds);
        for (const member of system.members || []) {
            if (
                member.activeTask &&
                String(member.activeTask.missionListId) === String(missionListId) &&
                nodeIdSet.has(member.activeTask.nodeId)
            ) {
                member.activeTask = null;
            }
            member.taskCompletions = (member.taskCompletions || []).filter(
                (c) => !(String(c.missionListId) === String(missionListId) && nodeIdSet.has(c.nodeId))
            );
            member.taskHistory = (member.taskHistory || []).filter(
                (h) => !(String(h.missionListId) === String(missionListId) && nodeIdSet.has(h.nodeId))
            );
        }
    };

    router.post('/create', authenticateToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const { profile, error, status } = await ensureProfile(userId);

            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const {
                name,
                image,
                description,
                modules,
                attributeBoard,
                obtainableItems,
                missionLists,
                storeProducts,
                lotteryPools,
            } = req.body;

            if (!name || typeof name !== 'string') {
                return res.status(400).json({ message: 'System name is required.' });
            }

            const duplicate = await System.findOne({ profile: profile._id, name: name.trim() });
            if (duplicate) {
                return res.status(400).json({ message: 'A system with this name already exists.' });
            }

            const payload = {
                profile: profile._id,
                name: name.trim(),
            };
            if (image !== undefined) payload.image = image;
            if (description !== undefined) payload.description = description;
            if (modules !== undefined) payload.modules = modules;
            if (attributeBoard !== undefined) payload.attributeBoard = attributeBoard;
            if (obtainableItems !== undefined) payload.obtainableItems = obtainableItems;
            if (missionLists !== undefined) payload.missionLists = missionLists;
            if (storeProducts !== undefined) payload.storeProducts = storeProducts;
            if (lotteryPools !== undefined) payload.lotteryPools = lotteryPools;

            const validateResult = validateAgainstObtainableItems(payload);
            if (!validateResult.valid) {
                return res.status(400).json({ message: validateResult.message });
            }

            const newSystem = await System.create(payload);

            await Profile.updateOne(
                { _id: profile._id },
                { $addToSet: { systems: newSystem._id } }
            );

            return res.status(201).json({
                success: true,
                message: 'System created successfully.',
                system: withSystemRelationship(newSystem, profile._id, userId),
            });
        } catch (error) {
            console.error('Create system error:', error);
            return res.status(500).json({ message: 'Failed to create system', error: error.message });
        }
    });

    router.get('/list', authenticateToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const { profile, error, status } = await ensureProfile(userId);

            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const systems = await System.find({ _id: { $in: profile.systems } })
                .select('name image description modules storeProducts lotteryPools missionLists obtainableItems createdAt updatedAt profile members')
                .sort({ createdAt: -1 })
                .lean();

            const filteredSystems = systems.map((sys) => {
                const system = withSystemRelationship(sys, profile._id, userId);
                if (system.relationship.isOwner) return system;
                return {
                    ...system,
                    storeProducts: (system.storeProducts || []).filter((p) => p.isListed !== false),
                };
            });

            return res.json({ systems: filteredSystems });
        } catch (error) {
            console.error('List systems error:', error);
            return res.status(500).json({ message: 'Failed to list systems', error: error.message });
        }
    });

    router.post('/:systemId/attributes/init-six-boards', authenticateToken, async (req, res) => {
        try {
            const { systemId } = req.params;
            const userId = req.user.id;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const existing = new Set(system.attributeBoard.map((board) => board.category));
            for (const category of ATTRIBUTE_CATEGORIES) {
                if (!existing.has(category)) {
                    system.attributeBoard.push({
                        category,
                        displayName: category,
                        attributes: [],
                    });
                }
            }

            await system.save();
            return res.json({ success: true, attributeBoard: system.attributeBoard });
        } catch (error) {
            console.error('Init six boards error:', error);
            return res.status(500).json({ message: 'Failed to initialize attribute boards', error: error.message });
        }
    });

    router.post('/:systemId/attributes', authenticateToken, async (req, res) => {
        try {
            const { systemId } = req.params;
            const { category, displayName, name, level = 0 } = req.body;
            const userId = req.user.id;

            if (!ATTRIBUTE_CATEGORIES.includes(category)) {
                return res.status(400).json({ message: 'Invalid category.' });
            }
            if (!name || typeof name !== 'string') {
                return res.status(400).json({ message: 'Attribute name is required.' });
            }

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            let board = system.attributeBoard.find((item) => item.category === category);
            if (!board) {
                system.attributeBoard.push({ category, displayName: displayName || category, attributes: [] });
                board = system.attributeBoard.find((item) => item.category === category);
            }

            const attrName = name.trim();
            const duplicate = board.attributes.find((attribute) => attribute.name === attrName);
            if (duplicate) {
                return res.status(400).json({ message: 'Attribute already exists in this board.' });
            }

            board.attributes.push({ name: attrName, level, used: false });
            if (displayName && typeof displayName === 'string') {
                board.displayName = displayName.trim() || board.displayName;
            }

            await system.save();
            return res.status(201).json({ success: true, attributeBoard: system.attributeBoard });
        } catch (error) {
            console.error('Create attribute error:', error);
            return res.status(500).json({ message: 'Failed to create attribute', error: error.message });
        }
    });

    router.patch('/:systemId/attributes/:category/:attributeName/mark-used', authenticateToken, async (req, res) => {
        try {
            const { systemId, category, attributeName } = req.params;
            const { used = true } = req.body;
            const userId = req.user.id;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const board = system.attributeBoard.find((item) => item.category === category);
            if (!board) {
                return res.status(404).json({ message: 'Attribute board not found.' });
            }

            const attr = board.attributes.find((item) => item.name === attributeName);
            if (!attr) {
                return res.status(404).json({ message: 'Attribute not found.' });
            }

            attr.used = !!used;
            await system.save();
            return res.json({ success: true, attributeBoard: system.attributeBoard });
        } catch (error) {
            console.error('Mark attribute used error:', error);
            return res.status(500).json({ message: 'Failed to mark attribute used', error: error.message });
        }
    });

    router.delete('/:systemId/attributes/:category/:attributeName', authenticateToken, async (req, res) => {
        try {
            const { systemId, category, attributeName } = req.params;
            const userId = req.user.id;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const board = system.attributeBoard.find((item) => item.category === category);
            if (!board) {
                return res.status(404).json({ message: 'Attribute board not found.' });
            }

            const attr = board.attributes.find((item) => item.name === attributeName);
            if (!attr) {
                return res.status(404).json({ message: 'Attribute not found.' });
            }

            if (attr.used) {
                return res.status(400).json({ message: 'Used attribute cannot be deleted.' });
            }

            board.attributes = board.attributes.filter((item) => item.name !== attributeName);
            await system.save();
            return res.json({ success: true, attributeBoard: system.attributeBoard });
        } catch (error) {
            console.error('Delete attribute error:', error);
            return res.status(500).json({ message: 'Failed to delete attribute', error: error.message });
        }
    });

    router.post('/:systemId/items', authenticateToken, async (req, res) => {
        try {
            const { systemId } = req.params;
            const userId = req.user.id;
            const { itemKey, name, image, description, rarity } = req.body;

            if (!itemKey || !name) {
                return res.status(400).json({ message: 'itemKey and name are required.' });
            }

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const duplicate = system.obtainableItems.find((item) => item.itemKey === itemKey);
            if (duplicate) {
                return res.status(400).json({ message: 'itemKey already exists.' });
            }

            system.obtainableItems.push({ itemKey, name, image, description, rarity });
            await system.save();
            return res.status(201).json({ success: true, obtainableItems: system.obtainableItems });
        } catch (error) {
            console.error('Create obtainable item error:', error);
            return res.status(500).json({ message: 'Failed to create obtainable item', error: error.message });
        }
    });

    router.post('/:systemId/mission-lists', authenticateToken, async (req, res) => {
        try {
            const { systemId } = req.params;
            const userId = req.user.id;
            const {
                listType,
                title,
                image,
                description,
                unlockCondition,
                failureMechanism,
            } = req.body;

            if (!listType || !String(title || '').trim()) {
                return res.status(400).json({ message: 'listType and title are required.' });
            }

            if (unlockCondition?.type === 'attributeLevel' && !String(unlockCondition?.attributeName || '').trim()) {
                return res.status(400).json({ message: 'unlockCondition.attributeName is required when unlock type is attributeLevel.' });
            }

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            if (!Array.isArray(system.missionLists)) system.missionLists = [];
            system.missionLists.push({
                _id: createObjectId(),
                listType,
                title,
                image,
                description,
                unlockCondition,
                failureMechanism,
                hasFailed: false,
                restartAllowed: false,
                rootNodeId: null,
                taskTree: [],
            });

            await system.save();
            const created = system.missionLists[system.missionLists.length - 1];
            emitSystemUpdateEvent(String(system._id), {
                type: 'mission_list_created',
                systemId: String(system._id),
                missionListId: String(created._id),
                missionListTitle: created.title,
                timestamp: new Date().toISOString(),
            });
            return res.status(201).json({ success: true, missionList: created });
        } catch (error) {
            console.error('Create mission list error:', error);
            return res.status(500).json({ message: 'Failed to create mission list', error: error.message });
        }
    });

    router.patch('/:systemId/mission-lists/:missionListId', authenticateToken, async (req, res) => {
        try {
            const { systemId, missionListId } = req.params;
            const userId = req.user.id;
            const {
                listType,
                title,
                image,
                description,
                unlockCondition,
                failureMechanism,
            } = req.body;

            if (!listType || !String(title || '').trim()) {
                return res.status(400).json({ message: 'listType and title are required.' });
            }

            if (unlockCondition?.type === 'attributeLevel' && !String(unlockCondition?.attributeName || '').trim()) {
                return res.status(400).json({ message: 'unlockCondition.attributeName is required when unlock type is attributeLevel.' });
            }

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            const missionList = missionResult.list;
            const nextFailureMechanism = failureMechanism || {};
            const allowedRewardItemKeys = buildAllowedRewardItemKeys(system);
            const penaltyKeys = (nextFailureMechanism.itemPenalty || []).map((item) => item?.itemKey);
            const penaltyValidation = validateRewardItemKeys({
                itemKeys: penaltyKeys,
                allowedRewardItemKeys,
                messagePrefix: 'Mission list failure penalty',
            });
            if (!penaltyValidation.valid) {
                return res.status(400).json({ message: penaltyValidation.message });
            }

            missionList.listType = listType;
            missionList.title = String(title || '').trim();
            missionList.image = image || null;
            missionList.description = String(description || '').trim();
            missionList.unlockCondition = {
                type: unlockCondition?.type || 'direct',
                attributeName: unlockCondition?.type === 'attributeLevel'
                    ? String(unlockCondition?.attributeName || '').trim()
                    : null,
                minLevel: unlockCondition?.type === 'attributeLevel'
                    ? Math.max(0, Number(unlockCondition?.minLevel || 0))
                    : 0,
            };
            missionList.failureMechanism = {
                enabled: !!nextFailureMechanism.enabled,
                pointPenalty: nextFailureMechanism.enabled ? (nextFailureMechanism.pointPenalty || []) : [],
                itemPenalty: nextFailureMechanism.enabled ? (nextFailureMechanism.itemPenalty || []) : [],
            };

            await system.save();
            emitSystemUpdateEvent(String(system._id), {
                type: 'mission_list_updated',
                systemId: String(system._id),
                missionListId: String(missionList._id),
                missionListTitle: missionList.title,
                timestamp: new Date().toISOString(),
            });

            return res.json({ success: true, missionList });
        } catch (error) {
            console.error('Update mission list error:', error);
            return res.status(500).json({ message: 'Failed to update mission list', error: error.message });
        }
    });

    router.delete('/:systemId/mission-lists/:missionListId', authenticateToken, async (req, res) => {
        try {
            const { systemId, missionListId } = req.params;
            const userId = req.user.id;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            const missionList = missionResult.list;
            const missionListObjectId = missionList._id;
            const missionListTitle = missionList.title;

            const cleanupStats = cleanupMemberProgressForMissionList(system, missionListObjectId);

            system.missionLists.pull(missionListObjectId);

            await system.save();

            const payload = {
                type: 'mission_list_deleted',
                systemId: String(system._id),
                missionListId: String(missionListObjectId),
                missionListTitle,
                cleanup: cleanupStats,
                timestamp: new Date().toISOString(),
            };

            emitSystemUpdateEvent(String(system._id), payload);
            emitSystemTaskEvent(String(system._id), payload);

            return res.json({
                success: true,
                missionListId: String(missionListObjectId),
                missionListTitle,
                cleanup: cleanupStats,
            });
        } catch (error) {
            console.error('Delete mission list error:', error);
            return res.status(500).json({ message: 'Failed to delete mission list', error: error.message });
        }
    });

    router.post('/:systemId/mission-lists/:missionListId/nodes', authenticateToken, async (req, res) => {
        try {
            const { systemId, missionListId } = req.params;
            const userId = req.user.id;
            const {
                parentNodeId = null,
                prerequisiteNodeIds = [],
                title,
                description,
                content,
                notice,
                timeCostMinutes,
                canInterrupt,
                rewards,
            } = req.body;

            if (!title || !timeCostMinutes) {
                return res.status(400).json({ message: 'title and timeCostMinutes are required.' });
            }

            const nodeId = `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const normalizedParentNodeId = parentNodeId ? normalizeNodeId(parentNodeId) : null;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            const missionList = missionResult.list;
            if (missionList.hasFailed) {
                return res.status(400).json({ message: 'Mission list already failed and cannot accept new tasks until rejoin.' });
            }

            const allowedRewardItemKeys = buildAllowedRewardItemKeys(system);
            const nodeRewardItemKeys = (rewards?.items || []).map((item) => item?.itemKey);
            const nodeRewardValidation = validateRewardItemKeys({
                itemKeys: nodeRewardItemKeys,
                allowedRewardItemKeys,
                messagePrefix: 'Task reward',
            });
            if (!nodeRewardValidation.valid) {
                return res.status(400).json({ message: nodeRewardValidation.message });
            }

            if (normalizedParentNodeId) {
                const parent = findNodeByNodeId(missionList, normalizedParentNodeId);
                if (!parent) {
                    return res.status(400).json({ message: 'Parent node not found.' });
                }
                if ((parent.childrenNodeIds || []).length >= 3) {
                    return res.status(400).json({ message: 'Each node can have at most 3 child tasks.' });
                }
                parent.childrenNodeIds.push(nodeId);
            } else if (missionList.rootNodeId) {
                return res.status(400).json({ message: 'Root node already exists.' });
            } else {
                missionList.rootNodeId = nodeId;
            }

            const prerequisiteResult = normalizePrerequisiteNodeIds(prerequisiteNodeIds, missionList, normalizedParentNodeId);
            if (prerequisiteResult.error) {
                return res.status(400).json({ message: prerequisiteResult.error });
            }

            missionList.taskTree.push({
                nodeId,
                parentNodeId: normalizedParentNodeId,
                prerequisiteNodeIds: prerequisiteResult.prerequisiteNodeIds,
                title,
                description,
                content,
                notice,
                timeCostMinutes,
                canInterrupt,
                rewards,
                childrenNodeIds: [],
                status: 'pending',
                allowRetryAfterFailure: true,
            });

            const graphValidation = validateMissionGraphAcyclic(missionList);
            if (!graphValidation.ok) {
                missionList.taskTree = missionList.taskTree.filter((taskNode) => taskNode.nodeId !== nodeId);
                if (normalizedParentNodeId) {
                    const parent = findNodeByNodeId(missionList, normalizedParentNodeId);
                    if (parent) {
                        parent.childrenNodeIds = (parent.childrenNodeIds || []).filter((childNodeId) => childNodeId !== nodeId);
                    }
                } else if (String(missionList.rootNodeId) === String(nodeId)) {
                    missionList.rootNodeId = null;
                }
                return res.status(400).json({ message: graphValidation.message });
            }

            await system.save();
            emitSystemUpdateEvent(String(system._id), {
                type: 'mission_node_created',
                systemId: String(system._id),
                missionListId: String(missionList._id),
                missionListTitle: missionList.title,
                nodeId,
                nodeTitle: title,
                timestamp: new Date().toISOString(),
            });
            return res.status(201).json({ success: true, missionList });
        } catch (error) {
            console.error('Create mission node error:', error);
            return res.status(500).json({ message: 'Failed to create mission node', error: error.message });
        }
    });

    // PATCH /system/:systemId/mission-lists/:missionListId/nodes/:nodeId — update node fields
    router.patch('/:systemId/mission-lists/:missionListId/nodes/:nodeId', authenticateToken, async (req, res) => {
        try {
            const { systemId, missionListId, nodeId } = req.params;
            const { title, description, content, notice, timeCostMinutes, canInterrupt, rewards, prerequisiteNodeIds } = req.body;

            if (!title || !timeCostMinutes) {
                return res.status(400).json({ message: 'title and timeCostMinutes are required.' });
            }

            const { system, error, status } = await findSystemForUser(req.user.id, systemId);
            if (error) return res.status(status || 400).json({ message: error });

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) return res.status(missionResult.status).json({ message: missionResult.error });

            const node = findNodeByNodeId(missionResult.list, normalizeNodeId(nodeId));
            if (!node) return res.status(404).json({ message: 'Node not found.' });

            if (rewards?.items?.length) {
                const allowedRewardItemKeys = buildAllowedRewardItemKeys(system);
                const validation = validateRewardItemKeys({
                    itemKeys: rewards.items.map(i => i?.itemKey),
                    allowedRewardItemKeys,
                    messagePrefix: 'Task reward',
                });
                if (!validation.valid) return res.status(400).json({ message: validation.message });
            }

            node.title           = title;
            node.description     = description ?? node.description;
            node.content         = content     ?? node.content;
            node.notice          = notice      ?? node.notice;
            node.timeCostMinutes = Math.max(1, timeCostMinutes);
            node.canInterrupt    = canInterrupt ?? node.canInterrupt;
            if (rewards) node.rewards = rewards;
            if (Array.isArray(prerequisiteNodeIds)) {
                const prerequisiteResult = normalizePrerequisiteNodeIds(prerequisiteNodeIds, missionResult.list, node.parentNodeId);
                if (prerequisiteResult.error) {
                    return res.status(400).json({ message: prerequisiteResult.error });
                }
                node.prerequisiteNodeIds = prerequisiteResult.prerequisiteNodeIds.filter((id) => id !== node.nodeId);
            }

            const graphValidation = validateMissionGraphAcyclic(missionResult.list);
            if (!graphValidation.ok) {
                return res.status(400).json({ message: graphValidation.message });
            }

            await system.save();
            const payload = {
                type: 'mission_node_updated',
                systemId: String(system._id),
                missionListId: String(missionResult.list._id),
                missionListTitle: missionResult.list.title,
                nodeId: node.nodeId,
                nodeTitle: node.title,
                timestamp: new Date().toISOString(),
            };
            emitSystemUpdateEvent(String(system._id), payload);
            emitSystemTaskEvent(String(system._id), payload);
            return res.json({ success: true, missionList: missionResult.list });
        } catch (error) {
            console.error('Update mission node error:', error);
            return res.status(500).json({ message: 'Failed to update mission node', error: error.message });
        }
    });

    router.patch('/:systemId/mission-lists/:missionListId/fail', authenticateToken, async (req, res) => {
        try {
            const { systemId, missionListId } = req.params;
            const userId = req.user.id;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            missionResult.list.hasFailed = true;
            missionResult.list.restartAllowed = false;

            await system.save();
            return res.json({ success: true, missionList: missionResult.list });
        } catch (error) {
            console.error('Fail mission list error:', error);
            return res.status(500).json({ message: 'Failed to fail mission list', error: error.message });
        }
    });

    router.patch('/:systemId/mission-lists/:missionListId/nodes/:nodeId/fail', authenticateToken, async (req, res) => {
        try {
            const { systemId, missionListId, nodeId } = req.params;
            const userId = req.user.id;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            const node = findNodeByNodeId(missionResult.list, nodeId);
            if (!node) {
                return res.status(404).json({ message: 'Node not found.' });
            }

            node.status = 'failed';
            await system.save();
            return res.json({ success: true, node });
        } catch (error) {
            console.error('Fail mission node error:', error);
            return res.status(500).json({ message: 'Failed to fail mission node', error: error.message });
        }
    });

    router.patch('/:systemId/mission-lists/:missionListId/nodes/:nodeId/restart', authenticateToken, async (req, res) => {
        try {
            const { systemId, missionListId, nodeId } = req.params;
            const userId = req.user.id;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) {
                return res.status(missionResult.status).json({ message: missionResult.error });
            }

            const missionList = missionResult.list;
            if (missionList.hasFailed) {
                return res.status(400).json({ message: 'Mission list failed. Rejoin is required before restart.' });
            }

            const node = findNodeByNodeId(missionList, nodeId);
            if (!node) {
                return res.status(404).json({ message: 'Node not found.' });
            }

            if (node.status !== 'failed') {
                return res.status(400).json({ message: 'Only failed nodes can be restarted.' });
            }

            if (!node.allowRetryAfterFailure) {
                return res.status(400).json({ message: 'This node is not allowed to restart after failure.' });
            }

            node.status = 'pending';
            await system.save();
            return res.json({ success: true, node });
        } catch (error) {
            console.error('Restart mission node error:', error);
            return res.status(500).json({ message: 'Failed to restart mission node', error: error.message });
        }
    });

    router.delete('/:systemId/mission-lists/:missionListId/nodes/:nodeId', authenticateToken, async (req, res) => {
        try {
            const { systemId, missionListId, nodeId } = req.params;
            const userId = req.user.id;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) return res.status(status || 400).json({ message: error });

            const missionResult = findMissionListById(system, missionListId);
            if (missionResult.error) return res.status(missionResult.status).json({ message: missionResult.error });

            const missionList = missionResult.list;
            const targetNode = findNodeByNodeId(missionList, nodeId);
            if (!targetNode) return res.status(404).json({ message: 'Node not found.' });

            // 收集以 rootId 为根的整棵子树的所有节点 ID（含自身）
            const collectSubtreeIds = (rootId) => {
                const ids = [];
                const queue = [rootId];
                while (queue.length > 0) {
                    const curr = queue.shift();
                    ids.push(curr);
                    const n = missionList.taskTree.find((nd) => nd.nodeId === curr);
                    if (n) queue.push(...n.childrenNodeIds);
                }
                return ids;
            };

            const nodesToDelete = [];
            const isRoot = String(missionList.rootNodeId) === String(nodeId);

            if (isRoot) {
                const children = [...targetNode.childrenNodeIds];

                if (children.length === 0) {
                    // 根节点无子节点：直接清空树
                    nodesToDelete.push(nodeId);
                    missionList.rootNodeId = null;
                } else {
                    // 第一个子节点升为新根
                    const newRootId = children[0];
                    const newRootNode = findNodeByNodeId(missionList, newRootId);
                    syncNodeParentDependency(newRootNode, null, [nodeId]);
                    missionList.rootNodeId = newRootId;

                    // 剩余子节点尝试挂到新根下
                    const remaining = children.slice(1);
                    const slotsAvailable = 3 - newRootNode.childrenNodeIds.length;
                    const toAttach = remaining.slice(0, slotsAvailable);
                    const toCascade = remaining.slice(slotsAvailable);

                    for (const cId of toAttach) {
                        const cNode = findNodeByNodeId(missionList, cId);
                        syncNodeParentDependency(cNode, newRootId, [nodeId]);
                        newRootNode.childrenNodeIds.push(cId);
                    }
                    for (const cId of toCascade) {
                        nodesToDelete.push(...collectSubtreeIds(cId));
                    }
                    nodesToDelete.push(nodeId);
                }
            } else {
                // 非根节点：从父节点 childrenNodeIds 中移除
                const parentNode = findNodeByNodeId(missionList, targetNode.parentNodeId);
                if (!parentNode) return res.status(400).json({ message: 'Parent node not found.' });

                parentNode.childrenNodeIds = parentNode.childrenNodeIds.filter((id) => id !== nodeId);

                // 尝试将目标节点的子节点拼接到父节点
                const slotsAvailable = 3 - parentNode.childrenNodeIds.length;
                const toSplice = targetNode.childrenNodeIds.slice(0, slotsAvailable);
                const toCascade = targetNode.childrenNodeIds.slice(slotsAvailable);

                for (const cId of toSplice) {
                    const cNode = findNodeByNodeId(missionList, cId);
                    syncNodeParentDependency(cNode, targetNode.parentNodeId, [nodeId]);
                    parentNode.childrenNodeIds.push(cId);
                }
                for (const cId of toCascade) {
                    nodesToDelete.push(...collectSubtreeIds(cId));
                }
                nodesToDelete.push(nodeId);
            }

            const nodeIdsToDelete = [...new Set(nodesToDelete)];

            // 清理成员进度
            cleanupMemberProgressForNodes(system, String(missionList._id), nodeIdsToDelete);

            // 从 taskTree 中移除
            missionList.taskTree = missionList.taskTree.filter(
                (n) => !nodeIdsToDelete.includes(n.nodeId)
            );
            removeDeletedNodeReferences(missionList, nodeIdsToDelete);

            const graphValidation = validateMissionGraphAcyclic(missionList);
            if (!graphValidation.ok) {
                return res.status(400).json({ message: graphValidation.message });
            }

            await system.save();

            const payload = {
                type: 'mission_node_deleted',
                systemId: String(system._id),
                missionListId: String(missionList._id),
                deletedNodeIds: nodeIdsToDelete,
                timestamp: new Date().toISOString(),
            };
            emitSystemUpdateEvent(String(system._id), payload);
            emitSystemTaskEvent(String(system._id), payload);

            return res.json({
                success: true,
                deletedNodeIds: nodeIdsToDelete,
                missionList,
            });
        } catch (error) {
            console.error('Delete mission node error:', error);
            return res.status(500).json({ message: 'Failed to delete mission node', error: error.message });
        }
    });

    router.patch('/:systemId/rejoin', authenticateToken, async (req, res) => {
        try {
            const { systemId } = req.params;
            const userId = req.user.id;

            const { system, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            for (const missionList of system.missionLists) {
                missionList.hasFailed = false;
                missionList.restartAllowed = false;
                for (const node of missionList.taskTree) {
                    if (node.status === 'failed') {
                        node.status = 'pending';
                    }
                }
            }

            await system.save();
            return res.json({ success: true, message: 'System rejoined. Failed mission lists are reset.' });
        } catch (error) {
            console.error('Rejoin system error:', error);
            return res.status(500).json({ message: 'Failed to rejoin system', error: error.message });
        }
    });

    router.get('/:systemId', authenticateToken, async (req, res) => {
        try {
            const userId = req.user.id;
            const { systemId } = req.params;

            const { profile, error, status } = await ensureProfile(userId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const system = await System.findOne({
                _id: systemId,
                profile: profile._id,
            }).lean();

            if (!system) {
                return res.status(404).json({ message: 'System not found.' });
            }

            return res.json({ system });
        } catch (error) {
            console.error('Get system detail error:', error);
            return res.status(500).json({ message: 'Failed to fetch system', error: error.message });
        }
    });

    router.get('/search/:systemId', authenticateToken, async (req, res) => {
        try {
            const { systemId } = req.params;
            const userId = req.user.id;

            if (!isValidObjectId(systemId)) {
                return res.status(400).json({ message: 'Invalid system ID format.' });
            }

            const { profile, error, status } = await ensureProfile(userId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const system = await System.findById(systemId)
                .select('name image description modules createdAt updatedAt profile members')
                .lean();

            if (!system) {
                return res.status(404).json({ message: 'System not found.' });
            }

            return res.json({ system: withSystemRelationship(system, profile._id, userId) });
        } catch (error) {
            console.error('Search system error:', error);
            return res.status(500).json({ message: 'Failed to search system', error: error.message });
        }
    });

    router.post('/:systemId/join', authenticateToken, async (req, res) => {
        try {
            const { systemId } = req.params;
            const userId = req.user.id;

            if (!isValidObjectId(systemId)) {
                return res.status(400).json({ message: 'Invalid system ID format.' });
            }

            const { profile, error, status } = await ensureProfile(userId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const system = await System.findById(systemId);
            if (!system) {
                return res.status(404).json({ message: 'System not found.' });
            }

            const alreadyMember = system.members.some((m) => m.user.toString() === userId);
            if (alreadyMember) {
                return res.status(400).json({ message: 'You are already a member of this system.' });
            }

            system.members.push({
                user: userId,
                profile: profile._id,
                joinedAt: new Date().toISOString(),
                acceptedMissionLists: [],
                activeTask: null,
                taskCompletions: [],
                taskHistory: [],
                dailyQuestStatus: [],
                purchases: [],
            });

            await system.save();

            await Profile.updateOne(
                { _id: profile._id },
                { $addToSet: { systems: systemId } }
            );

            return res.status(201).json({
                success: true,
                message: 'Successfully joined the system.',
                system: withSystemRelationship(system, profile._id, userId),
            });
        } catch (error) {
            console.error('Join system error:', error);
            return res.status(500).json({ message: 'Failed to join system', error: error.message });
        }
    });

    router.post('/:systemId/leave', authenticateToken, async (req, res) => {
        try {
            const { systemId } = req.params;
            const userId = req.user.id;

            const { system, profile, isOwner, error, status } = await findSystemForParticipant(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const member = findMemberByUserId(system, userId);
            if (!member) {
                return res.status(404).json({
                    message: isOwner
                        ? 'System owner is not joined as a member of this system.'
                        : 'Member not found in this system.',
                });
            }

            const memberProfileId = member.profile ? String(member.profile) : String(profile._id);
            system.members = (system.members || []).filter(
                (entry) => String(entry.user) !== String(userId)
            );

            await system.save();

            const pullUpdate = isOwner
                ? { inventory: { sourceSystem: system._id } }
                : {
                    systems: system._id,
                    inventory: { sourceSystem: system._id },
                };

            await Profile.updateOne(
                { _id: profile._id },
                { $pull: pullUpdate }
            );

            const timestamp = new Date().toISOString();

            emitSystemTaskEvent(String(system._id), {
                type: 'member_leave_system',
                systemId: String(system._id),
                memberUserId: String(userId),
                memberProfileId,
                timestamp,
            });

            emitSystemUpdateEvent(String(system._id), {
                type: 'member_left_system',
                systemId: String(system._id),
                memberUserId: String(userId),
                memberProfileId,
                timestamp,
            });

            return res.json({
                success: true,
                message: isOwner
                    ? 'Successfully left the system as a member.'
                    : 'Successfully left the system.',
                systemId: String(system._id),
                ownerMembershipOnly: isOwner,
            });
        } catch (error) {
            console.error('Leave system error:', error);
            return res.status(500).json({ message: 'Failed to leave system', error: error.message });
        }
    });

    router.delete('/:systemId', authenticateToken, async (req, res) => {
        try {
            const { systemId } = req.params;
            const userId = req.user.id;

            const { system, profile, error, status } = await findSystemForUser(userId, systemId);
            if (error) {
                return res.status(status || 400).json({ message: error });
            }

            const ownerProfileId = String(profile._id);
            const memberUserIds = (system.members || []).map((member) => String(member.user));
            const memberProfileIds = (system.members || [])
                .map((member) => String(member.profile || ''))
                .filter(Boolean);

            const participantProfileIds = Array.from(new Set([ownerProfileId, ...memberProfileIds]));
            const systemKey = String(system._id);
            const startedAt = new Date().toISOString();

            emitSystemUpdateEvent(systemKey, {
                type: 'system_deletion_started',
                systemId: systemKey,
                systemName: system.name,
                ownerProfileId,
                memberCount: memberUserIds.length,
                startedAt,
            });

            emitSystemTaskEvent(systemKey, {
                type: 'system_deletion_started',
                systemId: systemKey,
                systemName: system.name,
                ownerProfileId,
                memberCount: memberUserIds.length,
                startedAt,
            });

            const cleaningStartedAt = new Date().toISOString();
            emitSystemUpdateEvent(systemKey, {
                type: 'system_deletion_cleaning_profiles_started',
                systemId: systemKey,
                systemName: system.name,
                profileCount: participantProfileIds.length,
                clearSystemInventory: CLEAR_SYSTEM_INVENTORY_ON_DELETE,
                timestamp: cleaningStartedAt,
            });

            emitSystemTaskEvent(systemKey, {
                type: 'system_deletion_cleaning_profiles_started',
                systemId: systemKey,
                systemName: system.name,
                profileCount: participantProfileIds.length,
                clearSystemInventory: CLEAR_SYSTEM_INVENTORY_ON_DELETE,
                timestamp: cleaningStartedAt,
            });

            const cleanupUpdate = buildProfileCleanupUpdateForSystemDeletion({
                systemId: system._id,
                clearSystemInventory: CLEAR_SYSTEM_INVENTORY_ON_DELETE,
            });

            if (participantProfileIds.length > 0) {
                await Profile.updateMany(
                    { _id: { $in: participantProfileIds } },
                    cleanupUpdate
                );
            }

            const cleaningCompletedAt = new Date().toISOString();
            emitSystemUpdateEvent(systemKey, {
                type: 'system_deletion_cleaning_profiles_completed',
                systemId: systemKey,
                systemName: system.name,
                profileCount: participantProfileIds.length,
                clearSystemInventory: CLEAR_SYSTEM_INVENTORY_ON_DELETE,
                timestamp: cleaningCompletedAt,
            });

            emitSystemTaskEvent(systemKey, {
                type: 'system_deletion_cleaning_profiles_completed',
                systemId: systemKey,
                systemName: system.name,
                profileCount: participantProfileIds.length,
                clearSystemInventory: CLEAR_SYSTEM_INVENTORY_ON_DELETE,
                timestamp: cleaningCompletedAt,
            });

            const deletingSystemAt = new Date().toISOString();
            emitSystemUpdateEvent(systemKey, {
                type: 'system_deletion_deleting_system',
                systemId: systemKey,
                systemName: system.name,
                timestamp: deletingSystemAt,
            });

            emitSystemTaskEvent(systemKey, {
                type: 'system_deletion_deleting_system',
                systemId: systemKey,
                systemName: system.name,
                timestamp: deletingSystemAt,
            });

            await System.deleteOne({ _id: system._id });

            const deletedAt = new Date().toISOString();
            emitSystemUpdateEvent(systemKey, {
                type: 'system_deleted',
                systemId: systemKey,
                systemName: system.name,
                deletedAt,
            });

            emitSystemTaskEvent(systemKey, {
                type: 'system_deleted',
                systemId: systemKey,
                systemName: system.name,
                deletedAt,
            });

            return res.json({
                success: true,
                message: 'System deleted successfully.',
                systemId: systemKey,
            });
        } catch (error) {
            console.error('Delete system error:', error);
            return res.status(500).json({ message: 'Failed to delete system', error: error.message });
        }
    });

    router.get('/:systemId/members', authenticateToken, async (req, res) => {
        try {
            const { systemId } = req.params;

            if (!isValidObjectId(systemId)) {
                return res.status(400).json({ message: 'Invalid system ID format.' });
            }

            const system = await System.findById(systemId)
                .select('members')
                .populate('members.user', 'username email')
                .lean();

            if (!system) {
                return res.status(404).json({ message: 'System not found.' });
            }

            return res.json({ members: system.members || [] });
        } catch (error) {
            console.error('Get members error:', error);
            return res.status(500).json({ message: 'Failed to get members', error: error.message });
        }
    });

    // ── AI Task Chat ───────────────────────────────────────────────────────────
    // POST /system/:systemId/ai-task-chat
    // Body: { messages: [{role, content}] }
    // Sends conversation + existing mission lists + store products to OpenAI.
    // LLM may reply with text OR call propose_mission_list to return a preview.
    router.post('/:systemId/_legacy-ai-task-chat-disabled', authenticateToken, async (req, res) => {
        const { systemId } = req.params;
        const { messages } = req.body;

        if (!Array.isArray(messages)) {
            return res.status(400).json({ message: 'messages must be an array' });
        }

        if (!process.env.OPENAI_API_KEY) {
            return res.status(503).json({ message: 'AI 功能未配置，请联系管理员设置 OPENAI_API_KEY' });
        }

        try {
            const { system, error, status } = await findSystemForUser(req.user.id, systemId);
            if (error) return res.status(status || 404).json({ message: error });

            // Build mission list context for LLM
            const missionContext = (system.missionLists || []).map(ml => ({
                id: ml._id.toString(),
                title: ml.title,
                type: ml.listType,
                description: ml.description || '',
                nodeCount: (ml.taskTree || []).length,
                nodes: (ml.taskTree || []).slice(0, 8).map(n => ({
                    title: n.title,
                    description: n.description || '',
                    timeCostMinutes: n.timeCostMinutes,
                })),
            }));

            // Build store products context for reward suggestions
            const storeContext = (system.storeProducts || [])
                .filter(p => p.isListed !== false)
                .map(p => ({
                    itemKey: p._id.toString(),
                    name: p.name,
                    type: p.type,
                    price: p.price,
                    description: p.description || '',
                }));

            // Build obtainable items context
            const obtainableContext = (system.obtainableItems || []).map(i => ({
                itemKey: i.itemKey || i._id.toString(),
                name: i.name,
                description: i.description || '',
            }));

            const systemPrompt = `你是「${system.name}」系统的任务规划助手。

当前系统已有的任务列表（${missionContext.length} 个）：
${missionContext.length > 0 ? JSON.stringify(missionContext, null, 2) : '（暂无任务列表）'}

系统商店商品（可作为任务奖励）：
${storeContext.length > 0 ? JSON.stringify(storeContext, null, 2) : '（暂无商店商品）'}

系统可获得物品（可作为任务奖励）：
${obtainableContext.length > 0 ? JSON.stringify(obtainableContext, null, 2) : '（暂无可获得物品）'}

你的职责：
- 理解用户想完成的目标或计划
- 将目标分解成具体可执行的任务步骤（3~8 个节点）
- 主动询问或建议合理的任务奖励（金币数量、物品奖励），结合商店商品推荐
- 若用户没有明确说奖励，你可以根据任务难度和时长给出建议，并在 propose 时包含进去
- 用 propose_mission_list 工具返回方案预览，等用户确认后再创建
- 若信息不足，先用文字提问用户
- 每个节点需估算所需时间（分钟）

节点结构说明：
- 节点形成树，每个节点最多 3 个子节点
- 推荐先创建线性链（每节点仅 1 个子节点），复杂任务再分叉
- nodes 数组第一个 parentTempId 为 null 的节点是根节点
- 每个节点可以有独立的奖励（coins + items）

风格：温和、清楚、像小镇公告板旁边的邻居在帮忙规划，中文回复。`;

            const { default: OpenAI } = await import('openai');
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

            const tools = [{
                type: 'function',
                function: {
                    name: 'propose_mission_list',
                    description: '生成任务列表方案预览，返回给用户确认，不直接创建到数据库',
                    parameters: {
                        type: 'object',
                        required: ['title', 'listType', 'description', 'imageKeywords', 'nodes', 'replyMessage'],
                        properties: {
                            title: { type: 'string', description: '任务列表标题' },
                            listType: {
                                type: 'string',
                                enum: ['mainline', 'urgent'],
                                description: 'mainline=主线任务，urgent=紧急任务',
                            },
                            description: { type: 'string', description: '任务列表一句话描述' },
                            imageKeywords: {
                                type: 'string',
                                description: '用于搜索封面图的英文关键词，2~4 个词，空格分隔，如 "study reading books"',
                            },
                            nodes: {
                                type: 'array',
                                description: '任务节点数组，根节点 parentTempId 为 null',
                                items: {
                                    type: 'object',
                                    required: ['tempId', 'title', 'timeCostMinutes'],
                                    properties: {
                                        tempId: { type: 'string' },
                                        parentTempId: { type: ['string', 'null'] },
                                        title: { type: 'string' },
                                        description: { type: 'string' },
                                        timeCostMinutes: { type: 'number' },
                                        rewards: {
                                            type: 'object',
                                            description: '节点完成奖励',
                                            properties: {
                                                coins: { type: 'number', description: '金币奖励数量' },
                                                items: {
                                                    type: 'array',
                                                    description: '物品奖励列表',
                                                    items: {
                                                        type: 'object',
                                                        properties: {
                                                            itemKey: { type: 'string', description: '物品 key（来自商店或可获得物品）' },
                                                            quantity: { type: 'number' },
                                                        },
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                            replyMessage: { type: 'string', description: '向用户展示方案时的说明文字' },
                        },
                    },
                },
            }];

            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: `${ANIMAL_CROSSING_ASSISTANT_STYLE}\n${systemPrompt}` },
                    ...messages,
                ],
                tools,
                tool_choice: 'auto',
                max_tokens: 2000,
            });

            const choice = completion.choices[0];

            // ── Text-only reply ────────────────────────────────────────────────
            if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
                return res.json({ reply: choice.message.content, action: null });
            }

            // ── Tool call: propose_mission_list ────────────────────────────────
            const args = JSON.parse(choice.message.tool_calls[0].function.arguments);

            return res.json({
                reply: args.replyMessage || `已为你规划任务列表「${args.title}」，请确认方案。`,
                action: 'preview',
                proposal: {
                    title: args.title,
                    listType: args.listType || 'mainline',
                    description: args.description,
                    imageKeywords: args.imageKeywords,
                    nodes: args.nodes,
                },
            });
        } catch (error) {
            console.error('[AI Task Chat] error:', error);
            return res.status(500).json({ message: 'AI 请求失败', error: error.message });
        }
    });

    // ── AI Task Confirm ─────────────────────────────────────────────────────────
    // POST /system/:systemId/ai-task-confirm
    // Body: { proposal: { title, listType, description, imageKeywords, nodes } }
    // User confirmed the proposal — now actually create the mission list in DB.
    router.post('/:systemId/_legacy-ai-task-confirm-disabled', authenticateToken, async (req, res) => {
        const { systemId } = req.params;
        const { proposal } = req.body;

        if (!proposal || !proposal.title || !Array.isArray(proposal.nodes)) {
            return res.status(400).json({ message: '无效的方案数据' });
        }

        try {
            const { system, error, status } = await findSystemForUser(req.user.id, systemId);
            if (error) return res.status(status || 404).json({ message: error });

            // Get cover image
            let imageUrl = null;
            if (process.env.UNSPLASH_ACCESS_KEY) {
                try {
                    const uRes = await fetch(
                        `https://api.unsplash.com/photos/random?query=${encodeURIComponent(proposal.imageKeywords || proposal.title)}&orientation=landscape&client_id=${process.env.UNSPLASH_ACCESS_KEY}`
                    );
                    if (uRes.ok) {
                        const uData = await uRes.json();
                        imageUrl = uData?.urls?.regular || null;
                    }
                } catch (_) { /* ignore */ }
            }
            if (!imageUrl) {
                const seed = (proposal.imageKeywords || proposal.title).replace(/\s+/g, '-').toLowerCase().slice(0, 30);
                imageUrl = `https://picsum.photos/seed/${seed}/800/400`;
            }

            // Build nodeId map: tempId -> real nodeId
            const nodeMap = new Map();
            proposal.nodes.forEach((n, i) => {
                nodeMap.set(n.tempId, `node-${Date.now()}-${i}`);
            });

            // Build taskTree
            const taskTree = proposal.nodes.map(n => {
                const nodeId = nodeMap.get(n.tempId);
                const parentNodeId = n.parentTempId ? (nodeMap.get(n.parentTempId) || null) : null;
                const childrenNodeIds = proposal.nodes
                    .filter(c => c.parentTempId === n.tempId)
                    .map(c => nodeMap.get(c.tempId));
                const nodeRewards = n.rewards || {};
                return {
                    nodeId,
                    parentNodeId,
                    title: n.title,
                    description: n.description || '',
                    timeCostMinutes: Math.max(1, n.timeCostMinutes || 30),
                    canInterrupt: false,
                    childrenNodeIds,
                    status: 'pending',
                    rewards: {
                        experience: [],
                        coins: typeof nodeRewards.coins === 'number' ? nodeRewards.coins : 0,
                        items: Array.isArray(nodeRewards.items) ? nodeRewards.items : [],
                    },
                };
            });

            const rootNode = taskTree.find(n => n.parentNodeId === null);

            if (!system.missionLists) system.missionLists = [];
            system.missionLists.push({
                listType: proposal.listType || 'mainline',
                title: proposal.title,
                image: imageUrl,
                description: proposal.description || '',
                unlockCondition: { type: 'direct', attributeName: null, minLevel: 0 },
                failureMechanism: { enabled: false, pointPenalty: [], itemPenalty: [] },
                rootNodeId: rootNode?.nodeId || null,
                taskTree,
            });

            await system.save();

            const newList = system.missionLists[system.missionLists.length - 1];
            emitSystemUpdateEvent(systemId, 'mission_list_created', { missionListId: newList._id });

            return res.json({
                success: true,
                reply: `任务列表「${proposal.title}」已创建成功，包含 ${proposal.nodes.length} 个任务节点！`,
                action: 'created_mission_list',
                missionList: newList,
            });
        } catch (error) {
            console.error('[AI Task Confirm] error:', error);
            return res.status(500).json({ message: '创建失败', error: error.message });
        }
    });
}

module.exports = registerSystemOwnerCoreRoutes;
