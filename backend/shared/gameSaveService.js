const Profile = require('../models/Profile');
const RoomGameState = require('../models/RoomGameState');
const User = require('../models/User');
const {
    NPC_CATALOG_VERSION,
    normalizeUnlockedNpcIds,
    ensureUnlockedNpcSaves,
} = require('./gameNpcCatalog');
const {
    createDefaultEventState,
    normalizeEventState,
} = require('./gameEventService');
const {
    normalizeHouseInstances,
    normalizeHouseContracts,
} = require('./gameHouseCatalog');
const {
    normalizeStorageChests,
} = require('./gameStorageChestCatalog');

const SCHEMA_VERSION = 1;
const DEFAULT_WORLD_ID = 'world:village';

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function resolveRoomId(userId, roomId) {
    return String(roomId || userId);
}

function getDisplayName(user) {
    return user?.username || user?.email || user?.name || 'player';
}

function emptyWorldState(gameTick = 0) {
    return {
        grid: { cols: 0, rows: 0 },
        entities: {},
        objects: {},
        drops: {},
        crops: {},
        chickens: {},
        trees: {},
        nests: {},
        npcMinds: {},
        meta: {
            tick: gameTick,
            dayTime: '06:00',
            version: 1,
        },
    };
}

function createDefaultGameSave({ userId, username, roomId }) {
    const rid = resolveRoomId(userId, roomId);
    const now = new Date().toISOString();
    const save = {
        schemaVersion: SCHEMA_VERSION,
        saveVersion: 1,
        updatedAt: now,
        worldStatus: {
            roomId: rid,
            gameTick: 0,
            settings: {
                timeMinute: 360,
                weather: 'clear',
                physicsDebug: false,
                pathLineEnabled: false,
                sleepThreshold: 0,
                agentBrainEnabled: true,
                shadowEnabled: true,
            },
            entities: {
                worldState: emptyWorldState(0),
                farmTiles: [],
                chests: [],
                worldItems: [],
                creatures: [],
                houses: [],
                houseContracts: [],
                storageChests: [],
            },
            npcCatalogVersion: NPC_CATALOG_VERSION,
            unlockedNpcs: normalizeUnlockedNpcIds(null),
            npcs: {},
            events: createDefaultEventState(),
        },
        players: {
            [String(userId)]: createDefaultPlayerSave({
                userId,
                username,
                permissionLevel: String(userId) === rid ? 'op' : 'guest',
            }),
        },
    };
    return ensureUnlockedNpcSaves(save);
}

function createDefaultPlayerSave({ userId, username, permissionLevel = 'guest' }) {
    return {
        id: String(userId),
        name: username || 'player',
        position: {
            worldId: DEFAULT_WORLD_ID,
            x: 400,
            y: 1000,
            facing: 'down',
        },
        inventory: {
            gameInventory: [],
            hotbarSlots: Array(10).fill(null),
            backpackSlots: Array(40).fill(null),
        },
        permissionLevel,
        sleeping: false,
    };
}

function normalizeWorldId(input) {
    const value = String(input || '').trim();
    return value || DEFAULT_WORLD_ID;
}

function normalizePosition(input, fallback = {}) {
    return {
        worldId: normalizeWorldId(input?.worldId || fallback.worldId),
        x: typeof input?.x === 'number' ? input.x : Number(fallback.x || 0),
        y: typeof input?.y === 'number' ? input.y : Number(fallback.y || 0),
        facing: ['up', 'down', 'left', 'right'].includes(input?.facing)
            ? input.facing
            : fallback.facing || 'down',
    };
}

function normalizeNpcSaves(gameSave) {
    if (!gameSave.worldStatus.npcs || typeof gameSave.worldStatus.npcs !== 'object') {
        gameSave.worldStatus.npcs = {};
        return;
    }
    for (const [id, npc] of Object.entries(gameSave.worldStatus.npcs)) {
        if (!npc || typeof npc !== 'object') continue;
        npc.id = String(npc.id || id);
        npc.name = npc.name || id;
        npc.position = normalizePosition(npc.position, { x: 0, y: 0, facing: 'down' });
        npc.inventory = npc.inventory && typeof npc.inventory === 'object' ? npc.inventory : {};
        npc.memory = Array.isArray(npc.memory) ? npc.memory : [];
        npc.mind = npc.mind && typeof npc.mind === 'object' ? npc.mind : null;
    }
}

