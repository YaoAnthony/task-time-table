const {
    GAME_MCP_TOOLS,
    callGameMcpTool,
    normalizeNpcActionsForRuntime,
} = require('./gameMcpToolService');

const MAX_TOOL_ROUNDS = 8;
const HOUSE_INTENT_RE = /房子|屋子|房间|屋里|进屋|进房|进去|回家|睡觉|这是你的家|这是你的房|住这里|home|house|inside|enter|sleep/i;

function safeJsonParse(text, fallback = {}) {
    try {
        return JSON.parse(text || '{}');
    } catch (_) {
        return fallback;
    }
}

function parseToolArgs(raw) {
    if (!raw) return {};
    if (typeof raw === 'object') return raw;
    return safeJsonParse(raw, {});
}

function shouldForceObserve(text) {
    if (HOUSE_INTENT_RE.test(String(text || ''))) return true;
    if (/看见|看到|观察|附近|周围|屋里|房间|地上|里面|外面|what.*see|nearby|around|room|ground/i.test(String(text || ''))) return true;
    return /看|看到|观察|附近|周围|屋里|房间|地上|what.*see|nearby|around|room|ground/i.test(String(text || ''));
}

function shouldForceInventory(text) {
    if (/背包|库存|身上|拿着|有没有|持有|inventory|have/i.test(String(text || ''))) return true;
    return /背包|库存|身上|拿着|有没有|持有|inventory|have/i.test(String(text || ''));
}

function mergeActions(primary, planned) {
    const result = [];
    const seen = new Set();
    const push = (action) => {
        if (!action || !action.type) return;
        const key = JSON.stringify(action);
        if (seen.has(key)) return;
        seen.add(key);
        result.push(action);
    };
    primary.forEach(push);
    planned.forEach(push);
    return result;
}

async function createChatCompletion(openai, params) {
    try {
        return await openai.chat.completions.create(params);
    } catch (err) {
        const message = String(err?.message || '');
        if (params.response_format && /response_format|json_object|tool/i.test(message)) {
            const { response_format, ...fallbackParams } = params;
            return openai.chat.completions.create(fallbackParams);
        }
        throw err;
    }
}

async function runNpcMcpAgent(options) {
    const {
        openai,
        model,
        systemContent,
        userPrompt,
        playerMessage,
        toolContext,
        temperature = 0.7,
        maxTokens = 700,
    } = options;

    const messages = [
        {
            role: 'system',
            content: `${systemContent}

MCP tool rules:
- You have real game MCP tools. Use them before answering requests about seeing, nearby objects, inventory, picking up, dropping, moving, inspecting places, houses, homes, rooms, or using skills.
- Tool results are authoritative current game state. If a tool result contradicts memory or examples, trust the tool result.
- World/room identity matters. Preserve worldId from tool results in coordinate actions; never treat bare x/y from a room as village coordinates.
- If the player assigns a house/home ("this is your house", "这是你的房子", "住这里"), call remember_home_house.
- If the player asks you to enter/go inside/go home/sleep in a house, call enter_house. If they assign the house and also ask you to enter, call remember_home_house first, then enter_house.
- If you call pickup_item, drop_item, move_to, use_skill, talk_with, enter_house, or remember_home_house, include the resulting action in the final JSON actions array.
- For compound errands, build an ordered todo/action list. Example: "enter the room, get the hoe/tool, come back to me" should produce actions like enter_house, pickup_item(scythe), move_to(player).
- If the player says hoe/锄头 and the world uses scythe as the farm tool item, use itemId "scythe".
- After planning multiple actions, keep all actions in the final JSON in execution order.
- Final response must be a JSON object: {"reply":"...","actions":[...]}.`,
        },
        { role: 'user', content: userPrompt },
    ];

    const toolEvents = [];
    const plannedActions = [];
    let forcedTool = null;
    if (shouldForceObserve(playerMessage)) {
        forcedTool = { type: 'function', function: { name: 'observe_environment' } };
    } else if (shouldForceInventory(playerMessage)) {
        forcedTool = { type: 'function', function: { name: 'check_inventory' } };
    }

    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
        const completion = await createChatCompletion(openai, {
            model,
            messages,
            tools: GAME_MCP_TOOLS,
            tool_choice: round === 0 && forcedTool ? forcedTool : 'auto',
            max_tokens: maxTokens,
            temperature,
            response_format: { type: 'json_object' },
        });

        const message = completion.choices[0]?.message || {};
        const toolCalls = message.tool_calls || [];
        messages.push(message);

        if (!toolCalls.length) {
            const raw = message.content || '{}';
            const parsed = safeJsonParse(raw, {
                reply: String(raw || '').trim() || '……',
                actions: [],
            });
            const reply = String(parsed.reply || '……').trim();
            const actions = normalizeNpcActionsForRuntime(
                mergeActions(plannedActions, Array.isArray(parsed.actions) ? parsed.actions : []),
                toolContext,
            );
            return { reply, actions, raw, toolEvents, plannedActions };
        }

        for (const toolCall of toolCalls) {
            const name = toolCall.function?.name;
            const args = parseToolArgs(toolCall.function?.arguments);
            const result = callGameMcpTool(name, args, toolContext);
            if (result.action) plannedActions.push(result.action);
            toolEvents.push({
                name,
                args,
                ok: result.ok !== false,
                memoryText: result.memoryText,
                action: result.action || null,
            });
            messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: JSON.stringify({
                    ok: result.ok !== false,
                    data: result.data,
                    action: result.action,
                }),
            });
        }
    }

    messages.push({
        role: 'user',
        content: 'Return the final JSON now. Use the MCP tool results above. Do not call more tools.',
    });
    const finalCompletion = await createChatCompletion(openai, {
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
        response_format: { type: 'json_object' },
    });
    const raw = finalCompletion.choices[0]?.message?.content || '{}';
    const parsed = safeJsonParse(raw, {
        reply: String(raw || '').trim() || '……',
        actions: [],
    });
    return {
        reply: String(parsed.reply || '……').trim(),
        actions: normalizeNpcActionsForRuntime(
            mergeActions(plannedActions, Array.isArray(parsed.actions) ? parsed.actions : []),
            toolContext,
        ),
        raw,
        toolEvents,
        plannedActions,
    };
}

module.exports = {
    runNpcMcpAgent,
};
