const express = require('express');
const authenticateToken = require('../../middlewares/authenticateToken');
const {
    loadOrCreateGameSave,
    persistGameSave,
    getPlayerInventory,
} = require('../../shared/gameSaveService');
const {
    buildGameShopResponse,
    purchaseGameShopItem,
} = require('../../shared/gameShopService');

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

router.get('/shop', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        return res.json({
            success: true,
            ...buildGameShopResponse(state.gameSave, state.profile, req.user.id),
            gameSave: state.gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to load game shop');
    }
});

router.post('/shop/purchase', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = purchaseGameShopItem({
            gameSave: state.gameSave,
            profile: state.profile,
            userId: req.user.id,
            shopItemId: req.body?.shopItemId,
            quantity: req.body?.quantity || 1,
            currentTick: state.gameSave.worldStatus?.gameTick ?? 0,
        });
        const gameSave = await saveState(state, req);
        const shop = buildGameShopResponse(gameSave, state.profile, req.user.id);
        return res.json({
            success: true,
            purchase: result,
            wallet: state.profile.wallet || { coins: 0 },
            gameInventory: getPlayerInventory(gameSave, req.user.id),
            items: shop.items,
            unlockedNpcs: shop.unlockedNpcs,
            pendingNpcArrivals: shop.pendingNpcArrivals,
            gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to purchase game shop item');
    }
});

module.exports = router;
