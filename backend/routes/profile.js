const express = require('express');
const router = express.Router();


const User = require('../models/User');
const Profile = require('../models/Profile');
const Coupon = require('../models/Coupon');
const System = require('../models/System');

const jwt = require('jsonwebtoken');


const authenticateToken = require('../middlewares/authenticateToken');
const profileEventBus   = require('./modules/shared/profileEventBus');
const {
    ANIMAL_CROSSING_NPC_STYLE,
    ANIMAL_CROSSING_ASSISTANT_STYLE,
} = require('./modules/shared/animalCrossingAgentStyle');
const {
    getNpcSkillForPrompt,
    listNpcSkills,
    readNpcSkill,
} = require('../services/npcSkillService');
const { runNpcMcpAgent } = require('../services/npcMcpAgentService');
const {
    loadOrCreateGameSave,
    persistGameSave,
    resetGameSaveForUser,
    getNpcMemory,
    setNpcMemory,
    getChests,
    setChests,
} = require('../shared/gameSaveService');
const {
    listNpcDefinitions,
    getNpcDefinitionById,
    normalizeUnlockedNpcIds,
    toShopItem,
} = require('../shared/gameNpcCatalog');
const {
    getPendingNpcArrivalIds,
    enqueueNpcArrivalEvent,
} = require('../shared/gameEventService');
const { listEnabledStorylinePackages } = require('../storylineCore');

const paypal = require('@paypal/checkout-server-sdk');
// const { createPayPalClient, paypal } = require('./paypal');

const OpenAI = require('openai');
// Prefer DeepSeek when DEEPSEEK_API_KEY is set; fall back to OpenAI
const _openai = process.env.DEEPSEEK_API_KEY
    ? new OpenAI({ apiKey: process.env.DEEPSEEK_API_KEY, baseURL: 'https://api.deepseek.com' })
    : process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;
const _model = process.env.DEEPSEEK_API_KEY ? 'deepseek-chat' : 'gpt-4o-mini';

const SIX_ATTRIBUTES = ['stamina', 'strength', 'wisdom', 'discipline', 'charisma', 'luck'];

const ensureProfileState = async (userId) => {
    const user = await User.findById(userId);
    if (!user) {
        return { error: 'User not found.', status: 404 };
    }

    let profile = null;
    if (user.profile) {
        profile = await Profile.findById(user.profile);
    }
    if (!profile) {
        profile = await Profile.findOne({ user: user._id });
    }
    if (!profile) {
        profile = await Profile.create({ user: user._id, systems: [], wallet: { coins: 0 }, inventory: [] });
        user.profile = profile._id;
        await user.save();
    }

    let changed = false;
    if (!profile.wallet) {
        profile.wallet = { coins: 0 };
        changed = true;
    }
    if (typeof profile.wallet.coins !== 'number') {
        profile.wallet.coins = 0;
        changed = true;
    }

    if (!profile.attributes) {
        profile.attributes = {};
        changed = true;
    }

    for (const key of SIX_ATTRIBUTES) {
        if (!profile.attributes[key]) {
            profile.attributes[key] = { level: 0, exp: 0 };
            changed = true;
        } else {
            if (typeof profile.attributes[key].level !== 'number') {
                profile.attributes[key].level = 0;
                changed = true;
            }
            if (typeof profile.attributes[key].exp !== 'number') {
                profile.attributes[key].exp = 0;
                changed = true;
            }
        }
    }

    if (!Array.isArray(profile.inventory)) {
        profile.inventory = [];
        changed = true;
    }

    if (!Array.isArray(profile.gameInventory)) {
        profile.gameInventory = [];
        changed = true;
    }

    if (!profile.gameState) {
        profile.gameState = { farmTiles: [], creatures: [] };
        changed = true;
    }

    if (changed) {
        await profile.save();
    }

    return { profile };
};

const upsertInventoryItem = (profile, payload) => {
    const { inventoryKey, name, type, quantity = 1, sourceSystem = null, metadata = {} } = payload;
    const existing = profile.inventory.find((item) => item.inventoryKey === inventoryKey);
    if (existing) {
        existing.quantity += quantity;
        if (name) existing.name = name;
        if (type) existing.type = type;
        if (metadata && Object.keys(metadata).length > 0) {
            existing.metadata = { ...(existing.metadata || {}), ...metadata };
        }
        return existing;
    }

    profile.inventory.push({
        inventoryKey,
        name,
        type,
        quantity,
        sourceSystem,
        metadata,
    });
    return profile.inventory[profile.inventory.length - 1];
};

const upsertGameInventoryItem = (profile, itemId, quantity) => {
    if (!Array.isArray(profile.gameInventory)) profile.gameInventory = [];
    const existing = profile.gameInventory.find(i => i.itemId === itemId);
    if (existing) {
        existing.quantity += quantity;
    } else {
        profile.gameInventory.push({ itemId, quantity, instanceData: {} });
    }
    profile.markModified('gameInventory');
};

// 配置 PayPal 环境
function environment() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

  return process.env.NODE_ENV === 'production'
    ? new paypal.core.LiveEnvironment(clientId, clientSecret)
    : new paypal.core.SandboxEnvironment(clientId, clientSecret);
}

//test paypal client
function client() {
  return new paypal.core.PayPalHttpClient(environment());
}

const getProfileByUserId = async (userId) => {
    try {
        const user = await User.findById(userId).lean();
        if (!user) {
            return null;
        }

        const profile = await Profile.findOne({ user: userId })
            .populate('systems', 'name description modules createdAt updatedAt')
            .lean();

        return profile;
    } catch (err) {
        console.error(err);
        return null;
    }
}

const getUserById = async (userId) => {
    try {
        const user = await User.findById(userId).lean();
        if (!user) {
            return null;
        }
        
        return user;
    } catch (err) {
        console.error(err);
        return null;
    }
}

// 获得用户的profile
router.get('/getProfile', authenticateToken, async (req, res) => {
    const userId = req.user.id;
    const ensured = await ensureProfileState(userId);
    if (ensured.error) {
        return res.status(ensured.status || 400).json({ message: ensured.error });
    }
    const profile = await getProfileByUserId(userId);
    res.json({
        _id: userId,
        profile,
    });
});

router.get('/getProfileAndUser', authenticateToken, async (req, res) => {   
    const userId = req.user.id;
    const ensured = await ensureProfileState(userId);
    if (ensured.error) {
        return res.status(ensured.status || 400).json({ message: ensured.error });
    }
    const profile = await getProfileByUserId(userId);
    const user = await getUserById(userId);
    res.json({
        profile,
        user,
    });
});

router.get('/active-system-tasks', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { profile, error, status } = await ensureProfileState(userId);

        if (error) {
            return res.status(status || 400).json({ message: error });
        }

        const systemIds = Array.isArray(profile.systems) ? profile.systems : [];
        if (systemIds.length === 0) {
            return res.json({ success: true, activeTasks: [] });
        }

        const systems = await System.find({ _id: { $in: systemIds } })
            .select('name members missionLists')
            .lean();

        const activeTasks = [];
        const now = Date.now();

        for (const system of systems) {
            const member = (system.members || []).find((entry) => String(entry.user) === String(userId));
            if (!member?.activeTask) continue;

            const activeMissionListId = String(member.activeTask.missionListId || '');
            const activeNodeId = String(member.activeTask.nodeId || '');
            if (!activeMissionListId || !activeNodeId) continue;

            const missionList = (system.missionLists || []).find(
                (list) => String(list._id) === activeMissionListId
            );
            if (!missionList) continue;

            const node = (missionList.taskTree || []).find((item) => item.nodeId === activeNodeId);
            if (!node) continue;

            const startedAtRaw = member.activeTask.startedAt ? new Date(member.activeTask.startedAt) : null;
            if (!startedAtRaw || Number.isNaN(startedAtRaw.getTime())) continue;

            const elapsedSeconds = Math.max(0, Math.floor((now - startedAtRaw.getTime()) / 1000));
            const requiredSeconds = Math.max(60, Number(node.timeCostMinutes || 1) * 60);

            activeTasks.push({
                systemId: String(system._id),
                systemName: system.name || '',
                memberUserId: String(member.user),
                memberProfileId: String(member.profile || ''),
                missionListId: String(missionList._id),
                missionListTitle: missionList.title || '',
                nodeId: node.nodeId,
                nodeTitle: node.title || '',
                startedAt: startedAtRaw.toISOString(),
                timeCostMinutes: Number(node.timeCostMinutes || 0),
                requiredSeconds,
                elapsedSeconds,
                overtimeSeconds: Math.max(0, elapsedSeconds - requiredSeconds),
                isOvertime: elapsedSeconds > requiredSeconds,
            });
        }

        return res.json({
            success: true,
            activeTasks,
        });
    } catch (err) {
        console.error('Get active system tasks error:', err);
        return res.status(500).json({ message: 'Failed to get active system tasks', error: err.message });
    }
});

