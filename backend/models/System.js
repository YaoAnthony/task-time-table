const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ATTRIBUTE_CATEGORIES = ['stamina', 'strength', 'wisdom', 'discipline', 'charisma', 'luck'];
const RARITY_LEVELS = ['common', 'rare', 'epic', 'legendary', 'mythic'];

const ObtainableItemSchema = new Schema({
    itemKey: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: null },
    description: { type: String, default: '' },
    rarity: { type: String, enum: RARITY_LEVELS, default: 'common' },
}, { _id: false });

const AttributeValueSchema = new Schema({
    name: { type: String, required: true, trim: true },
    level: { type: Number, default: 0, min: 0 },
    used: { type: Boolean, default: false },
}, { _id: false });

const AttributeBoardSchema = new Schema({
    category: { type: String, enum: ATTRIBUTE_CATEGORIES, required: true },
    displayName: { type: String, required: true, trim: true },
    attributes: { type: [AttributeValueSchema], default: [] },
}, { _id: false });

const RewardExperienceSchema = new Schema({
    name: { type: String, required: true, trim: true },
    value: { type: Number, required: true, min: 0 },
}, { _id: false });

const RewardItemSchema = new Schema({
    itemKey: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const UnlockMissionRewardSchema = new Schema({
    missionId: { type: String, required: true, trim: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
}, { _id: false });

const RewardSchema = new Schema({
    experience: { type: [RewardExperienceSchema], default: [] },
    coins: { type: Number, default: 0, min: 0 },
    items: { type: [RewardItemSchema], default: [] },
    unlockMissions: { type: [UnlockMissionRewardSchema], default: [] },
}, { _id: false });

const TaskNodeSchema = new Schema({
    nodeId: { type: String, required: true, trim: true },
    parentNodeId: { type: String, default: null, trim: true },
    prerequisiteNodeIds: { type: [String], default: [] },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    content: { type: String, default: '' },
    notice: { type: String, default: '' },
    timeCostMinutes: { type: Number, required: true, min: 1 },
    canInterrupt: { type: Boolean, default: true },
    rewards: { type: RewardSchema, default: () => ({}) },
    childrenNodeIds: {
        type: [String],
        default: [],
        validate: {
            validator(value) {
                return Array.isArray(value) && value.length <= 3;
            },
            message: 'Each task node can have at most 3 children.',
        },
    },
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'completed', 'failed'],
        default: 'pending',
    },
    allowRetryAfterFailure: { type: Boolean, default: true },
}, { _id: false });

const UnlockConditionSchema = new Schema({
    type: { type: String, enum: ['direct', 'attributeLevel'], default: 'direct' },
    attributeName: { type: String, default: null },
    minLevel: { type: Number, default: 0, min: 0 },
}, { _id: false });

const PointPenaltySchema = new Schema({
    attributeName: { type: String, required: true, trim: true },
    value: { type: Number, required: true, min: 1 },
}, { _id: false });

const ItemPenaltySchema = new Schema({
    itemKey: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
}, { _id: false });

const FailureMechanismSchema = new Schema({
    enabled: { type: Boolean, default: false },
    pointPenalty: { type: [PointPenaltySchema], default: [] },
    itemPenalty: { type: [ItemPenaltySchema], default: [] },
}, { _id: false });

const MissionListSchema = new Schema({
    listType: { type: String, enum: ['mainline', 'urgent'], required: true },
    title: { type: String, required: true, trim: true },
    image: { type: String, default: null },
    description: { type: String, default: '' },
    unlockCondition: { type: UnlockConditionSchema, default: () => ({ type: 'direct' }) },
    failureMechanism: { type: FailureMechanismSchema, default: () => ({}) },
    hasFailed: { type: Boolean, default: false },
    restartAllowed: { type: Boolean, default: false },
    rootNodeId: { type: String, default: null },
    taskTree: { type: [TaskNodeSchema], default: [] },
}, { _id: true });

const StoreItemSchema = new Schema({
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['mission', 'item', 'lottery_chance'], required: true },
    image: { type: String, default: null },
    description: { type: String, default: '' },
    rarity: { type: String, enum: RARITY_LEVELS, default: 'common' },
    price: { type: Number, required: true, min: 0 },
    stock: {
        type: Number,
        default: null,
        validate: {
            validator(value) {
                if (this.type === 'item' || this.type === 'lottery_chance') {
                    return Number.isInteger(value) && value >= 0;
                }
                return value === null || value === undefined;
            },
            message: 'Stock is required only for item or lottery_chance products.',
        },
    },
    isListed: { type: Boolean, default: true },
}, { _id: true });

