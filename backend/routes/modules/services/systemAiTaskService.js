const OpenAI = require('openai');
const { normalizeProposal, validateProposal, MAX_CHILDREN_PER_NODE } = require('../shared/systemAiSchemas');
const { ANIMAL_CROSSING_ASSISTANT_STYLE } = require('../shared/animalCrossingAgentStyle');

const buildMissionContext = (system) => (system.missionLists || []).map((missionList) => ({
    id: missionList._id.toString(),
    title: missionList.title,
    type: missionList.listType,
    description: missionList.description || '',
    nodeCount: (missionList.taskTree || []).length,
    nodes: (missionList.taskTree || []).slice(0, 8).map((node) => ({
        title: node.title,
        description: node.description || '',
        timeCostMinutes: node.timeCostMinutes,
    })),
}));

const buildAttachableMissionContext = (system) => (system.missionLists || []).map((missionList) => ({
    id: missionList._id.toString(),
    title: missionList.title,
    nodes: (missionList.taskTree || []).map((node) => ({
        nodeId: node.nodeId,
        title: node.title,
    })),
}));

const buildStoreContext = (system) => (system.storeProducts || [])
    .filter((product) => product.isListed !== false)
    .map((product) => ({
        itemKey: product._id.toString(),
        name: product.name,
        type: product.type,
        price: product.price,
        description: product.description || '',
    }));

const buildObtainableContext = (system) => (system.obtainableItems || []).map((item) => ({
    itemKey: item.itemKey || item._id.toString(),
    name: item.name,
    description: item.description || '',
}));

const REWARD_TARGET_PATTERN = /(\d+\s*(金币|coin|coins|元|块|dollars?))|(赚|获得|奖励|金币|coin|coins|预算|报酬|收益|多少钱|经验|exp|xp|物品|道具|奖励目标|你来建议)/i;

const shouldAskRewardTarget = (messages = []) => {
    const userTexts = messages
        .filter((message) => message?.role === 'user')
        .map((message) => String(message?.content || '').trim())
        .filter(Boolean);

    if (userTexts.length === 0) return false;

    const combined = userTexts.join('\n');
    const planningIntent = /(任务|计划|规划|mission|task|系列任务|任务树|分支|新建一个任务列表)/i.test(combined);
    if (!planningIntent) return false;

    return !REWARD_TARGET_PATTERN.test(combined);
};

const buildSystemPrompt = (system) => {
    const missionContext = buildMissionContext(system);
    const storeContext = buildStoreContext(system);
    const obtainableContext = buildObtainableContext(system);
    const attachableMissionContext = buildAttachableMissionContext(system);

    return `${ANIMAL_CROSSING_ASSISTANT_STYLE}

你是「${system.name}」系统的任务规划助手。

当前系统已有的任务列表（${missionContext.length} 个）：
${missionContext.length > 0 ? JSON.stringify(missionContext, null, 2) : '（暂无任务列表）'}

系统商店商品（可作为任务奖励）：
${storeContext.length > 0 ? JSON.stringify(storeContext, null, 2) : '（暂无商店商品）'}

系统可获得物品（可作为任务奖励）：
${obtainableContext.length > 0 ? JSON.stringify(obtainableContext, null, 2) : '（暂无可获得物品）'}

可挂接的现有任务链：
${attachableMissionContext.length > 0 ? JSON.stringify(attachableMissionContext, null, 2) : '（暂无可挂接任务链）'}

你的职责：
- 理解用户想完成的目标或计划
- 将目标分解成具体可执行的任务步骤（3~8 个节点）
- 如果任务天然包含并行模块，例如“前端 / 后端 / 测试 / 部署”，优先生成分支树，而不是强行线性排列
- 如果多个分支都完成后才能进入下一阶段，请使用 prerequisiteTempIds 表达“合流解锁”
- 主动询问或建议合理的任务奖励，结合商店商品推荐
- 若用户没有明确说奖励，你可以根据任务难度和时长给出建议，并在 propose 时包含进去
- 用 propose_mission_list 工具返回方案预览，等用户确认后再创建
- 如果更适合接到现有任务链里，而不是新建整套任务链，请返回 attach_to_existing_list 模式，并带上目标任务链和目标节点
- 若信息不足，先用文字提问用户
- 每个节点需要估算所需时间（分钟）

节点结构说明：
- 节点形成树，每个节点最多 3 个子节点
- 简单顺序任务可用线性链；并行模块任务优先分叉；需要合流时使用 prerequisiteTempIds
- nodes 数组第一个 parentTempId 为 null 的节点是根节点
- 每个节点可以有独立的奖励（coins + items）

风格：温和、清楚、像小镇公告板旁边的邻居在帮忙规划，中文回复。`;
};

