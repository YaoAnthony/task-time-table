const express = require('express');
const authenticateToken = require('../../middlewares/authenticateToken');
const {
    loadOrCreateGameSave,
    persistGameSave,
    getPlayerInventory,
} = require('../../shared/gameSaveService');
const {
    getStorageChests,
    placeStorageChest,
    transferStorageChestItem,
} = require('../../shared/gameStorageChestService');

const router = express.Router();

function usernameOf(state) {
    return state.user?.username || state.user?.email || 'player';
}

async function loadState(req) {
    const roomId = req.body?.roomId || req.query?.roomId;
    const state = await loadOrCreateGameSave(req.user.id, roomId);
    if (state.error) {
        const err = new Error(state.error);
        err.status = state.status || 400;
        throw err;
    }
    return state;
}

async function saveState(state, req) {
    return persistGameSave({
        profile: state.profile,
        room: state.room,
        gameSave: state.gameSave,
        userId: req.user.id,
        username: usernameOf(state),
        roomId: state.roomId,
    });
}

function sendError(res, err, fallback) {
    const status = Number(err.status || err.statusCode || 500);
    console.error(fallback, err);
    return res.status(status).json({ message: err.message || fallback });
}

router.get('/storage-chests', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        return res.json({
            success: true,
            storageChests: getStorageChests(state.gameSave),
            gameSave: state.gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to load storage chests');
    }
});

router.post('/storage-chests/place', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = placeStorageChest({
            gameSave: state.gameSave,
            userId: req.user.id,
            username: usernameOf(state),
            roomId: state.roomId,
            itemId: req.body?.itemId,
            x: req.body?.x,
            y: req.body?.y,
            gameTick: req.body?.placementProof?.requestedAtTick ?? state.gameSave.worldStatus?.gameTick,
        });
        const gameSave = await saveState(state, req);
        return res.json({
            success: true,
            storageChest: result.storageChest,
            storageChests: getStorageChests(gameSave),
            gameInventory: getPlayerInventory(gameSave, req.user.id),
            gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to place storage chest');
    }
});

router.post('/storage-chests/:chestId/transfer', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = transferStorageChestItem({
            gameSave: state.gameSave,
            userId: req.user.id,
            chestId: req.params.chestId,
            from: req.body?.from,
            to: req.body?.to,
            quantity: req.body?.quantity,
            gameTick: req.body?.gameTick ?? state.gameSave.worldStatus?.gameTick,
        });
        const gameSave = await saveState(state, req);
        return res.json({
            success: true,
            storageChest: result.storageChest,
            storageChests: getStorageChests(gameSave),
            gameInventory: getPlayerInventory(gameSave, req.user.id),
            gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to transfer storage item');
    }
});

module.exports = router;
