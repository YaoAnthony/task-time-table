const ITEM_LABELS = {
    watering_can: '水壶',
    axe: '斧头',
    scythe: '镰刀',
    wheat_seed: '小麦种子',
    tomato_seed: '番茄种子',
    wheat: '小麦',
    tomato: '番茄',
    fruit: '苹果',
    raspberry: '树莓',
    log: '木头',
    stone: '石头',
    berry: '浆果',
    apple: '苹果',
    egg: '鸡蛋',
};

const ITEM_ALIASES = {
    hoe: 'scythe',
    '锄头': 'scythe',
    '锄': 'scythe',
    '镰刀': 'scythe',
    scythe: 'scythe',
    axe: 'axe',
    '斧头': 'axe',
    '斧子': 'axe',
    watering_can: 'watering_can',
    wateringcan: 'watering_can',
    '水壶': 'watering_can',
    '浇水壶': 'watering_can',
};

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function asObject(value) {
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function compactJson(value, limit = 3500) {
    const text = JSON.stringify(value);
    if (text.length <= limit) return text;
    return `${text.slice(0, limit)}...`;
}

function itemLabel(itemId) {
    return ITEM_LABELS[itemId] || itemId || 'unknown';
}

function normalizeItemId(itemId) {
    const raw = String(itemId || '').trim();
    if (!raw) return '';
    return ITEM_ALIASES[raw] || ITEM_ALIASES[raw.toLowerCase()] || raw;
}

function normalizeInventory(input) {
    const source = asObject(input);
    const result = {};
    Object.entries(source).forEach(([itemId, qty]) => {
        const quantity = Number(qty || 0);
        if (quantity > 0) result[itemId] = quantity;
    });
    return result;
}

function getPlayerInventory(gameSave, userId) {
    const player = gameSave?.players?.[String(userId)] || Object.values(gameSave?.players || {})[0] || null;
    const flat = asArray(player?.inventory?.gameInventory);
    const result = {};
    flat.forEach((entry) => {
        const itemId = entry?.itemId;
        const qty = Number(entry?.quantity || 0);
        if (itemId && qty > 0) result[itemId] = (result[itemId] || 0) + qty;
    });
    return result;
}

function currentContext(ctx) {
    return asObject(ctx.perceptionContext);
}

function visibleDrops(ctx) {
    const context = currentContext(ctx);
    const direct = asArray(context.visibleDrops);
    const agentObjects = asArray(context.agentWorld?.visibleObjects)
        .filter((entry) => typeof entry?.kind === 'string' && entry.kind.startsWith('drop:'))
        .map((entry) => ({
            id: entry.id,
            itemId: String(entry.kind).slice('drop:'.length),
            x: entry.x,
            y: entry.y,
            distance: entry.distance,
            source: 'agentWorld',
        }));
    const seen = new Set();
    return [...direct, ...agentObjects]
        .filter((drop) => drop && drop.itemId && !drop.claimed)
        .filter((drop) => {
            const key = drop.id || `${drop.itemId}:${drop.x}:${drop.y}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0));
}

function visibleObjects(ctx) {
    const context = currentContext(ctx);
    const direct = asArray(context.visibleObjects);
    const agentObjects = asArray(context.agentWorld?.visibleObjects)
        .filter((entry) => typeof entry?.kind === 'string' && !entry.kind.startsWith('drop:'))
        .map((entry) => ({
            id: entry.id,
            type: entry.kind,
            x: entry.x,
            y: entry.y,
            distance: entry.distance,
            state: entry.state,
            affordances: entry.affordances,
            source: 'agentWorld',
        }));
    return [...direct, ...agentObjects]
        .filter(Boolean)
        .sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0));
}

function findDrop(ctx, itemId) {
    const drops = visibleDrops(ctx);
    const normalizedItemId = normalizeItemId(itemId);
    if (!normalizedItemId) return drops[0] || null;
    return drops.find((drop) => normalizeItemId(drop.itemId) === normalizedItemId) || null;
}

function summarizeEnvironment(ctx) {
    const context = currentContext(ctx);
    const drops = visibleDrops(ctx).slice(0, 10).map((drop) => ({
        id: drop.id,
        itemId: drop.itemId,
        label: itemLabel(drop.itemId),
        x: Math.round(Number(drop.x || 0)),
        y: Math.round(Number(drop.y || 0)),
        distance: Math.round(Number(drop.distance || 0)),
    }));
    const objects = visibleObjects(ctx).slice(0, 12).map((objectItem) => ({
        id: objectItem.id,
        type: objectItem.type || objectItem.kind,
        x: Math.round(Number(objectItem.x || 0)),
        y: Math.round(Number(objectItem.y || 0)),
        distance: Math.round(Number(objectItem.distance || 0)),
        state: objectItem.state,
        affordances: objectItem.affordances,
    }));
    return {
        perceptionText: ctx.perception || '',
        self: context.self || null,
        summary: context.summary || null,
        nearest: context.nearest || null,
        visibleDrops: drops,
        visibleObjects: objects,
        visibleEntities: asArray(context.visibleEntities).slice(0, 8),
        visibleCrops: asArray(context.visibleCrops).slice(0, 8),
        landmarks: asArray(context.landmarks).slice(0, 8),
        currentPlace: context.agentWorld?.currentPlace || null,
        nearbyPlaces: asArray(context.agentWorld?.nearbyPlaces).slice(0, 6),
        availableActions: asArray(context.agentWorld?.availableActions).slice(0, 12),
    };
}

function makeToolResult({ ok = true, data = {}, action = null, memoryText = '' }) {
    return {
        ok,
        data,
        action,
        memoryText,
        content: [
            {
                type: 'text',
                text: compactJson({ ok, ...data, action }),
            },
        ],
    };
}

const tools = [
    {
        type: 'function',
        function: {
            name: 'observe_environment',
            description: 'Observe the NPC current nearby world state: drops, beds, chests, nests, trees, NPCs, landmarks, and current place.',
            parameters: {
                type: 'object',
                properties: {
                    reason: { type: 'string', description: 'Why the NPC is observing.' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'check_inventory',
            description: 'Check current inventory. Use owner=self for NPC inventory or owner=player for player inventory.',
            parameters: {
                type: 'object',
                properties: {
                    owner: { type: 'string', enum: ['self', 'player'] },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'find_world_item',
            description: 'Find a currently visible ground item by itemId, or the nearest visible ground item if itemId is omitted.',
            parameters: {
                type: 'object',
                properties: {
                    itemId: { type: 'string' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'pickup_item',
            description: 'Plan a frontend action for the NPC to pick up/search for a ground item. Use itemId scythe for hoe/锄头.',
            parameters: {
                type: 'object',
                properties: {
                    itemId: { type: 'string' },
                },
                required: ['itemId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'drop_item',
            description: 'Plan a frontend action for the NPC to drop an item from its inventory.',
            parameters: {
                type: 'object',
                properties: {
                    itemId: { type: 'string' },
                },
                required: ['itemId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'move_to',
            description: 'Plan a frontend movement action to player, a named place, or coordinates.',
            parameters: {
                type: 'object',
                properties: {
                    target: {
                        type: 'object',
                        properties: {
                            kind: { type: 'string', enum: ['entity', 'named', 'coords'] },
                            ref: { type: 'string' },
                            place: { type: 'string' },
                            x: { type: 'number' },
                            y: { type: 'number' },
                        },
                        required: ['kind'],
                    },
                },
                required: ['target'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'inspect_place',
            description: 'Inspect current/nearby place information and objects visible in that place.',
            parameters: {
                type: 'object',
                properties: {
                    placeId: { type: 'string' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'use_skill',
            description: 'Plan a durable NPC knowledge skill action, such as go_to_room or farming skills.',
            parameters: {
                type: 'object',
                properties: {
                    skillId: { type: 'string' },
                },
                required: ['skillId'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'talk_with',
            description: 'Plan an action to walk to another NPC and talk with them.',
            parameters: {
                type: 'object',
                properties: {
                    targetNpcName: { type: 'string' },
                    duration: { type: 'number' },
                },
                required: ['targetNpcName'],
            },
        },
    },
];

function callGameMcpTool(name, args, ctx) {
    const parsedArgs = asObject(args);
    switch (name) {
        case 'observe_environment': {
            const data = summarizeEnvironment(ctx);
            const drops = data.visibleDrops.map((drop) => `${drop.label}/${drop.itemId}`).join(', ') || 'none';
            const objects = data.visibleObjects.map((objectItem) => objectItem.type).join(', ') || 'none';
            return makeToolResult({
                data,
                memoryText: `MCP observe_environment: saw drops [${drops}] and objects [${objects}].`,
            });
        }
        case 'check_inventory': {
            const owner = parsedArgs.owner === 'player' ? 'player' : 'self';
            const inventory = owner === 'player'
                ? getPlayerInventory(ctx.gameSave, ctx.userId)
                : normalizeInventory(ctx.npcInventory);
            const inventoryText = Object.entries(inventory)
                .map(([itemId, qty]) => `${itemLabel(itemId)}(${itemId}) x${qty}`)
                .join(', ') || 'empty';
            return makeToolResult({
                data: { owner, inventory },
                memoryText: `MCP check_inventory(${owner}): ${inventoryText}.`,
            });
        }
        case 'find_world_item': {
            const itemId = normalizeItemId(parsedArgs.itemId);
            const drop = findDrop(ctx, itemId);
            return makeToolResult({
                ok: Boolean(drop),
                data: {
                    itemId: itemId || null,
                    requestedItemId: parsedArgs.itemId || null,
                    found: Boolean(drop),
                    drop: drop ? clone(drop) : null,
                    visibleDrops: visibleDrops(ctx).slice(0, 10),
                },
                memoryText: drop
                    ? `MCP find_world_item: found ${itemLabel(drop.itemId)}(${drop.itemId}) at (${Math.round(drop.x)},${Math.round(drop.y)}).`
                    : `MCP find_world_item: did not find ${itemId || 'any visible item'}.`,
            });
        }
        case 'pickup_item': {
            const itemId = normalizeItemId(parsedArgs.itemId);
            const drop = findDrop(ctx, itemId);
            if (!drop) {
                const action = { type: 'pickup_item', itemId };
                return makeToolResult({
                    data: {
                        itemId,
                        requestedItemId: parsedArgs.itemId || null,
                        planned: true,
                        visibility: 'not_currently_visible',
                        visibleDrops: visibleDrops(ctx).slice(0, 10),
                    },
                    action,
                    memoryText: `MCP pickup_item: planned pickup/search for ${itemLabel(itemId)}(${itemId}); it was not currently visible.`,
                });
            }
            const action = {
                type: 'pickup_item',
                itemId,
                target: { kind: 'coords', x: Number(drop.x || 0), y: Number(drop.y || 0) },
            };
            return makeToolResult({
                data: { itemId, requestedItemId: parsedArgs.itemId || null, drop: clone(drop), planned: true },
                action,
                memoryText: `MCP pickup_item: planned pickup of ${itemLabel(itemId)}(${itemId}) at (${Math.round(drop.x)},${Math.round(drop.y)}).`,
            });
        }
        case 'drop_item': {
            const itemId = normalizeItemId(parsedArgs.itemId);
            const inventory = normalizeInventory(ctx.npcInventory);
            if (!inventory[itemId]) {
                return makeToolResult({
                    ok: false,
                    data: { itemId, requestedItemId: parsedArgs.itemId || null, reason: 'not_in_inventory', inventory },
                    memoryText: `MCP drop_item failed: ${itemId} was not in inventory.`,
                });
            }
            const action = { type: 'drop_item', itemId };
            return makeToolResult({
                data: { itemId, planned: true },
                action,
                memoryText: `MCP drop_item: planned drop of ${itemLabel(itemId)}(${itemId}).`,
            });
        }
        case 'move_to': {
            const target = asObject(parsedArgs.target);
            const action = { type: 'move', target };
            return makeToolResult({
                data: { target, planned: true },
                action,
                memoryText: `MCP move_to: planned move to ${compactJson(target, 400)}.`,
            });
        }
        case 'inspect_place': {
            const context = currentContext(ctx);
            const placeId = parsedArgs.placeId;
            const agentWorld = asObject(context.agentWorld);
            return makeToolResult({
                data: {
                    requestedPlaceId: placeId || null,
                    currentPlace: agentWorld.currentPlace || null,
                    nearbyPlaces: asArray(agentWorld.nearbyPlaces),
                    landmarks: asArray(context.landmarks),
                    visibleObjects: visibleObjects(ctx).slice(0, 16),
                    visibleDrops: visibleDrops(ctx).slice(0, 16),
                },
                memoryText: `MCP inspect_place: inspected ${placeId || 'current nearby place'}.`,
            });
        }
        case 'use_skill': {
            const skillId = parsedArgs.skillId;
            const action = { type: 'use_skill', skillId };
            return makeToolResult({
                data: { skillId, planned: true },
                action,
                memoryText: `MCP use_skill: planned knowledge skill ${skillId}.`,
            });
        }
        case 'talk_with': {
            const action = {
                type: 'talk_with',
                targetNpcName: parsedArgs.targetNpcName,
                duration: typeof parsedArgs.duration === 'number' ? parsedArgs.duration : 14,
            };
            return makeToolResult({
                data: { targetNpcName: parsedArgs.targetNpcName, planned: true },
                action,
                memoryText: `MCP talk_with: planned conversation with ${parsedArgs.targetNpcName}.`,
            });
        }
        default:
            return makeToolResult({
                ok: false,
                data: { reason: 'unknown_tool', name },
                memoryText: `MCP unknown tool call: ${name}.`,
            });
    }
}

module.exports = {
    GAME_MCP_TOOLS: tools,
    callGameMcpTool,
};
