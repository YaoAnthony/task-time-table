const { v4: uuidv4 } = require('uuid');
const {
    STORAGE_CHEST_ITEM_ID,
    getStorageChestDefinition,
    getStorageChestDefinitionByItemId,
    listStorageChestDefinitions,
    normalizeStorageChests,
    normalizeStoredItem,
} = require('./gameStorageChestCatalog');
const {
    clone,
    getPlayerInventory,
    upsertPlayerInventoryItem,
    consumePlayerInventoryItem,
} = require('./gameSaveService');

function getEntities(gameSave) {
    if (!gameSave.worldStatus) gameSave.worldStatus = {};
    if (!gameSave.worldStatus.entities) gameSave.worldStatus.entities = {};
    gameSave.worldStatus.entities.storageChests = normalizeStorageChests(gameSave.worldStatus.entities.storageChests);
    return gameSave.worldStatus.entities;
}

function getStorageChests(gameSave) {
    return getEntities(gameSave).storageChests;
}

function setStorageChests(gameSave, chests) {
    getEntities(gameSave).storageChests = normalizeStorageChests(chests);
}

function requireDefinition(definitionId) {
    const definition = getStorageChestDefinition(definitionId);
    if (!definition) {
        const err = new Error('Unknown storage chest definition');
        err.status = 400;
        throw err;
    }
    return definition;
}

function requireDefinitionByItemId(itemId) {
    const definition = getStorageChestDefinitionByItemId(itemId);
    if (!definition) {
        const err = new Error('Unknown storage chest item');
        err.status = 400;
        throw err;
    }
    return definition;
}

function debitCoins(profile, amount) {
    if (!profile.wallet) profile.wallet = { coins: 0 };
    const current = Number(profile.wallet.coins || 0);
    if (current < amount) {
        const err = new Error('Not enough coins');
        err.status = 400;
        throw err;
    }
    profile.wallet.coins = current - amount;
    profile.markModified?.('wallet');
}

function buildStorageChestShopItems(gameSave, userId = 'player') {
    const inventory = getPlayerInventory(gameSave, userId);
    return listStorageChestDefinitions().map((definition) => ({
        id: definition.id,
        itemId: definition.itemId,
        name: definition.name,
        nameZh: definition.nameZh,
        description: definition.description,
        price: definition.price,
        capacity: definition.capacity,
        ownedQuantity: inventory
            .filter((entry) => entry.itemId === definition.itemId)
            .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
    }));
}

function purchaseStorageChestItem({ gameSave, profile, userId, definitionId = 'basic', quantity = 1 }) {
    const definition = requireDefinition(definitionId);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(quantity || 1))));
    debitCoins(profile, definition.price * qty);
    upsertPlayerInventoryItem(gameSave, userId, definition.itemId, qty, {
        customMeta: { definitionId: definition.id },
    });
    return {
        wallet: profile.wallet,
        gameInventory: getPlayerInventory(gameSave, userId),
        gameSave,
    };
}

function createStorageChestInstance({ definition, userId, username, roomId, x, y, gameTick }) {
    const tick = Number.isFinite(Number(gameTick)) ? Number(gameTick) : 0;
    return {
        id: `storage_chest_${uuidv4()}`,
        definitionId: definition.id,
        itemId: definition.itemId,
        x: Number(x || 0),
        y: Number(y || 0),
        roomId: String(roomId || 'solo'),
        ownerPlayerId: String(userId),
        ownerName: username,
        capacity: definition.capacity,
        slots: Array(definition.capacity).fill(null),
        createdAtTick: tick,
        updatedAtTick: tick,
        access: {
            locked: false,
            allowedPlayerIds: [String(userId)],
            allowedNpcIds: [],
        },
    };
}

function placeStorageChest({ gameSave, userId, username, roomId, itemId, x, y, gameTick }) {
    const definition = requireDefinitionByItemId(itemId || STORAGE_CHEST_ITEM_ID);
    const consumed = consumePlayerInventoryItem(gameSave, userId, definition.itemId, 1, { definitionId: definition.id })
        || consumePlayerInventoryItem(gameSave, userId, definition.itemId, 1);
    if (!consumed) {
        const err = new Error('Missing storage chest item');
        err.status = 400;
        throw err;
    }

    const chests = getStorageChests(gameSave);
    const chest = createStorageChestInstance({
        definition,
        userId,
        username,
        roomId,
        x,
        y,
        gameTick,
    });
    chests.push(chest);
    setStorageChests(gameSave, chests);
    return {
        storageChest: chest,
        storageChests: getStorageChests(gameSave),
        gameInventory: getPlayerInventory(gameSave, userId),
        gameSave,
    };
}

function itemKey(item) {
    const meta = item?.instanceData?.customMeta || {};
    const instanceId = meta.instanceId || meta.houseId || meta.storageChestId;
    return instanceId ? `${item.itemId}:${String(instanceId)}` : String(item?.itemId || '');
}

function itemMetaForConsume(item) {
    const meta = item?.instanceData?.customMeta || {};
    return Object.keys(meta).length ? meta : undefined;
}