router.get('/state', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { profile, error, status } = await ensureProfileState(userId);

        if (error) {
            return res.status(status || 400).json({ message: error });
        }

        return res.json({
            wallet: profile.wallet,
            attributes: profile.attributes,
            inventory: profile.inventory,
        });
    } catch (err) {
        console.error('Get profile state error:', err);
        return res.status(500).json({ message: 'Failed to get profile state', error: err.message });
    }
});

router.patch('/state/coins', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { amount, operation = 'add' } = req.body;

        if (typeof amount !== 'number' || amount < 0) {
            return res.status(400).json({ message: 'amount must be a non-negative number.' });
        }

        const { profile, error, status } = await ensureProfileState(userId);
        if (error) {
            return res.status(status || 400).json({ message: error });
        }

        if (operation === 'set') {
            profile.wallet.coins = amount;
        } else if (operation === 'subtract') {
            if (profile.wallet.coins < amount) {
                return res.status(400).json({ message: 'Insufficient coins.' });
            }
            profile.wallet.coins -= amount;
        } else {
            profile.wallet.coins += amount;
        }

        await profile.save();
        return res.json({ success: true, wallet: profile.wallet });
    } catch (err) {
        console.error('Update coins error:', err);
        return res.status(500).json({ message: 'Failed to update coins', error: err.message });
    }
});

router.patch('/state/attributes/:attributeKey', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { attributeKey } = req.params;
        const { levelDelta, expDelta, setLevel, setExp } = req.body;

        if (!SIX_ATTRIBUTES.includes(attributeKey)) {
            return res.status(400).json({ message: 'Invalid attribute key.' });
        }

        const { profile, error, status } = await ensureProfileState(userId);
        if (error) {
            return res.status(status || 400).json({ message: error });
        }

        const target = profile.attributes[attributeKey];

        if (typeof setLevel === 'number') {
            target.level = Math.max(0, setLevel);
        }
        if (typeof setExp === 'number') {
            target.exp = Math.max(0, setExp);
        }
        if (typeof levelDelta === 'number') {
            target.level = Math.max(0, target.level + levelDelta);
        }
        if (typeof expDelta === 'number') {
            target.exp = Math.max(0, target.exp + expDelta);
        }

        await profile.save();
        return res.json({ success: true, attributes: profile.attributes });
    } catch (err) {
        console.error('Update attribute error:', err);
        return res.status(500).json({ message: 'Failed to update attribute', error: err.message });
    }
});

router.post('/shop/purchase', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { systemId, productId, quantity = 1 } = req.body;

        if (!systemId || !productId) {
            return res.status(400).json({ message: 'systemId and productId are required.' });
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
            return res.status(400).json({ message: 'quantity must be a positive integer.' });
        }

        const { profile, error, status } = await ensureProfileState(userId);
        if (error) {
            return res.status(status || 400).json({ message: error });
        }

        const system = await System.findOne({ _id: systemId, profile: profile._id });
        if (!system) {
            return res.status(404).json({ message: 'System not found.' });
        }

        const product = system.storeProducts.id(productId);
        if (!product) {
            return res.status(404).json({ message: 'Store product not found.' });
        }

        const totalCost = product.price * quantity;
        if (profile.wallet.coins < totalCost) {
            return res.status(400).json({ message: 'Insufficient coins.' });
        }

        if ((product.type === 'item' || product.type === 'lottery_chance') && (product.stock === null || product.stock === undefined || product.stock < quantity)) {
            return res.status(400).json({ message: 'Insufficient stock.' });
        }

        if (product.type === 'item' || product.type === 'lottery_chance') {
            product.stock -= quantity;
        }

        profile.wallet.coins -= totalCost;

        const inventoryKey = `system:${system._id}:product:${product._id}`;
        upsertInventoryItem(profile, {
            inventoryKey,
            name: product.name,
            type: product.type === 'item' ? 'item' : product.type,
            quantity,
            sourceSystem: system._id,
            metadata: {
                productId: String(product._id),
                systemId: String(system._id),
                rarity: product.rarity,
                price: product.price,
            },
        });

        await Promise.all([profile.save(), system.save()]);

        return res.json({
            success: true,
            wallet: profile.wallet,
            inventory: profile.inventory,
            storeProducts: system.storeProducts,
        });
    } catch (err) {
        console.error('Purchase product error:', err);
        return res.status(500).json({ message: 'Failed to purchase product', error: err.message });
    }
});

router.post('/inventory/use', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { inventoryKey, quantity = 1 } = req.body;

        if (!inventoryKey) {
            return res.status(400).json({ message: 'inventoryKey is required.' });
        }
        if (!Number.isInteger(quantity) || quantity <= 0) {
            return res.status(400).json({ message: 'quantity must be a positive integer.' });
        }

        const { profile, error, status } = await ensureProfileState(userId);
        if (error) {
            return res.status(status || 400).json({ message: error });
        }

        const item = profile.inventory.find((inventoryItem) => inventoryItem.inventoryKey === inventoryKey);
        if (!item) {
            return res.status(404).json({ message: 'Inventory item not found.' });
        }

        if (item.quantity < quantity) {
            return res.status(400).json({ message: 'Not enough quantity in inventory.' });
        }

        item.quantity -= quantity;
        if (item.quantity === 0) {
            profile.inventory = profile.inventory.filter((inventoryItem) => inventoryItem.inventoryKey !== inventoryKey);
        }

        await profile.save();
        return res.json({ success: true, inventory: profile.inventory });
    } catch (err) {
        console.error('Use inventory item error:', err);
        return res.status(500).json({ message: 'Failed to use inventory item', error: err.message });
    }
});


// Route to upgrade a user's subscription
router.post('/upgrade-subscription', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { level, renewalPeriod, couponCode } = req.body;

        // Validate subscription level and renewal period
        const validLevels = ['individual', 'enterprise'];
        if (!validLevels.includes(level)) {
            return res.status(400).json({ message: 'Invalid subscription level for upgrade.' });
        }
        const validPeriods = ['monthly', 'yearly'];
        if (!validPeriods.includes(renewalPeriod)) {
            return res.status(400).json({ message: 'Invalid renewal period.' });
        }

        // First: update subscription
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                'subscription.level': level,
                'subscription.subscribedAt': new Date(),
                'subscription.renewalPeriod': renewalPeriod,
            },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Second: Mark coupon as used (if provided)
        if (couponCode) {
            await Coupon.updateOne(
                { code: couponCode },
                { $addToSet: { usedBy: userId } }    // 防止重复 push
            );
        }

        res.status(200).json({
            success: true,
            message: couponCode
                ? 'Subscription upgraded successfully. Coupon has been redeemed.'
                : 'Subscription upgraded successfully.',
            user: updatedUser,
        });

    } catch (err) {
        console.error('Error upgrading subscription:', err);
        res.status(500).json({
            message: 'Failed to upgrade subscription',
            error: err.message
        });
    }
});


