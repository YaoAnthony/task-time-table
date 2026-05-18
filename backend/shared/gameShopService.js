const {
    listNpcDefinitions,
    getNpcDefinitionById,
    normalizeUnlockedNpcIds,
    toShopItem,
} = require('./gameNpcCatalog');
const {
    getPendingNpcArrivalIds,
    enqueueNpcArrivalEvent,
} = require('./gameEventService');
const {
    buildHouseShopResponse,
    purchaseHouseBlueprint,
} = require('./gameHouseService');
const {
    buildStorageChestShopItems,
    purchaseStorageChestItem,
} = require('./gameStorageChestService');
const { GAME_ITEMS } = require('./gameItems');
const {
    getPlayerInventory,
    upsertPlayerInventoryItem,
} = require('./gameSaveService');

const TOOL_SHOP_CATALOG = [
    {
        itemId: 'shovel',
        nameZh: '铲子',
        price: 5,
        description: '基础铲子。现在可以先作为工具购买和携带，后续可接挖地、移除地块等动作。',
    },
    {
        itemId: 'scythe',
        nameZh: '锄头',
        price: 5,
        description: '用来开垦土地。买到背包后选中它，就能在农田附近耕地。',
    },
    {
        itemId: 'watering_can',
        nameZh: '水壶',
        price: 5,
        description: '用来给农田浇水。',
    },
];

const PET_SHOP_CATALOG = [
    {
        itemId: 'pet_laoli_cat',
        petId: 'laoli_cat',
        ownerNpcId: 'laoli',
        entityId: 'pet-laoli-cat',
        nameZh: '老李的猫',
        price: 30,
        description: '老李牵挂的小猫。买下后会进入背包，放到世界里后会记住老李和新家，但不会说话。',
    },
];

const LAOLI_CAT_MEMORY_SEEDS = [
    {
        id: 'laoli_cat_remembers_laoli',
        kind: 'bond',
        text: '记得老李的气味，会把老李当作家人。',
        importance: 0.95,
    },
    {
        id: 'laoli_cat_new_home',
        kind: 'home',
        text: '记得自己被接回了老李的新家，那里是安全的地方。',
        importance: 0.85,
    },
    {
        id: 'laoli_cat_silent_affection',
        kind: 'behavior',
        text: '不会说人类语言，只会通过靠近、停留和跟随表达亲近。',
        importance: 0.7,
    },
];

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

function isPetPlaced(gameSave, entityId) {
    return Boolean(gameSave.worldStatus?.entities?.worldState?.entities?.[entityId]);
}

function buildGameShopResponse(gameSave, profile, userId = 'player') {
    const unlocked = normalizeUnlockedNpcIds(gameSave.worldStatus?.unlockedNpcs);
    const pending = getPendingNpcArrivalIds(gameSave);
    const npcItems = listNpcDefinitions().map((definition) => ({
        ...toShopItem(definition, unlocked, pending),
        shopItemId: `npc:${definition.id}`,
        category: 'npc',
    }));

    const houseItems = buildHouseShopResponse(gameSave, profile, userId).items.map((item) => ({
        ...item,
        shopItemId: `house:${item.id}`,
        category: 'house',
        title: item.nameZh,
        description: `Blueprint. Rent ${item.rentPerDay} coins/day.`,
    }));

    const storageItems = buildStorageChestShopItems(gameSave, userId).map((item) => ({
        ...item,
        shopItemId: `storage:${item.id}`,
        category: 'storage',
        title: item.nameZh,
    }));

    const inventory = getPlayerInventory(gameSave, userId);
    const toolItems = TOOL_SHOP_CATALOG.map((entry) => {
        const definition = GAME_ITEMS[entry.itemId] || {};
        const ownedQuantity = inventory
            .filter((item) => item.itemId === entry.itemId)
            .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        return {
            id: entry.itemId,
            itemId: entry.itemId,
            name: definition.name || entry.itemId,
            nameZh: entry.nameZh || definition.nameZh || entry.itemId,
            title: entry.nameZh || definition.nameZh || entry.itemId,
            description: entry.description || definition.description || '',
            price: entry.price,
            owned: definition.stackable === false && ownedQuantity > 0,
            ownedQuantity,
            shopItemId: `tool:${entry.itemId}`,
            category: 'tool',
        };
    });

    const petItems = PET_SHOP_CATALOG.map((entry) => {
        const definition = GAME_ITEMS[entry.itemId] || {};
        const ownedQuantity = inventory
            .filter((item) => item.itemId === entry.itemId)
            .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
        const owned = ownedQuantity > 0 || isPetPlaced(gameSave, entry.entityId);
        return {
            id: entry.petId,
            itemId: entry.itemId,
            name: definition.name || entry.petId,
            nameZh: entry.nameZh || definition.nameZh || entry.petId,
            title: entry.nameZh || definition.nameZh || entry.petId,
            description: entry.description || definition.description || '',
            price: entry.price,
            owned,
            ownedQuantity,
            ownerNpcId: entry.ownerNpcId,
            petId: entry.petId,
            canSpeak: false,
            shopItemId: `pet:${entry.petId}`,
            category: 'pet',
        };
    });

    return {
        wallet: profile.wallet || { coins: 0 },
        items: [...npcItems, ...houseItems, ...storageItems, ...toolItems, ...petItems],
        unlockedNpcs: unlocked,
        pendingNpcArrivals: pending,
    };
}

