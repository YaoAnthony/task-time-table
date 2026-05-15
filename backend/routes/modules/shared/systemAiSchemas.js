const MAX_CHILDREN_PER_NODE = 3;

const isNonEmptyString = (value) => typeof value === 'string' && value.trim().length > 0;
const getProposalPrerequisiteTempIds = (node) => [...new Set([
    node?.parentTempId || null,
    ...(Array.isArray(node?.prerequisiteTempIds) ? node.prerequisiteTempIds : []),
].filter(Boolean))];

const normalizeProposalNode = (node) => ({
    tempId: String(node?.tempId || '').trim(),
    parentTempId: node?.parentTempId ? String(node.parentTempId).trim() : null,
    prerequisiteTempIds: Array.isArray(node?.prerequisiteTempIds)
        ? [...new Set(node.prerequisiteTempIds.map((value) => String(value || '').trim()).filter(Boolean))]
        : [],
    title: String(node?.title || '').trim(),
    description: typeof node?.description === 'string' ? node.description.trim() : '',
    timeCostMinutes: Math.max(1, Number(node?.timeCostMinutes || 30)),
    rewards: {
        experience: Array.isArray(node?.rewards?.experience)
            ? node.rewards.experience
                .filter((entry) => isNonEmptyString(entry?.name))
                .map((entry) => ({
                    name: String(entry.name).trim(),
                    value: Math.max(0, Number(entry.value || 0)),
                }))
            : [],
        coins: typeof node?.rewards?.coins === 'number' ? node.rewards.coins : 0,
        items: Array.isArray(node?.rewards?.items)
            ? node.rewards.items
                .filter((item) => isNonEmptyString(item?.itemKey))
                .map((item) => ({
                    itemKey: String(item.itemKey).trim(),
                    quantity: Math.max(1, Number(item.quantity || 1)),
                }))
            : [],
    },
});

const normalizeProposal = (proposal) => {
    const nodes = Array.isArray(proposal?.nodes) ? proposal.nodes.map(normalizeProposalNode) : [];
    const mode = proposal?.mode === 'attach_to_existing_list' ? 'attach_to_existing_list' : 'create_new_list';
    const title = String(proposal?.title || '').trim();
    const repairedNodes = (() => {
        if (mode !== 'create_new_list') return nodes;

        const normalizedNodes = nodes.map((node) => (
            !node.parentTempId && Array.isArray(node.prerequisiteTempIds) && node.prerequisiteTempIds.length > 0
                ? { ...node, parentTempId: node.prerequisiteTempIds[0] }
                : node
        ));

        const rootNodes = normalizedNodes.filter((node) => !node.parentTempId);
        if (rootNodes.length <= 1) return normalizedNodes;

        const syntheticRootId = '__auto_root__';
        const syntheticRootTitle = title || 'Mission Root';
        const nodesWithParent = normalizedNodes.map((node) => (
            !node.parentTempId
                ? { ...node, parentTempId: syntheticRootId }
                : node
        ));

        return [
            {
                tempId: syntheticRootId,
                parentTempId: null,
                prerequisiteTempIds: [],
                title: syntheticRootTitle,
                description: `Auto-generated root for ${syntheticRootTitle}`,
                timeCostMinutes: 30,
                rewards: { coins: 0, items: [] },
            },
            ...nodesWithParent,
        ];
    })();
    return {
        title,
        listType: proposal?.listType === 'urgent' ? 'urgent' : 'mainline',
        mode,
        structureType: ['branched', 'merge'].includes(proposal?.structureType) ? proposal.structureType : 'linear',
        description: typeof proposal?.description === 'string' ? proposal.description.trim() : '',
        imageKeywords: typeof proposal?.imageKeywords === 'string' ? proposal.imageKeywords.trim() : '',
        attachTargetMissionListId: proposal?.attachTargetMissionListId ? String(proposal.attachTargetMissionListId).trim() : null,
        attachTargetMissionListTitle: typeof proposal?.attachTargetMissionListTitle === 'string' ? proposal.attachTargetMissionListTitle.trim() : '',
        attachTargetNodeId: proposal?.attachTargetNodeId ? String(proposal.attachTargetNodeId).trim() : null,
        attachTargetNodeTitle: typeof proposal?.attachTargetNodeTitle === 'string' ? proposal.attachTargetNodeTitle.trim() : '',
        rewardGoalSummary: typeof proposal?.rewardGoalSummary === 'string' ? proposal.rewardGoalSummary.trim() : '',
        rewardTargetCoins: typeof proposal?.rewardTargetCoins === 'number' ? Math.max(0, Number(proposal.rewardTargetCoins || 0)) : null,
        rewardPlanningMode: proposal?.rewardPlanningMode === 'user_specified' ? 'user_specified' : 'ai_suggested',
        rewardPlanningNote: typeof proposal?.rewardPlanningNote === 'string' ? proposal.rewardPlanningNote.trim() : '',
        nodes: repairedNodes,
    };
};

