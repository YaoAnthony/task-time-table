// Game world inventory routes
// Mounted at: /profile/game/inventory

const express = require('express');
const router  = express.Router();
const authenticateToken = require('../../middlewares/authenticateToken');

const Profile = require('../../models/Profile');
const User    = require('../../models/User');
const { useGameItem } = require('../../shared/useGameItemService');
const {
    clone,
    loadOrCreateGameSave,
    persistGameSave,
    getPlayerInventory,
    setPlayerInventory,
    upsertPlayerInventoryItem,
    consumePlayerInventoryItem,
} = require('../../shared/gameSaveService');

// Re-use ensureProfileState logic inline (lighter approach to avoid circular require)
async function loadProfile(userId) {
    const user = await User.findById(userId);
    if (!user) return null;
    let profile = user.profile ? await Profile.findById(user.profile) : null;
    if (!profile) profile = await Profile.findOne({ user: user._id });
    return profile;
}

// ── POST /profile/game/inventory/pickup ───────────────────────────────────────
// Called when a player picks up a world item (egg, fruit, harvested crop)
router.post('/pickup', authenticateToken, async (req, res) => {
    try {
        const { itemId, quantity = 1 } = req.body;
        if (!itemId) return res.status(400).json({ message: 'itemId is required' });
        if (!Number.isInteger(quantity) || quantity < 1)
            return res.status(400).json({ message: 'quantity must be a positive integer' });

        const state = await loadOrCreateGameSave(req.user.id, req.body.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const gameInventory = upsertPlayerInventoryItem(state.gameSave, req.user.id, itemId, quantity);
        await persistGameSave({
            profile: state.profile,
            room: state.room,
            gameSave: state.gameSave,
            userId: req.user.id,
            username: state.user?.username || state.user?.email || 'player',
            roomId: state.roomId,
        });

        return res.json({ success: true, gameInventory });
    } catch (err) {
        console.error('Game inventory pickup error:', err);
        return res.status(500).json({ message: 'Failed to add item', error: err.message });
    }
});

// ── GET /profile/game/inventory ───────────────────────────────────────────────
// Generic server-side decrement for local world actions such as Q-drop/place.
router.post('/consume', authenticateToken, async (req, res) => {
    try {
        const { itemId, quantity = 1 } = req.body;
        if (!itemId) return res.status(400).json({ message: 'itemId is required' });
        if (!Number.isInteger(quantity) || quantity < 1)
            return res.status(400).json({ message: 'quantity must be a positive integer' });

        const state = await loadOrCreateGameSave(req.user.id, req.body.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const gameInventory = consumePlayerInventoryItem(state.gameSave, req.user.id, itemId, quantity);
        if (!gameInventory) {
            return res.status(400).json({ message: 'Not enough quantity in game inventory' });
        }

        await persistGameSave({
            profile: state.profile,
            room: state.room,
            gameSave: state.gameSave,
            userId: req.user.id,
            username: state.user?.username || state.user?.email || 'player',
            roomId: state.roomId,
        });

        return res.json({ success: true, gameInventory });
    } catch (err) {
        console.error('Game inventory consume error:', err);
        return res.status(500).json({ message: 'Failed to consume item', error: err.message });
    }
});

router.get('/', authenticateToken, async (req, res) => {
    try {
        const state = await loadOrCreateGameSave(req.user.id, req.query.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });
        return res.json({ gameInventory: getPlayerInventory(state.gameSave, req.user.id) });
    } catch (err) {
        console.error('Get game inventory error:', err);
        return res.status(500).json({ message: 'Failed to get inventory', error: err.message });
    }
});

// ── POST /profile/game/inventory/use ─────────────────────────────────────────
// Validated item use: checks capabilities, applies effects, persists changes
router.post('/use', authenticateToken, async (req, res) => {
    try {
        const { itemId, action, targetContext = {} } = req.body;
        if (!itemId || !action) return res.status(400).json({ message: 'itemId and action are required' });

        const state = await loadOrCreateGameSave(req.user.id, targetContext.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const profileFacade = {
            gameInventory: clone(getPlayerInventory(state.gameSave, req.user.id)),
            gameState: { farmTiles: clone(state.gameSave.worldStatus.entities.farmTiles) },
            markModified() {},
        };
        const result = await useGameItem(profileFacade, itemId, action, targetContext);
        if (!result.success) return res.status(400).json({ message: result.error });

        if (result.changes.gameInventory) {
            setPlayerInventory(state.gameSave, req.user.id, result.changes.gameInventory);
        }
        if (result.changes.farmTiles) {
            state.gameSave.worldStatus.entities.farmTiles = clone(result.changes.farmTiles);
        }
        await persistGameSave({
            profile: state.profile,
            room: state.room,
            gameSave: state.gameSave,
            userId: req.user.id,
            username: state.user?.username || state.user?.email || 'player',
            roomId: state.roomId,
        });
        return res.json({ success: true, changes: result.changes });
    } catch (err) {
        console.error('Game item use error:', err);
        return res.status(500).json({ message: 'Failed to use item', error: err.message });
    }
});

module.exports = router;
