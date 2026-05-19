const ITEM_LABELS = {
    watering_can: '水壶',
    axe: '斧头',
    scythe: '锄头',
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
    house_blueprint_greenhouse: '温室蓝图',
    house_key: '房屋钥匙',
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

const DEFAULT_WORLD_ID = 'world:village';
const REMEMBER_HOME_SKILL_ALIASES = new Set([
    'remember_home_house',
    'remember_home',
    'remember_house',
    'home_house',
    'set_home',
    'assign_home',
    'learn_home',
    'this_is_your_house',
]);
const ENTER_HOUSE_SKILL_ALIASES = new Set([
    'enter_house',
    'go_home',
    'go_to_house',
    'go_inside_house',
]);

function normalizeSkillId(skillId) {
    return String(skillId || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
}

function toolNameForSkillAlias(skillId) {
    const normalized = normalizeSkillId(skillId);
    if (REMEMBER_HOME_SKILL_ALIASES.has(normalized)) return 'remember_home_house';
    if (ENTER_HOUSE_SKILL_ALIASES.has(normalized)) return 'enter_house';
    return null;
}

function currentWorldId(ctx) {
    const context = currentContext(ctx);
    return context.self?.worldId
        || context.agentWorld?.position?.worldId
        || context.currentPlace?.id
        || DEFAULT_WORLD_ID;
}

function worldIdForPoint(ctx, x, y, fallback) {
    return fallback || currentWorldId(ctx) || DEFAULT_WORLD_ID;
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
            worldId: entry.worldId,
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
            drop.worldId = worldIdForPoint(ctx, drop.x, drop.y, drop.worldId);
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
            worldId: entry.worldId,
            distance: entry.distance,
            state: entry.state,
            meta: entry.meta,
            affordances: entry.affordances,
            source: 'agentWorld',
        }));
    return [...direct, ...agentObjects]
        .filter(Boolean)
        .map((objectItem) => ({
            ...objectItem,
            worldId: worldIdForPoint(ctx, objectItem.x, objectItem.y, objectItem.worldId),
        }))
        .sort((a, b) => Number(a.distance || 0) - Number(b.distance || 0));
}

function findDrop(ctx, itemId) {
    const drops = visibleDrops(ctx);
    const normalizedItemId = normalizeItemId(itemId);
    if (!normalizedItemId) return drops[0] || null;
    return drops.find((drop) => normalizeItemId(drop.itemId) === normalizedItemId) || null;
}

function visibleHouses(ctx) {
    return visibleObjects(ctx).filter((objectItem) => (objectItem.type || objectItem.kind) === 'house');
}

function houseLabel(house) {
    return house?.meta?.displayId || house?.meta?.label || house?.id || 'house';
}

function findHouse(ctx, houseId) {
    const houses = visibleHouses(ctx);
    if (!houseId) return houses[0] || null;
    return houses.find((entry) => (
        entry.id === houseId
        || entry.meta?.displayId === houseId
        || entry.meta?.label === houseId
        || entry.meta?.roomId === houseId
    )) || null;
}

function buildEnterHouseResult(ctx, houseId) {
    const house = findHouse(ctx, houseId);
    const roomId = house?.meta?.roomId || null;
    const action = house ? {
        type: 'enter_house',
        houseId: house.id,
        roomId,
    } : null;
    return makeToolResult({
        ok: Boolean(house),
        data: {
            requestedHouseId: houseId || null,
            house: house ? clone(house) : null,
            visibleHouses: visibleHouses(ctx),
            planned: Boolean(action),
        },
        action,
        memoryText: house
            ? `MCP enter_house: planned entering ${houseLabel(house)} (${house.meta?.summary || roomId || 'house'}).`
            : 'MCP enter_house: no visible house was available.',
    });
}

function buildRememberHomeHouseResult(ctx, houseId) {
    const house = findHouse(ctx, houseId);
    const roomId = house?.meta?.roomId || null;
    const action = house ? {
        type: 'remember_home_house',
        houseId: house.id,
        roomId,
    } : null;
    return makeToolResult({
        ok: Boolean(house),
        data: {
            requestedHouseId: houseId || null,
            house: house ? clone(house) : null,
            planned: Boolean(action),
        },
        action,
        memoryText: house
            ? `MCP remember_home_house: planned remembering ${houseLabel(house)} (${house.meta?.summary || roomId || 'house'}) as home.`
            : 'MCP remember_home_house: no visible house was available.',
    });
}

function normalizeNpcActionForRuntime(action, ctx) {
    const item = asObject(action);
    if (!item.type) return null;
    if (item.type !== 'use_skill') return item;

    const toolName = toolNameForSkillAlias(item.skillId);
    if (toolName === 'remember_home_house') {
        return buildRememberHomeHouseResult(ctx, item.houseId).action
            || { type: 'remember_home_house', houseId: item.houseId, roomId: item.roomId };
    }
    if (toolName === 'enter_house') {
        return buildEnterHouseResult(ctx, item.houseId).action
            || { type: 'enter_house', houseId: item.houseId, roomId: item.roomId };
    }
    return item;
}

function normalizeNpcActionsForRuntime(actions, ctx) {
    const result = [];
    const seen = new Set();
    for (const action of asArray(actions)) {
        const normalized = normalizeNpcActionForRuntime(action, ctx);
        if (!normalized?.type) continue;
        const key = JSON.stringify(normalized);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(normalized);
    }
    return result;
}