const validateProposalStructure = (proposal) => {
    const nodes = Array.isArray(proposal?.nodes) ? proposal.nodes : [];
    const tempIdSet = new Set(nodes.map((node) => node.tempId));
    const childCountByParent = new Map();
    const rootNodes = [];

    for (const node of nodes) {
        if (!node.parentTempId) {
            rootNodes.push(node.tempId);
        } else {
            childCountByParent.set(
                node.parentTempId,
                (childCountByParent.get(node.parentTempId) || 0) + 1,
            );
        }

        if (node.parentTempId && !tempIdSet.has(node.parentTempId)) {
            return {
                ok: false,
                message: `Node "${node.title}" references a missing parent node.`,
            };
        }

        for (const prerequisiteTempId of getProposalPrerequisiteTempIds(node)) {
            if (!tempIdSet.has(prerequisiteTempId)) {
                return {
                    ok: false,
                    message: `Node "${node.title}" references a missing prerequisite node.`,
                };
            }
            if (prerequisiteTempId === node.tempId) {
                return {
                    ok: false,
                    message: `Node "${node.title}" cannot depend on itself.`,
                };
            }
        }
    }

    for (const [parentTempId, childCount] of childCountByParent.entries()) {
        if (childCount > MAX_CHILDREN_PER_NODE) {
            const parentNode = nodes.find((node) => node.tempId === parentTempId);
            const parentTitle = parentNode?.title || parentTempId;
            return {
                ok: false,
                message: `Node "${parentTitle}" has ${childCount} direct child tasks, which exceeds the limit of ${MAX_CHILDREN_PER_NODE}. Split it into more layers or branches.`,
            };
        }
    }

    if (proposal.mode !== 'attach_to_existing_list' && rootNodes.length !== 1) {
        return {
            ok: false,
            message: `A new mission list must have exactly 1 root node, but this proposal has ${rootNodes.length}.`,
        };
    }

    const nodeMap = new Map(nodes.map((node) => [node.tempId, node]));
    const visitState = new Map();
    const visit = (tempId, path = []) => {
        const state = visitState.get(tempId);
        if (state === 'visiting') {
            const cyclePath = [...path, tempId].join(' -> ');
            return { ok: false, message: `Task graph contains a dependency cycle: ${cyclePath}` };
        }
        if (state === 'done') return { ok: true };

        visitState.set(tempId, 'visiting');
        const node = nodeMap.get(tempId);
        for (const prerequisiteTempId of getProposalPrerequisiteTempIds(node)) {
            const result = visit(prerequisiteTempId, [...path, tempId]);
            if (!result.ok) return result;
        }
        visitState.set(tempId, 'done');
        return { ok: true };
    };

    for (const node of nodes) {
        const result = visit(node.tempId);
        if (!result.ok) return result;
    }

    return { ok: true };
};

const validateProposal = (proposal) => {
    if (!proposal || !isNonEmptyString(proposal.title) || !Array.isArray(proposal.nodes) || proposal.nodes.length === 0) {
        return { ok: false, message: '无效的方案数据' };
    }

    if (proposal.mode === 'attach_to_existing_list' && !isNonEmptyString(proposal.attachTargetMissionListId || '')) {
        return { ok: false, message: '挂接现有任务链时必须指定目标任务链' };
    }

    for (const node of proposal.nodes) {
        if (!isNonEmptyString(node.tempId) || !isNonEmptyString(node.title)) {
            return { ok: false, message: '任务节点缺少必要字段' };
        }
    }

    return validateProposalStructure(proposal);
};

module.exports = {
    MAX_CHILDREN_PER_NODE,
    normalizeProposal,
    validateProposal,
    validateProposalStructure,
};
