function createSystemDomainService(deps) {
    const {
        objectIds,
        User,
        Profile,
        System,
    } = deps;

    const ATTRIBUTE_CATEGORIES = ['stamina', 'strength', 'wisdom', 'discipline', 'charisma', 'luck'];

    const isValidObjectId = (value) => objectIds.Types.ObjectId.isValid(value);

    const normalizeNodeId = (value) => String(value || '').trim();
    const normalizeItemKey = (value) => String(value || '').trim();

    const isMissingSubdocumentId = (value) => {
        const id = value?._id;
        return id === undefined || id === null || String(id) === '' || String(id) === 'undefined';
    };

    const ensureMissionListIdentity = (missionList) => {
        if (!missionList || !isMissingSubdocumentId(missionList)) return false;
        missionList._id = objectIds.createObjectId();
        return true;
    };

    const ensureMissionListIdentities = (system) => {
        let changed = false;
        if (!Array.isArray(system.missionLists)) {
            system.missionLists = [];
            return true;
        }
        for (const missionList of system.missionLists) {
            changed = ensureMissionListIdentity(missionList) || changed;
        }
        return changed;
    };

    const ensureMemberTaskState = (member) => {
        if (!member) return null;
        if (!Array.isArray(member.acceptedMissionLists)) member.acceptedMissionLists = [];
        if (!Array.isArray(member.taskCompletions)) member.taskCompletions = [];
        if (!Array.isArray(member.taskHistory)) member.taskHistory = [];
        if (!Array.isArray(member.dailyQuestStatus)) member.dailyQuestStatus = [];
        if (member.activeTask === undefined) member.activeTask = null;
        return member;
    };

    const ensureProfile = async (userId) => {
        const user = await User.findById(userId);
        if (!user) {
            return { error: 'User not found', status: 404 };
        }

        let profile = null;

        if (user.profile) {
            profile = await Profile.findById(user.profile);
        }

        if (!profile) {
            profile = await Profile.findOne({ user: user._id });
        }

        if (!profile) {
            profile = await Profile.create({ user: user._id, systems: [] });
            user.profile = profile._id;
            await user.save();
        }

        return { profile };
    };

    const findSystemForUser = async (userId, systemId) => {
        if (!isValidObjectId(systemId)) {
            return { error: 'Invalid systemId', status: 400 };
        }

        const { profile, error, status } = await ensureProfile(userId);
        if (error) {
            return { error, status };
        }

        const system = await System.findOne({ _id: systemId, profile: profile._id });
        if (!system) {
            return { error: 'System not found.', status: 404 };
        }
        if (ensureMissionListIdentities(system)) {
            await system.save();
        }

        return { system, profile };
    };

    const findSystemForParticipant = async (userId, systemId) => {
        if (!isValidObjectId(systemId)) {
            return { error: 'Invalid systemId', status: 400 };
        }

        const { profile, error, status } = await ensureProfile(userId);
        if (error) {
            return { error, status };
        }

        const system = await System.findById(systemId);
        if (!system) {
            return { error: 'System not found.', status: 404 };
        }

        const isOwner = String(system.profile) === String(profile._id);
        const isMember = system.members.some((member) => String(member.user) === String(userId));

        if (!isOwner && !isMember) {
            return { error: 'You are not a member of this system.', status: 403 };
        }
        if (ensureMissionListIdentities(system)) {
            await system.save();
        }

        return { system, profile, isOwner };
    };

    const findMissionListById = (system, missionListId) => {
        const normalizedMissionListId = String(missionListId || '').trim();
        if (normalizedMissionListId === 'undefined' || normalizedMissionListId === '') {
            const legacyMatches = (system.missionLists || []).filter((missionList) => isMissingSubdocumentId(missionList));
            if (legacyMatches.length === 1) {
                ensureMissionListIdentity(legacyMatches[0]);
                return { list: legacyMatches[0], repaired: true };
            }
        }

        ensureMissionListIdentities(system);
        const list = typeof system.missionLists?.id === 'function'
            ? system.missionLists.id(normalizedMissionListId)
            : (system.missionLists || []).find((missionList) => String(missionList?._id) === normalizedMissionListId);
        if (!list && normalizedMissionListId === 'undefined' && (system.missionLists || []).length === 1) {
            return { list: system.missionLists[0], repaired: true };
        }
        if (!list) {
            return { error: 'Mission list not found.', status: 404 };
        }
        return { list };
    };

    const findNodeByNodeId = (missionList, nodeId) => {
        return missionList.taskTree.find((node) => node.nodeId === nodeId) || null;
    };

    const buildAllowedRewardItemKeys = (systemPayload) => {
        const obtainableItemKeys = new Set(
            (systemPayload.obtainableItems || [])
                .map((item) => normalizeItemKey(item.itemKey))
                .filter(Boolean)
        );

        const storeProductItemKeys = new Set(
            (systemPayload.storeProducts || [])
                .filter((product) => product && product.type === 'item' && product._id)
                .map((product) => normalizeItemKey(product._id))
        );

        return new Set([...obtainableItemKeys, ...storeProductItemKeys]);
    };

    const validateRewardItemKeys = ({ itemKeys, allowedRewardItemKeys, messagePrefix = 'Task reward' }) => {
        for (const rawKey of itemKeys || []) {
            const key = normalizeItemKey(rawKey);
            if (!key) continue;
            if (!allowedRewardItemKeys.has(key)) {
                return {
                    valid: false,
                    message: `${messagePrefix} itemKey "${key}" is not in obtainableItems or storeProducts.`,
                };
            }
        }

        return { valid: true };
    };

    const validateAgainstObtainableItems = (systemPayload) => {
        const allowedRewardItemKeys = buildAllowedRewardItemKeys(systemPayload);

        const rewardItemKeys = [];
        for (const list of systemPayload.missionLists || []) {
            for (const node of list.taskTree || []) {
                for (const rewardItem of node?.rewards?.items || []) {
                    const normalizedRewardItemKey = normalizeItemKey(rewardItem.itemKey);
                    if (normalizedRewardItemKey) {
                        rewardItemKeys.push(normalizedRewardItemKey);
                    }
                }
            }
        }

        const rewardValidateResult = validateRewardItemKeys({
            itemKeys: rewardItemKeys,
            allowedRewardItemKeys,
            messagePrefix: 'Task reward',
        });
        if (!rewardValidateResult.valid) {
            return rewardValidateResult;
        }

        for (const pool of systemPayload.lotteryPools || []) {
            for (const prize of pool.prizes || []) {
                const normalizedPrizeItemKey = normalizeItemKey(prize.itemKey || prize.productId);
                if (prize.type === 'item' && normalizedPrizeItemKey && !allowedRewardItemKeys.has(normalizedPrizeItemKey)) {
                    return {
                        valid: false,
                        message: `Lottery prize itemKey "${normalizedPrizeItemKey}" is not in obtainableItems or storeProducts.`,
                    };
                }
            }

            if (pool?.consume?.type === 'item') {
                const normalizedConsumeItemKey = normalizeItemKey(pool?.consume?.itemKey);
                if (normalizedConsumeItemKey && !allowedRewardItemKeys.has(normalizedConsumeItemKey)) {
                    return {
                        valid: false,
                        message: `Lottery consume itemKey "${normalizedConsumeItemKey}" is not in obtainableItems or storeProducts.`,
                    };
                }
            }
        }

        return { valid: true };
    };

    const findItemReferenceInSystem = (system, itemKey) => {
        const normalizedKey = normalizeItemKey(itemKey);
        if (!normalizedKey) return null;

        for (const missionList of system.missionLists || []) {
            for (const node of missionList.taskTree || []) {
                for (const rewardItem of node?.rewards?.items || []) {
                    if (normalizeItemKey(rewardItem.itemKey) === normalizedKey) {
                        return {
                            kind: 'mission_reward',
                            missionListId: String(missionList._id),
                            missionListTitle: missionList.title,
                            nodeId: node.nodeId,
                            nodeTitle: node.title,
                        };
                    }
                }
            }

            for (const penaltyItem of missionList?.failureMechanism?.itemPenalty || []) {
                if (normalizeItemKey(penaltyItem.itemKey) === normalizedKey) {
                    return {
                        kind: 'failure_penalty',
                        missionListId: String(missionList._id),
                        missionListTitle: missionList.title,
                    };
                }
            }
        }

        for (const pool of system.lotteryPools || []) {
            if (pool?.consume?.type === 'item' && normalizeItemKey(pool?.consume?.itemKey) === normalizedKey) {
                return {
                    kind: 'lottery_consume',
                    poolId: String(pool._id),
                    poolName: pool.name,
                };
            }

            for (const prize of pool.prizes || []) {
                const normalizedPrizeItemKey = normalizeItemKey(prize.itemKey || prize.productId);
                if (prize.type === 'item' && normalizedPrizeItemKey === normalizedKey) {
                    return {
                        kind: 'lottery_prize',
                        poolId: String(pool._id),
                        poolName: pool.name,
                        prizeName: prize.name,
                    };
                }
            }
        }

        return null;
    };

    const findMemberByUserId = (system, userId) => {
        const member = system.members.find((entry) => String(entry.user) === String(userId)) || null;
        return ensureMemberTaskState(member);
    };

    const findMemberMissionListState = (member, missionListId) => {
        return (member.acceptedMissionLists || []).find(
            (state) => String(state.missionListId) === String(missionListId)
        ) || null;
    };

    const hasMemberCompletedNode = (member, missionListId, nodeId) => {
        return (member.taskCompletions || []).some(
            (completion) =>
                String(completion.missionListId) === String(missionListId)
                && completion.nodeId === nodeId
        );
    };

    const getLatestMemberNodeEventType = (member, missionListId, nodeId) => {
        const history = member.taskHistory || [];
        for (let index = history.length - 1; index >= 0; index -= 1) {
            const event = history[index];
            if (
                String(event.missionListId) === String(missionListId)
                && event.nodeId === nodeId
            ) {
                return event.eventType;
            }
        }
        return null;
    };

    const hasMemberFailedNode = (member, missionListId, nodeId) => {
        return getLatestMemberNodeEventType(member, missionListId, nodeId) === 'fail_task';
    };

    const normalizeAttributeName = (rawName) => {
        const value = String(rawName || '').trim().toLowerCase();
        const map = {
            stamina: 'stamina',
            strength: 'strength',
            wisdom: 'wisdom',
            discipline: 'discipline',
            charisma: 'charisma',
            luck: 'luck',
            体力: 'stamina',
            力量: 'strength',
            智慧: 'wisdom',
            纪律: 'discipline',
            魅力: 'charisma',
            幸运: 'luck',
        };
        return map[value] || null;
    };

    const applyTaskRewardsToProfile = async ({ profileId, system, rewards }) => {
        const profile = await Profile.findById(profileId);
        if (!profile) {
            throw new Error('Member profile not found.');
        }

        const safeRewards = rewards || {};

        const coins = Number(safeRewards.coins || 0);
        if (coins > 0) {
            profile.wallet.coins = (profile.wallet?.coins || 0) + coins;
        }

        for (const expReward of safeRewards.experience || []) {
            const key = normalizeAttributeName(expReward.name);
            if (!key) continue;
            if (!profile.attributes?.[key]) continue;
            profile.attributes[key].exp = (profile.attributes[key].exp || 0) + Number(expReward.value || 0);
        }

        for (const itemReward of safeRewards.items || []) {
            const itemKey = String(itemReward.itemKey || '').trim();
            const quantity = Math.max(1, Number(itemReward.quantity || 1));
            if (!itemKey) continue;

            const storeProduct = (system.storeProducts || []).find(
                (product) => String(product._id) === itemKey
            );
            const obtainableItem = (system.obtainableItems || []).find(
                (item) => item.itemKey === itemKey
            );

            const inventoryName = storeProduct?.name || obtainableItem?.name || itemKey;
            const inventoryItem = profile.inventory.find(
                (entry) => entry.inventoryKey === itemKey && String(entry.sourceSystem) === String(system._id)
            );

            if (inventoryItem) {
                inventoryItem.quantity += quantity;
            } else {
                profile.inventory.push({
                    inventoryKey: itemKey,
                    name: inventoryName,
                    type: 'item',
                    quantity,
                    sourceSystem: system._id,
                    metadata: {
                        rarity: storeProduct?.rarity || obtainableItem?.rarity || 'common',
                        image: obtainableItem?.image || null,
                    },
                });
            }
        }

        await profile.save();
        return profile;
    };

    const applyMissionFailurePenaltyToProfile = async ({ profileId, system, failureMechanism }) => {
        if (!failureMechanism?.enabled) return;

        const profile = await Profile.findById(profileId);
        if (!profile) {
            throw new Error('Member profile not found.');
        }

        for (const pointPenalty of failureMechanism.pointPenalty || []) {
            const key = normalizeAttributeName(pointPenalty.attributeName);
            if (!key || !profile.attributes?.[key]) continue;
            const deduct = Math.max(0, Number(pointPenalty.value || 0));
            profile.attributes[key].exp = Math.max(0, Number(profile.attributes[key].exp || 0) - deduct);
        }

        for (const itemPenalty of failureMechanism.itemPenalty || []) {
            const itemKey = String(itemPenalty.itemKey || '').trim();
            const quantity = Math.max(0, Number(itemPenalty.quantity || 0));
            if (!itemKey || quantity <= 0) continue;

            const inventoryItem = profile.inventory.find(
                (entry) => entry.inventoryKey === itemKey && String(entry.sourceSystem) === String(system._id)
            );

            if (!inventoryItem) continue;
            inventoryItem.quantity = Math.max(0, Number(inventoryItem.quantity || 0) - quantity);
        }

        profile.inventory = (profile.inventory || []).filter((entry) => Number(entry.quantity || 0) > 0);
        await profile.save();
    };

    const buildProfileCleanupUpdateForSystemDeletion = ({
        systemId,
        clearSystemInventory = true,
    }) => {
        const pullPayload = {
            systems: systemId,
        };

        if (clearSystemInventory) {
            pullPayload.inventory = { sourceSystem: systemId };
        }

        return {
            $pull: pullPayload,
        };
    };

    return {
        ATTRIBUTE_CATEGORIES,
        isValidObjectId,
        normalizeNodeId,
        normalizeItemKey,
        ensureProfile,
        findSystemForUser,
        findSystemForParticipant,
        findMissionListById,
        findNodeByNodeId,
        buildAllowedRewardItemKeys,
        validateRewardItemKeys,
        validateAgainstObtainableItems,
        findItemReferenceInSystem,
        findMemberByUserId,
        findMemberMissionListState,
        hasMemberCompletedNode,
        hasMemberFailedNode,
        normalizeAttributeName,
        applyTaskRewardsToProfile,
        applyMissionFailurePenaltyToProfile,
        buildProfileCleanupUpdateForSystemDeletion,
    };
}

module.exports = createSystemDomainService;