const buildTools = () => [{
    type: 'function',
    function: {
        name: 'propose_mission_list',
        description: '生成任务列表方案预览，返回给用户确认，不直接创建到数据库',
        parameters: {
            type: 'object',
            required: ['title', 'listType', 'description', 'imageKeywords', 'nodes', 'replyMessage', 'mode', 'structureType', 'rewardPlanningMode'],
            properties: {
                mode: {
                    type: 'string',
                    enum: ['create_new_list', 'attach_to_existing_list'],
                    description: '创建新的任务链，或挂接到现有任务链',
                },
                structureType: {
                    type: 'string',
                    enum: ['linear', 'branched', 'merge'],
                    description: '任务结构形态',
                },
                title: { type: 'string', description: '任务列表标题' },
                listType: {
                    type: 'string',
                    enum: ['mainline', 'urgent'],
                    description: 'mainline=主线任务，urgent=紧急任务',
                },
                description: { type: 'string', description: '任务列表一句话描述' },
                imageKeywords: {
                    type: 'string',
                    description: '用于搜索封面图的英文关键词，2~4 个词，空格分隔，例如 "study reading books"',
                },
                attachTargetMissionListId: { type: ['string', 'null'] },
                attachTargetMissionListTitle: { type: 'string' },
                attachTargetNodeId: { type: ['string', 'null'] },
                attachTargetNodeTitle: { type: 'string' },
                rewardGoalSummary: {
                    type: 'string',
                    description: '用户期望获得的总收益概述，例如“300 金币 + 1 个稀有道具 + 一些纪律经验”。',
                },
                rewardTargetCoins: {
                    type: ['number', 'null'],
                    description: '总金币目标。若用户明确给出金额，填写该金额；若用户要求 AI 建议，可填写建议值。',
                },
                rewardPlanningMode: {
                    type: 'string',
                    enum: ['user_specified', 'ai_suggested'],
                    description: '总奖励金额是用户明确指定，还是 AI 建议。',
                },
                rewardPlanningNote: {
                    type: 'string',
                    description: '简短说明总奖励金额的由来，例如“用户要求 300 金币”或“根据 4 小时工作量建议 240 金币”。',
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
                            prerequisiteTempIds: {
                                type: 'array',
                                items: { type: 'string' },
                                description: '若该节点需要多个前置节点都完成才解锁，在这里列出所有前置 tempId',
                            },
                            title: { type: 'string' },
                            description: { type: 'string' },
                            timeCostMinutes: { type: 'number' },
                            rewards: {
                                type: 'object',
                                properties: {
                                    coins: { type: 'number', description: '金币奖励数量' },
                                    items: {
                                        type: 'array',
                                        items: {
                                            type: 'object',
                                            properties: {
                                                itemKey: { type: 'string', description: '物品 key' },
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

const buildPreviewResponse = (proposal, reply) => ({
    reply,
    action: 'preview',
    proposal: {
        mode: proposal.mode || 'create_new_list',
        structureType: proposal.structureType || 'linear',
        title: proposal.title,
        listType: proposal.listType || 'mainline',
        description: proposal.description,
        imageKeywords: proposal.imageKeywords,
        attachTargetMissionListId: proposal.attachTargetMissionListId || null,
        attachTargetMissionListTitle: proposal.attachTargetMissionListTitle || '',
        attachTargetNodeId: proposal.attachTargetNodeId || null,
        attachTargetNodeTitle: proposal.attachTargetNodeTitle || '',
        rewardGoalSummary: proposal.rewardGoalSummary || '',
        rewardTargetCoins: typeof proposal.rewardTargetCoins === 'number' ? proposal.rewardTargetCoins : null,
        rewardPlanningMode: proposal.rewardPlanningMode || 'ai_suggested',
        rewardPlanningNote: proposal.rewardPlanningNote || '',
        nodes: proposal.nodes,
    },
});

const requestProposal = async ({ openai, system, messages }) => {
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: buildSystemPrompt(system) }, ...messages],
        tools: buildTools(),
        tool_choice: 'auto',
        max_tokens: 4096,
    });

    const choice = completion.choices[0];
    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        return {
            reply: choice.message.content,
            action: null,
        };
    }

    const args = JSON.parse(choice.message.tool_calls[0].function.arguments);
    const proposal = normalizeProposal(args);
    return {
        reply: args.replyMessage,
        action: 'preview',
        proposal,
    };
};

const runSystemAiTaskChat = async ({ system, messages }) => {
    if (!process.env.OPENAI_API_KEY) {
        return { error: 'AI 功能未配置，请联系管理员设置 OPENAI_API_KEY', status: 503 };
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'system', content: buildSystemPrompt(system) }, ...messages],
        tools: buildTools(),
        tool_choice: 'auto',
        max_tokens: 4096,
    });

    const choice = completion.choices[0];
    if (!choice.message.tool_calls || choice.message.tool_calls.length === 0) {
        return {
            reply: choice.message.content,
            action: null,
        };
    }

    const args = JSON.parse(choice.message.tool_calls[0].function.arguments);
    return {
        reply: args.replyMessage || `已为你规划任务列表「${args.title}」，请确认方案。`,
        action: 'preview',
        proposal: {
            mode: args.mode || 'create_new_list',
            structureType: args.structureType || 'linear',
            title: args.title,
            listType: args.listType || 'mainline',
            description: args.description,
            imageKeywords: args.imageKeywords,
            attachTargetMissionListId: args.attachTargetMissionListId || null,
            attachTargetMissionListTitle: args.attachTargetMissionListTitle || '',
            attachTargetNodeId: args.attachTargetNodeId || null,
            attachTargetNodeTitle: args.attachTargetNodeTitle || '',
            nodes: args.nodes,
        },
    };
};

const runSystemAiTaskChatWithValidation = async ({ system, messages }) => {
    if (!process.env.OPENAI_API_KEY) {
        return { error: 'AI 鍔熻兘鏈厤缃紝璇疯仈绯荤鐞嗗憳璁剧疆 OPENAI_API_KEY', status: 503 };
    }

    if (shouldAskRewardTarget(messages)) {
        return {
            reply: '在我开始生成任务树之前，我想先确认总收益目标：你希望完成这套任务后获得哪些收益？可以是金币、物品、经验成长，或者它们的组合。如果你暂时没想好，也可以直接告诉我“你来建议”。',
            action: null,
        };
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const firstPass = await requestProposal({ openai, system, messages });
    if (firstPass.action !== 'preview' || !firstPass.proposal) {
        return firstPass;
    }

    const firstValidation = validateProposal(firstPass.proposal);
    if (firstValidation.ok) {
        return buildPreviewResponse(
            firstPass.proposal,
            firstPass.reply || `我把「${firstPass.proposal.title}」整理成一份小计划啦，你看看这样安排顺不顺手。`,
        );
    }

    const retryInstruction = [
        'Your previous proposal violated the task graph constraints and must be redesigned.',
        `Problem found: ${firstValidation.message}`,
        `Hard rule: every node can have at most ${MAX_CHILDREN_PER_NODE} direct child tasks.`,
        'Please redesign the task graph now, keep the same user intent, and explicitly mention in replyMessage that you detected the problem and corrected it.',
    ].join('\n');

    const secondPass = await requestProposal({
        openai,
        system,
        messages: [
            ...messages,
            { role: 'assistant', content: 'I found a structural issue in my previous draft and will redesign it.' },
            { role: 'user', content: retryInstruction },
        ],
    });

    if (secondPass.action !== 'preview' || !secondPass.proposal) {
        return secondPass;
    }

    const secondValidation = validateProposal(secondPass.proposal);
    if (secondValidation.ok) {
        return buildPreviewResponse(
            secondPass.proposal,
            secondPass.reply
                || `刚才那版分支有点太挤了，我重新整理成更清爽的任务树啦，你再看看。`,
        );
    }

    return {
        reply: `我检查了两次，任务树还是有点打结：${secondValidation.message}。我们把目标拆小一点，我再帮你重新排一版。`,
        action: null,
    };
};

module.exports = {
    runSystemAiTaskChat: runSystemAiTaskChatWithValidation,
};
