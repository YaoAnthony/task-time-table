// Shared item-use validation + execution service.
// Called from game.inventoryRoutes.js and game.farmRoutes.js

const { GAME_ITEMS } = require('./gameItems');

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

function clearCropFields(tile) {
    tile.cropId = null;
    tile.plantRow = 0;
    tile.numStages = 0;
    tile.plantedAt = null;
    tile.readyAt = null;
}

/**
 * Validate and execute a game item action.
 *
 * @param {object} profile      — Mongoose Profile document (personal inventory / wallet)
 * @param {string} itemId       — GAME_ITEMS key
 * @param {string} action       — ItemActionType string
 * @param {object} targetContext — { tileState?, tx?, ty?, gameTick? }
 * @param {object} [roomState]  — Optional RoomGameState document.
 *                                When provided, farm-state (farmTiles) is read/written there
 *                                instead of profile.gameState.farmTiles.
 * @returns {{ success: boolean, error?: string, changes: object }}
 */
async function useGameItem(profile, itemId, action, targetContext = {}, roomState) {
    const def = GAME_ITEMS[itemId];
    if (!def) return { success: false, error: `未知物品: ${itemId}`, changes: {} };

    const cap = (def.capabilities || []).find(c => c.action === action);
    if (!cap) return { success: false, error: `${def.nameZh} 不支持动作: ${action}`, changes: {} };

    // Validate requires constraints
    if (cap.requires) {
        for (const [k, v] of Object.entries(cap.requires)) {
            if (targetContext[k] !== v) {
                return { success: false, error: `需要 ${k} = ${v}，当前为 ${targetContext[k]}`, changes: {} };
            }
        }
    }

    // Consumables need inventory stock; tools do not
    if (def.type !== 'tool') {
        const entry = (profile.gameInventory || []).find(i => i.itemId === itemId);
        if (!entry || entry.quantity < 1) {
            return { success: false, error: `${def.nameZh} 数量不足`, changes: {} };
        }
    }

    // Helper: get tiles array from roomState (shared) or profile.gameState (legacy solo)
    function getTiles() {
        if (roomState) return roomState.farmTiles || [];
        if (!profile.gameState) profile.gameState = { farmTiles: [], creatures: [] };
        return profile.gameState.farmTiles || [];
    }
    function markTilesDirty() {
        if (roomState) {
            roomState.markModified('farmTiles');
        } else {
            profile.markModified('gameState');
        }
    }

    const changes = {};

    switch (action) {
        case 'till': {
            const { tx, ty } = targetContext;
            const tiles = getTiles();
            if (tiles.find(t => t.tx === tx && t.ty === ty))
                return { success: false, error: '该位置已有耕地', changes: {} };
            const newTile = { tx, ty, state: 'tilled', cropId: null, plantedAt: null, readyAt: null, waterExpiry: null };
            tiles.push(newTile);
            if (roomState) roomState.farmTiles = tiles;
            else profile.gameState.farmTiles = tiles;
            markTilesDirty();
            // 30 % chance to drop a random seed — frontend spawns it as DropItem
            let droppedSeed = null;
            if (Math.random() < 0.3) {
                const pool = ['wheat_seed', 'tomato_seed'];
                droppedSeed = { itemId: pool[Math.floor(Math.random() * pool.length)], quantity: 1 };
            }
            changes.farmTile    = newTile;
            changes.droppedSeed = droppedSeed;
            break;
        }

        case 'eat': {
            profile.gameInventory = (profile.gameInventory || [])
                .map(i => i.itemId === itemId ? { ...i.toObject?.() ?? i, quantity: i.quantity - 1 } : i)
                .filter(i => i.quantity > 0);
            profile.markModified('gameInventory');
            changes.gameInventory = profile.gameInventory;
            break;
        }

        case 'plant': {
            const { tx, ty, gameTick = 0 } = targetContext;
            const tiles = getTiles();
            const tile = tiles.find(t => t.tx === tx && t.ty === ty);
            if (!tile) return { success: false, error: '该位置没有耕地', changes: {} };
            if (tile.cropId || tile.plantedAt != null || tile.readyAt != null) {
                return { success: false, error: '该位置已经有作物', changes: {} };
            }
            if (!['tilled', 'watered'].includes(tile.state)) {
                return { success: false, error: '需要耕地或浇水状态才能播种', changes: {} };
            }
            // Consume 1 seed
            profile.gameInventory = (profile.gameInventory || [])
                .map(i => i.itemId === itemId ? { ...i.toObject?.() ?? i, quantity: i.quantity - 1 } : i)
                .filter(i => i.quantity > 0);
            const numStages     = def.numStages    || 4;
            const growDuration  = def.growDuration || 40;
            const wasWatered    = tile.state === 'watered';
            const effectiveDuration = wasWatered ? growDuration / 2 : growDuration;
            tile.state     = wasWatered ? 'growing' : 'seeded';
            tile.cropId    = itemId;
            tile.plantRow  = def.plantRow ?? 0;
            tile.numStages = numStages;
            tile.plantedAt = gameTick;
            tile.readyAt   = gameTick + effectiveDuration;
            markTilesDirty();
            profile.markModified('gameInventory');
            changes.farmTiles     = getTiles();
            changes.gameInventory = profile.gameInventory;
            break;
        }

        case 'harvest': {
            const { tx, ty, gameTick = 0 } = targetContext;
            const tiles = getTiles();
            const tile  = tiles.find(t => t.tx === tx && t.ty === ty);
            if (!tile) return { success: false, error: '该位置没有农田', changes: {} };

            const isTimeReady  = tile.readyAt != null && gameTick >= tile.readyAt;
            const isStateReady = tile.state === 'ready';
            if (!hasPlantedCrop(tile)) {
                return { success: false, error: '该农田尚未播种', changes: {} };
            }
            if (!isStateReady && !isTimeReady)
                return { success: false, error: '该农田尚未成熟', changes: {} };

            const cropDef   = GAME_ITEMS[tile.cropId];
            const harvestId = cropDef?.harvestItem ?? tile.cropId;
            const qty       = cropDef?.harvestQty ?? 1;
            const seedId    = tile.cropId;

            tile.state = 'harvested';
            markTilesDirty();
            changes.farmTiles = getTiles();

            const dropItems = [];
            for (let i = 0; i < qty; i++) dropItems.push({ itemId: harvestId, quantity: 1 });
            if (seedId && GAME_ITEMS[seedId]) dropItems.push({ itemId: seedId, quantity: 1 });
            changes.dropItems = dropItems;
            break;
        }

        case 'water': {
            const { tx, ty, gameTick = 0 } = targetContext;
            const WATER_TICKS = 120;
            const tiles = getTiles();
            const tile  = tiles.find(t => t.tx === tx && t.ty === ty);
            if (!tile) return { success: false, error: '该位置没有耕地', changes: {} };
            tile.waterExpiry = gameTick + WATER_TICKS;
            if (tile.state === 'tilled' || (tile.state === 'watered' && !hasPlantedCrop(tile))) {
                clearCropFields(tile);
                tile.state = 'watered';
            } else if (tile.state === 'seeded' && hasPlantedCrop(tile)) {
                tile.state = 'growing';
                if (tile.readyAt !== null && tile.readyAt !== undefined) {
                    const remaining = tile.readyAt - gameTick;
                    tile.readyAt = gameTick + Math.max(1, Math.ceil(remaining / 2));
                }
            }
            markTilesDirty();
            changes.farmTiles = getTiles();
            break;
        }

        case 'collect':
            // collect is handled directly by pickup endpoint
            break;

        default:
            break;
    }

    return { success: true, changes };
}

