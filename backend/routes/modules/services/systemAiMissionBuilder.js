const buildTaskTreeFromProposal = (proposal, options = {}) => {
    const attachParentNodeId = options.attachParentNodeId || null;
    const nodeMap = new Map();
    proposal.nodes.forEach((node, index) => {
        nodeMap.set(node.tempId, `node-${Date.now()}-${index}`);
    });

    const taskTree = proposal.nodes.map((node) => {
        const nodeId = nodeMap.get(node.tempId);
        const parentNodeId = node.parentTempId
            ? nodeMap.get(node.parentTempId) || null
            : attachParentNodeId;
        const prerequisiteNodeIds = [
            ...new Set([
                ...(Array.isArray(node.prerequisiteTempIds)
                    ? node.prerequisiteTempIds.map((tempId) => nodeMap.get(tempId)).filter(Boolean)
                    : []),
                ...(attachParentNodeId && !node.parentTempId ? [attachParentNodeId] : []),
            ]),
        ];
        const childrenNodeIds = proposal.nodes
            .filter((candidate) => candidate.parentTempId === node.tempId)
            .map((candidate) => nodeMap.get(candidate.tempId));

        return {
            nodeId,
            parentNodeId,
            prerequisiteNodeIds,
            title: node.title,
            description: node.description || '',
            timeCostMinutes: Math.max(1, node.timeCostMinutes || 30),
            canInterrupt: false,
            childrenNodeIds,
            status: 'pending',
            rewards: {
                experience: Array.isArray(node.rewards?.experience) ? node.rewards.experience : [],
                coins: typeof node.rewards?.coins === 'number' ? node.rewards.coins : 0,
                items: Array.isArray(node.rewards?.items) ? node.rewards.items : [],
            },
        };
    });

    const rootNode = taskTree.find((node) => node.parentNodeId === null);
    return {
        rootNodeId: rootNode?.nodeId || null,
        taskTree,
    };
};

module.exports = {
    buildTaskTreeFromProposal,
};
