// Farm tile routes
// Mounted at: /profile/game/farm
//
// World state (farmTiles) is now stored in RoomGameState (shared between players).
// Personal state (inventory) remains in Profile.
// roomId = hostUserId; for solo play the client passes its own userId as roomId.

const express = require('express');
const router  = express.Router();
const authenticateToken = require('../../middlewares/authenticateToken');
const Profile       = require('../../models/Profile');
const User          = require('../../models/User');
const RoomGameState = require('../../models/RoomGameState');
const profileEventBus = require('./shared/profileEventBus');
const { useGameItem, harvestFarmTile } = require('../../shared/useGameItemService');
const { GAME_ITEMS } = require('../../shared/gameItems');
const { getIo }     = require('../../multiplay');
const {
    clone,
    loadOrCreateGameSave,
    persistGameSave,
    getPlayerInventory,
    setPlayerInventory,
    getFarmTiles,
    setFarmTiles,
} = require('../../shared/gameSaveService');

function hasPlantedCrop(tile) {
    return Boolean(
        tile &&
        tile.cropId &&
        GAME_ITEMS[tile.cropId] &&
        tile.plantedAt !== null &&
        tile.plantedAt !== undefined &&
        tile.readyAt !== null &&
        tile.readyAt !== undefined
    );
}

