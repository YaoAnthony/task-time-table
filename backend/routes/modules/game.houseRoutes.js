const express = require('express');
const authenticateToken = require('../../middlewares/authenticateToken');
const {
    loadOrCreateGameSave,
    persistGameSave,
    getPlayerInventory,
} = require('../../shared/gameSaveService');
const {
    buildHouseShopResponse,
    getHouses,
    getHouseContracts,
    purchaseHouseBlueprint,
    placeHouse,
    completeConstruction,
    openHouse,
    createHouseContract,
    signHouseContract,
    cancelHouseContract,
    collectHouseRent,
} = require('../../shared/gameHouseService');

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

router.get('/house-shop', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        return res.json({
            success: true,
            ...buildHouseShopResponse(state.gameSave, state.profile, req.user.id),
        });
    } catch (err) {
        return sendError(res, err, 'Failed to load house shop');
    }
});

router.post('/house-shop/purchase', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = purchaseHouseBlueprint({
            gameSave: state.gameSave,
            profile: state.profile,
            userId: req.user.id,
            definitionId: req.body?.houseDefinitionId,
            quantity: req.body?.quantity || 1,
        });
        const gameSave = await saveState(state, req);
        return res.json({
            success: true,
            wallet: result.wallet,
            gameInventory: getPlayerInventory(gameSave, req.user.id),
            gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to purchase house blueprint');
    }
});

router.get('/houses', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        return res.json({ success: true, houses: getHouses(state.gameSave), gameSave: state.gameSave });
    } catch (err) {
        return sendError(res, err, 'Failed to load houses');
    }
});

router.post('/houses/place', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = placeHouse({
            gameSave: state.gameSave,
            userId: req.user.id,
            username: usernameOf(state),
            definitionId: req.body?.definitionId,
            blueprintItemId: req.body?.blueprintItemId,
            x: req.body?.x,
            y: req.body?.y,
            gameTick: req.body?.placementProof?.requestedAtTick ?? state.gameSave.worldStatus?.gameTick,
        });
        const gameSave = await saveState(state, req);
        return res.json({
            success: true,
            house: result.house,
            houses: getHouses(gameSave),
            gameInventory: getPlayerInventory(gameSave, req.user.id),
            gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to place house');
    }
});

router.post('/houses/:houseId/construction/complete', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = completeConstruction({
            gameSave: state.gameSave,
            userId: req.user.id,
            houseId: req.params.houseId,
            gameTick: req.body?.gameTick ?? state.gameSave.worldStatus?.gameTick,
        });
        const gameSave = await saveState(state, req);
        return res.json({
            success: true,
            house: result.house,
            houses: getHouses(gameSave),
            gameInventory: getPlayerInventory(gameSave, req.user.id),
            gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to complete house construction');
    }
});

router.post('/houses/:houseId/open', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = openHouse({
            gameSave: state.gameSave,
            userId: req.user.id,
            houseId: req.params.houseId,
        });
        const gameSave = await saveState(state, req);
        return res.json({ success: true, house: result.house, houses: getHouses(gameSave), gameSave });
    } catch (err) {
        return sendError(res, err, 'Failed to open house');
    }
});

router.post('/houses/:houseId/rent/collect', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = collectHouseRent({
            gameSave: state.gameSave,
            profile: state.profile,
            houseId: req.params.houseId,
            gameTick: req.body?.gameTick ?? state.gameSave.worldStatus?.gameTick,
        });
        const gameSave = await saveState(state, req);
        return res.json({
            success: true,
            collected: result.collected,
            wallet: result.wallet,
            house: result.house,
            gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to collect house rent');
    }
});

router.get('/house-contracts', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        return res.json({
            success: true,
            contracts: getHouseContracts(state.gameSave),
            houses: getHouses(state.gameSave),
            gameSave: state.gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to load house contracts');
    }
});

router.post('/house-contracts', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = createHouseContract({
            gameSave: state.gameSave,
            userId: req.user.id,
            houseId: req.body?.houseId,
            npcId: req.body?.npcId,
            npcName: req.body?.npcName,
            rentPerDay: req.body?.rentPerDay,
            gameTick: req.body?.gameTick ?? state.gameSave.worldStatus?.gameTick,
        });
        const gameSave = await saveState(state, req);
        return res.json({
            success: true,
            contract: result.contract,
            house: result.house,
            contracts: getHouseContracts(gameSave),
            houses: getHouses(gameSave),
            gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to create house contract');
    }
});

router.post('/house-contracts/:contractId/sign', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = signHouseContract({
            gameSave: state.gameSave,
            contractId: req.params.contractId,
            gameTick: req.body?.gameTick ?? state.gameSave.worldStatus?.gameTick,
        });
        const gameSave = await saveState(state, req);
        return res.json({
            success: true,
            contract: result.contract,
            house: result.house,
            contracts: getHouseContracts(gameSave),
            houses: getHouses(gameSave),
            gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to sign house contract');
    }
});

router.post('/house-contracts/:contractId/cancel', authenticateToken, async (req, res) => {
    try {
        const state = await loadState(req);
        const result = cancelHouseContract({
            gameSave: state.gameSave,
            contractId: req.params.contractId,
        });
        const gameSave = await saveState(state, req);
        return res.json({
            success: true,
            contract: result.contract,
            house: result.house,
            contracts: getHouseContracts(gameSave),
            houses: getHouses(gameSave),
            gameSave,
        });
    } catch (err) {
        return sendError(res, err, 'Failed to cancel house contract');
    }
});

module.exports = router;