function addToChestSlot(chest, targetIndex, item) {
    if (targetIndex == null || targetIndex < 0 || targetIndex >= chest.slots.length) {
        const empty = chest.slots.findIndex((slot) => !slot);
        targetIndex = empty;
    }
    if (targetIndex < 0) {
        const err = new Error('Storage chest is full');
        err.status = 400;
        throw err;
    }
    const normalized = normalizeStoredItem(item);
    if (!normalized) {
        const err = new Error('Invalid item');
        err.status = 400;
        throw err;
    }
    const existing = chest.slots[targetIndex];
    if (existing && itemKey(existing) !== itemKey(normalized)) {
        const err = new Error('Target storage slot is occupied');
        err.status = 400;
        throw err;
    }
    chest.slots[targetIndex] = existing
        ? { ...existing, quantity: Number(existing.quantity || 0) + normalized.quantity }
        : normalized;
}

function assertCanAddToChestSlot(chest, targetIndex, item) {
    const normalized = normalizeStoredItem(item);
    if (!normalized) {
        const err = new Error('Invalid item');
        err.status = 400;
        throw err;
    }
    if (targetIndex == null || targetIndex < 0 || targetIndex >= chest.slots.length) {
        const empty = chest.slots.findIndex((slot) => !slot);
        if (empty < 0) {
            const err = new Error('Storage chest is full');
            err.status = 400;
            throw err;
        }
        return;
    }
    const existing = chest.slots[targetIndex];
    if (existing && itemKey(existing) !== itemKey(normalized)) {
        const err = new Error('Target storage slot is occupied');
        err.status = 400;
        throw err;
    }
}

function removeFromChestSlot(chest, index, quantity) {
    const slot = chest.slots[index];
    if (!slot) {
        const err = new Error('Storage slot is empty');
        err.status = 400;
        throw err;
    }
    const qty = Math.max(1, Math.floor(Number(quantity || slot.quantity || 1)));
    if (Number(slot.quantity || 0) < qty) {
        const err = new Error('Not enough items in storage slot');
        err.status = 400;
        throw err;
    }
    const removed = {
        itemId: slot.itemId,
        quantity: qty,
        instanceData: clone(slot.instanceData),
    };
    slot.quantity -= qty;
    if (slot.quantity <= 0) chest.slots[index] = null;
    return removed;
}

function transferStorageChestItem({ gameSave, userId, chestId, from, to, quantity = undefined, gameTick }) {
    const chests = getStorageChests(gameSave);
    const chest = chests.find((entry) => entry.id === chestId);
    if (!chest) {
        const err = new Error('Storage chest not found');
        err.status = 404;
        throw err;
    }

    const fromContainer = from?.container;
    const toContainer = to?.container;
    const qty = quantity == null ? undefined : Math.max(1, Math.floor(Number(quantity || 1)));

    if (fromContainer === 'player' && toContainer === 'chest') {
        const item = normalizeStoredItem({ ...from.item, quantity: qty ?? from.item?.quantity });
        if (!item) {
            const err = new Error('Invalid player item');
            err.status = 400;
            throw err;
        }
        assertCanAddToChestSlot(chest, Number(to.index), item);
        const consumed = consumePlayerInventoryItem(
            gameSave,
            userId,
            item.itemId,
            item.quantity,
            itemMetaForConsume(item),
        );
        if (!consumed) {
            const err = new Error('Player item no longer exists');
            err.status = 400;
            throw err;
        }
        addToChestSlot(chest, Number(to.index), item);
    } else if (fromContainer === 'chest' && toContainer === 'player') {
        const removed = removeFromChestSlot(chest, Number(from.index), qty);
        upsertPlayerInventoryItem(gameSave, userId, removed.itemId, removed.quantity, removed.instanceData);
    } else if (fromContainer === 'chest' && toContainer === 'chest') {
        const sourceIndex = Number(from.index);
        const targetIndex = Number(to.index);
        if (sourceIndex === targetIndex) {
            return {
                storageChest: chest,
                storageChests: chests,
                gameInventory: getPlayerInventory(gameSave, userId),
                gameSave,
            };
        }
        const source = chest.slots[sourceIndex] || null;
        chest.slots[sourceIndex] = chest.slots[targetIndex] || null;
        chest.slots[targetIndex] = source;
    } else {
        const err = new Error('Unsupported storage transfer');
        err.status = 400;
        throw err;
    }

    chest.updatedAtTick = Number.isFinite(Number(gameTick)) ? Number(gameTick) : chest.updatedAtTick;
    setStorageChests(gameSave, chests);
    const normalized = getStorageChests(gameSave);
    return {
        storageChest: normalized.find((entry) => entry.id === chestId) || null,
        storageChests: normalized,
        gameInventory: getPlayerInventory(gameSave, userId),
        gameSave,
    };
}

module.exports = {
    buildStorageChestShopItems,
    purchaseStorageChestItem,
    placeStorageChest,
    transferStorageChestItem,
    getStorageChests,
    setStorageChests,
};