function summarizeEnvironment(ctx) {
    const context = currentContext(ctx);
    const drops = visibleDrops(ctx).slice(0, 10).map((drop) => ({
        id: drop.id,
        itemId: drop.itemId,
        label: itemLabel(drop.itemId),
        x: Math.round(Number(drop.x || 0)),
        y: Math.round(Number(drop.y || 0)),
        worldId: drop.worldId || currentWorldId(ctx),
        distance: Math.round(Number(drop.distance || 0)),
    }));
    const objects = visibleObjects(ctx).slice(0, 12).map((objectItem) => ({
        id: objectItem.id,
        type: objectItem.type || objectItem.kind,
        x: Math.round(Number(objectItem.x || 0)),
        y: Math.round(Number(objectItem.y || 0)),
        worldId: objectItem.worldId || currentWorldId(ctx),
        distance: Math.round(Number(objectItem.distance || 0)),
        state: objectItem.state,
        meta: objectItem.meta,
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
        currentWorldId: currentWorldId(ctx),
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
            description: 'Observe the NPC current nearby world state: drops, beds, chests, nests, trees, houses/contracts, NPCs, landmarks, and current place.',
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
            description: 'Plan a frontend movement action to player, a named place, or coordinates. Coordinate targets may include worldId such as world:village or room:<houseId>.',
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
                            worldId: { type: 'string' },
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
            name: 'inspect_house',
            description: 'Inspect a visible house, including stage, door, owner, resident, contract status, rent, roomId, and affordances.',
            parameters: {
                type: 'object',
                properties: {
                    houseId: { type: 'string' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'enter_house',
            description: 'Plan a frontend action for this NPC to walk to a visible house door and enter its room instance. Use when the player asks the NPC to go into a house, go home, enter their house, or sleep in their house.',
            parameters: {
                type: 'object',
                properties: {
                    houseId: { type: 'string', description: 'Visible house id. Omit to use the nearest visible house.' },
                },
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'remember_home_house',
            description: 'Remember a visible house as this NPC home. Use when the player says this is your house/home or assigns this house to the NPC.',
            parameters: {
                type: 'object',
                properties: {
                    houseId: { type: 'string', description: 'Visible house id. Omit to use the nearest visible house.' },
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
            const objects = data.visibleObjects.map((objectItem) => (
                objectItem.meta?.summary
                    ? `${objectItem.type}:${objectItem.meta.summary}`
                    : objectItem.type === 'house'
                        ? `house:${houseLabel(objectItem)}`
                        : objectItem.type
            )).join(', ') || 'none';
            return makeToolResult({
                data,
                memoryText: `MCP observe_environment: in ${data.currentWorldId || currentWorldId(ctx)} saw drops [${drops}] and objects [${objects}].`,
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
                    ? `MCP find_world_item: found ${itemLabel(drop.itemId)}(${drop.itemId}) in ${drop.worldId || currentWorldId(ctx)} at (${Math.round(drop.x)},${Math.round(drop.y)}).`
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
                target: {
                    kind: 'coords',
                    x: Number(drop.x || 0),
                    y: Number(drop.y || 0),
                    worldId: drop.worldId || currentWorldId(ctx),
                },
            };
            return makeToolResult({
                data: { itemId, requestedItemId: parsedArgs.itemId || null, drop: clone(drop), planned: true },
                action,
                memoryText: `MCP pickup_item: planned pickup of ${itemLabel(itemId)}(${itemId}) in ${drop.worldId || currentWorldId(ctx)} at (${Math.round(drop.x)},${Math.round(drop.y)}).`,
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
            const normalizedTarget = target.kind === 'coords'
                ? {
                    ...target,
                    worldId: target.worldId || currentWorldId(ctx),
                }
                : target;
            const action = { type: 'move', target: normalizedTarget };
            return makeToolResult({
                data: { target: normalizedTarget, planned: true },
                action,
                memoryText: `MCP move_to: planned move to ${compactJson(normalizedTarget, 400)}.`,
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
        case 'inspect_house': {
            const houses = visibleHouses(ctx);
            const house = findHouse(ctx, parsedArgs.houseId);
            return makeToolResult({
                ok: Boolean(house),
                data: {
                    requestedHouseId: parsedArgs.houseId || null,
                    house: house ? clone(house) : null,
                    visibleHouses: houses,
                },
                memoryText: house
                    ? `MCP inspect_house: inspected ${houseLabel(house)} (${house.meta?.summary || house.state || 'house'}).`
                    : 'MCP inspect_house: no visible house was available.',
            });
        }
        case 'enter_house': {
            return buildEnterHouseResult(ctx, parsedArgs.houseId);
        }
        case 'remember_home_house': {
            return buildRememberHomeHouseResult(ctx, parsedArgs.houseId);
        }
        case 'use_skill': {
            const skillId = parsedArgs.skillId;
            const toolName = toolNameForSkillAlias(skillId);
            if (toolName === 'remember_home_house') return buildRememberHomeHouseResult(ctx, parsedArgs.houseId);
            if (toolName === 'enter_house') return buildEnterHouseResult(ctx, parsedArgs.houseId);
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
    normalizeNpcActionsForRuntime,
    normalizeNpcActionForRuntime,
};