const LotteryConsumeSchema = new Schema({
    type: { type: String, enum: ['none', 'item', 'coins'], default: 'none' },
    itemKey: { type: String, default: null, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
}, { _id: false });

// Simple mode prize (item from store or flat coins reward)
const SimplePrizeSchema = new Schema({
    type: { type: String, enum: ['item', 'coins'], required: true },
    productId: { type: String, default: null, trim: true }, // store product _id
    quantity: { type: Number, default: 1, min: 1 },
    probability: { type: Number, required: true, min: 0, max: 1 },
    name: { type: String, default: '', trim: true }, // denormalized name
}, { _id: true });

// Item inside a Genshin tier (no per-item probability – uniform within tier)
const GenshinTierItemSchema = new Schema({
    type: { type: String, enum: ['item', 'coins'], default: 'item' },
    productId: { type: String, default: null, trim: true },
    quantity: { type: Number, default: 1, min: 1 },
    name: { type: String, default: '', trim: true }, // denormalized
}, { _id: true });

// One pity tier (0 = featured/rarest, 1 = rare, 2 = common/fallback)
const GenshinTierSchema = new Schema({
    tierIndex: { type: Number, required: true, min: 0, max: 2 },
    name: { type: String, default: '' }, // display name e.g. '限定', '精锐', '普通'
    baseRate: { type: Number, default: 0.006, min: 0, max: 1 },
    softPityStart: { type: Number, default: 74, min: 1 },
    hardPityLimit: { type: Number, default: 90, min: 1 },
    softPityIncrement: { type: Number, default: 0.06, min: 0 },
    items: { type: [GenshinTierItemSchema], default: [] },
}, { _id: false });

const LotteryPoolSchema = new Schema({
    name:        { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    image:       { type: String, default: null, trim: true },
    drawMode:    { type: String, enum: ['simple', 'genshin'], default: 'simple' },
    consume: { type: LotteryConsumeSchema, default: () => ({ type: 'none', itemKey: null, quantity: 1 }) },
    // simple mode
    prizes: { type: [SimplePrizeSchema], default: [] },
    // genshin mode
    genshinTiers: { type: [GenshinTierSchema], default: [] },
    canGetNothing: { type: Boolean, default: false },
}, { _id: true });

// ── Daily Quest Pool ──────────────────────────────────────────────────────────
const DailyQuestSchema = new Schema({
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '' },
    rewards: { type: RewardSchema, default: () => ({}) },
    isUnlimited: { type: Boolean, default: false },     // unlimited daily completions
    maxCompletions: { type: Number, default: 1, min: 1 }, // per-user per-day limit (if not unlimited)
    totalCompletions: { type: Number, default: 0, min: 0 }, // global completion counter
    isActive: { type: Boolean, default: true },
}, { _id: true });

const DailyQuestSettingsSchema = new Schema({
    dailyCount: { type: Number, default: 3, min: 1, max: 20 }, // quests drawn per member per day
    enabled: { type: Boolean, default: true },
}, { _id: false });

// Per-quest status inside a user's daily list
const UserDailyQuestStatusSchema = new Schema({
    questId: { type: String, required: true },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    rewards: { type: RewardSchema, default: () => ({}) },
    isUnlimited: { type: Boolean, default: false },
    maxCompletions: { type: Number, default: 1 },
    completedCount: { type: Number, default: 0, min: 0 },
    completed: { type: Boolean, default: false },
}, { _id: false });

// Daily status snapshot per member (one entry per day)
const UserDailyStatusSchema = new Schema({
    date: { type: String, required: true }, // YYYY-MM-DD
    quests: { type: [UserDailyQuestStatusSchema], default: [] },
}, { _id: false });

const TaskCompletionSchema = new Schema({
    missionListId: { type: mongoose.Schema.Types.ObjectId, required: true },
    nodeId: { type: String, required: true, trim: true },
    completedAt: { type: Date, default: Date.now },
    rewards: { type: RewardSchema, default: () => ({}) },
}, { _id: true });

const MemberMissionListStateSchema = new Schema({
    missionListId: { type: mongoose.Schema.Types.ObjectId, required: true },
    acceptedAt: { type: Date, default: Date.now },
    hasFailed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
}, { _id: false });

const MemberActiveTaskSchema = new Schema({
    missionListId: { type: mongoose.Schema.Types.ObjectId, required: true },
    nodeId: { type: String, required: true, trim: true },
    startedAt: { type: Date, default: Date.now },
}, { _id: false });

const MemberTaskHistorySchema = new Schema({
    eventType: {
        type: String,
        enum: ['accept_list', 'start_task', 'complete_task', 'fail_task'],
        required: true,
    },
    missionListId: { type: mongoose.Schema.Types.ObjectId, required: true },
    nodeId: { type: String, default: null, trim: true },
    taskTitle: { type: String, default: '' },
    timestamp: { type: Date, default: Date.now },
    rewards: { type: RewardSchema, default: () => ({}) },
}, { _id: true });

const PurchaseRecordSchema = new Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, required: true },
    productName: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    purchasedAt: { type: Date, default: Date.now },
}, { _id: true });