/**
 * Harvest a ready farm tile — NO tool requirement (bare-hands F-key action).
 * @param {object} profile
 * @param {{ tx, ty, gameTick? }} context
 * @param {object} [roomState]  — Optional RoomGameState document
 * @returns {{ success: boolean, error?: string, changes: object }}
 */
async function harvestFarmTile(profile, { tx, ty, gameTick = 0 }, roomState) {
    const tiles = roomState
        ? (roomState.farmTiles || [])
        : (profile.gameState?.farmTiles || []);
    const tile = tiles.find(t => t.tx === tx && t.ty === ty);
    if (!tile) return { success: false, error: '该位置没有农田', changes: {} };

    const isTimeReady  = tile.readyAt != null && gameTick >= tile.readyAt;
    const isStateReady = tile.state === 'ready';
    if (!hasPlantedCrop(tile)) {
        return { success: false, error: '该农田尚未播种', changes: {} };
    }
    if (!isStateReady && !isTimeReady)
        return { success: false, error: '该农田尚未成熟', changes: {} };

    const cropDef   = GAME_ITEMS[tile.cropId];
    const harvestId = cropDef?.harvestItem ?? tile.cropId;
    const qty       = cropDef?.harvestQty ?? 1;
    const seedId    = tile.cropId;

    tile.state = 'harvested';
    if (roomState) roomState.markModified('farmTiles');
    else           profile.markModified('gameState');

    const dropItems = [];
    for (let i = 0; i < qty; i++) dropItems.push({ itemId: harvestId, quantity: 1 });
    if (seedId && GAME_ITEMS[seedId]) dropItems.push({ itemId: seedId, quantity: 1 });

    return { success: true, changes: { farmTiles: tiles, dropItems } };
}

module.exports = { useGameItem, harvestFarmTile };