// Route to downgrade a user's subscription to free
router.post('/downgrade-subscription', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                'subscription.level': 'free',
                'subscription.subscribedAt': null,
                'subscription.renewalPeriod': null,
            },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Subscription downgraded to free.',
            user: updatedUser,
        });
    } catch (err) {
        console.error('Error downgrading subscription:', err);
        res.status(500).json({ message: 'Failed to downgrade subscription', error: err.message });
    }
});

// Route to cancel a subscription (functionally same as downgrading to free)
router.post('/cancel-subscription', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                'subscription.level': 'free',
                'subscription.subscribedAt': null,
                'subscription.renewalPeriod': null,
            },
            { new: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found.' });
        }

        res.status(200).json({
            success: true,
            message: 'Subscription cancelled successfully.',
            user: updatedUser,
        });
    } catch (err) {
        console.error('Error cancelling subscription:', err);
        res.status(500).json({ message: 'Failed to cancel subscription', error: err.message });
    }
});


router.get('/game/save', authenticateToken, async (req, res) => {
    try {
        const result = await loadOrCreateGameSave(req.user.id, req.query.roomId);
        if (result.error) return res.status(result.status || 400).json({ message: result.error });
        return res.json({
            success: true,
            gameSave: result.gameSave,
            storylines: listEnabledStorylinePackages(),
        });
    } catch (err) {
        console.error('Load game save error:', err);
        return res.status(500).json({ message: 'Failed to load game save', error: err.message });
    }
});

async function saveGameSaveRoute(req, res) {
    try {
        const body = req.body || {};
        const incoming = body.gameSave || body;
        const requestedRoomId = body.roomId || incoming?.worldStatus?.roomId || req.query.roomId;
        const result = await loadOrCreateGameSave(req.user.id, requestedRoomId);
        if (result.error) return res.status(result.status || 400).json({ message: result.error });

        const gameSave = await persistGameSave({
            profile: result.profile,
            room: result.room,
            gameSave: incoming,
            userId: req.user.id,
            username: result.user?.username || result.user?.email || 'player',
            roomId: result.roomId,
        });
        return res.json({
            success: true,
            gameSave,
            storylines: listEnabledStorylinePackages(),
        });
    } catch (err) {
        console.error('Save game save error:', err);
        return res.status(500).json({ message: 'Failed to save game save', error: err.message });
    }
}

router.put('/game/save', authenticateToken, saveGameSaveRoute);
router.post('/game/save', authenticateToken, saveGameSaveRoute);
router.delete('/game/save', authenticateToken, async (req, res) => {
    try {
        const requestedRoomId = req.body?.roomId || req.query.roomId;
        const result = await resetGameSaveForUser(req.user.id, requestedRoomId);
        if (result.error) return res.status(result.status || 400).json({ message: result.error });
        return res.json({
            success: true,
            gameSave: result.gameSave,
            wallet: result.profile.wallet || { coins: 0 },
            inventory: result.profile.inventory || [],
        });
    } catch (err) {
        console.error('Delete game save error:', err);
        return res.status(500).json({ message: 'Failed to delete game save', error: err.message });
    }
});

router.get('/game/npc-shop', authenticateToken, async (req, res) => {
    try {
        const state = await loadOrCreateGameSave(req.user.id, req.query.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });
        const unlocked = normalizeUnlockedNpcIds(state.gameSave.worldStatus?.unlockedNpcs);
        const pending = getPendingNpcArrivalIds(state.gameSave);
        return res.json({
            success: true,
            wallet: state.profile.wallet || { coins: 0 },
            unlockedNpcs: unlocked,
            pendingNpcArrivals: pending,
            npcs: listNpcDefinitions().map((definition) => toShopItem(definition, unlocked, pending)),
            gameSave: state.gameSave,
        });
    } catch (err) {
        console.error('Load NPC shop error:', err);
        return res.status(500).json({ message: 'Failed to load NPC shop', error: err.message });
    }
});

router.post('/game/npc-shop/purchase', authenticateToken, async (req, res) => {
    try {
        const { npcId, roomId } = req.body || {};
        const definition = getNpcDefinitionById(npcId);
        if (!definition) return res.status(404).json({ message: 'NPC product not found.' });

        const state = await loadOrCreateGameSave(req.user.id, roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const unlocked = normalizeUnlockedNpcIds(state.gameSave.worldStatus?.unlockedNpcs);
        const pending = getPendingNpcArrivalIds(state.gameSave);
        if (unlocked.includes(definition.id)) {
            return res.json({
                success: true,
                alreadyOwned: true,
                npc: toShopItem(definition, unlocked, pending),
                wallet: state.profile.wallet || { coins: 0 },
                unlockedNpcs: unlocked,
                pendingNpcArrivals: pending,
                gameSave: state.gameSave,
            });
        }
        if (pending.includes(definition.id)) {
            return res.json({
                success: true,
                pendingArrival: true,
                npc: toShopItem(definition, unlocked, pending),
                wallet: state.profile.wallet || { coins: 0 },
                unlockedNpcs: unlocked,
                pendingNpcArrivals: pending,
                gameSave: state.gameSave,
            });
        }

        const price = Math.max(0, Number(definition.price || 0));
        const coins = Number(state.profile.wallet?.coins || 0);
        if (coins < price) {
            return res.status(400).json({ message: `金币不足，需要 ${price} 金币。` });
        }

        state.profile.wallet = {
            ...(state.profile.wallet || {}),
            coins: coins - price,
        };
        const arrivalEvent = enqueueNpcArrivalEvent(
            state.gameSave,
            definition,
            state.gameSave.worldStatus?.gameTick ?? 0,
        );

        const gameSave = await persistGameSave({
            profile: state.profile,
            room: state.room,
            gameSave: state.gameSave,
            userId: req.user.id,
            username: state.user?.username || state.user?.email || 'player',
            roomId: state.roomId,
        });
        const nextUnlocked = normalizeUnlockedNpcIds(gameSave.worldStatus?.unlockedNpcs);
        const nextPending = getPendingNpcArrivalIds(gameSave);

        return res.json({
            success: true,
            pendingArrival: true,
            event: arrivalEvent,
            npc: toShopItem(definition, nextUnlocked, nextPending),
            wallet: state.profile.wallet,
            unlockedNpcs: nextUnlocked,
            pendingNpcArrivals: nextPending,
            gameSave,
        });
    } catch (err) {
        console.error('Purchase NPC error:', err);
        return res.status(500).json({ message: 'Failed to purchase NPC', error: err.message });
    }
});


router.patch('/state/idle-game', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const state = await loadOrCreateGameSave(userId, req.body.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });
        const profile = state.profile;

        const { x, y, gameTick, facing, trees, worldState } = req.body;
        if (!profile.idleGame) profile.idleGame = {};
        if (typeof x        === 'number') profile.idleGame.x        = x;
        if (typeof y        === 'number') profile.idleGame.y        = y;
        if (typeof gameTick === 'number') profile.idleGame.gameTick = gameTick;
        if (facing) profile.idleGame.facing = facing;
        if (Array.isArray(trees)) {
            const VALID_STAGES = ['A', 'B', 'C', 'chopA', 'chopBC'];
            profile.idleGame.trees = trees
                .filter(t => typeof t.id === 'string' && VALID_STAGES.includes(t.stage))
                .map(t => ({ id: t.id, stage: t.stage, hasFruit: Boolean(t.hasFruit) }));
        }
        // Generic world-state blob (beds, nests, future furniture)
        if (worldState !== undefined && worldState !== null && typeof worldState === 'object') {
            profile.idleGame.worldState = worldState;
        }
        profile.markModified('idleGame');

        await profile.save();
        return res.json({ success: true, idleGame: profile.idleGame });
    } catch (err) {
        console.error('Save idle game error:', err);
        return res.status(500).json({ message: 'Failed to save idle game state', error: err.message });
    }
});

// ─── NPC Memory Helpers ───────────────────────────────────────────────────────