const LotteryDrawRecordSchema = new Schema({
    poolId: { type: mongoose.Schema.Types.ObjectId, required: true },
    poolName: { type: String, required: true, trim: true },
    consumed: {
        type: {
            type: String,
            enum: ['none', 'item', 'coins'],
            default: 'none',
        },
        itemKey: { type: String, default: null, trim: true },
        quantity: { type: Number, default: 0, min: 0 },
    },
    reward: {
        productId: { type: mongoose.Schema.Types.ObjectId, default: null },
        productName: { type: String, default: '', trim: true },
        productType: { type: String, enum: ['mission', 'item', 'lottery_chance'], default: null },
        quantity: { type: Number, default: 0, min: 0 },
    },
    won: { type: Boolean, default: false },
    tierIndex: { type: Number, default: null }, // genshin mode: which tier fired (0,1,2)
    randomValue: { type: Number, default: 0, min: 0, max: 1 },
    createdAt: { type: Date, default: Date.now },
}, { _id: true });

const TierPitySchema = new Schema({
    tierIndex: { type: Number, required: true },
    pullCount: { type: Number, default: 0, min: 0 },
}, { _id: false });

const LotteryPityCounterSchema = new Schema({
    poolId: { type: mongoose.Schema.Types.ObjectId, required: true },
    pullCount: { type: Number, default: 0, min: 0 }, // simple mode (legacy)
    tierPities: { type: [TierPitySchema], default: [] }, // genshin mode per-tier
}, { _id: false });

const MemberSchema = new Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    profile: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true },
    joinedAt: { type: Date, default: Date.now, index: true },
    acceptedMissionLists: { type: [MemberMissionListStateSchema], default: [] },
    activeTask: { type: MemberActiveTaskSchema, default: null },
    taskCompletions: { type: [TaskCompletionSchema], default: [] },
    taskHistory: { type: [MemberTaskHistorySchema], default: [] },
    purchases: { type: [PurchaseRecordSchema], default: [] },
    lotteryDraws: { type: [LotteryDrawRecordSchema], default: [] },
    lotteryPityCounters: { type: [LotteryPityCounterSchema], default: [] },
    dailyQuestStatus: { type: [UserDailyStatusSchema], default: [] },
}, { _id: true });

const SystemSchema = new Schema({
    profile: { type: mongoose.Schema.Types.ObjectId, ref: 'Profile', required: true, index: true },
    name: { type: String, required: true, trim: true },
    image: { type: String, default: null },
    description: { type: String, default: '' },
    modules: {
        taskChain: { type: Boolean, default: true },
        store: { type: Boolean, default: true },
        lottery: { type: Boolean, default: true },
    },
    attributeBoard: { type: [AttributeBoardSchema], default: [] },
    obtainableItems: { type: [ObtainableItemSchema], default: [] },
    missionLists: { type: [MissionListSchema], default: [] },
    storeProducts: { type: [StoreItemSchema], default: [] },
    lotteryPools: { type: [LotteryPoolSchema], default: [] },
    dailyQuestPool: { type: [DailyQuestSchema], default: [] },
    dailyQuestSettings: { type: DailyQuestSettingsSchema, default: () => ({ dailyCount: 3, enabled: true }) },
    members: { type: [MemberSchema], default: [] },
}, {
    timestamps: true,
});

const System = mongoose.model('System', SystemSchema);

module.exports = System;
