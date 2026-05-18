const HOUSE_BLUEPRINT_ITEM_ID = 'house_blueprint_greenhouse';
const HOUSE_KEY_ITEM_ID = 'house_key';

const HOUSE_CATALOG_VERSION = 1;
const GREENHOUSE_STAGE_DURATION_SECONDS = 5;

const HOUSE_CATALOG = {
    greenhouse: {
        id: 'greenhouse',
        displayPrefix: 'greenhouse',
        name: 'Greenhouse',
        nameZh: '温室小屋',
        blueprintItemId: HOUSE_BLUEPRINT_ITEM_ID,
        price: 50,
        rentPerDay: 5,
        roomTemplateId: 'two_bedroom_living_room',
        stageDuration: GREENHOUSE_STAGE_DURATION_SECONDS,
        stageDurations: {
            step0: GREENHOUSE_STAGE_DURATION_SECONDS,
            step1: GREENHOUSE_STAGE_DURATION_SECONDS,
            step2: GREENHOUSE_STAGE_DURATION_SECONDS,
            step3: GREENHOUSE_STAGE_DURATION_SECONDS,
            step4: GREENHOUSE_STAGE_DURATION_SECONDS,
        },
        footprint: { w: 192, h: 142 },
        collisionBoxes: [
            { x: -88, y: -64, w: 180, h: 34 },
            { x: -88, y: -34, w: 52, h: 86 },
            { x: 42, y: -34, w: 50, h: 86 },
            { x: -36, y: -20, w: 72, h: 42 },
            { x: -88, y: 42, w: 64, h: 20 },
            { x: 24, y: 42, w: 68, h: 20 },
        ],
        doorOffset: { x: 0, y: 64 },
    },
};

function getHouseDefinition(definitionId) {
    return HOUSE_CATALOG[String(definitionId || '')] || null;
}

function getHouseShopItems() {
    return Object.values(HOUSE_CATALOG).map((definition) => ({
        id: definition.id,
        name: definition.name,
        nameZh: definition.nameZh,
        blueprintItemId: definition.blueprintItemId,
        price: definition.price,
        rentPerDay: definition.rentPerDay,
        roomTemplateId: definition.roomTemplateId,
        footprint: definition.footprint,
        stageDuration: definition.stageDuration,
        stageDurations: definition.stageDurations,
    }));
}

function createHouseRoomId(houseId) {
    return `room:${houseId}`;
}

function houseDisplayPrefix(definition) {
    return definition.displayPrefix || definition.id;
}

function createHouseDisplayId(definitionId, sequence) {
    const definition = getHouseDefinition(definitionId);
    const prefix = definition ? houseDisplayPrefix(definition) : String(definitionId || 'house');
    return `${prefix}-${String(Math.max(1, Number(sequence || 1))).padStart(3, '0')}`;
}

function parseHouseDisplaySequence(displayId, definitionId) {
    const definition = getHouseDefinition(definitionId);
    const prefix = definition ? houseDisplayPrefix(definition) : String(definitionId || 'house');
    const match = String(displayId || '').match(new RegExp(`^${prefix}-(\\d+)$`));
    return match ? Number(match[1]) : 0;
}

function getTotalConstructionDuration(definition) {
    return Object.values(definition.stageDurations).reduce((sum, value) => sum + Number(value || 0), 0);
}

function normalizeHouseStage(stage) {
    return ['step0', 'step1', 'step2', 'step3', 'step4', 'ready_closed', 'ready_open'].includes(stage)
        ? stage
        : 'step0';
}