const GAME_MINS_PER_SEC = 5;
const SECS_PER_GAME_DAY = 1440 / GAME_MINS_PER_SEC;   // = 288
// In-game calendar epoch — gameTick 0 == 2026-01-01 00:00.
// Keep in sync with frontend constants.ts (GAME_EPOCH_*).
const GAME_EPOCH_YEAR  = 2026;
const GAME_EPOCH_MONTH = 1;     // 1-12
const GAME_EPOCH_DAY   = 1;     // 1-31

/** Convert gameTick to "HH:MM" in-game time string. */
function tickToTimeStr(gameTick) {
    const totalMins = Math.floor(gameTick * GAME_MINS_PER_SEC) % 1440;
    return `${String(Math.floor(totalMins / 60)).padStart(2, '0')}:${String(totalMins % 60).padStart(2, '0')}`;
}

/** Resolve gameTick to {year, month, day, hour, minute, dayOfWeek, dayCount}. */
function tickToDateInfo(gameTick) {
    const dayCount  = Math.floor(gameTick / SECS_PER_GAME_DAY);
    const totalMins = Math.floor(gameTick * GAME_MINS_PER_SEC) % 1440;
    const hour      = Math.floor(totalMins / 60);
    const minute    = totalMins % 60;
    const epoch     = new Date(GAME_EPOCH_YEAR, GAME_EPOCH_MONTH - 1, GAME_EPOCH_DAY);
    epoch.setDate(epoch.getDate() + dayCount);
    return {
        year:      epoch.getFullYear(),
        month:     epoch.getMonth() + 1,
        day:       epoch.getDate(),
        hour,
        minute,
        dayOfWeek: epoch.getDay(),
        dayCount,
    };
}

/** Format gameTick as "YYYY-MM-DD HH:MM" (Chinese-friendly). */
function tickToDateTimeStr(gameTick) {
    const d = tickToDateInfo(gameTick);
    return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')} ` +
           `${String(d.hour).padStart(2, '0')}:${String(d.minute).padStart(2, '0')}`;
}

/** Extract simple keywords from Chinese/English text (length ≥ 2 chars). */
function extractKeywords(text) {
    // Split on whitespace + common punctuation, keep tokens ≥ 2 chars
    const tokens = text
        .split(/[\s，。！？、""''「」【】\.,!?;:]+/)
        .map(t => t.trim())
        .filter(t => t.length >= 2);
    return [...new Set(tokens)];
}

/** Score a single memory entry for retrieval relevance. */
function scoreMemory(entry, queryKeywords, currentTick) {
    // Recency: exponential decay — half-life ≈ 1000 game-ticks (≈17 real min)
    const tickAge = Math.max(0, currentTick - entry.gameTick);
    const recency = Math.exp(-0.001 * tickAge);

    // Importance: normalize 1-10 → 0-1
    const importance = ((entry.importance ?? 5) - 1) / 9;

    // Relevance: keyword overlap ratio
    const entryKw = new Set(entry.keywords ?? []);
    const matchCount = queryKeywords.filter(kw => entryKw.has(kw)).length;
    const relevance = queryKeywords.length > 0 ? matchCount / queryKeywords.length : 0;

    return recency * 1 + importance * 2 + relevance * 3;
}

/**
/** Chinese display names for game item IDs */
const ITEM_NAMES_ZH = {
    axe:          '斧头',
    watering_can: '水壶',
    scythe:       '锄头',
    shovel:       '铲子',
    egg:          '鸡蛋',
    fruit:        '果实',
    animal_feed:  '饲料',
    wheat_seed:   '小麦种子',
    wheat:        '小麦',
};
function itemNameZh(id) { return ITEM_NAMES_ZH[id] || id; }

/**
 * Describe what actions an NPC performed, as natural-language memory strings.
 * Shared by both /npc/chat and /npc/command endpoints.
 */
const NPC_SKILL_PROMPT_RULES = `
Agent knowledge / skill actions:
- {"type":"use_skill","skillId":"go_to_room"} uses durable knowledge to move to a known place.
- {"type":"use_skill","skillId":"farm_sow_wheat_day"} goes to the farm in daytime and plants wheat, or tills a tile first if no prepared tile exists.
- {"type":"use_skill","skillId":"farm_till_day"} tills soil in daytime.
- {"type":"use_skill","skillId":"farm_water_day"} waters prepared/planted crops in daytime.
- {"type":"talk_with","targetNpcName":"王村长","duration":14} makes the NPC walk to that NPC, stand beside them, face them, and stay in a conversation lock.
- {"type":"remember_home_house","houseId":"..."} remembers a visible/known house as this NPC's home.
- {"type":"enter_house","houseId":"..."} makes the NPC walk to the house door and enter that house room instance.
- Coordinate targets may include "worldId"; keep it when a tool or memory provides it so room coordinates are not confused with village coordinates.
- {"type":"till_tile"} / {"type":"plant_crop","itemId":"wheat_seed"} / {"type":"water_tile"} / {"type":"harvest_crop"} are direct farm actions near the NPC.
Prefer talk_with for requests like "talk with 王村长", "go chat with 张雪峰", "和老李聊聊".
Prefer remember_home_house when the player says this is your house/home.
Prefer enter_house when the player asks the NPC to go inside, go home, enter a house, or sleep in their house.
Prefer use_skill for player requests like go to the room, farm, till soil, sow seeds, water crops, or harvest crops.`;

function describeActions(actions) {
    const descriptions = [];
    for (const action of (actions || [])) {
        if (action.type === 'move') {
            const t = action.target;
            if (!t) continue;
            if (t.kind === 'entity' && t.ref === 'player')
                descriptions.push('玩家召唤我，我去找了他');
            else if (t.kind === 'named' && t.place === 'room')
                descriptions.push('玩家让我去房间，我进去了');
            else if (t.kind === 'named' && t.place === 'door')
                descriptions.push('我去了门口');
            else if (t.kind === 'named' && t.place)
                descriptions.push(`我去了${t.place}`);
            else if (t.kind === 'coords')
                descriptions.push(`我移动到了${t.worldId || 'world:village'} (${t.x}, ${t.y})附近`);
        } else if (action.type === 'water') {
            descriptions.push('我去给植物浇水了');
        } else if (action.type === 'eat') {
            descriptions.push('我吃了一些东西');
        } else if (action.type === 'drink') {
            descriptions.push('我喝了一些水');
        } else if (action.type === 'pickup_item') {
            const item = itemNameZh(action.itemId || '某件物品');
            descriptions.push(`我捡起了地上的${item}，现在我持有${item}`);
        } else if (action.type === 'drop_item') {
            const item = itemNameZh(action.itemId || '某件物品');
            descriptions.push(`我把${item}放到了地上，我不再持有${item}`);
        } else if (action.type === 'chop_tree') {
            descriptions.push('我去砍了一棵树');
        } else if (action.type === 'use_skill') {
            descriptions.push(`I used knowledge skill ${action.skillId || 'unknown'}.`);
        } else if (action.type === 'talk_with') {
            descriptions.push(`I walked over to talk with ${action.targetNpcName || 'another NPC'} and stayed facing them.`);
        } else if (action.type === 'remember_home_house') {
            descriptions.push(`I remembered house ${action.houseId || 'nearby'} as my home.`);
        } else if (action.type === 'enter_house') {
            descriptions.push(`I entered house ${action.houseId || 'nearby'} and moved into its room.`);
        } else if (action.type === 'till_tile') {
            descriptions.push('I tilled a farm tile.');
        } else if (action.type === 'plant_crop') {
            descriptions.push(`I planted ${action.itemId || 'a seed'} on a farm tile.`);
        } else if (action.type === 'water_tile') {
            descriptions.push('I watered a farm tile.');
        } else if (action.type === 'harvest_crop') {
            descriptions.push('I harvested a ready crop.');
        } else if (action.type === 'ask_confirm') {
            const q = action.question || action.text || '';
            if (q) descriptions.push(`我向玩家询问确认：${q}`);
        }
        // nuzzle / emote — no memory worth recording
    }
    return descriptions;
}

