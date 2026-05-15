// Creature state routes
// Mounted at: /profile/game/creatures
//
// Creature state is now stored in RoomGameState (shared between players).
// roomId = hostUserId; solo play uses the user's own id as roomId.

const express = require('express');
const router  = express.Router();
const authenticateToken = require('../../middlewares/authenticateToken');
const RoomGameState = require('../../models/RoomGameState');
const { getIo }     = require('../../multiplay');
const {
    loadOrCreateGameSave,
    persistGameSave,
    getCreatures,
    setCreatures,
} = require('../../shared/gameSaveService');

async function loadOrCreateRoom(roomId) {
    let room = await RoomGameState.findOne({ roomId });
    if (!room) room = await RoomGameState.create({ roomId });
    return room;
}

function broadcastCreatureEvent(roomId, payload) {
    const io = getIo();
    if (io) io.to(roomId).emit('game_event', { type: 'creature_update', ...payload });
}

// ── GET /profile/game/creatures ───────────────────────────────────────────────
router.get('/', authenticateToken, async (req, res) => {
    try {
        const state = await loadOrCreateGameSave(req.user.id, req.query.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });
        return res.json({ creatures: getCreatures(state.gameSave) });
    } catch (err) {
        console.error('Get creatures error:', err);
        return res.status(500).json({ message: 'Failed to get creatures', error: err.message });
    }
});

// ── PATCH /profile/game/creatures ─────────────────────────────────────────────
// Batch save: replaces the full creature list (called every ~30s from frontend)
router.patch('/', authenticateToken, async (req, res) => {
    try {
        const { creatures, roomId: bodyRoomId } = req.body;
        if (!Array.isArray(creatures))
            return res.status(400).json({ message: 'creatures must be an array' });

        const roomId = bodyRoomId || String(req.user.id);
        const state = await loadOrCreateGameSave(req.user.id, roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        setCreatures(state.gameSave, creatures);
        await persistGameSave({
            profile: state.profile,
            room: state.room,
            gameSave: state.gameSave,
            userId: req.user.id,
            username: state.user?.username || state.user?.email || 'player',
            roomId: state.roomId,
        });

        broadcastCreatureEvent(roomId, { creatures });
        return res.json({ success: true });
    } catch (err) {
        console.error('Save creatures error:', err);
        return res.status(500).json({ message: 'Failed to save creatures', error: err.message });
    }
});

module.exports = router;
