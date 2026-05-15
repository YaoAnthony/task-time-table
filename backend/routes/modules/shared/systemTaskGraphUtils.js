const unique = (values) => [...new Set((values || []).filter(Boolean))];

// Task graph state is business data, not transport/UI data. Keep mutation helpers here
// so route handlers can reparent/delete nodes without scattering graph rules everywhere.
const getEffectivePrerequisiteNodeIds = (node) => unique([
    node?.parentNodeId || null,
    ...(Array.isArray(node?.prerequisiteNodeIds) ? node.prerequisiteNodeIds : []),
]);

const syncNodeParentDependency = (node, nextParentNodeId, removedNodeIds = []) => {
    const removed = new Set((removedNodeIds || []).filter(Boolean));
    const currentParentNodeId = node?.parentNodeId || null;
    const prerequisiteNodeIds = Array.isArray(node?.prerequisiteNodeIds) ? node.prerequisiteNodeIds : [];

    const kept = prerequisiteNodeIds.filter((prerequisiteNodeId) => (
        prerequisiteNodeId
        && prerequisiteNodeId !== node.nodeId
        && prerequisiteNodeId !== currentParentNodeId
        && !removed.has(prerequisiteNodeId)
    ));

    node.parentNodeId = nextParentNodeId || null;
    node.prerequisiteNodeIds = unique([
        ...kept,
        nextParentNodeId || null,
    ]).filter((prerequisiteNodeId) => prerequisiteNodeId !== node.nodeId);
};

const removeDeletedNodeReferences = (missionList, deletedNodeIds) => {
    const deleted = new Set((deletedNodeIds || []).filter(Boolean));
    if (deleted.size === 0) return;

    for (const node of missionList.taskTree || []) {
        node.childrenNodeIds = (node.childrenNodeIds || []).filter((childNodeId) => !deleted.has(childNodeId));
        node.prerequisiteNodeIds = (node.prerequisiteNodeIds || []).filter((prerequisiteNodeId) => (
            prerequisiteNodeId
            && prerequisiteNodeId !== node.nodeId
            && !deleted.has(prerequisiteNodeId)
        ));
        if (node.parentNodeId && deleted.has(node.parentNodeId)) {
            node.parentNodeId = null;
        }
    }
};

const validateMissionGraphAcyclic = (missionList) => {
    const nodes = missionList?.taskTree || [];
    const nodeMap = new Map(nodes.map((node) => [node.nodeId, node]));

    for (const node of nodes) {
        for (const prerequisiteNodeId of getEffectivePrerequisiteNodeIds(node)) {
            if (prerequisiteNodeId === node.nodeId) {
                return { ok: false, message: `Node "${node.title}" cannot depend on itself.` };
            }
            if (!nodeMap.has(prerequisiteNodeId)) {
                return { ok: false, message: `Node "${node.title}" references a missing prerequisite node.` };
            }
        }
    }

    const visitState = new Map();
    const visit = (nodeId, path = []) => {
        const state = visitState.get(nodeId);
        if (state === 'visiting') {
            const cyclePath = [...path, nodeId].join(' -> ');
            return { ok: false, message: `Task graph contains a dependency cycle: ${cyclePath}` };
        }
        if (state === 'done') return { ok: true };

        visitState.set(nodeId, 'visiting');
        const node = nodeMap.get(nodeId);
        for (const prerequisiteNodeId of getEffectivePrerequisiteNodeIds(node)) {
            const result = visit(prerequisiteNodeId, [...path, nodeId]);
            if (!result.ok) return result;
        }
        visitState.set(nodeId, 'done');
        return { ok: true };
    };

    for (const node of nodes) {
        const result = visit(node.nodeId);
        if (!result.ok) return result;
    }

    return { ok: true };
};

module.exports = {
    getEffectivePrerequisiteNodeIds,
    syncNodeParentDependency,
    removeDeletedNodeReferences,
    validateMissionGraphAcyclic,
};