/** Retrieve top-K memories most relevant to the query text. */
function retrieveTopMemories(allMemories, queryText, currentTick, topK = 8) {
    const queryKeywords = extractKeywords(queryText);
    const scored = allMemories.map(entry => ({
        entry,
        score: scoreMemory(entry, queryKeywords, currentTick),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(s => s.entry);
}

/**
 * Trigger a reflection: condense the N most recent memories into 2-3 insights.
 * Returns new memory entries with source='reflection'.
 */
async function generateReflection(npcName, recentMemories, currentTick) {
    if (!_openai || recentMemories.length === 0) return [];
    try {
        const memText = recentMemories
            .slice(-20)
            .map(m => {
                const who = m.source === 'player' ? '玩家' : m.source === 'npc' ? npcName : '记忆';
                return `${who}：${m.text}`;
            })
            .join('\n');

        const completion = await _openai.chat.completions.create({
            model: _model,
            messages: [
                {
                    role: 'system',
                    content: `${ANIMAL_CROSSING_NPC_STYLE}\n你是"${npcName}"，一个像素风农场NPC。根据以下最近的记忆，用中文总结2-3条关于玩家的高层次见解或事实，每条不超过20字。只返回JSON数组，例：["玩家喜欢问天气","玩家叫小明"]`,
                },
                { role: 'user', content: memText },
            ],
            max_tokens: 150,
            temperature: 0.7,
        });

        const raw = completion.choices[0]?.message?.content?.trim() ?? '[]';
        const clean = raw.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
        const insights = JSON.parse(clean);
        if (!Array.isArray(insights)) return [];

        const { v4: uuidv4 } = require('uuid');
        return insights.slice(0, 3).map(text => ({
            id:           uuidv4(),
            gameTick:     currentTick,
            text:         String(text).slice(0, 60),
            source:       'reflection',
            importance:   8,
            keywords:     extractKeywords(String(text)),
            lastAccessed: currentTick,
        }));
    } catch {
        return [];
    }
}

// ─── GET /profile/npc/memories/:npcName ───────────────────────────────────────
// Returns the full memory array for the authenticated user's named NPC.
router.get('/npc/memories/:npcName', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const { npcName } = req.params;
        const state = await loadOrCreateGameSave(userId, req.query.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const memories = getNpcMemory(state.gameSave, npcName);
        return res.json({ memories });
    } catch (err) {
        console.error('Get NPC memories error:', err);
        return res.status(500).json({ message: 'Failed to get NPC memories', error: err.message });
    }
});

// ─── NPC AI Think ─────────────────────────────────────────────────────────────
// Returns the NPC persona skills used by the backend prompt layer.
router.get('/npc/skills', authenticateToken, async (_req, res) => {
    try {
        return res.json({ skills: listNpcSkills() });
    } catch (err) {
        console.error('List NPC skills error:', err);
        return res.status(500).json({ message: 'Failed to list NPC skills', error: err.message });
    }
});

router.get('/npc/skills/:npcName', authenticateToken, async (req, res) => {
    try {
        const { npcName } = req.params;
        const mode = req.query.mode || 'display';
        return res.json({ skill: readNpcSkill(npcName, mode) });
    } catch (err) {
        console.error('Get NPC skill error:', err);
        return res.status(500).json({ message: 'Failed to get NPC skill', error: err.message });
    }
});

// POST /profile/npc/think
// Body: { npcName, gameTick }
// Returns: { actions: [{type, text?, x?, y?, duration?}] }
router.post('/npc/think', authenticateToken, async (req, res) => {
    try {
        const { npcName = '老李', gameTick = 0 } = req.body;
        const userId = req.user.id;

        const fallbackThink = () => {
            const fallbacks = ['哎，今天天气真好！','跟你聊天最开心啦！','嘿，有我在呢，放心！','这里风景不错吧，我带你转转！','来来来，有啥需要帮忙的？'];
            const text = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            return res.json({ actions: [{ type: 'say', text, duration: 4 }, { type: 'idle', duration: 3 }] });
        };

        if (!_openai) return fallbackThink();

        // Load memories from the unified game save.
        const state = await loadOrCreateGameSave(userId, req.body.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const allMemories = [...getNpcMemory(state.gameSave, npcName)];
        // Retrieve most relevant/recent memories for ambient thought
        const relevant = retrieveTopMemories(allMemories, npcName, gameTick, 10);
        const memorySummary = relevant.length > 0
            ? relevant.map(m => `[${m.source}] ${m.text}`).join('\n')
            : '(暂无记忆)';

        const dateTimeStr = tickToDateTimeStr(gameTick);
        const dateInfo    = tickToDateInfo(gameTick);
        const npcSkill    = getNpcSkillForPrompt(npcName, 'think');
        const systemPrompt = `你是一个名叫"${npcName}"的NPC角色，生活在一个像素风格的休闲农场世界里。
你的性格：热情开朗、乐于助人、喜欢和玩家聊天、偶尔说些农场趣事或关心玩家近况，说话亲切自然，语言简短活泼，用中文说话。
你非常乐意配合玩家的请求，比如去房间、过来找玩家等，不会拒绝或找借口。
当前游戏日期与时间：${dateTimeStr}（农场进入第${dateInfo.dayCount + 1}天）。

根据以下记忆，为接下来的1-3个行动制定计划。
每个行动必须是以下JSON对象之一：
- {"type":"say","text":"说的话","duration":4}
- {"type":"idle","duration":3}
- {"type":"move","x":数字,"y":数字,"duration":3}

只返回一个JSON数组，不要有其他内容，不要Markdown代码块。
示例：[{"type":"say","text":"哎，今天天气真好！","duration":4},{"type":"idle","duration":2}]`;

        const completion = await _openai.chat.completions.create({
            model: _model,
            messages: [
                { role: 'system', content: `${ANIMAL_CROSSING_NPC_STYLE}\n${npcSkill.prompt}\n${systemPrompt}\n${NPC_SKILL_PROMPT_RULES}` },
                { role: 'user',   content: `最近的记忆：\n${memorySummary}\n\n请制定接下来的行动计划：` },
            ],
            max_tokens:  300,
            temperature: 0.8,
        });

        const raw = completion.choices[0]?.message?.content?.trim() ?? '[]';
        let actions;
        try {
            const clean = raw.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
            actions = JSON.parse(clean);
            if (!Array.isArray(actions)) actions = [];
        } catch {
            actions = [{ type: 'say', text: raw.slice(0, 60), duration: 4 }];
        }

        return res.json({ actions });
    } catch (err) {
        console.error('NPC think error:', err);
        return res.status(500).json({ actions: [] });
    }
});

// ─── NPC Interactive Chat ──────────────────────────────────────────────────────
// POST /profile/npc/chat
// Body: { npcName, playerMessage, gameTick }
// Returns: { reply: string }
// Memory is owned entirely by the backend: loaded from DB, new entries saved back to DB.
router.post('/npc/chat', authenticateToken, async (req, res) => {
    try {
        const { npcName = '老李', playerMessage = '', gameTick = 0, playerX, playerY, perception, perceptionContext, npcInventory, familiarity = 0, chatCount = 0, agentBrainEnabled = true } = req.body;
        const userId = req.user.id;

        if (!playerMessage.trim()) {
            return res.status(400).json({ message: 'playerMessage is required.' });
        }

        if (agentBrainEnabled === false) {
            return res.json({
                reply: '',
                actions: [],
                mcp: { enabled: false, toolCalls: [] },
            });
        }

        // ── DEBUG: log what frontend sent ────────────────────────────────────
        console.log(`[NPC chat] msg="${playerMessage}"`);
        console.log(`[NPC chat] npcInventory=`, JSON.stringify(npcInventory ?? {}));
        console.log(`[NPC chat] perception="${(perception ?? 'NONE').slice(0, 300)}"`);

        const state = await loadOrCreateGameSave(userId, req.body.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const { v4: uuidv4 } = require('uuid');

        if (!_openai) {
            // Fallback: persist player message, return static reply with no actions
            const fallbacks = ['哈哈，好的好的！','没问题，包在我身上！','哎，你说得对！','好嘞，我这就来！','放心吧，有我呢！'];
            const reply = fallbacks[Math.floor(Math.random() * fallbacks.length)];
            const now = gameTick;
            const existing = [...getNpcMemory(state.gameSave, npcName)];
            existing.push(
                { id: uuidv4(), gameTick: now, text: playerMessage, source: 'player', importance: 6, keywords: extractKeywords(playerMessage), lastAccessed: now },
                { id: uuidv4(), gameTick: now, text: reply,         source: 'npc',    importance: 5, keywords: extractKeywords(reply),         lastAccessed: now },
            );
            setNpcMemory(state.gameSave, npcName, existing);
            await persistGameSave({
                profile: state.profile,
                room: state.room,
                gameSave: state.gameSave,
                userId,
                username: state.user?.username || state.user?.email || 'player',
                roomId: state.roomId,
            });
            return res.json({ reply, actions: [] });
        }

        // ── 1. Load + retrieve relevant memories ─────────────────────────────
        const allMemories = [...getNpcMemory(state.gameSave, npcName)];
        const relevant = retrieveTopMemories(allMemories, playerMessage, gameTick, 8);

        // Update lastAccessed for retrieved memories
        const retrievedIds = new Set(relevant.map(m => m.id));
        for (const m of allMemories) {
            if (retrievedIds.has(m.id)) m.lastAccessed = gameTick;
        }

        // ── 2. Build prompt ───────────────────────────────────────────────────
        const memorySummary = relevant.length > 0
            ? relevant
                .sort((a, b) => a.gameTick - b.gameTick)
                .map(m => {
                    const who = m.source === 'player' ? '玩家' : m.source === 'npc' ? npcName : m.source === 'reflection' ? '【记忆总结】' : '事件';
                    return `${who}：${m.text}`;
                })
                .join('\n')
            : '(暂无对话记忆)';

        const dateTimeStr = tickToDateTimeStr(gameTick);
        const dateInfo    = tickToDateInfo(gameTick);
        const playerLocationHint = (playerX != null && playerY != null)
            ? `玩家当前位置约为(${Math.round(playerX)}, ${Math.round(playerY)})。`
            : '';

        // Build inventory display with Chinese names
        const inventoryLines = npcInventory && Object.keys(npcInventory).length > 0
            ? `你当前持有：${Object.entries(npcInventory).map(([k, v]) => `${itemNameZh(k)}×${v}`).join('、')}`
            : '你当前背包为空';

        const perceptionLine = perception ? `\n你能观察到的环境：${perception}` : '';
        const structuredPerceptionLine = perceptionContext && typeof perceptionContext === 'object'
            ? `\nSTRUCTURED_WORLD_CONTEXT_JSON:\n${JSON.stringify(perceptionContext).slice(0, 6000)}`
            : '';

        // Translate familiarity score → relationship descriptor in the prompt.
        // Familiarity grows with each chat; 0 = stranger, 60+ = old friend.
        let relationshipLine;
        if (familiarity < 10)      relationshipLine = '你刚认识这个玩家，对他还不熟。';
        else if (familiarity < 30) relationshipLine = '你和玩家见过几次面，开始有点印象。';
        else if (familiarity < 60) relationshipLine = '你和玩家比较熟了，能开点玩笑。';
        else                       relationshipLine = '你和玩家是老熟人，关系不错，可以放开了聊。';
        const relationshipBlock = `\n【关系】${relationshipLine}（已聊过${chatCount}次，熟悉度${Math.round(familiarity)}/100）`;

        const npcSkill = getNpcSkillForPrompt(npcName, 'chat');
        const systemPrompt = `你是"${npcName}"，一个住在像素风农场里的热心村民。
【性格设定】
- 朴实热心，说话温和自然，像邻居大叔一样亲切
- 爱聊家常、爱唠两句，但不啰嗦，不爱抱怨
- 乐于帮忙，玩家叫你做什么就答应，偶尔会嘀咕一两句但不会拒绝
- 用日常口语表达，不用网络用语和流行黑话（不要说"楼主/OP/属实/离大谱/哥们/6啊"这类）
- 称呼玩家用"你"就行，关系熟了之后偶尔可以叫"小伙子"或直呼名字
当前游戏日期与时间：${dateTimeStr}（农场进入第${dateInfo.dayCount + 1}天）。${playerLocationHint}${perceptionLine}${structuredPerceptionLine}${relationshipBlock}

以下是你从记忆中检索到的相关记忆（仅供参考，可能已过时）：
${memorySummary}

Dialogue grounding rules:
- The current player message is the immediate task. Do not answer a different example or template.
- If the player asks what they just said, which number they mentioned, or asks you to remember/recall a fact, use the player conversation memory directly and answer the fact first.
- Do not reply with vague filler like "let me think" when the remembered fact is present.
- If the player asks what you can see, what is nearby, what is in the room, or what is on the ground, answer from the current perception text and STRUCTURED_WORLD_CONTEXT_JSON first.
- Treat STRUCTURED_WORLD_CONTEXT_JSON as authoritative current sensory input. visibleDrops are ground items; visibleObjects are beds, chests, nests, trees, bushes, and other world objects; landmarks/currentPlace describe houses and rooms.
- Do not claim you see nothing when visibleDrops, visibleObjects, visibleEntities, landmarks, or agentWorld.visibleObjects are non-empty.

════════════════════════════════════
【当前实际状态 — 绝对权威，覆盖一切记忆】
${inventoryLines}
（记忆中提到你有或没有某物品都作废，以上面这行为唯一真相）
════════════════════════════════════

你必须只返回一个JSON对象，不要有其他内容：
{"reply":"你说的话","actions":[...]}

reply：用温和、自然、生活化的口语回复玩家，1-2句，不超过25个字，要有人情味但不浮夸。
actions：接下来要执行的动作数组（0到4个），可用动作：
- {"type":"move","target":{"kind":"entity","ref":"player"}} — 走向玩家
- {"type":"move","target":{"kind":"named","place":"room"}} — 去房间
- {"type":"move","target":{"kind":"named","place":"door"}} — 去门口
- {"type":"idle","duration":3} — 原地待着
- {"type":"pickup_item","itemId":"axe"} — 捡地上的物品（itemId必须与感知到的完全一致，如 axe/watering_can/scythe/fruit/log/stone/berry）
- {"type":"drop_item","itemId":"axe"} — 把背包里的东西扔地上
- {"type":"chop_tree"} — 走去砍树（需视野内有树）
- {"type":"ask_confirm","question":"确定要我砍？"} — 问确认（危险操作前用）
- {"type":"say","text":"说的话","duration":4} — 说话
- {"type":"follow_player"} — 开始跟在玩家身后走（玩家叫你跟着/一起去时用）
- {"type":"stop_follow"} — 停止跟随
- {"type":"talk_with","targetNpcName":"王村长","duration":14} — 去某个NPC旁边，面对面站定聊天；玩家说“和xxx聊天/talk with xxx/找xxx聊聊”时优先用
- {"type":"dispatch"} — 接受委托任务出门，10秒后带战利品回来（玩家委托/派遣时用）

行动规则（必须遵守）：
- 背包已有某物 → reply怼人 + actions为[]，绝对不能再pickup
- 背包为空/没有该物 → 正常执行pickup_item
- 玩家让你过来 → move到player
- 玩家让你过来做事 → move到player，再加任务动作
- 玩家让你去房间 → move到room
- 玩家让你捡东西 → 严格按【当前实际状态】判断，空包才能pickup
- 玩家让你放下东西 → drop_item
- 玩家让你砍树 → ask_confirm；已确认 → chop_tree
- 玩家叫你跟着/跟我来 → follow_player
- 玩家叫你停下/别跟了 → stop_follow
- 玩家叫你去和某个NPC聊天/谈话 → talk_with，targetNpcName必须是目标NPC的中文名
- 玩家委托/派遣你去做事（尤其给了物品作为报酬）→ pickup那个物品 + dispatch
- 只是聊天 → actions为[]`;

        const userPrompt = `玩家说："${playerMessage}"`;

        // ── 3. Call LLM through the game MCP tool loop ───────────────────────
        const mcpResult = await runNpcMcpAgent({
            openai: _openai,
            model: _model,
            systemContent: `${ANIMAL_CROSSING_NPC_STYLE}\n${npcSkill.prompt}\n${systemPrompt}\n${NPC_SKILL_PROMPT_RULES}`,
            userPrompt,
            playerMessage,
            toolContext: {
                npcName,
                userId,
                gameTick,
                gameSave: state.gameSave,
                perception,
                perceptionContext,
                npcInventory,
            },
            maxTokens: 700,
            temperature: 0.75,
        });

        let reply = mcpResult.reply || '……';
        let parsedActions = Array.isArray(mcpResult.actions) ? mcpResult.actions : [];
        console.log(`[NPC chat] ${npcName} MCP raw:`, (mcpResult.raw || '').slice(0, 600));
        console.log(`[NPC chat] ${npcName} MCP tools:`, JSON.stringify(mcpResult.toolEvents || []).slice(0, 900));
        if (parsedActions.length > 1) {
            const planText = parsedActions
                .map((action, index) => `${index + 1}. ${action?.type || 'unknown'}${action?.skillId ? `:${action.skillId}` : ''}${action?.itemId ? `:${action.itemId}` : ''}`)
                .join(' -> ');
            allMemories.push({
                id:           uuidv4(),
                gameTick,
                text:         `MCP task plan: ${planText}`,
                source:       'event',
                importance:   8,
                keywords:     extractKeywords(planText),
                lastAccessed: gameTick,
            });
        }

        // ── 4. Persist conversation memories ─────────────────────────────────
        allMemories.push(
            { id: uuidv4(), gameTick, text: playerMessage, source: 'player', importance: 6, keywords: extractKeywords(playerMessage), lastAccessed: gameTick },
            { id: uuidv4(), gameTick, text: reply,         source: 'npc',    importance: 5, keywords: extractKeywords(reply),         lastAccessed: gameTick },
        );

        // Persist MCP tool memories so the NPC remembers how it reasoned and what it tried.
        for (const event of (mcpResult.toolEvents || [])) {
            if (!event.memoryText) continue;
            allMemories.push({
                id:           uuidv4(),
                gameTick,
                text:         event.memoryText,
                source:       'event',
                importance:   event.ok ? 7 : 6,
                keywords:     extractKeywords(`${event.name || ''} ${event.memoryText}`),
                lastAccessed: gameTick,
            });
        }

        // ── 4b. Persist action memories (what the NPC actually did) ──────────
        for (const desc of describeActions(parsedActions)) {
            allMemories.push({
                id:           uuidv4(),
                gameTick,
                text:         desc,
                source:       'event',
                importance:   7,
                keywords:     extractKeywords(desc),
                lastAccessed: gameTick,
            });
        }

        // ── 5. Optionally trigger reflection every 20 conversational memories ─
        const conversationalCount = allMemories.filter(m => m.source === 'player' || m.source === 'npc').length;
        if (conversationalCount > 0 && conversationalCount % 20 === 0) {
            const reflections = await generateReflection(npcName, allMemories, gameTick);
            allMemories.push(...reflections);
        }

        // ── 6. Cap total memories to 200 ─────────────────────────────────────
        const MAX_MEMORIES = 200;
        let trimmed = allMemories;
        if (allMemories.length > MAX_MEMORIES) {
            const sorted = [...allMemories].sort((a, b) => scoreMemory(b, [], gameTick) - scoreMemory(a, [], gameTick));
            trimmed = sorted.slice(0, MAX_MEMORIES);
            trimmed.sort((a, b) => a.gameTick - b.gameTick);
        }

        setNpcMemory(state.gameSave, npcName, trimmed);
        await persistGameSave({
            profile: state.profile,
            room: state.room,
            gameSave: state.gameSave,
            userId,
            username: state.user?.username || state.user?.email || 'player',
            roomId: state.roomId,
        });

        return res.json({
            reply,
            actions: parsedActions,
            mcp: {
                enabled: true,
                toolCalls: (mcpResult.toolEvents || []).map((event) => ({
                    name: event.name,
                    ok: event.ok,
                    action: event.action || null,
                })),
            },
        });
    } catch (err) {
        console.error('NPC chat error:', err);
        return res.status(500).json({ reply: '……（老李陷入了沉默）', actions: [] });
    }
});

// ─── POST /profile/npc/dispatch-return ───────────────────────────────────────
// Called when an NPC returns from a dispatch mission.
// Generates a story + list of items the NPC found, using the LLM.
router.post('/npc/dispatch-return', authenticateToken, async (req, res) => {
    try {
        const { npcName = '老李', carriedItems = {}, gameTick = 0 } = req.body;

        // Build a description of what the NPC took with them
        const itemNameZhLocal = (id) => ({
            apple: '苹果', berry: '浆果', axe: '斧头', log: '木头',
            stone: '石头', watering_can: '水壶', scythe: '锄头', shovel: '铲子',
        }[id] ?? id);

        const carriedStr = Object.keys(carriedItems).length > 0
            ? `你出门时带了：${Object.entries(carriedItems).map(([k, v]) => `${itemNameZhLocal(k)}×${v}`).join('、')}`
            : '你空手出门了';

        const npcSkill = getNpcSkillForPrompt(npcName, 'dispatch');
        const systemPrompt = `你是"${npcName}"，一个住在像素风农场里的热心村民。你刚完成了一次委托任务回来。
${carriedStr}。
用平实、亲切、生活化的口语，2-3句话说说：你去哪了、路上遇到了什么有意思的事、带回来了什么。
不要使用网络流行语或黑话（如"楼主、OP、属实、离大谱、哥们"等）。
你只能返回JSON，格式如下：
{"story":"归来叙述","items":[{"itemId":"log","qty":2}]}
items可以包含：log（木头）、apple（苹果）、stone（石头）、berry（浆果）。
根据你带走的东西合理决定换了什么回来，可以为空数组。story不超过50字。`;

        const completion = await _openai.chat.completions.create({
            model:           _model,
            messages:        [{ role: 'system', content: `${ANIMAL_CROSSING_NPC_STYLE}\n${npcSkill.prompt}\n${systemPrompt}` }],
            max_tokens:      300,
            temperature:     1.1,
            response_format: { type: 'json_object' },
        });

        const raw  = completion.choices[0]?.message?.content ?? '{}';
        console.log(`[Dispatch return] ${npcName} raw:`, raw);
        const data = JSON.parse(raw);
        return res.json({
            story: data.story ?? '我回来啦。路上风挺舒服的，虽然没遇到什么大事，但能平安回来也不错。',
            items: Array.isArray(data.items) ? data.items : [],
        });
    } catch (err) {
        console.error('Dispatch return error:', err);
        return res.status(500).json({
            story: '我回来啦，路上稍微绕了点远，不过小镇的风吹着还挺舒服。',
            items: [],
        });
    }
});

// ─── POST /profile/npc/command ────────────────────────────────────────────────
// Server-push NPC behavior via SSE. Protected by ADMIN_SECRET header.
// Body: { userId, npcName, actions: NpcAction[], announcement? }
router.post('/npc/command', async (req, res) => {
    const adminKey = req.headers['x-admin-key'];
    if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ message: 'Forbidden: invalid admin key' });
    }

    const { userId, npcName, actions, announcement } = req.body;
    if (!userId || !npcName || !Array.isArray(actions)) {
        return res.status(400).json({ message: 'userId, npcName, and actions[] are required' });
    }

    try {
        // Persist action memories into the unified game save.
        const state = await loadOrCreateGameSave(userId, req.body.roomId);
        if (!state.error) {
            const { v4: uuidv4 } = require('uuid');
            const gameTick = Date.now();
            const allMemories = [...getNpcMemory(state.gameSave, npcName)];

            for (const desc of describeActions(actions)) {
                allMemories.push({ id: uuidv4(), gameTick, text: desc, source: 'event', importance: 7, keywords: extractKeywords(desc), lastAccessed: gameTick });
            }
            if (announcement) {
                allMemories.push({ id: uuidv4(), gameTick, text: `系统通知：${announcement}`, source: 'event', importance: 8, keywords: extractKeywords(announcement), lastAccessed: gameTick });
            }

            setNpcMemory(state.gameSave, npcName, allMemories);
            await persistGameSave({
                profile: state.profile,
                room: state.room,
                gameSave: state.gameSave,
                userId,
                username: state.user?.username || state.user?.email || 'player',
                roomId: state.roomId,
            });
        }

        // Push SSE event to the target user
        profileEventBus.emit(String(userId), 'npc_command', { npcName, actions, announcement });
        return res.json({ success: true });
    } catch (err) {
        console.error('NPC command error:', err);
        return res.status(500).json({ message: 'Internal server error' });
    }
});

// ─── GET /profile/game/events ─────────────────────────────────────────────────
// Per-user SSE stream for idle-game world events (chest spawns, etc.)
router.get('/game/events', (req, res) => {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
    const queryToken  = req.query?.token ? String(req.query.token) : null;
    const token = bearerToken || queryToken;

    if (!token) return res.status(401).json({ message: 'No token provided' });

    let userId;
    try {
        const decoded = require('jsonwebtoken').verify(token, process.env.ACCESS_SECRET);
        userId = String(decoded.id);
    } catch {
        return res.status(401).json({ message: 'Invalid or expired token' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    profileEventBus.register(userId, res);
    res.write(`data: ${JSON.stringify({ type: 'connected', userId, timestamp: new Date().toISOString() })}\n\n`);

    const heartbeat = setInterval(() => {
        try { res.write(': heartbeat\n\n'); }
        catch { clearInterval(heartbeat); profileEventBus.unregister(userId, res); }
    }, 20000);

    req.on('close', () => {
        clearInterval(heartbeat);
        profileEventBus.unregister(userId, res);
        res.end();
    });
});

// ─── GET /profile/game/chests ─────────────────────────────────────────────────
// Returns all unopened chests for the authenticated user.
router.get('/game/chests', authenticateToken, async (req, res) => {
    try {
        const state = await loadOrCreateGameSave(req.user.id, req.query.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });
        const chests = getChests(state.gameSave).filter(c => !c.opened);
        return res.json({ chests });
    } catch (err) {
        console.error('Get game chests error:', err);
        return res.status(500).json({ message: 'Failed to get chests', error: err.message });
    }
});

// ─── POST /profile/game/chests/:chestId/open ──────────────────────────────────
// Open a chest: apply its rewards to the profile and mark it as opened.
router.post('/game/chests/:chestId/open', authenticateToken, async (req, res) => {
    try {
        const { chestId } = req.params;
        const state = await loadOrCreateGameSave(req.user.id, req.body?.roomId || req.query.roomId);
        if (state.error) return res.status(state.status || 400).json({ message: state.error });

        const chests = getChests(state.gameSave);
        let chest = chests.find(c => c.id === chestId);
        const localChest = req.body?.localChest;
        if (!chest && localChest && localChest.id === chestId && localChest.rewards) {
            chest = {
                id: String(localChest.id),
                x: Number(localChest.x || 0),
                y: Number(localChest.y || 0),
                rewards: {
                    coins: Math.max(0, Number(localChest.rewards?.coins || 0)),
                    items: Array.isArray(localChest.rewards?.items) ? localChest.rewards.items : [],
                },
                opened: false,
                createdAt: Number(localChest.createdAt || state.gameSave.worldStatus?.gameTick || 0),
            };
            chests.push(chest);
        }
        if (!chest)        return res.status(404).json({ message: 'Chest not found' });
        if (chest.opened)  return res.status(400).json({ message: 'Chest already opened' });

        // Apply rewards
        const coins = Number(chest.rewards?.coins || 0);
        if (!state.profile.wallet) state.profile.wallet = { coins: 0 };
        if (coins > 0) state.profile.wallet.coins = (state.profile.wallet.coins || 0) + coins;

        for (const item of chest.rewards?.items || []) {
            upsertInventoryItem(state.profile, {
                inventoryKey: item.inventoryKey,
                name:         item.name,
                type:         'item',
                quantity:     item.quantity || 1,
                sourceSystem: null,
                metadata:     {
                    rarity:      item.rarity      || 'common',
                    image:       item.imageUrl    || '',
                    description: item.description || '',
                },
            });
        }

        chest.opened = true;
        setChests(state.gameSave, chests);
        state.profile.markModified('wallet');
        state.profile.markModified('inventory');
        await persistGameSave({
            profile: state.profile,
            room: state.room,
            gameSave: state.gameSave,
            userId: req.user.id,
            username: state.user?.username || state.user?.email || 'player',
            roomId: state.roomId,
        });

        return res.json({
            success:   true,
            rewards:   chest.rewards,
            wallet:    state.profile.wallet,
            inventory: state.profile.inventory,
        });
    } catch (err) {
        console.error('Open chest error:', err);
        return res.status(500).json({ message: 'Failed to open chest', error: err.message });
    }
});

// ─── POST /profile/ai/fill-task ───────────────────────────────────────────────
// AI fills empty task fields based on what the user has already entered.
// Body: { title, description, content, notice, systemContext? }
// Returns: { title, description, content, notice }
router.post('/ai/fill-task', authenticateToken, async (req, res) => {
    const { title = '', description = '', content = '', notice = '', systemContext = '' } = req.body;

    if (!_openai) {
        return res.json({ title, description, content, notice });
    }

    const systemPrompt = `你是一个任务设计助手，帮助系统管理员完善任务节点内容。
任务字段说明：
- title: 任务的简短标题（20字以内）
- description: 任务的一句话概述（50字以内）
- content: 任务的详细执行步骤或具体要求（100字以内）
- notice: 执行中需要特别注意的事项（50字以内，可为空字符串）
${systemContext ? `系统背景：${systemContext}` : ''}

规则：
1. 只补充空白或极短的字段，不要覆盖用户已填写的内容
2. 返回标准 JSON，格式：{"title":"...","description":"...","content":"...","notice":"..."}
3. 风格简洁、专业、富有游戏感
4. 如果某个字段用户已填写（非空），直接原样返回，不要修改`;

    const userPrompt = `当前已填写内容：
title: "${title}"
description: "${description}"
content: "${content}"
notice: "${notice}"

请补充空白字段并返回完整JSON。`;

    try {
        const completion = await _openai.chat.completions.create({
            model: _model,
            messages: [
                { role: 'system', content: `${ANIMAL_CROSSING_ASSISTANT_STYLE}\n${systemPrompt}` },
                { role: 'user',   content: userPrompt },
            ],
            max_tokens: 400,
            temperature: 0.75,
            response_format: { type: 'json_object' },
        });

        const raw = completion.choices[0]?.message?.content ?? '{}';
        const data = JSON.parse(raw);
        return res.json({
            title:       data.title       || title,
            description: data.description || description,
            content:     data.content     || content,
            notice:      data.notice      ?? notice,
        });
    } catch (err) {
        console.error('AI fill task error:', err);
        return res.json({ title, description, content, notice });
    }
});

// ─── Game sub-routers ─────────────────────────────────────────────────────────
const gameInventoryRouter = require('./modules/game.inventoryRoutes');
const gameFarmRouter      = require('./modules/game.farmRoutes');
const gameCreatureRouter  = require('./modules/game.creatureRoutes');
const gameHouseRouter     = require('./modules/game.houseRoutes');
const gameStorageChestRouter = require('./modules/game.storageChestRoutes');
const gameShopRouter      = require('./modules/game.shopRoutes');
router.use('/game/inventory', gameInventoryRouter);
router.use('/game/farm',      gameFarmRouter);
router.use('/game/creatures', gameCreatureRouter);
router.use('/game',           gameHouseRouter);
router.use('/game',           gameStorageChestRouter);
router.use('/game',           gameShopRouter);

module.exports = router;