function normalizeInventory(input) {
    return {
        gameInventory: Array.isArray(input?.gameInventory) ? normalizeInventoryEntries(input.gameInventory) : [],
        hotbarSlots: Array.isArray(input?.hotbarSlots) ? clone(input.hotbarSlots) : Array(10).fill(null),
        backpackSlots: Array.isArray(input?.backpackSlots) ? clone(input.backpackSlots) : Array(40).fill(null),
    };
}

function normalizeInventoryEntries(entries) {
    return Array.isArray(entries)
        ? entries
            .map((entry) => {
                if (!entry || typeof entry !== 'object' || !entry.itemId) return null;
                return {
                    itemId: String(entry.itemId),
                    quantity: Math.max(0, Number(entry.quantity || 0)),
                    instanceData: normalizeInstanceData(entry.instanceData),
                };
            })
            .filter((entry) => entry && entry.quantity > 0)
        : [];
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

function getInventoryEntryKey(entry) {
    const meta = entry?.instanceData?.customMeta || {};
    const instanceId = meta.instanceId || meta.houseId || meta.storageChestId;
    return instanceId ? `${entry.itemId}:${instanceId}` : String(entry.itemId);
}

function normalizeSettings(input) {
    return {
        timeMinute: typeof input?.timeMinute === 'number'
            ? Math.max(0, Math.min(1439, Math.round(input.timeMinute)))
            : 360,
        weather: input?.weather === 'rain' ? 'rain' : 'clear',
        physicsDebug: Boolean(input?.physicsDebug),
        pathLineEnabled: Boolean(input?.pathLineEnabled),
        sleepThreshold: typeof input?.sleepThreshold === 'number'
            ? Math.max(0, Math.min(1, input.sleepThreshold))
            : 0,
        agentBrainEnabled: input?.agentBrainEnabled !== false,
        shadowEnabled: input?.shadowEnabled !== false,
    };
}

function normalizeGameSave(input, { userId, username, roomId }) {
    const base = createDefaultGameSave({ userId, username, roomId });
    let raw = input && typeof input === 'object' ? clone(input) : {};
    if (raw.worldStatus?.npcCatalogVersion !== NPC_CATALOG_VERSION) {
        raw = {};
    }
    const world = raw.worldStatus && typeof raw.worldStatus === 'object' ? raw.worldStatus : {};
    const entities = world.entities && typeof world.entities === 'object' ? world.entities : {};
    const players = raw.players && typeof raw.players === 'object' ? raw.players : {};

    const next = {
        ...base,
        ...raw,
        schemaVersion: SCHEMA_VERSION,
        saveVersion: Number(raw.saveVersion || base.saveVersion),
        updatedAt: raw.updatedAt || base.updatedAt,
        worldStatus: {
            ...base.worldStatus,
            ...world,
            roomId: resolveRoomId(userId, world.roomId || roomId),
            gameTick: typeof world.gameTick === 'number' ? world.gameTick : 0,
            settings: normalizeSettings(world.settings),
            entities: {
                worldState: entities.worldState && typeof entities.worldState === 'object'
                    ? entities.worldState
                    : emptyWorldState(typeof world.gameTick === 'number' ? world.gameTick : 0),
                farmTiles: Array.isArray(entities.farmTiles) ? entities.farmTiles : [],
                chests: Array.isArray(entities.chests) ? entities.chests.filter(chest => !chest?.opened) : [],
                worldItems: Array.isArray(entities.worldItems) ? entities.worldItems : [],
                creatures: Array.isArray(entities.creatures) ? entities.creatures : [],
                houses: normalizeHouseInstances(entities.houses),
                houseContracts: normalizeHouseContracts(entities.houseContracts),
                storageChests: normalizeStorageChests(entities.storageChests),
            },
            npcCatalogVersion: NPC_CATALOG_VERSION,
            unlockedNpcs: normalizeUnlockedNpcIds(world.unlockedNpcs),
            npcs: world.npcs && typeof world.npcs === 'object' ? world.npcs : {},
            events: normalizeEventState(world.events),
        },
        players: {},
    };

    for (const [id, player] of Object.entries(players)) {
        const playerObj = player && typeof player === 'object' ? player : {};
        next.players[id] = {
            id: String(playerObj.id || id),
            name: playerObj.name || (String(id) === String(userId) ? username : 'player'),
            position: normalizePosition(playerObj.position, { x: 400, y: 1000, facing: 'down' }),
            inventory: normalizeInventory(playerObj.inventory),
            permissionLevel: playerObj.permissionLevel === 'op' ? 'op' : 'guest',
            sleeping: Boolean(playerObj.sleeping),
        };
    }

    ensurePlayer(next, userId, username, String(userId) === next.worldStatus.roomId ? 'op' : 'guest');
    ensureUnlockedNpcSaves(next);
    normalizeNpcSaves(next);
    return next;
}

async function loadProfile(userId) {
    const user = await User.findById(userId);
    if (!user) return { user: null, profile: null };
    let profile = user.profile ? await Profile.findById(user.profile) : null;
    if (!profile) profile = await Profile.findOne({ user: user._id });
    if (!profile) {
        profile = await Profile.create({ user: user._id, systems: [], wallet: { coins: 0 }, inventory: [] });
        user.profile = profile._id;
        await user.save();
    }
    return { user, profile };
}

async function loadOrCreateRoom(roomId) {
    let room = await RoomGameState.findOne({ roomId });
    if (!room) room = await RoomGameState.create({ roomId });
    return room;
}

async function loadOrCreateGameSave(userId, requestedRoomId) {
    const { user, profile } = await loadProfile(userId);
    if (!user || !profile) return { error: 'Profile not found', status: 404 };

    const username = getDisplayName(user);
    const roomId = resolveRoomId(userId, requestedRoomId);
    const room = await loadOrCreateRoom(roomId);
    const source = room.gameSave || profile.gameSave || null;
    const gameSave = normalizeGameSave(source, { userId, username, roomId });
    await persistGameSave({ profile, room, gameSave, userId, username, roomId, bumpVersion: false });
    return { user, profile, room, gameSave, roomId };
}

async function persistGameSave({ profile, room, gameSave, userId, username, roomId, bumpVersion = true }) {
    const serverSource = room?.gameSave || profile?.gameSave || null;
    const serverSave = serverSource
        ? normalizeGameSave(serverSource, {
            userId: userId || Object.keys(serverSource.players || {})[0] || 'player',
            username: username || 'player',
            roomId: roomId || serverSource.worldStatus?.roomId,
        })
        : null;
    const next = normalizeGameSave(gameSave, {
        userId: userId || Object.keys(gameSave.players || {})[0] || 'player',
        username: username || 'player',
        roomId: roomId || gameSave.worldStatus?.roomId,
    });
    if (serverSave && Number(gameSave?.saveVersion || 0) < Number(serverSave.saveVersion || 0)) {
        next.worldStatus.entities.houses = clone(serverSave.worldStatus?.entities?.houses || []);
        next.worldStatus.entities.houseContracts = clone(serverSave.worldStatus?.entities?.houseContracts || []);
        next.worldStatus.entities.storageChests = clone(serverSave.worldStatus?.entities?.storageChests || []);
        for (const [playerId, serverPlayer] of Object.entries(serverSave.players || {})) {
            if (!serverPlayer?.inventory) continue;
            if (!next.players[playerId]) {
                next.players[playerId] = clone(serverPlayer);
            } else {
                next.players[playerId].inventory = normalizeInventory(serverPlayer.inventory);
            }
        }
    }
    next.saveVersion = Number(next.saveVersion || 0) + (bumpVersion ? 1 : 0);
    next.updatedAt = new Date().toISOString();

    profile.gameSave = next;
    profile.markModified('gameSave');

    room.gameSave = next;
    room.markModified('gameSave');
    if (bumpVersion) room.version = Number(room.version || 0) + 1;

    await Promise.all([profile.save(), room.save()]);
    return next;
}

async function resetGameSaveForUser(userId, requestedRoomId) {
    const { user, profile } = await loadProfile(userId);
    if (!user || !profile) return { error: 'Profile not found', status: 404 };

    const ownRoomId = String(userId);
    const roomId = resolveRoomId(userId, requestedRoomId);
    if (roomId !== ownRoomId) {
        return { error: 'Only the owner can delete this world save', status: 403 };
    }

    const username = getDisplayName(user);
    const gameSave = createDefaultGameSave({ userId, username, roomId: ownRoomId });
    const room = await loadOrCreateRoom(ownRoomId);

    profile.gameSave = gameSave;
    profile.gameInventory = [];
    profile.gameChests = [];
    profile.npcMemories = {};
    profile.idleGame = {};
    profile.gameState = { farmTiles: [], creatures: [] };
    profile.markModified('gameSave');
    profile.markModified('gameInventory');
    profile.markModified('gameChests');
    profile.markModified('npcMemories');
    profile.markModified('idleGame');
    profile.markModified('gameState');

    room.gameSave = gameSave;
    room.farmTiles = [];
    room.creatures = [];
    room.worldItems = [];
    room.trees = [];
    room.worldState = null;
    room.gameTick = 0;
    room.version = Number(room.version || 0) + 1;
    room.markModified('gameSave');

    await Promise.all([profile.save(), room.save()]);
    return { user, profile, room, gameSave, roomId: ownRoomId };
}

function ensurePlayer(gameSave, userId, username, permissionLevel = 'guest') {
    const id = String(userId);
    if (!gameSave.players || typeof gameSave.players !== 'object') gameSave.players = {};
    const existing = gameSave.players[id];
    if (!existing) {
        gameSave.players[id] = createDefaultPlayerSave({ userId: id, username, permissionLevel });
        return gameSave.players[id];
    }
    existing.id = String(existing.id || id);
    existing.name = existing.name || username || 'player';
    existing.inventory = normalizeInventory(existing.inventory);
    existing.position = normalizePosition(existing.position, { x: 400, y: 1000, facing: 'down' });
    existing.permissionLevel = existing.permissionLevel === 'op' ? 'op' : permissionLevel;
    existing.sleeping = Boolean(existing.sleeping);
    return existing;
}

function getPlayerInventory(gameSave, userId) {
    const player = gameSave.players?.[String(userId)];
    return normalizeInventory(player?.inventory).gameInventory;
}

function setPlayerInventory(gameSave, userId, inventory) {
    const player = ensurePlayer(gameSave, userId, 'player');
    player.inventory = {
        ...normalizeInventory(player.inventory),
        gameInventory: normalizeInventoryEntries(inventory),
    };
}

function upsertPlayerInventoryItem(gameSave, userId, itemId, quantity, instanceData = undefined) {
    const inv = getPlayerInventory(gameSave, userId);
    const nextEntry = {
        itemId: String(itemId),
        quantity: Math.max(0, Number(quantity || 0)),
        instanceData: normalizeInstanceData(instanceData),
    };
    const key = getInventoryEntryKey(nextEntry);
    const existing = inv.find((entry) => getInventoryEntryKey(entry) === key);
    if (existing) {
        existing.quantity += Number(quantity || 0);
        existing.instanceData = normalizeInstanceData(existing.instanceData || instanceData);
    } else if (Number(quantity || 0) > 0) {
        inv.push(nextEntry);
    }
    setPlayerInventory(gameSave, userId, inv.filter((entry) => Number(entry.quantity || 0) > 0));
    return getPlayerInventory(gameSave, userId);
}

function consumePlayerInventoryItem(gameSave, userId, itemId, quantity, matchMeta = undefined) {
    const inv = getPlayerInventory(gameSave, userId);
    const existing = inv.find((entry) => {
        if (entry.itemId !== itemId) return false;
        if (!matchMeta || typeof matchMeta !== 'object') return true;
        const meta = entry.instanceData?.customMeta || {};
        return Object.entries(matchMeta).every(([key, value]) => String(meta[key]) === String(value));
    });
    if (!existing || existing.quantity < quantity) return null;
    existing.quantity -= quantity;
    setPlayerInventory(gameSave, userId, inv.filter((entry) => Number(entry.quantity || 0) > 0));
    return getPlayerInventory(gameSave, userId);
}

function hasPlayerInventoryItem(gameSave, userId, itemId, matchMeta = undefined) {
    const inv = getPlayerInventory(gameSave, userId);
    return inv.some((entry) => {
        if (entry.itemId !== itemId || Number(entry.quantity || 0) <= 0) return false;
        if (!matchMeta || typeof matchMeta !== 'object') return true;
        const meta = entry.instanceData?.customMeta || {};
        return Object.entries(matchMeta).every(([key, value]) => String(meta[key]) === String(value));
    });
}

function getFarmTiles(gameSave) {
    return gameSave.worldStatus?.entities?.farmTiles || [];
}

function setFarmTiles(gameSave, farmTiles) {
    gameSave.worldStatus.entities.farmTiles = Array.isArray(farmTiles) ? clone(farmTiles) : [];
}

function getCreatures(gameSave) {
    return gameSave.worldStatus?.entities?.creatures || [];
}

function setCreatures(gameSave, creatures) {
    gameSave.worldStatus.entities.creatures = Array.isArray(creatures) ? clone(creatures) : [];
}

function getChests(gameSave) {
    return gameSave.worldStatus?.entities?.chests || [];
}

function setChests(gameSave, chests) {
    gameSave.worldStatus.entities.chests = Array.isArray(chests)
        ? clone(chests.filter(chest => !chest?.opened))
        : [];
}

function getStorageChests(gameSave) {
    return normalizeStorageChests(gameSave.worldStatus?.entities?.storageChests);
}

function setStorageChests(gameSave, storageChests) {
    gameSave.worldStatus.entities.storageChests = normalizeStorageChests(storageChests);
}

function ensureNpc(gameSave, npcName) {
    if (!gameSave.worldStatus.npcs || typeof gameSave.worldStatus.npcs !== 'object') {
        gameSave.worldStatus.npcs = {};
    }
    const existing = gameSave.worldStatus.npcs[npcName];
    if (existing) return existing;
    gameSave.worldStatus.npcs[npcName] = {
        id: npcName,
        name: npcName,
        position: { worldId: DEFAULT_WORLD_ID, x: 0, y: 0, facing: 'down' },
        inventory: {},
        mind: null,
        memory: [],
    };
    return gameSave.worldStatus.npcs[npcName];
}

function getNpcMemory(gameSave, npcName) {
    const npc = ensureNpc(gameSave, npcName);
    return Array.isArray(npc.memory) ? npc.memory : [];
}

function setNpcMemory(gameSave, npcName, memory) {
    const npc = ensureNpc(gameSave, npcName);
    npc.memory = Array.isArray(memory) ? clone(memory) : [];
}

module.exports = {
    SCHEMA_VERSION,
    clone,
    createDefaultGameSave,
    normalizeGameSave,
    loadOrCreateGameSave,
    persistGameSave,
    resetGameSaveForUser,
    ensurePlayer,
    getPlayerInventory,
    setPlayerInventory,
    upsertPlayerInventoryItem,
    consumePlayerInventoryItem,
    hasPlayerInventoryItem,
    getFarmTiles,
    setFarmTiles,
    getCreatures,
    setCreatures,
    getChests,
    setChests,
    getStorageChests,
    setStorageChests,
    ensureNpc,
    getNpcMemory,
    setNpcMemory,
};