function purchaseNpc({ gameSave, profile, npcId, currentTick }) {
    const definition = getNpcDefinitionById(npcId);
    if (!definition) {
        const err = new Error('NPC product not found');
        err.status = 404;
        throw err;
    }
    const unlocked = normalizeUnlockedNpcIds(gameSave.worldStatus?.unlockedNpcs);
    const pending = getPendingNpcArrivalIds(gameSave);
    if (unlocked.includes(definition.id)) {
        return {
            alreadyOwned: true,
            pendingArrival: false,
            npc: toShopItem(definition, unlocked, pending),
        };
    }
    if (pending.includes(definition.id)) {
        return {
            alreadyOwned: false,
            pendingArrival: true,
            npc: toShopItem(definition, unlocked, pending),
        };
    }
    debitCoins(profile, Math.max(0, Number(definition.price || 0)));
    const event = enqueueNpcArrivalEvent(gameSave, definition, currentTick);
    return {
        alreadyOwned: false,
        pendingArrival: true,
        event,
        npc: toShopItem(definition, unlocked, getPendingNpcArrivalIds(gameSave)),
    };
}

function parseShopItemId(raw) {
    const value = String(raw || '');
    const [category, id] = value.includes(':') ? value.split(':') : ['', value];
    return { category, id };
}

function purchaseToolItem({ gameSave, profile, userId, itemId, quantity = 1 }) {
    const catalogItem = TOOL_SHOP_CATALOG.find((entry) => entry.itemId === itemId);
    if (!catalogItem || !GAME_ITEMS[catalogItem.itemId]) {
        const err = new Error('Tool product not found');
        err.status = 404;
        throw err;
    }
    const qty = Math.max(1, Math.min(99, Math.floor(Number(quantity || 1))));
    const existingQuantity = getPlayerInventory(gameSave, userId)
        .filter((item) => item.itemId === catalogItem.itemId)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (GAME_ITEMS[catalogItem.itemId].stackable === false && existingQuantity > 0) {
        return {
            alreadyOwned: true,
            wallet: profile.wallet,
            gameInventory: getPlayerInventory(gameSave, userId),
            itemId: catalogItem.itemId,
            quantity: existingQuantity,
            gameSave,
        };
    }
    debitCoins(profile, catalogItem.price * qty);
    upsertPlayerInventoryItem(gameSave, userId, catalogItem.itemId, qty);
    return {
        wallet: profile.wallet,
        gameInventory: getPlayerInventory(gameSave, userId),
        itemId: catalogItem.itemId,
        quantity: qty,
        gameSave,
    };
}

function purchasePetItem({ gameSave, profile, userId, petId }) {
    const catalogItem = PET_SHOP_CATALOG.find((entry) => entry.petId === petId || entry.itemId === petId);
    if (!catalogItem || !GAME_ITEMS[catalogItem.itemId]) {
        const err = new Error('Pet product not found');
        err.status = 404;
        throw err;
    }
    const existingQuantity = getPlayerInventory(gameSave, userId)
        .filter((item) => item.itemId === catalogItem.itemId)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    if (existingQuantity > 0 || isPetPlaced(gameSave, catalogItem.entityId)) {
        return {
            alreadyOwned: true,
            wallet: profile.wallet,
            gameInventory: getPlayerInventory(gameSave, userId),
            itemId: catalogItem.itemId,
            petId: catalogItem.petId,
            quantity: existingQuantity,
            gameSave,
        };
    }
    debitCoins(profile, catalogItem.price);
    upsertPlayerInventoryItem(gameSave, userId, catalogItem.itemId, 1, {
        customMeta: {
            instanceId: catalogItem.entityId,
            petId: catalogItem.petId,
            ownerNpcId: catalogItem.ownerNpcId,
            canSpeak: false,
            memories: LAOLI_CAT_MEMORY_SEEDS,
        },
    });
    return {
        wallet: profile.wallet,
        gameInventory: getPlayerInventory(gameSave, userId),
        itemId: catalogItem.itemId,
        petId: catalogItem.petId,
        quantity: 1,
        gameSave,
    };
}

function purchaseGameShopItem({ gameSave, profile, userId, shopItemId, quantity = 1, currentTick }) {
    const { category, id } = parseShopItemId(shopItemId);
    if (category === 'npc') {
        return {
            type: 'npc',
            ...purchaseNpc({ gameSave, profile, npcId: id, currentTick }),
        };
    }
    if (category === 'house') {
        return {
            type: 'house',
            ...purchaseHouseBlueprint({ gameSave, profile, userId, definitionId: id, quantity }),
        };
    }
    if (category === 'storage') {
        return {
            type: 'storage',
            ...purchaseStorageChestItem({ gameSave, profile, userId, definitionId: id, quantity }),
        };
    }
    if (category === 'tool') {
        return {
            type: 'tool',
            ...purchaseToolItem({ gameSave, profile, userId, itemId: id, quantity }),
        };
    }
    if (category === 'pet') {
        return {
            type: 'pet',
            ...purchasePetItem({ gameSave, profile, userId, petId: id }),
        };
    }
    const err = new Error('Unknown shop item');
    err.status = 400;
    throw err;
}

module.exports = {
    buildGameShopResponse,
    purchaseGameShopItem,
};
