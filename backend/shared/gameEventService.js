const EVENT_STATE_SCHEMA_VERSION = 1;
const NPC_ARRIVAL_EVENT_ID = 'npc_arrival_vehicle';
const NPC_ARRIVAL_DELAY_TICKS = 10;
const HISTORY_LIMIT = 80;

function createDefaultEventState() {
    return {
        schemaVersion: EVENT_STATE_SCHEMA_VERSION,
        queued: [],
        active: [],
        cooldowns: {},
        flags: {},
        history: [],
    };
}

function normalizeEventState(input) {
    const raw = input && typeof input === 'object' ? input : {};
    const normalizeInstances = (items) => Array.isArray(items)
        ? items
            .filter((entry) => entry && typeof entry === 'object' && typeof entry.instanceId === 'string')
            .map((entry) => ({
                instanceId: entry.instanceId,
                definitionId: entry.definitionId || NPC_ARRIVAL_EVENT_ID,
                status: entry.status === 'active' ? 'active' : 'queued',
                triggerTick: Number.isFinite(Number(entry.triggerTick)) ? Number(entry.triggerTick) : 0,
                createdAtTick: Number.isFinite(Number(entry.createdAtTick)) ? Number(entry.createdAtTick) : 0,
                startedAtTick: Number.isFinite(Number(entry.startedAtTick)) ? Number(entry.startedAtTick) : null,
                completedAtTick: Number.isFinite(Number(entry.completedAtTick)) ? Number(entry.completedAtTick) : null,
                payload: entry.payload && typeof entry.payload === 'object' ? { ...entry.payload } : {},
            }))
        : [];

    return {
        schemaVersion: EVENT_STATE_SCHEMA_VERSION,
        queued: normalizeInstances(raw.queued),
        active: normalizeInstances(raw.active),
        cooldowns: raw.cooldowns && typeof raw.cooldowns === 'object' ? { ...raw.cooldowns } : {},
        flags: raw.flags && typeof raw.flags === 'object' ? { ...raw.flags } : {},
        history: Array.isArray(raw.history) ? raw.history.slice(-HISTORY_LIMIT) : [],
    };
}

function ensureEventState(gameSave) {
    if (!gameSave.worldStatus) gameSave.worldStatus = {};
    gameSave.worldStatus.events = normalizeEventState(gameSave.worldStatus.events);
    return gameSave.worldStatus.events;
}

function getPendingNpcArrivalIds(gameSave) {
    const events = ensureEventState(gameSave);
    return getPendingNpcArrivalIdsFromEvents(events);
}

function getPendingNpcArrivalIdsFromEvents(events) {
    return [...events.queued, ...events.active]
        .filter((event) => event.definitionId === NPC_ARRIVAL_EVENT_ID)
        .map((event) => event.payload?.npcId)
        .filter(Boolean);
}

function enqueueNpcArrivalEvent(gameSave, definition, currentTick, delayTicks = NPC_ARRIVAL_DELAY_TICKS) {
    const events = ensureEventState(gameSave);
    const npcId = definition.id;
    if (getPendingNpcArrivalIdsFromEvents(events).includes(npcId)) return null;

    const tick = Number.isFinite(Number(currentTick)) ? Number(currentTick) : 0;
    const event = {
        instanceId: `npc-arrival-${npcId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        definitionId: NPC_ARRIVAL_EVENT_ID,
        status: 'queued',
        triggerTick: tick + delayTicks,
        createdAtTick: tick,
        startedAtTick: null,
        completedAtTick: null,
        payload: { npcId },
    };
    events.queued.push(event);
    return event;
}

module.exports = {
    EVENT_STATE_SCHEMA_VERSION,
    NPC_ARRIVAL_EVENT_ID,
    NPC_ARRIVAL_DELAY_TICKS,
    createDefaultEventState,
    normalizeEventState,
    ensureEventState,
    getPendingNpcArrivalIds,
    enqueueNpcArrivalEvent,
};
