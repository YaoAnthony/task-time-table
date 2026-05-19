const { normalizeProposal, validateProposal } = require('./shared/systemAiSchemas');
const { createObjectId } = require('../../db/objectIdCompat');
const { resolveSystemAiCover } = require('./services/systemAiCoverService');
const { buildTaskTreeFromProposal } = require('./services/systemAiMissionBuilder');
const { runSystemAiTaskChat } = require('./services/systemAiTaskService');

function registerSystemAiRoutes(router, deps) {
    const {
        authenticateToken,
        findSystemForUser,
        findMissionListById,
        findNodeByNodeId,
        emitSystemUpdateEvent,
    } = deps;

    router.post('/:systemId/ai-task-chat', authenticateToken, async (req, res) => {
        const { systemId } = req.params;
        const { messages } = req.body;

        if (!Array.isArray(messages)) {
            return res.status(400).json({ message: 'messages must be an array' });
        }

        try {
            const { system, error, status } = await findSystemForUser(req.user.id, systemId);
            if (error) return res.status(status || 404).json({ message: error });

            const result = await runSystemAiTaskChat({ system, messages });
            if (result?.error) {
                return res.status(result.status || 500).json({ message: result.error });
            }
            return res.json(result);
        } catch (error) {
            console.error('[AI Task Chat] error:', error);
            return res.status(500).json({ message: 'AI 请求失败', error: error.message });
        }
    });

    router.post('/:systemId/ai-task-confirm', authenticateToken, async (req, res) => {
        const { systemId } = req.params;
        const proposal = normalizeProposal(req.body?.proposal);
        const validation = validateProposal(proposal);

        if (!validation.ok) {
            return res.status(400).json({ message: validation.message });
        }

        try {
            const { system, error, status } = await findSystemForUser(req.user.id, systemId);
            if (error) return res.status(status || 404).json({ message: error });

            const imageUrl = await resolveSystemAiCover(proposal);
            if (proposal.mode === 'attach_to_existing_list') {
                const missionResult = findMissionListById(system, proposal.attachTargetMissionListId);
                if (missionResult.error) {
                    return res.status(missionResult.status || 400).json({ message: missionResult.error });
                }
                const missionList = missionResult.list;
                const attachNode = proposal.attachTargetNodeId ? findNodeByNodeId(missionList, proposal.attachTargetNodeId) : null;
                if (proposal.attachTargetNodeId && !attachNode) {
                    return res.status(400).json({ message: '挂接目标节点不存在' });
                }

                const { taskTree } = buildTaskTreeFromProposal(proposal, {
                    attachParentNodeId: attachNode?.nodeId || null,
                });
                const rootIds = taskTree.filter((node) => node.parentNodeId === (attachNode?.nodeId || null)).map((node) => node.nodeId);
                if (attachNode) {
                    if ((attachNode.childrenNodeIds || []).length + rootIds.length > 3) {
                        return res.status(400).json({ message: '挂接目标节点的子任务数量超过上限 3 个' });
                    }
                    attachNode.childrenNodeIds = [...new Set([...(attachNode.childrenNodeIds || []), ...rootIds])];
                } else if (!missionList.rootNodeId && taskTree[0]) {
                    missionList.rootNodeId = taskTree[0].nodeId;
                }
                missionList.taskTree.push(...taskTree);
                await system.save();

                emitSystemUpdateEvent(String(system._id), {
                    type: 'mission_list_updated',
                    systemId: String(system._id),
                    missionListId: String(missionList._id),
                    missionListTitle: missionList.title,
                    timestamp: new Date().toISOString(),
                });
                return res.json({
                    success: true,
                    reply: `好呀，我把 ${proposal.nodes.length} 个小任务接到「${missionList.title}」里了，像给小路补上几块踏脚石一样。`,
                    action: 'attached_mission_nodes',
                    missionList,
                });
            }

            const { rootNodeId, taskTree } = buildTaskTreeFromProposal(proposal);

            if (!Array.isArray(system.missionLists)) system.missionLists = [];
            system.missionLists.push({
                _id: createObjectId(),
                listType: proposal.listType || 'mainline',
                title: proposal.title,
                image: imageUrl,
                description: proposal.description || '',
                unlockCondition: { type: 'direct', attributeName: null, minLevel: 0 },
                failureMechanism: { enabled: false, pointPenalty: [], itemPenalty: [] },
                rootNodeId,
                taskTree,
            });

            await system.save();

            const newList = system.missionLists[system.missionLists.length - 1];
            emitSystemUpdateEvent(String(system._id), {
                type: 'mission_list_created',
                systemId: String(system._id),
                missionListId: String(newList._id),
                missionListTitle: newList.title,
                timestamp: new Date().toISOString(),
            });

            return res.json({
                success: true,
                reply: `「${proposal.title}」已经放进你的任务板啦，一共 ${proposal.nodes.length} 个小目标，慢慢来就好。`,
                action: 'created_mission_list',
                missionList: newList,
            });
        } catch (error) {
            console.error('[AI Task Confirm] error:', error);
            return res.status(500).json({ message: '创建失败', error: error.message });
        }
    });
}

module.exports = registerSystemAiRoutes;
