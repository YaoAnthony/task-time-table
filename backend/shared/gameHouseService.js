const {
    HOUSE_BLUEPRINT_ITEM_ID,
    HOUSE_KEY_ITEM_ID,
    getHouseDefinition,
    getHouseShopItems,
    createHouseRoomId,
    createHouseDisplayId,
    parseHouseDisplaySequence,
    getTotalConstructionDuration,
    normalizeHouseInstances,
    normalizeHouseContracts,
} = require('./gameHouseCatalog');
const {
    clone,
    ensurePlayer,
    getPlayerInventory,
    upsertPlayerInventoryItem,
    consumePlayerInventoryItem,
    hasPlayerInventoryItem,
} = require('./gameSaveService');

function getEntities(gameSave) {
    if (!gameSave.worldStatus.entities) gameSave.worldStatus.entities = {};
    gameSave.worldStatus.entities.houses = normalizeHouseInstances(gameSave.worldStatus.entities.houses);
    gameSave.worldStatus.entities.houseContracts = normalizeHouseContracts(gameSave.worldStatus.entities.houseContracts);
    return gameSave.worldStatus.entities;
}

function getHouses(gameSave) {
    return getEntities(gameSave).houses;
}

function setHouses(gameSave, houses) {
    getEntities(gameSave).houses = normalizeHouseInstances(houses);
}

function getHouseContracts(gameSave) {
    return getEntities(gameSave).houseContracts;
}

function setHouseContracts(gameSave, contracts) {
    getEntities(gameSave).houseContracts = normalizeHouseContracts(contracts);
}

function buildHouseShopResponse(gameSave, profile, userId = 'player') {
    const inventory = getPlayerInventory(gameSave, userId);
    return {
        items: getHouseShopItems().map((item) => ({
            ...item,
            ownedBlueprintQuantity: inventory
                .filter((entry) => entry.itemId === item.blueprintItemId)
                .reduce((sum, entry) => sum + Number(entry.quantity || 0), 0),
        })),
        wallet: profile.wallet || { coins: 0 },
    };
}