function sanitizeSeedlessFarmTiles(tiles) {
    let changed = 0;
    for (const tile of tiles || []) {
        if (hasPlantedCrop(tile)) continue;
        if (['seeded', 'growing', 'ready'].includes(tile.state)) {
            tile.state = tile.waterExpiry ? 'watered' : 'tilled';
            changed++;
        }
        if (tile.cropId || tile.plantedAt != null || tile.readyAt != null) {
            tile.cropId = null;
            tile.plantRow = 0;
            tile.numStages = 0;
            tile.plantedAt = null;
            tile.readyAt = null;
            changed++;
        }
    }
    return changed;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function loadProfile(userId) {
    const user = await User.findById(userId);
    if (!user) return null;
    let profile = user.profile ? await Profile.findById(user.profile) : null;
    if (!profile) profile = await Profile.findOne({ user: user._id });
    return profile;
}

async function loadOrCreateRoom(roomId) {
    let room = await RoomGameState.findOne({ roomId });
    if (!room) room = await RoomGameState.create({ roomId });
    return room;
}

function createActionDocuments(gameSave, userId) {
    const actionRoom = {
        farmTiles: clone(getFarmTiles(gameSave)),
        markModified() {},
    };
    const actionProfile = {
        gameInventory: clone(getPlayerInventory(gameSave, userId)),
        gameState: { farmTiles: actionRoom.farmTiles },
        markModified() {},
    };
    return { actionProfile, actionRoom };
}

async function saveActionResult(state, result, userId) {
    if (result.changes.gameInventory) {
        setPlayerInventory(state.gameSave, userId, result.changes.gameInventory);
    }
    if (result.changes.farmTiles) {
        setFarmTiles(state.gameSave, result.changes.farmTiles);
    }
    if (result.changes.farmTile) {
        const tiles = getFarmTiles(state.gameSave);
        const idx = tiles.findIndex(t => t.tx === result.changes.farmTile.tx && t.ty === result.changes.farmTile.ty);
        if (idx >= 0) tiles[idx] = result.changes.farmTile;
        else tiles.push(result.changes.farmTile);
        setFarmTiles(state.gameSave, tiles);
    }
    await persistGameSave({
        profile: state.profile,
        room: state.room,
        gameSave: state.gameSave,
        userId,
        username: state.user?.username || state.user?.email || 'player',
        roomId: state.roomId,
    });
}

/**
 * Broadcast a farm game_event to all players in the room.
 * Mirrors the client-side 'game_event' relay so both host and guest apply the change.
 */
function broadcastFarmEvent(roomId, type, payload) {
    const io = getIo();
    if (io) io.to(roomId).emit('game_event', { type, ...payload });
}

// ── POST /profile/game/farm/till ──────────────────────────────────────────────
router.post('/till', authenticateToken, async (req, res) => {
    try {
        const { tx, ty, itemId = 'scythe', roomId: bodyRoomId, gameTick = 0 } = req.body;
        if (typeof tx !== 'number' || typeof ty !== 'number')
            return res.status(400).json({ message: 'tx and ty are required numbers' });

        const roomId = bodyRoomId || String(req.user.id);
        const state = await loadOrCreateGameSave(req.user.id, roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const { actionProfile, actionRoom } = createActionDocuments(state.gameSave, req.user.id);
        const result = await useGameItem(actionProfile, itemId, 'till', { tx, ty, gameTick }, actionRoom);
        if (!result.success) return res.status(400).json({ message: result.error });

        await saveActionResult(state, result, req.user.id);

        broadcastFarmEvent(roomId, 'farm_till', { tx, ty, tile: result.changes.farmTile, droppedSeed: result.changes.droppedSeed });
        return res.json({ success: true, ...result.changes });
    } catch (err) {
        console.error('Till error:', err);
        return res.status(500).json({ message: 'Failed to till', error: err.message });
    }
});

// ── POST /profile/game/farm/water ─────────────────────────────────────────────
router.post('/water', authenticateToken, async (req, res) => {
    try {
        const { tx, ty, gameTick = 0, itemId = 'watering_can', roomId: bodyRoomId } = req.body;

        const roomId = bodyRoomId || String(req.user.id);
        const state = await loadOrCreateGameSave(req.user.id, roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const { actionProfile, actionRoom } = createActionDocuments(state.gameSave, req.user.id);
        const result = await useGameItem(actionProfile, itemId, 'water', { tx, ty, gameTick }, actionRoom);
        if (!result.success) return res.status(400).json({ message: result.error });

        await saveActionResult(state, result, req.user.id);

        const tile = getFarmTiles(state.gameSave).find(t => t.tx === tx && t.ty === ty);
        broadcastFarmEvent(roomId, 'farm_water', { tx, ty, tile });
        return res.json({ success: true, farmTile: tile, farmTiles: getFarmTiles(state.gameSave) });
    } catch (err) {
        console.error('Water error:', err);
        return res.status(500).json({ message: 'Failed to water', error: err.message });
    }
});

// ── POST /profile/game/farm/plant ─────────────────────────────────────────────
router.post('/plant', authenticateToken, async (req, res) => {
    try {
        const { tx, ty, itemId, gameTick = 0, roomId: bodyRoomId } = req.body;
        if (!itemId) return res.status(400).json({ message: 'itemId is required' });

        const roomId = bodyRoomId || String(req.user.id);
        const state = await loadOrCreateGameSave(req.user.id, roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const tile = getFarmTiles(state.gameSave).find(t => t.tx === tx && t.ty === ty);
        const tileState = tile?.state ?? 'none';

        const { actionProfile, actionRoom } = createActionDocuments(state.gameSave, req.user.id);
        const result = await useGameItem(actionProfile, itemId, 'plant', { tx, ty, gameTick, tileState }, actionRoom);
        if (!result.success) return res.status(400).json({ message: result.error });

        await saveActionResult(state, result, req.user.id);

        const updatedTile = getFarmTiles(state.gameSave).find(t => t.tx === tx && t.ty === ty);
        broadcastFarmEvent(roomId, 'farm_plant', { tx, ty, cropId: itemId, tile: updatedTile });
        return res.json({ success: true, ...result.changes });
    } catch (err) {
        console.error('Plant error:', err);
        return res.status(500).json({ message: 'Failed to plant', error: err.message });
    }
});

// ── POST /profile/game/farm/harvest ───────────────────────────────────────────
router.post('/harvest', authenticateToken, async (req, res) => {
    try {
        const { tx, ty, gameTick = 0, roomId: bodyRoomId } = req.body;

        const roomId = bodyRoomId || String(req.user.id);
        const state = await loadOrCreateGameSave(req.user.id, roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const { actionProfile, actionRoom } = createActionDocuments(state.gameSave, req.user.id);
        const result = await harvestFarmTile(actionProfile, { tx, ty, gameTick }, actionRoom);
        if (!result.success) return res.status(400).json({ message: result.error });

        await saveActionResult(state, result, req.user.id);

        broadcastFarmEvent(roomId, 'farm_harvest', { tx, ty, drops: result.changes.dropItems });
        return res.json({ success: true, ...result.changes });
    } catch (err) {
        console.error('Harvest error:', err);
        return res.status(500).json({ message: 'Failed to harvest', error: err.message });
    }
});

// ── GET /profile/game/farm ────────────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
    try {
        const roomId = req.query.roomId || String(req.user.id);
        const state = await loadOrCreateGameSave(req.user.id, roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });
        const farmTiles = getFarmTiles(state.gameSave);
        const cleaned = sanitizeSeedlessFarmTiles(farmTiles);
        if (cleaned > 0) {
            setFarmTiles(state.gameSave, farmTiles);
            await persistGameSave({
                profile: state.profile,
                room: state.room,
                gameSave: state.gameSave,
                userId: req.user.id,
                username: state.user?.username || state.user?.email || 'player',
                roomId: state.roomId,
            });
        }
        return res.json({ farmTiles });
    } catch (err) {
        console.error('Get farm tiles error:', err);
        return res.status(500).json({ message: 'Failed to get farm tiles', error: err.message });
    }
});

// ── POST /profile/game/farm/tick ──────────────────────────────────────────────
// Called by frontend every ~30s; advances crop growth and expires water
router.post('/tick', authenticateToken, async (req, res) => {
    try {
        const { gameTick = 0, roomId: bodyRoomId } = req.body;

        const roomId = bodyRoomId || String(req.user.id);
        const state = await loadOrCreateGameSave(req.user.id, roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });
        const tiles = getFarmTiles(state.gameSave);
        let updated  = sanitizeSeedlessFarmTiles(tiles);

        for (const tile of tiles) {
            if (!hasPlantedCrop(tile)) continue;
            if (tile.state === 'seeded' || tile.state === 'growing') {
                const isWatered = tile.waterExpiry !== null && gameTick <= tile.waterExpiry;
                if (tile.state === 'seeded' && !isWatered) continue;
                if (tile.state === 'seeded' && isWatered) {
                    tile.state = 'growing';
                    updated++;
                }
                if (tile.readyAt !== null && gameTick >= tile.readyAt) {
                    tile.state = 'ready';
                    updated++;
                    try {
                        profileEventBus.emit(String(req.user.id), 'farm_tile_updated', { tile: tile.toObject?.() ?? tile });
                    } catch (_) {}
                }
            }
        }

        if (updated > 0) {
            setFarmTiles(state.gameSave, tiles);
            await persistGameSave({
                profile: state.profile,
                room: state.room,
                gameSave: state.gameSave,
                userId: req.user.id,
                username: state.user?.username || state.user?.email || 'player',
                roomId: state.roomId,
            });
            broadcastFarmEvent(roomId, 'farm_tick', { farmTiles: getFarmTiles(state.gameSave), gameTick });
        }

        return res.json({ updated, farmTiles: getFarmTiles(state.gameSave) });
    } catch (err) {
        console.error('Farm tick error:', err);
        return res.status(500).json({ message: 'Failed to tick farm', error: err.message });
    }
});

module.exports = router;
