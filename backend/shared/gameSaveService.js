const Profile = require('../models/Profile');
const RoomGameState = require('../models/RoomGameState');
const User = require('../models/User');
const {
    NPC_CATALOG_VERSION,
    normalizeUnlockedNpcIds,
    ensureUnlockedNpcSaves,
} = require('./gameNpcCatalog');

const SCHEMA_VERSION = 1;

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
            },
            npcCatalogVersion: NPC_CATALOG_VERSION,
            unlockedNpcs: normalizeUnlockedNpcIds(null),
            npcs: {},
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

function normalizeInventory(input) {
    return {
        gameInventory: Array.isArray(input?.gameInventory) ? clone(input.gameInventory) : [],
        hotbarSlots: Array.isArray(input?.hotbarSlots) ? clone(input.hotbarSlots) : Array(10).fill(null),
        backpackSlots: Array.isArray(input?.backpackSlots) ? clone(input.backpackSlots) : Array(40).fill(null),
    };
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
                chests: Array.isArray(entities.chests) ? entities.chests : [],
                worldItems: Array.isArray(entities.worldItems) ? entities.worldItems : [],
                creatures: Array.isArray(entities.creatures) ? entities.creatures : [],
            },
            npcCatalogVersion: NPC_CATALOG_VERSION,
            unlockedNpcs: normalizeUnlockedNpcIds(world.unlockedNpcs),
            npcs: world.npcs && typeof world.npcs === 'object' ? world.npcs : {},
        },
        players: {},
    };

    for (const [id, player] of Object.entries(players)) {
        const playerObj = player && typeof player === 'object' ? player : {};
        next.players[id] = {
            id: String(playerObj.id || id),
            name: playerObj.name || (String(id) === String(userId) ? username : 'player'),
            position: {
                x: typeof playerObj.position?.x === 'number' ? playerObj.position.x : 400,
                y: typeof playerObj.position?.y === 'number' ? playerObj.position.y : 1000,
                facing: ['up', 'down', 'left', 'right'].includes(playerObj.position?.facing)
                    ? playerObj.position.facing
                    : 'down',
            },
            inventory: normalizeInventory(playerObj.inventory),
            permissionLevel: playerObj.permissionLevel === 'op' ? 'op' : 'guest',
            sleeping: Boolean(playerObj.sleeping),
        };
    }

    ensurePlayer(next, userId, username, String(userId) === next.worldStatus.roomId ? 'op' : 'guest');
    ensureUnlockedNpcSaves(next);
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
    const next = normalizeGameSave(gameSave, {
        userId: userId || Object.keys(gameSave.players || {})[0] || 'player',
        username: username || 'player',
        roomId: roomId || gameSave.worldStatus?.roomId,
    });
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
    existing.position = {
        x: typeof existing.position?.x === 'number' ? existing.position.x : 400,
        y: typeof existing.position?.y === 'number' ? existing.position.y : 1000,
        facing: ['up', 'down', 'left', 'right'].includes(existing.position?.facing)
            ? existing.position.facing
            : 'down',
    };
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
        gameInventory: Array.isArray(inventory) ? clone(inventory) : [],
    };
}

function upsertPlayerInventoryItem(gameSave, userId, itemId, quantity) {
    const inv = getPlayerInventory(gameSave, userId);
    const existing = inv.find((entry) => entry.itemId === itemId);
    if (existing) {
        existing.quantity += quantity;
    } else if (quantity > 0) {
        inv.push({ itemId, quantity, instanceData: {} });
    }
    setPlayerInventory(gameSave, userId, inv.filter((entry) => Number(entry.quantity || 0) > 0));
    return getPlayerInventory(gameSave, userId);
}

function consumePlayerInventoryItem(gameSave, userId, itemId, quantity) {
    const inv = getPlayerInventory(gameSave, userId);
    const existing = inv.find((entry) => entry.itemId === itemId);
    if (!existing || existing.quantity < quantity) return null;
    existing.quantity -= quantity;
    setPlayerInventory(gameSave, userId, inv.filter((entry) => Number(entry.quantity || 0) > 0));
    return getPlayerInventory(gameSave, userId);
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
    gameSave.worldStatus.entities.chests = Array.isArray(chests) ? clone(chests) : [];
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
        position: { x: 0, y: 0, facing: 'down' },
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
    ensurePlayer,
    getPlayerInventory,
    setPlayerInventory,
    upsertPlayerInventoryItem,
    consumePlayerInventoryItem,
    getFarmTiles,
    setFarmTiles,
    getCreatures,
    setCreatures,
    getChests,
    setChests,
    ensureNpc,
    getNpcMemory,
    setNpcMemory,
};
