const STORAGE_CHEST_ITEM_ID = 'storage_chest_basic';

const STORAGE_CHEST_CATALOG_VERSION = 1;

const STORAGE_CHEST_CATALOG = {
    basic: {
        id: 'basic',
        itemId: STORAGE_CHEST_ITEM_ID,
        name: 'Storage Chest',
        nameZh: '储物箱',
        description: 'A placeable chest that stores backpack items in the world.',
        price: 15,
        capacity: 24,
        footprint: { w: 32, h: 28 },
        collisionBox: { x: -14, y: -10, w: 28, h: 22 },
    },
};

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function getStorageChestDefinition(definitionId) {
    return STORAGE_CHEST_CATALOG[String(definitionId || '')] || null;
}

function getStorageChestDefinitionByItemId(itemId) {
    return Object.values(STORAGE_CHEST_CATALOG).find((entry) => entry.itemId === itemId) || null;
}

function listStorageChestDefinitions() {
    return Object.values(STORAGE_CHEST_CATALOG).map((entry) => clone(entry));
}

function normalizeInstanceData(input) {
    return {
        durability: Number.isFinite(Number(input?.durability)) ? Number(input.durability) : null,
        freshness: Number.isFinite(Number(input?.freshness)) ? Number(input.freshness) : null,
        customMeta: input?.customMeta && typeof input.customMeta === 'object'
            ? clone(input.customMeta)
            : {},
    };
}

function normalizeStoredItem(input) {
    if (!input || typeof input !== 'object' || !input.itemId) return null;
    const quantity = Math.max(0, Math.floor(Number(input.quantity || 0)));
    if (quantity <= 0) return null;
    return {
        itemId: String(input.itemId),
        quantity,
        instanceData: normalizeInstanceData(input.instanceData),
    };
}

function createEmptySlots(capacity) {
    return Array(Math.max(1, Number(capacity || 24))).fill(null);
}

function normalizeSlots(input, capacity) {
    const slots = createEmptySlots(capacity);
    if (!Array.isArray(input)) return slots;
    for (let i = 0; i < slots.length; i += 1) {
        slots[i] = normalizeStoredItem(input[i]);
    }
    return slots;
}

function normalizeStorageChestInstance(input) {
    if (!input || typeof input !== 'object') return null;
    const definition = getStorageChestDefinition(input.definitionId) || getStorageChestDefinitionByItemId(input.itemId);
    if (!definition) return null;
    const id = String(input.id || `storage_chest_${Date.now()}`);
    const capacity = Number.isFinite(Number(input.capacity)) ? Number(input.capacity) : definition.capacity;
    return {
        id,
        definitionId: definition.id,
        itemId: definition.itemId,
        x: Number.isFinite(Number(input.x)) ? Number(input.x) : 0,
        y: Number.isFinite(Number(input.y)) ? Number(input.y) : 0,
        roomId: String(input.roomId || 'solo'),
        ownerPlayerId: String(input.ownerPlayerId || input.ownership?.ownerPlayerId || 'player'),
        ownerName: input.ownerName || input.ownership?.ownerName || undefined,
        capacity,
        slots: normalizeSlots(input.slots, capacity),
        createdAtTick: Number.isFinite(Number(input.createdAtTick)) ? Number(input.createdAtTick) : 0,
        updatedAtTick: Number.isFinite(Number(input.updatedAtTick)) ? Number(input.updatedAtTick) : 0,
        access: {
            locked: Boolean(input.access?.locked),
            allowedPlayerIds: Array.isArray(input.access?.allowedPlayerIds)
                ? input.access.allowedPlayerIds.map(String).filter(Boolean)
                : [],
            allowedNpcIds: Array.isArray(input.access?.allowedNpcIds)
                ? input.access.allowedNpcIds.map(String).filter(Boolean)
                : [],
        },
    };
}

function normalizeStorageChests(input) {
    return Array.isArray(input)
        ? input.map(normalizeStorageChestInstance).filter(Boolean)
        : [];
}

module.exports = {
    STORAGE_CHEST_ITEM_ID,
    STORAGE_CHEST_CATALOG_VERSION,
    STORAGE_CHEST_CATALOG,
    getStorageChestDefinition,
    getStorageChestDefinitionByItemId,
    listStorageChestDefinitions,
    normalizeStoredItem,
    normalizeStorageChestInstance,
    normalizeStorageChests,
};