function normalizeHouseInstance(input) {
    if (!input || typeof input !== 'object') return null;
    const definition = getHouseDefinition(input.definitionId);
    if (!definition) return null;

    const id = String(input.id || `house_${Date.now()}`);
    const stage = normalizeHouseStage(input.stage);
    const doorState = input.doorState === 'open' || stage === 'ready_open' ? 'open' : 'closed';
    const startedAtTick = Number.isFinite(Number(input.startedAtTick)) ? Number(input.startedAtTick) : 0;
    const catalogReadyAtTick = startedAtTick + getTotalConstructionDuration(definition);
    const inputReadyAtTick = Number.isFinite(Number(input.readyAtTick))
        ? Number(input.readyAtTick)
        : catalogReadyAtTick;
    const readyAtTick = String(stage || '').startsWith('ready')
        ? inputReadyAtTick
        : Math.min(inputReadyAtTick, catalogReadyAtTick);

    return {
        id,
        displayId: input.displayId
            ? String(input.displayId)
            : parseHouseDisplaySequence(id, definition.id) > 0
                ? id
                : undefined,
        definitionId: definition.id,
        x: Number.isFinite(Number(input.x)) ? Number(input.x) : 0,
        y: Number.isFinite(Number(input.y)) ? Number(input.y) : 0,
        stage,
        doorState,
        startedAtTick,
        readyAtTick,
        roomId: String(input.roomId || createHouseRoomId(id)),
        ownership: {
            ownerPlayerId: String(input.ownership?.ownerPlayerId || input.ownerPlayerId || 'player'),
            ownerName: input.ownership?.ownerName ? String(input.ownership.ownerName) : undefined,
        },
        tenancy: {
            status: ['vacant', 'reserved', 'occupied', 'evicted'].includes(input.tenancy?.status)
                ? input.tenancy.status
                : 'vacant',
            residentNpcId: input.tenancy?.residentNpcId ? String(input.tenancy.residentNpcId) : null,
            residentNpcName: input.tenancy?.residentNpcName ? String(input.tenancy.residentNpcName) : null,
            contractId: input.tenancy?.contractId ? String(input.tenancy.contractId) : null,
            assignedAtTick: Number.isFinite(Number(input.tenancy?.assignedAtTick)) ? Number(input.tenancy.assignedAtTick) : null,
            moveInAtTick: Number.isFinite(Number(input.tenancy?.moveInAtTick)) ? Number(input.tenancy.moveInAtTick) : null,
        },
        economy: {
            rentPerDay: Number.isFinite(Number(input.economy?.rentPerDay)) ? Number(input.economy.rentPerDay) : definition.rentPerDay,
            lastRentCollectedTick: Number.isFinite(Number(input.economy?.lastRentCollectedTick))
                ? Number(input.economy.lastRentCollectedTick)
                : null,
            totalRentCollected: Number.isFinite(Number(input.economy?.totalRentCollected)) ? Number(input.economy.totalRentCollected) : 0,
        },
        access: {
            keyItemInstanceId: input.access?.keyItemInstanceId ? String(input.access.keyItemInstanceId) : null,
            locked: typeof input.access?.locked === 'boolean' ? input.access.locked : doorState !== 'open',
            allowedNpcIds: Array.isArray(input.access?.allowedNpcIds)
                ? input.access.allowedNpcIds.map(String).filter(Boolean)
                : [],
        },
    };
}

function normalizeHouseInstances(input) {
    if (!Array.isArray(input)) return [];
    const counters = {};
    return input
        .map(normalizeHouseInstance)
        .filter(Boolean)
        .map((house) => {
            const current = house.displayId;
            if (current) {
                counters[house.definitionId] = Math.max(
                    counters[house.definitionId] || 0,
                    parseHouseDisplaySequence(current, house.definitionId),
                );
                return house;
            }
            const next = (counters[house.definitionId] || 0) + 1;
            counters[house.definitionId] = next;
            return {
                ...house,
                displayId: createHouseDisplayId(house.definitionId, next),
            };
        });
}

function normalizeHouseContract(input) {
    if (!input || typeof input !== 'object') return null;
    if (!input.houseId || !input.npcId) return null;
    const status = ['draft', 'offered', 'signed', 'cancelled', 'ended'].includes(input.status)
        ? input.status
        : 'draft';
    return {
        id: String(input.id || `contract_${Date.now()}`),
        houseId: String(input.houseId),
        npcId: String(input.npcId),
        npcName: String(input.npcName || input.npcId),
        playerId: String(input.playerId || 'player'),
        status,
        rentPerDay: Number.isFinite(Number(input.rentPerDay)) ? Number(input.rentPerDay) : 5,
        createdAtTick: Number.isFinite(Number(input.createdAtTick)) ? Number(input.createdAtTick) : 0,
        signedAtTick: Number.isFinite(Number(input.signedAtTick)) ? Number(input.signedAtTick) : null,
        startsAtTick: Number.isFinite(Number(input.startsAtTick)) ? Number(input.startsAtTick) : null,
        endsAtTick: Number.isFinite(Number(input.endsAtTick)) ? Number(input.endsAtTick) : null,
        terms: {
            canEnterHouse: input.terms?.canEnterHouse !== false,
            canDecorate: Boolean(input.terms?.canDecorate),
            canUseStorage: Boolean(input.terms?.canUseStorage),
            rentCollection: input.terms?.rentCollection === 'daily' ? 'daily' : 'manual',
        },
    };
}

function normalizeHouseContracts(input) {
    return Array.isArray(input)
        ? input.map(normalizeHouseContract).filter(Boolean)
        : [];
}

module.exports = {
    HOUSE_BLUEPRINT_ITEM_ID,
    HOUSE_KEY_ITEM_ID,
    HOUSE_CATALOG_VERSION,
    HOUSE_CATALOG,
    getHouseDefinition,
    getHouseShopItems,
    createHouseRoomId,
    createHouseDisplayId,
    parseHouseDisplaySequence,
    getTotalConstructionDuration,
    normalizeHouseInstances,
    normalizeHouseContracts,
};
