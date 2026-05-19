const createSystemRouteMiddlewares = require('./shared/createSystemRouteMiddlewares');
const OpenAI = require('openai');
const { ANIMAL_CROSSING_LOOT_STYLE } = require('./shared/animalCrossingAgentStyle');

const openaiClient = process.env.OPENAI_API_KEY
    ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    : null;

function registerSystemStoreRoutes(router, deps) {
    const {
        authenticateToken,
        Profile,
        findSystemForParticipant,
        findSystemForUser,
        findMemberByUserId,
        findItemReferenceInSystem,
        emitSystemTaskEvent,
        emitSystemUpdateEvent,
    } = deps;

    const {
        loadOwnerSystem,
        loadParticipantSystem,
        requireMember,
    } = createSystemRouteMiddlewares({
        findSystemForUser,
        findSystemForParticipant,
        findMemberByUserId,
    });

    const findAllowedItemByKey = (system, itemKey) => {
        const key = String(itemKey || '').trim();
        if (!key) return null;

        const inStore = system.storeProducts.find(
            (product) => product.type === 'item' && String(product._id) === key
        );
        if (inStore) return { source: 'store', item: inStore };

        const inObtainable = system.obtainableItems.find((item) => item.itemKey === key);
        if (inObtainable) return { source: 'obtainable', item: inObtainable };

        return null;
    };


    router.post('/:systemId/member/store-products/:productId/purchase', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { productId } = req.params;
            const { system, member } = req;
            const quantity = Math.max(1, Number(req.body?.quantity || 1));

            if (!Number.isInteger(quantity) || quantity <= 0) {
                return res.status(400).json({ message: 'quantity must be a positive integer.' });
            }

            const product = system.storeProducts.id(productId);
            if (!product) {
                return res.status(404).json({ message: 'Store product not found.' });
            }

            if (!product.isListed) {
                return res.status(400).json({ message: 'This product is not currently listed.' });
            }

            if (product.stock !== null && Number(product.stock) < quantity) {
                return res.status(400).json({ message: 'Insufficient stock.' });
            }

            const buyerProfile = await Profile.findById(member.profile);
            if (!buyerProfile) {
                return res.status(404).json({ message: 'Buyer profile not found.' });
            }
            if (!buyerProfile.wallet) buyerProfile.wallet = { coins: 0 };
            if (!Array.isArray(buyerProfile.inventory)) buyerProfile.inventory = [];

            const unitPrice = Number(product.price || 0);
            const totalCost = unitPrice * quantity;
            const currentCoins = Number(buyerProfile.wallet?.coins || 0);

            if (currentCoins < totalCost) {
                return res.status(400).json({ message: 'Insufficient coins.' });
            }

            buyerProfile.wallet.coins = currentCoins - totalCost;

            const inventoryKey = String(product._id);
            const inventoryMetadata = {
                productId: String(product._id),
                systemId: String(system._id),
                rarity: product.rarity,
                description: product.description || '',
                image: product.image || '',
                price: unitPrice,
            };
            const existingInventory = (buyerProfile.inventory || []).find(
                (entry) => entry.inventoryKey === inventoryKey && String(entry.sourceSystem) === String(system._id)
            );

            if (existingInventory) {
                existingInventory.quantity += quantity;
                existingInventory.name = product.name;
                existingInventory.type = product.type;
                existingInventory.metadata = {
                    ...(existingInventory.metadata || {}),
                    ...inventoryMetadata,
                };
            } else {
                buyerProfile.inventory.push({
                    inventoryKey,
                    name: product.name,
                    type: product.type,
                    quantity,
                    sourceSystem: system._id,
                    metadata: inventoryMetadata,
                });
            }
            buyerProfile.markModified?.('inventory');

            if (product.stock !== null) {
                product.stock = Math.max(0, Number(product.stock) - quantity);
            }

            member.purchases.push({
                productId: product._id,
                productName: product.name,
                quantity,
                price: unitPrice,
                purchasedAt: new Date(),
            });

            await buyerProfile.save();
            await system.save();

            emitSystemTaskEvent(String(system._id), {
                type: 'member_purchase_product',
                systemId: String(system._id),
                memberUserId: String(member.user),
                memberProfileId: String(member.profile),
                productId: String(product._id),
                productName: product.name,
                quantity,
                unitPrice,
                totalCost,
                remainingCoins: Number(buyerProfile.wallet?.coins || 0),
                timestamp: new Date().toISOString(),
            });

            emitSystemUpdateEvent(String(system._id), {
                type: 'store_products_updated',
                systemId: String(system._id),
                storeProducts: system.storeProducts,
                timestamp: new Date().toISOString(),
            });

            return res.status(201).json({
                success: true,
                message: 'Purchase successful.',
                wallet: buyerProfile.wallet,
                inventory: buyerProfile.inventory,
                purchase: {
                    productId: String(product._id),
                    productName: product.name,
                    quantity,
                    unitPrice,
                    totalCost,
                    remainingCoins: Number(buyerProfile.wallet?.coins || 0),
                },
            });
        } catch (error) {
            console.error('Purchase store product error:', error);
            return res.status(500).json({ message: 'Failed to purchase product', error: error.message });
        }
    });

    router.post('/:systemId/store-products', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { system } = req;
            const { name, type, image, description, rarity, price, stock } = req.body;

            if (!name || !type || price === undefined || price === null) {
                return res.status(400).json({ message: 'name, type, and price are required.' });
            }

            system.storeProducts.push({ name, type, image, description, rarity, price, stock });
            await system.save();
            const createdProduct = system.storeProducts[system.storeProducts.length - 1];
            emitSystemUpdateEvent(String(system._id), {
                type: 'store_products_updated',
                systemId: String(system._id),
                storeProducts: system.storeProducts,
                timestamp: new Date().toISOString(),
            });
            return res.status(201).json({ success: true, storeProducts: system.storeProducts });
        } catch (error) {
            console.error('Create store product error:', error);
            return res.status(500).json({ message: 'Failed to create store product', error: error.message });
        }
    });

    router.patch('/:systemId/store-products/:productId', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { productId } = req.params;
            const { system } = req;
            const { name, type, image, description, rarity, price, stock } = req.body;

            const product = system.storeProducts.id(productId);
            if (!product) {
                return res.status(404).json({ message: 'Store product not found.' });
            }

            if (name !== undefined) product.name = name;
            if (type !== undefined) product.type = type;
            if (image !== undefined) product.image = image;
            if (description !== undefined) product.description = description;
            if (rarity !== undefined) product.rarity = rarity;
            if (price !== undefined) product.price = price;
            if (stock !== undefined) product.stock = stock;

            await system.save();
            emitSystemUpdateEvent(String(system._id), {
                type: 'store_products_updated',
                systemId: String(system._id),
                storeProducts: system.storeProducts,
                timestamp: new Date().toISOString(),
            });
            return res.json({ success: true, storeProducts: system.storeProducts });
        } catch (error) {
            console.error('Update store product error:', error);
            return res.status(500).json({ message: 'Failed to update store product', error: error.message });
        }
    });

    router.patch('/:systemId/store-products/:productId/listing', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { productId } = req.params;
            const { system } = req;

            const product = system.storeProducts.id(productId);
            if (!product) {
                return res.status(404).json({ message: 'Store product not found.' });
            }

            product.isListed = !product.isListed;
            await system.save();

            emitSystemUpdateEvent(String(system._id), {
                type: 'store_products_updated',
                systemId: String(system._id),
                storeProducts: system.storeProducts,
                timestamp: new Date().toISOString(),
            });
            return res.json({ success: true, storeProducts: system.storeProducts });
        } catch (error) {
            console.error('Toggle listing error:', error);
            return res.status(500).json({ message: 'Failed to toggle listing', error: error.message });
        }
    });

    router.delete('/:systemId/store-products/:productId', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { productId } = req.params;
            const { system } = req;

            const product = system.storeProducts.id(productId);
            if (!product) {
                return res.status(404).json({ message: 'Store product not found.' });
            }

            const removedProductId = String(product._id);
            const removedProductName = product.name;

            if (product.type === 'item') {
                const reference = findItemReferenceInSystem(system, removedProductId);
                if (reference) {
                    return res.status(400).json({
                        message: 'This product is referenced by tasks or lottery and cannot be deleted.',
                        reference,
                    });
                }
            }

            product.deleteOne();
            await system.save();
            emitSystemUpdateEvent(String(system._id), {
                type: 'store_products_updated',
                systemId: String(system._id),
                storeProducts: system.storeProducts,
                timestamp: new Date().toISOString(),
            });
            return res.json({ success: true, storeProducts: system.storeProducts });
        } catch (error) {
            console.error('Delete store product error:', error);
            return res.status(500).json({ message: 'Failed to delete store product', error: error.message });
        }
    });

    // ── Helper: resolve product name ────────────────────────────────────────
    function resolveProductName(system, productId) {
        if (!productId) return '';
        const p = system.storeProducts.find(x => String(x._id) === String(productId));
        return p ? p.name : String(productId);
    }

    // ── Simple draw ─────────────────────────────────────────────────────────
    function executeSimpleDraw(prizes) {
        const total = prizes.reduce((s, p) => s + p.probability, 0);
        const r = Math.random();
        if (total <= 0) return { selected: null, randomValue: r };
        let cumulative = 0;
        const threshold = r * total;
        for (const prize of prizes) {
            cumulative += prize.probability;
            if (threshold <= cumulative) return { selected: prize, randomValue: r };
        }
        return { selected: null, randomValue: r };
    }

    // ── Genshin tier draw ───────────────────────────────────────────────────
    // tierPities: [{ tierIndex, pullCount }]  (mutable, updated in place)
    function executeGenshinTiersDraw(pool, tierPities) {
        const tiers = [...(pool.genshinTiers || [])].sort((a, b) => a.tierIndex - b.tierIndex);

        // Increment ALL tier pity counters for this pull
        for (const tp of tierPities) tp.pullCount += 1;

        let wonTierIndex = -1;
        let wonItem = null;

        // Check tiers 0 and 1 (both have pity mechanics)
        for (const tier of tiers.filter(t => t.tierIndex < 2)) {
            const tp = tierPities.find(x => x.tierIndex === tier.tierIndex);
            const pc = tp?.pullCount ?? 1;

            const hardLimit = Math.max(1, tier.hardPityLimit || 90);
            const softStart = Math.max(1, tier.softPityStart || 74);
            const softInc = Math.max(0, tier.softPityIncrement || 0.06);
            const base = Math.max(0, Math.min(1, tier.baseRate || 0.006));

            let effectiveRate;
            if (pc >= hardLimit) {
                effectiveRate = 1.0;
            } else if (pc >= softStart) {
                effectiveRate = Math.min(1.0, base + (pc - softStart + 1) * softInc);
            } else {
                effectiveRate = base;
            }

            if (Math.random() < effectiveRate) {
                wonTierIndex = tier.tierIndex;
                // Reset this tier AND all lower tiers (higher index) – like Genshin
                for (const tp2 of tierPities) {
                    if (tp2.tierIndex >= tier.tierIndex) tp2.pullCount = 0;
                }
                if (tier.items.length > 0) {
                    wonItem = tier.items[Math.floor(Math.random() * tier.items.length)];
                }
                break;
            }
        }

        // Fallback to tier 2 (common)
        if (wonTierIndex === -1) {
            const commonTier = tiers.find(t => t.tierIndex === 2);
            if (!pool.canGetNothing && commonTier && commonTier.items.length > 0) {
                wonTierIndex = 2;
                wonItem = commonTier.items[Math.floor(Math.random() * commonTier.items.length)];
                // Reset tier-2 pity
                for (const tp of tierPities) {
                    if (tp.tierIndex >= 2) tp.pullCount = 0;
                }
            }
        }

        const randomValue = Math.random(); // for record keeping
        return { wonTierIndex, wonItem, randomValue };
    }

    // ── Ensure genshin pity counters exist for a member+pool ────────────────
    function ensureGenshinPities(member, poolId) {
        let counter = member.lotteryPityCounters.find(c => String(c.poolId) === String(poolId));
        if (!counter) {
            member.lotteryPityCounters.push({ poolId, pullCount: 0, tierPities: [] });
            counter = member.lotteryPityCounters[member.lotteryPityCounters.length - 1];
        }
        if (!counter.tierPities) counter.tierPities = [];
        // Ensure all 3 tiers exist
        for (let i = 0; i < 3; i++) {
            if (!counter.tierPities.find(tp => tp.tierIndex === i)) {
                counter.tierPities.push({ tierIndex: i, pullCount: 0 });
            }
        }
        return counter;
    }

    // ── Apply reward to member inventory / coins ─────────────────────────────
    async function applyReward(member, system, rewardItem, Profile) {
        if (!rewardItem) return null;
        const type = rewardItem.type || 'item';
        const qty = Math.max(1, Number(rewardItem.quantity || 1));

        if (type === 'coins') {
            // Find the owner profile and add coins
            await Profile.findByIdAndUpdate(system.profile, { $inc: { 'wallet.coins': qty } });
            return { productId: null, productName: `${qty} 金币`, productType: 'coins', quantity: qty };
        }

        // type === 'item' – add to member inventory via storeProduct lookup
        const productId = rewardItem.productId;
        const product = productId ? system.storeProducts.find(p => String(p._id) === String(productId)) : null;
        const name = rewardItem.name || (product ? product.name : '未知奖品');
        const itemKey = product ? String(product._id) : String(productId || '');

        if (itemKey) {
            const existing = member.profile ? null : null; // profile inventory handled separately
            // We add to member's purchase record as a free reward
        }

        return { productId, productName: name, productType: 'item', quantity: qty };
    }

    // ════════════════════════════════════════════════════════════════════════
    // CRUD – Lottery Pools
    // ════════════════════════════════════════════════════════════════════════

    // Create pool
    router.post('/:systemId/lottery-pools', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { system } = req;
            const { name, description, image, drawMode, consume } = req.body;

            if (!String(name || '').trim()) {
                return res.status(400).json({ message: 'Pool name is required.' });
            }

            const mode = drawMode === 'genshin' ? 'genshin' : 'simple';
            const consumeType = consume?.type === 'item' ? 'item' : (consume?.type === 'coins' ? 'coins' : 'none');
            const consumeItemKey = String(consume?.itemKey || '').trim();
            const consumeQuantity = Math.max(1, Number(consume?.quantity || 1));

            if (consumeType === 'item' && !consumeItemKey) {
                return res.status(400).json({ message: 'consume.itemKey required when type is item.' });
            }

            // Auto-create 3 genshin tiers when mode is genshin
            const genshinTiers = mode === 'genshin' ? [
                { tierIndex: 0, name: '限定', baseRate: 0.006, softPityStart: 74, hardPityLimit: 90, softPityIncrement: 0.06, items: [] },
                { tierIndex: 1, name: '精锐', baseRate: 0.051, softPityStart: 8,  hardPityLimit: 10, softPityIncrement: 0.5,  items: [] },
                { tierIndex: 2, name: '普通', baseRate: 1,    softPityStart: 999, hardPityLimit: 999, softPityIncrement: 0, items: [] },
            ] : [];

            system.lotteryPools.push({
                name: String(name).trim(),
                description: String(description || ''),
                image: String(image || '').trim() || null,
                drawMode: mode,
                consume: {
                    type: consumeType,
                    itemKey: consumeType === 'item' ? consumeItemKey : null,
                    quantity: consumeQuantity,
                },
                prizes: [],
                genshinTiers,
                canGetNothing: false,
            });
            await system.save();

            const created = system.lotteryPools[system.lotteryPools.length - 1];
            emitSystemUpdateEvent(String(system._id), {
                type: 'lottery_pools_updated',
                systemId: String(system._id),
                lotteryPools: system.lotteryPools,
            });

            return res.status(201).json({ success: true, lotteryPools: system.lotteryPools });
        } catch (err) {
            console.error('Create lottery pool error:', err);
            return res.status(500).json({ message: 'Failed to create lottery pool', error: err.message });
        }
    });

    // Update pool meta (name, description, image, consume, canGetNothing)
    router.patch('/:systemId/lottery-pools/:poolId', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { poolId } = req.params;
            const { system } = req;
            const pool = system.lotteryPools.id(poolId);
            if (!pool) return res.status(404).json({ message: 'Pool not found.' });

            const { name, description, image, consume, canGetNothing } = req.body;
            if (name !== undefined) pool.name = String(name).trim() || pool.name;
            if (description !== undefined) pool.description = String(description);
            if (image !== undefined) pool.image = String(image || '').trim() || null;
            if (canGetNothing !== undefined) pool.canGetNothing = Boolean(canGetNothing);

            if (consume) {
                const cType = consume.type === 'item' ? 'item' : (consume.type === 'coins' ? 'coins' : 'none');
                pool.consume.type = cType;
                pool.consume.itemKey = cType === 'item' ? String(consume.itemKey || '').trim() : null;
                pool.consume.quantity = Math.max(1, Number(consume.quantity || 1));
            }

            await system.save();
            emitSystemUpdateEvent(String(system._id), {
                type: 'lottery_pools_updated',
                systemId: String(system._id),
                lotteryPools: system.lotteryPools,
            });
            return res.json({ success: true, lotteryPools: system.lotteryPools });
        } catch (err) {
            console.error('Update lottery pool error:', err);
            return res.status(500).json({ message: 'Failed to update pool', error: err.message });
        }
    });

    // Delete pool
    router.delete('/:systemId/lottery-pools/:poolId', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { poolId } = req.params;
            const { system } = req;
            const pool = system.lotteryPools.id(poolId);
            if (!pool) return res.status(404).json({ message: 'Pool not found.' });

            pool.deleteOne();

            // Clear pity counters for this pool
            for (const member of system.members) {
                member.lotteryPityCounters = member.lotteryPityCounters.filter(
                    c => String(c.poolId) !== String(poolId)
                );
            }

            await system.save();
            emitSystemUpdateEvent(String(system._id), {
                type: 'lottery_pools_updated',
                systemId: String(system._id),
                lotteryPools: system.lotteryPools,
            });
            return res.json({ success: true });
        } catch (err) {
            console.error('Delete lottery pool error:', err);
            return res.status(500).json({ message: 'Failed to delete pool', error: err.message });
        }
    });

    // ════════════════════════════════════════════════════════════════════════
    // SIMPLE MODE – Prize management
    // ════════════════════════════════════════════════════════════════════════

    // Add simple prize
    router.post('/:systemId/lottery-pools/:poolId/simple-prizes', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { poolId } = req.params;
            const { system } = req;
            const pool = system.lotteryPools.id(poolId);
            if (!pool) return res.status(404).json({ message: 'Pool not found.' });
            if (pool.drawMode !== 'simple') return res.status(400).json({ message: 'Pool is not in simple mode.' });

            const { type, productId, quantity, probability } = req.body;
            const prizeType = type === 'coins' ? 'coins' : 'item';
            const prob = Number(probability);
            if (!Number.isFinite(prob) || prob < 0 || prob > 1) {
                return res.status(400).json({ message: 'probability must be between 0 and 1.' });
            }

            let name = '';
            if (prizeType === 'coins') {
                name = `金币 ×${Math.max(1, Number(quantity || 1))}`;
            } else {
                const product = system.storeProducts.find(p => String(p._id) === String(productId));
                if (!product) return res.status(404).json({ message: 'Product not found in store.' });
                name = product.name;
            }

            pool.prizes.push({
                type: prizeType,
                productId: prizeType === 'item' ? String(productId) : null,
                quantity: Math.max(1, Number(quantity || 1)),
                probability: prob,
                name,
            });
            await system.save();

            emitSystemUpdateEvent(String(system._id), {
                type: 'lottery_pools_updated',
                systemId: String(system._id),
                lotteryPools: system.lotteryPools,
            });
            return res.status(201).json({ success: true, prizes: pool.prizes });
        } catch (err) {
            console.error('Add simple prize error:', err);
            return res.status(500).json({ message: 'Failed to add prize', error: err.message });
        }
    });

    // Delete simple prize
    router.delete('/:systemId/lottery-pools/:poolId/simple-prizes/:prizeId', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { poolId, prizeId } = req.params;
            const { system } = req;
            const pool = system.lotteryPools.id(poolId);
            if (!pool) return res.status(404).json({ message: 'Pool not found.' });

            const prize = pool.prizes.id(prizeId);
            if (!prize) return res.status(404).json({ message: 'Prize not found.' });
            prize.deleteOne();

            await system.save();
            emitSystemUpdateEvent(String(system._id), {
                type: 'lottery_pools_updated',
                systemId: String(system._id),
                lotteryPools: system.lotteryPools,
            });
            return res.json({ success: true, prizes: pool.prizes });
        } catch (err) {
            console.error('Delete simple prize error:', err);
            return res.status(500).json({ message: 'Failed to delete prize', error: err.message });
        }
    });

    // ════════════════════════════════════════════════════════════════════════
    // GENSHIN MODE – Tier & item management
    // ════════════════════════════════════════════════════════════════════════

    // Update tier config (baseRate, softPityStart, hardPityLimit, softPityIncrement, name)
    router.patch('/:systemId/lottery-pools/:poolId/genshin-tiers/:tierIndex', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { poolId, tierIndex } = req.params;
            const idx = Number(tierIndex);
            const { system } = req;
            const pool = system.lotteryPools.id(poolId);
            if (!pool) return res.status(404).json({ message: 'Pool not found.' });
            if (pool.drawMode !== 'genshin') return res.status(400).json({ message: 'Pool is not in genshin mode.' });

            const tier = pool.genshinTiers.find(t => t.tierIndex === idx);
            if (!tier) return res.status(404).json({ message: `Tier ${idx} not found.` });

            const { name, baseRate, softPityStart, hardPityLimit, softPityIncrement } = req.body;
            if (name !== undefined) tier.name = String(name);
            if (baseRate !== undefined) tier.baseRate = Math.min(1, Math.max(0, Number(baseRate)));
            if (softPityStart !== undefined) tier.softPityStart = Math.max(1, Number(softPityStart));
            if (hardPityLimit !== undefined) tier.hardPityLimit = Math.max(1, Number(hardPityLimit));
            if (softPityIncrement !== undefined) tier.softPityIncrement = Math.max(0, Number(softPityIncrement));

            await system.save();
            emitSystemUpdateEvent(String(system._id), {
                type: 'lottery_pools_updated',
                systemId: String(system._id),
                lotteryPools: system.lotteryPools,
            });
            return res.json({ success: true, genshinTiers: pool.genshinTiers });
        } catch (err) {
            console.error('Update genshin tier error:', err);
            return res.status(500).json({ message: 'Failed to update tier', error: err.message });
        }
    });

    // Add item to genshin tier
    router.post('/:systemId/lottery-pools/:poolId/genshin-tiers/:tierIndex/items', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { poolId, tierIndex } = req.params;
            const idx = Number(tierIndex);
            const { system } = req;
            const pool = system.lotteryPools.id(poolId);
            if (!pool) return res.status(404).json({ message: 'Pool not found.' });
            if (pool.drawMode !== 'genshin') return res.status(400).json({ message: 'Pool is not in genshin mode.' });

            const tier = pool.genshinTiers.find(t => t.tierIndex === idx);
            if (!tier) return res.status(404).json({ message: `Tier ${idx} not found.` });

            const { type, productId, quantity } = req.body;
            const itemType = type === 'coins' ? 'coins' : 'item';

            let name = '';
            if (itemType === 'coins') {
                name = `金币 ×${Math.max(1, Number(quantity || 1))}`;
            } else {
                const product = system.storeProducts.find(p => String(p._id) === String(productId));
                if (!product) return res.status(404).json({ message: 'Product not found.' });
                name = product.name;
            }

            tier.items.push({
                type: itemType,
                productId: itemType === 'item' ? String(productId) : null,
                quantity: Math.max(1, Number(quantity || 1)),
                name,
            });
            await system.save();

            emitSystemUpdateEvent(String(system._id), {
                type: 'lottery_pools_updated',
                systemId: String(system._id),
                lotteryPools: system.lotteryPools,
            });
            return res.status(201).json({ success: true, genshinTiers: pool.genshinTiers });
        } catch (err) {
            console.error('Add genshin tier item error:', err);
            return res.status(500).json({ message: 'Failed to add item', error: err.message });
        }
    });

    // Delete item from genshin tier
    router.delete('/:systemId/lottery-pools/:poolId/genshin-tiers/:tierIndex/items/:itemId', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { poolId, tierIndex, itemId } = req.params;
            const idx = Number(tierIndex);
            const { system } = req;
            const pool = system.lotteryPools.id(poolId);
            if (!pool) return res.status(404).json({ message: 'Pool not found.' });

            const tier = pool.genshinTiers.find(t => t.tierIndex === idx);
            if (!tier) return res.status(404).json({ message: `Tier ${idx} not found.` });

            const item = tier.items.id(itemId);
            if (!item) return res.status(404).json({ message: 'Item not found.' });
            item.deleteOne();

            await system.save();
            emitSystemUpdateEvent(String(system._id), {
                type: 'lottery_pools_updated',
                systemId: String(system._id),
                lotteryPools: system.lotteryPools,
            });
            return res.json({ success: true, genshinTiers: pool.genshinTiers });
        } catch (err) {
            console.error('Delete genshin tier item error:', err);
            return res.status(500).json({ message: 'Failed to delete item', error: err.message });
        }
    });

    // ════════════════════════════════════════════════════════════════════════
    // GPT – Generate pool description
    // ════════════════════════════════════════════════════════════════════════

    router.post('/:systemId/lottery-pools/:poolId/generate-description', authenticateToken, loadOwnerSystem, async (req, res) => {
        try {
            const { poolId } = req.params;
            const { system } = req;
            const pool = system.lotteryPools.id(poolId);
            if (!pool) return res.status(404).json({ message: 'Lottery pool not found.' });

            if (!openaiClient) {
                return res.status(503).json({ message: 'OpenAI not configured.' });
            }

            const prizeList = pool.drawMode === 'simple'
                ? pool.prizes.map(p => p.name).join(', ')
                : pool.genshinTiers.flatMap(t => t.items.map(i => i.name)).join(', ');

            const completion = await openaiClient.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{
                    role: 'user',
                    content: `${ANIMAL_CROSSING_LOOT_STYLE}\n请为一个名为「${pool.name}」的抽奖池生成一段简短有趣的中文介绍（60字以内），奖品包括：${prizeList || '未配置'}。`,
                }],
                max_tokens: 150,
            });

            const description = completion.choices?.[0]?.message?.content?.trim() || '';
            pool.description = description;
            await system.save();

            return res.json({ success: true, description });
        } catch (err) {
            console.error('Generate description error:', err);
            return res.status(500).json({ message: 'Failed to generate description', error: err.message });
        }
    });

    // ════════════════════════════════════════════════════════════════════════
    // MEMBER – Draw
    // ════════════════════════════════════════════════════════════════════════

    router.post('/:systemId/member/lottery-pools/:poolId/draw', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { poolId } = req.params;
            const { system, member } = req;
            const drawCount = Math.min(10, Math.max(1, Number(req.body?.count || 1)));

            const pool = system.lotteryPools.id(poolId);
            if (!pool) return res.status(404).json({ message: 'Lottery pool not found.' });

            // ── Consume check ──────────────────────────────────────────────
            const consumeType = pool.consume?.type || 'none';
            const consumePerDraw = Math.max(1, Number(pool.consume?.quantity || 1));
            const totalConsume = consumePerDraw * drawCount;
            const consumeItemKey = pool.consume?.itemKey || null;

            const memberProfile = await Profile.findById(member.profile);
            if (!memberProfile) return res.status(404).json({ message: 'Member profile not found.' });

            if (consumeType === 'coins') {
                if (Number(memberProfile.wallet?.coins || 0) < totalConsume) {
                    return res.status(400).json({ message: `金币不足，需要 ${totalConsume} 金币。` });
                }
                await Profile.findByIdAndUpdate(member.profile, { $inc: { 'wallet.coins': -totalConsume } });
            } else if (consumeType === 'item') {
                if (!consumeItemKey) return res.status(400).json({ message: 'Pool consume item key missing.' });
                const inv = (memberProfile.inventory || []).find(i => i.inventoryKey === consumeItemKey);
                if (!inv || Number(inv.quantity || 0) < totalConsume) {
                    return res.status(400).json({ message: `消耗物品不足，需要 ${totalConsume} 个。` });
                }
                await Profile.findByIdAndUpdate(
                    member.profile,
                    { $inc: { 'inventory.$[elem].quantity': -totalConsume } },
                    { arrayFilters: [{ 'elem.inventoryKey': consumeItemKey }] }
                );
            }

            // ── Execute draws ──────────────────────────────────────────────
            const draws = [];
            let pityCounter = member.lotteryPityCounters.find(c => String(c.poolId) === String(poolId));

            if (pool.drawMode === 'genshin') {
                // Ensure pity counter exists for all tiers
                if (!pityCounter) {
                    member.lotteryPityCounters.push({ poolId, pullCount: 0, tierPities: [] });
                    pityCounter = member.lotteryPityCounters[member.lotteryPityCounters.length - 1];
                }
                if (!pityCounter.tierPities) pityCounter.tierPities = [];
                for (let i = 0; i < 3; i++) {
                    if (!pityCounter.tierPities.find(tp => tp.tierIndex === i)) {
                        pityCounter.tierPities.push({ tierIndex: i, pullCount: 0 });
                    }
                }

                // mutable array passed to draw function
                const tierPities = pityCounter.tierPities.map(tp => ({ tierIndex: tp.tierIndex, pullCount: tp.pullCount }));

                for (let d = 0; d < drawCount; d++) {
                    const { wonTierIndex, wonItem, randomValue } = executeGenshinTiersDraw(pool, tierPities);
                    const won = wonTierIndex !== -1 && wonItem !== null;

                    let rewardInfo = null;
                    if (won && wonItem) {
                        const qty = Math.max(1, Number(wonItem.quantity || 1));
                        if (wonItem.type === 'coins') {
                            await Profile.findByIdAndUpdate(member.profile, { $inc: { 'wallet.coins': qty } });
                            rewardInfo = { productId: null, productName: `${qty} 金币`, productType: 'coins', quantity: qty };
                        } else if (wonItem.productId) {
                            const product = system.storeProducts.find(p => String(p._id) === String(wonItem.productId));
                            if (product) {
                                rewardInfo = { productId: String(wonItem.productId), productName: wonItem.name || product.name, productType: product.type, quantity: qty };
                                // Add to profile inventory
                                const invEntry = (await Profile.findById(member.profile))?.inventory?.find(i => i.inventoryKey === String(wonItem.productId));
                                if (invEntry) {
                                    await Profile.findByIdAndUpdate(member.profile, { $inc: { 'inventory.$[elem].quantity': qty } }, { arrayFilters: [{ 'elem.inventoryKey': String(wonItem.productId) }] });
                                } else {
                                    await Profile.findByIdAndUpdate(member.profile, { $push: { inventory: { inventoryKey: String(wonItem.productId), name: wonItem.name || product.name, quantity: qty } } });
                                }
                            }
                        }
                    }

                    member.lotteryDraws.push({
                        poolId, poolName: pool.name,
                        consumed: consumeType !== 'none' ? { type: consumeType, itemKey: consumeItemKey, quantity: consumePerDraw } : { type: 'none', itemKey: null, quantity: 0 },
                        reward: rewardInfo ? { productId: rewardInfo.productId, productName: rewardInfo.productName, productType: rewardInfo.productType === 'coins' ? 'item' : rewardInfo.productType, quantity: rewardInfo.quantity } : { productId: null, productName: '', productType: null, quantity: 0 },
                        won, randomValue,
                        tierIndex: wonTierIndex,
                    });

                    const tier0Pity = tierPities.find(tp => tp.tierIndex === 0);
                    draws.push({
                        poolId: String(poolId), poolName: pool.name,
                        won, reward: rewardInfo, randomValue,
                        tierIndex: wonTierIndex,
                        pityCount: tier0Pity?.pullCount ?? 0,
                        isFeatured: wonTierIndex === 0,
                    });
                }

                // Persist tier pity counts
                for (const tp of tierPities) {
                    const existing = pityCounter.tierPities.find(x => x.tierIndex === tp.tierIndex);
                    if (existing) existing.pullCount = tp.pullCount;
                }

            } else {
                // Simple mode
                if (!pityCounter) {
                    member.lotteryPityCounters.push({ poolId, pullCount: 0, tierPities: [] });
                    pityCounter = member.lotteryPityCounters[member.lotteryPityCounters.length - 1];
                }

                const validPrizes = pool.prizes.filter(p => p.probability > 0);

                for (let d = 0; d < drawCount; d++) {
                    pityCounter.pullCount += 1;
                    const { selected, randomValue } = executeSimpleDraw(validPrizes);
                    const won = !!selected;

                    let rewardInfo = null;
                    if (won && selected) {
                        const qty = Math.max(1, Number(selected.quantity || 1));
                        if (selected.type === 'coins') {
                            await Profile.findByIdAndUpdate(member.profile, { $inc: { 'wallet.coins': qty } });
                            rewardInfo = { productId: null, productName: `${qty} 金币`, productType: 'coins', quantity: qty };
                        } else if (selected.productId) {
                            const product = system.storeProducts.find(p => String(p._id) === String(selected.productId));
                            rewardInfo = { productId: String(selected.productId), productName: selected.name || (product?.name || ''), productType: product?.type || 'item', quantity: qty };
                            if (product) {
                                const inv2 = (await Profile.findById(member.profile))?.inventory?.find(i => i.inventoryKey === String(selected.productId));
                                if (inv2) {
                                    await Profile.findByIdAndUpdate(member.profile, { $inc: { 'inventory.$[elem].quantity': qty } }, { arrayFilters: [{ 'elem.inventoryKey': String(selected.productId) }] });
                                } else {
                                    await Profile.findByIdAndUpdate(member.profile, { $push: { inventory: { inventoryKey: String(selected.productId), name: selected.name || product.name, quantity: qty } } });
                                }
                            }
                        }
                    }

                    member.lotteryDraws.push({
                        poolId, poolName: pool.name,
                        consumed: consumeType !== 'none' ? { type: consumeType, itemKey: consumeItemKey, quantity: consumePerDraw } : { type: 'none', itemKey: null, quantity: 0 },
                        reward: rewardInfo ? { productId: rewardInfo.productId, productName: rewardInfo.productName, productType: rewardInfo.productType === 'coins' ? 'item' : rewardInfo.productType, quantity: rewardInfo.quantity } : { productId: null, productName: '', productType: null, quantity: 0 },
                        won, randomValue,
                        tierIndex: null,
                    });

                    draws.push({ poolId: String(poolId), poolName: pool.name, won, reward: rewardInfo, randomValue, pityCount: pityCounter.pullCount });
                }
            }

            await system.save();
            emitSystemUpdateEvent(String(system._id), { type: 'lottery_pool_draw_executed', poolId });

            return res.json({
                success: true,
                draws,
                draw: draws[0] || null,
                pityCount: draws[0]?.pityCount ?? 0,
                consumed: consumeType !== 'none' ? { type: consumeType, itemKey: consumeItemKey, quantity: totalConsume } : null,
            });
        } catch (err) {
            console.error('Draw lottery error:', err);
            return res.status(500).json({ message: 'Failed to draw', error: err.message });
        }
    });

    // ── Member pity query ───────────────────────────────────────────────────
    router.get('/:systemId/member/lottery/pity', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { member } = req;
            return res.json({ success: true, pityCounters: member.lotteryPityCounters || [] });
        } catch (err) {
            return res.status(500).json({ message: 'Failed to get pity', error: err.message });
        }
    });

    // ── Member lottery history ──────────────────────────────────────────────
    router.get('/:systemId/member/lottery/history', authenticateToken, loadParticipantSystem, requireMember, async (req, res) => {
        try {
            const { member } = req;
            const limit = Math.min(100, Math.max(1, Number(req.query.limit || 30)));
            const history = [...(member.lotteryDraws || [])].reverse().slice(0, limit);
            return res.json({ success: true, history });
        } catch (err) {
            return res.status(500).json({ message: 'Failed to get history', error: err.message });
        }
    });
}

module.exports = registerSystemStoreRoutes;