function requireHouseDefinition(definitionId) {
    const definition = getHouseDefinition(definitionId);
    if (!definition) {
        const err = new Error('Unknown house definition');
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

function creditCoins(profile, amount) {
    if (!profile.wallet) profile.wallet = { coins: 0 };
    profile.wallet.coins = Number(profile.wallet.coins || 0) + Math.max(0, Number(amount || 0));
    profile.markModified?.('wallet');
}

function purchaseHouseBlueprint({ gameSave, profile, userId, definitionId, quantity = 1 }) {
    const definition = requireHouseDefinition(definitionId);
    const qty = Math.max(1, Math.min(99, Math.floor(Number(quantity || 1))));
    debitCoins(profile, definition.price * qty);
    upsertPlayerInventoryItem(gameSave, userId, definition.blueprintItemId, qty, {
        customMeta: { definitionId: definition.id },
    });
    return {
        wallet: profile.wallet,
        gameInventory: getPlayerInventory(gameSave, userId),
        gameSave,
    };
}

function nextHouseDisplayId(existingHouses, definition) {
    const maxSequence = existingHouses
        .filter((house) => house.definitionId === definition.id)
        .reduce((max, house) => Math.max(max, parseHouseDisplaySequence(house.displayId || house.id, definition.id)), 0);
    return createHouseDisplayId(definition.id, maxSequence + 1);
}

function createHouseInstance({ userId, username, definition, x, y, gameTick, existingHouses = [] }) {
    const id = nextHouseDisplayId(existingHouses, definition);
    const startedAtTick = Number.isFinite(Number(gameTick)) ? Number(gameTick) : 0;
    const readyIn = getTotalConstructionDuration(definition);
    return {
        id,
        displayId: id,
        definitionId: definition.id,
        x: Number(x || 0),
        y: Number(y || 0),
        stage: 'step0',
        doorState: 'closed',
        startedAtTick,
        readyAtTick: startedAtTick + readyIn,
        roomId: createHouseRoomId(id),
        ownership: {
            ownerPlayerId: String(userId),
            ownerName: username,
        },
        tenancy: {
            status: 'vacant',
            residentNpcId: null,
            residentNpcName: null,
            contractId: null,
            assignedAtTick: null,
            moveInAtTick: null,
        },
        economy: {
            rentPerDay: definition.rentPerDay,
            lastRentCollectedTick: null,
            totalRentCollected: 0,
        },
        access: {
            keyItemInstanceId: null,
            locked: true,
            allowedNpcIds: [],
        },
    };
}

function placeHouse({ gameSave, userId, username, definitionId, blueprintItemId, x, y, gameTick }) {
    const definition = requireHouseDefinition(definitionId);
    if (blueprintItemId !== definition.blueprintItemId) {
        const err = new Error('Blueprint does not match house definition');
        err.status = 400;
        throw err;
    }
    const consumed = consumePlayerInventoryItem(gameSave, userId, definition.blueprintItemId, 1, { definitionId: definition.id });
    if (!consumed) {
        const fallbackConsumed = consumePlayerInventoryItem(gameSave, userId, definition.blueprintItemId, 1);
        if (!fallbackConsumed) {
            const err = new Error('Missing house blueprint');
            err.status = 400;
            throw err;
        }
    }
    const houses = getHouses(gameSave);
    const house = createHouseInstance({ userId, username, definition, x, y, gameTick, existingHouses: houses });
    houses.push(house);
    setHouses(gameSave, houses);
    return {
        house,
        houses: getHouses(gameSave),
        gameInventory: getPlayerInventory(gameSave, userId),
        gameSave,
    };
}

function completeConstruction({ gameSave, userId, houseId, gameTick }) {
    const houses = getHouses(gameSave);
    const house = houses.find((entry) => entry.id === houseId);
    if (!house) {
        const err = new Error('House not found');
        err.status = 404;
        throw err;
    }
    const definition = getHouseDefinition(house.definitionId);
    const catalogReadyAtTick = Number(house.startedAtTick || 0) + (definition ? getTotalConstructionDuration(definition) : 0);
    const readyAtTick = Math.min(Number(house.readyAtTick || catalogReadyAtTick), catalogReadyAtTick || Number(house.readyAtTick || 0));
    if (Number(gameTick || 0) < readyAtTick && !String(house.stage || '').startsWith('ready')) {
        const err = new Error('House is still under construction');
        err.status = 400;
        throw err;
    }
    house.readyAtTick = readyAtTick;
    if (!house.access) {
        house.access = { keyItemInstanceId: null, locked: true, allowedNpcIds: [] };
    }
    const hadKey = Boolean(house.access.keyItemInstanceId);
    if (!hadKey) {
        const keyInstanceId = `key:${house.id}`;
        house.access.keyItemInstanceId = keyInstanceId;
        house.doorState = 'open';
        house.stage = 'ready_open';
        house.access.locked = false;
        upsertPlayerInventoryItem(gameSave, userId, HOUSE_KEY_ITEM_ID, 1, {
            customMeta: {
                instanceId: keyInstanceId,
                houseId: house.id,
                definitionId: house.definitionId,
            },
        });
    } else {
        house.stage = house.doorState === 'open' ? 'ready_open' : 'ready_closed';
        house.access.locked = house.doorState !== 'open';
    }
    setHouses(gameSave, houses);
    return {
        house,
        houses: getHouses(gameSave),
        gameInventory: getPlayerInventory(gameSave, userId),
        gameSave,
    };
}

function openHouse({ gameSave, userId, houseId }) {
    const houses = getHouses(gameSave);
    const house = houses.find((entry) => entry.id === houseId);
    if (!house) {
        const err = new Error('House not found');
        err.status = 404;
        throw err;
    }
    if (!String(house.stage || '').startsWith('ready')) {
        const err = new Error('House is not ready');
        err.status = 400;
        throw err;
    }
    if (!hasPlayerInventoryItem(gameSave, userId, HOUSE_KEY_ITEM_ID, { houseId })) {
        const err = new Error('Missing matching house key');
        err.status = 403;
        throw err;
    }
    if (!house.access) {
        house.access = { keyItemInstanceId: null, locked: true, allowedNpcIds: [] };
    }
    const nextDoorState = house.doorState === 'open' ? 'closed' : 'open';
    house.doorState = nextDoorState;
    house.stage = nextDoorState === 'open' ? 'ready_open' : 'ready_closed';
    house.access.locked = nextDoorState !== 'open';
    setHouses(gameSave, houses);
    return { house, houses: getHouses(gameSave), gameSave };
}

function createHouseContract({ gameSave, userId, houseId, npcId, npcName, rentPerDay, gameTick }) {
    const houses = getHouses(gameSave);
    const house = houses.find((entry) => entry.id === houseId);
    if (!house) {
        const err = new Error('House not found');
        err.status = 404;
        throw err;
    }
    if (!String(house.stage || '').startsWith('ready')) {
        const err = new Error('House is not ready');
        err.status = 400;
        throw err;
    }
    const contracts = getHouseContracts(gameSave);
    const active = contracts.find((entry) => entry.houseId === houseId && ['offered', 'signed'].includes(entry.status));
    if (active) {
        const err = new Error('House already has an active contract');
        err.status = 400;
        throw err;
    }
    const contract = {
        id: `contract_${uuidv4()}`,
        houseId,
        npcId: String(npcId),
        npcName: String(npcName || npcId),
        playerId: String(userId),
        status: 'offered',
        rentPerDay: Number.isFinite(Number(rentPerDay)) ? Number(rentPerDay) : house.economy.rentPerDay,
        createdAtTick: Number.isFinite(Number(gameTick)) ? Number(gameTick) : 0,
        signedAtTick: null,
        startsAtTick: null,
        endsAtTick: null,
        terms: {
            canEnterHouse: true,
            canDecorate: false,
            canUseStorage: false,
            rentCollection: 'manual',
        },
    };
    contracts.push(contract);
    house.tenancy.status = 'reserved';
    house.tenancy.residentNpcId = contract.npcId;
    house.tenancy.residentNpcName = contract.npcName;
    house.tenancy.contractId = contract.id;
    house.tenancy.assignedAtTick = contract.createdAtTick;
    house.economy.rentPerDay = contract.rentPerDay;
    setHouseContracts(gameSave, contracts);
    setHouses(gameSave, houses);
    return { contract, house, contracts: getHouseContracts(gameSave), houses: getHouses(gameSave), gameSave };
}

function signHouseContract({ gameSave, contractId, gameTick }) {
    const contracts = getHouseContracts(gameSave);
    const contract = contracts.find((entry) => entry.id === contractId);
    if (!contract) {
        const err = new Error('Contract not found');
        err.status = 404;
        throw err;
    }
    const houses = getHouses(gameSave);
    const house = houses.find((entry) => entry.id === contract.houseId);
    if (!house) {
        const err = new Error('House not found');
        err.status = 404;
        throw err;
    }
    const tick = Number.isFinite(Number(gameTick)) ? Number(gameTick) : 0;
    contract.status = 'signed';
    contract.signedAtTick = contract.signedAtTick ?? tick;
    contract.startsAtTick = contract.startsAtTick ?? tick;
    house.tenancy.status = 'occupied';
    house.tenancy.residentNpcId = contract.npcId;
    house.tenancy.residentNpcName = contract.npcName;
    house.tenancy.contractId = contract.id;
    house.tenancy.moveInAtTick = house.tenancy.moveInAtTick ?? tick;
    house.access.allowedNpcIds = Array.from(new Set([...(house.access.allowedNpcIds || []), contract.npcId]));
    setHouseContracts(gameSave, contracts);
    setHouses(gameSave, houses);
    return { contract, house, contracts: getHouseContracts(gameSave), houses: getHouses(gameSave), gameSave };
}

function cancelHouseContract({ gameSave, contractId }) {
    const contracts = getHouseContracts(gameSave);
    const contract = contracts.find((entry) => entry.id === contractId);
    if (!contract) {
        const err = new Error('Contract not found');
        err.status = 404;
        throw err;
    }
    contract.status = 'cancelled';
    const houses = getHouses(gameSave);
    const house = houses.find((entry) => entry.id === contract.houseId);
    if (house && house.tenancy.contractId === contract.id) {
        house.tenancy.status = 'vacant';
        house.tenancy.residentNpcId = null;
        house.tenancy.residentNpcName = null;
        house.tenancy.contractId = null;
        house.access.allowedNpcIds = (house.access.allowedNpcIds || []).filter((id) => id !== contract.npcId);
    }
    setHouseContracts(gameSave, contracts);
    setHouses(gameSave, houses);
    return { contract, house, contracts: getHouseContracts(gameSave), houses: getHouses(gameSave), gameSave };
}

function collectHouseRent({ gameSave, profile, houseId, gameTick }) {
    const houses = getHouses(gameSave);
    const house = houses.find((entry) => entry.id === houseId);
    if (!house) {
        const err = new Error('House not found');
        err.status = 404;
        throw err;
    }
    if (house.tenancy.status !== 'occupied') {
        return { house, collected: 0, wallet: profile.wallet || { coins: 0 }, gameSave };
    }
    const tick = Number.isFinite(Number(gameTick)) ? Number(gameTick) : 0;
    const last = Number(house.economy.lastRentCollectedTick || 0);
    if (last > 0 && tick - last < 1440) {
        return { house, collected: 0, wallet: profile.wallet || { coins: 0 }, gameSave };
    }
    const amount = Math.max(0, Number(house.economy.rentPerDay || 0));
    creditCoins(profile, amount);
    house.economy.lastRentCollectedTick = tick;
    house.economy.totalRentCollected = Number(house.economy.totalRentCollected || 0) + amount;
    setHouses(gameSave, houses);
    return { house, collected: amount, wallet: profile.wallet, gameSave };
}

module.exports = {
    HOUSE_BLUEPRINT_ITEM_ID,
    HOUSE_KEY_ITEM_ID,
    getHouses,
    setHouses,
    getHouseContracts,
    setHouseContracts,
    buildHouseShopResponse,
    purchaseHouseBlueprint,
    placeHouse,
    completeConstruction,
    openHouse,
    createHouseContract,
    signHouseContract,
    cancelHouseContract,
    collectHouseRent,
};
