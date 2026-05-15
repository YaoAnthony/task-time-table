const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserAttributeSchema = new Schema({
    level: { type: Number, default: 0, min: 0 },
    exp: { type: Number, default: 0, min: 0 },
}, { _id: false });

const TreeSaveSchema = new Schema({
    id:       { type: String, required: true },
    stage:    { type: String, enum: ['A', 'B', 'C', 'chopA', 'chopBC'], default: 'A' },
    hasFruit: { type: Boolean, default: false },
}, { _id: false });

const IdleGameSchema = new Schema({
    x:          { type: Number, default: 10 },
    y:          { type: Number, default: 7 },
    gameTick:   { type: Number, default: 0 },
    facing:     { type: String, enum: ['up', 'down', 'left', 'right'], default: 'down' },
    trees:      { type: [TreeSaveSchema], default: [] },
    /**
     * Generic world-state blob: beds, nests, and any future placeable entities.
     * Schema is frontend-owned; backend stores it as-is.
     * Example: { schemaVersion:1, beds:[{color,x,y}], nests:[{x,y,state}] }
     */
    worldState: { type: Schema.Types.Mixed, default: null },
}, { _id: false });

// ─── NPC Memory (Generative Agents-inspired) ──────────────────────────────────
const NpcMemoryEntrySchema = new Schema({
    id:           { type: String, required: true },
    gameTick:     { type: Number, default: 0 },
    text:         { type: String, required: true },
    source:       { type: String, enum: ['npc', 'player', 'event', 'reflection'], default: 'event' },
    /** Poignancy score 1-10. Higher = more important. */
    importance:   { type: Number, default: 5, min: 1, max: 10 },
    /** Extracted keywords for relevance scoring. */
    keywords:     [{ type: String }],
    /** gameTick of the last time this memory was retrieved (for recency decay). */
    lastAccessed: { type: Number, default: 0 },
}, { _id: false });

// ─── Treasure Chest ───────────────────────────────────────────────────────────
const ChestRewardItemSchema = new Schema({
    inventoryKey: { type: String },
    name:         { type: String },
    description:  { type: String, default: '' },
    rarity:       { type: String, default: 'common' },
    imageUrl:     { type: String, default: '' },
    quantity:     { type: Number, default: 1 },
}, { _id: false });

const ChestSchema = new Schema({
    id:       { type: String, required: true },
    x:        { type: Number, required: true },
    y:        { type: Number, required: true },
    rewards: {
        coins: { type: Number, default: 0 },
        items: { type: [ChestRewardItemSchema], default: [] },
    },
    opened:    { type: Boolean, default: false },
    createdAt: { type: Number, default: 0 },
}, { _id: false });

// ─── Game World Inventory (eggs, fruit, crops, etc.) ──────────────────────────
const GameInventoryItemSchema = new Schema({
    itemId:   { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0, default: 1 },
    instanceData: {
        durability: { type: Number, default: null },
        freshness:  { type: Number, default: null },
        customMeta: { type: Schema.Types.Mixed, default: {} },
    },
}, { _id: false });

// ─── Farm Tile State ──────────────────────────────────────────────────────────
const FarmTileSchema = new Schema({
    tx:          { type: Number, required: true },
    ty:          { type: Number, required: true },
    state: {
        type: String,
        enum: ['tilled', 'watered', 'seeded', 'growing', 'ready', 'harvested'],
        default: 'tilled',
    },
    cropId:      { type: String,  default: null },
    plantRow:    { type: Number,  default: 0    },
    numStages:   { type: Number,  default: 4    },
    plantedAt:   { type: Number,  default: null },
    readyAt:     { type: Number,  default: null },
    waterExpiry: { type: Number,  default: null },
}, { _id: false });

// ─── Creature State ───────────────────────────────────────────────────────────
const CreatureStateSchema = new Schema({
    creatureId: { type: String, required: true },
    type:       { type: String, enum: ['chicken'], default: 'chicken' },
    x:          { type: Number, default: 0 },
    y:          { type: Number, default: 0 },
    thirst:     { type: Number, default: 0, min: 0, max: 100 },
    growth:     { type: Number, default: 0, min: 0, max: 100 },
    state: {
        type: String,
        enum: ['wandering', 'moving_to_water', 'drinking', 'moving_to_nest', 'laying'],
        default: 'wandering',
    },
}, { _id: false });

// ─── Game World State Container ───────────────────────────────────────────────
const GameStateSchema = new Schema({
    farmTiles: { type: [FarmTileSchema],      default: [] },
    creatures: { type: [CreatureStateSchema], default: [] },
}, { _id: false });

const InventoryItemSchema = new Schema({
    inventoryKey: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    type: {
        type: String,
        enum: ['item', 'mission', 'lottery_chance', 'consumable'],
        default: 'item',
    },
    quantity: { type: Number, required: true, min: 0, default: 0 },
    sourceSystem: { type: mongoose.Schema.Types.ObjectId, ref: 'System', default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
}, { _id: false });

const ProfileSchema = new Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    systems: [{ type: mongoose.Schema.Types.ObjectId, ref: 'System', default: [] }],
    wallet: {
        coins: { type: Number, default: 0, min: 0 },
    },
    /**
     * Per-NPC memory store: { [npcName]: NpcMemoryEntry[] }.
     * Stored as Mixed to avoid Mongoose Map's $* key restriction with array values.
     */
    npcMemories: { type: Schema.Types.Mixed, default: {} },
    attributes: {
        stamina: { type: UserAttributeSchema, default: () => ({ level: 0, exp: 0 }) },
        strength: { type: UserAttributeSchema, default: () => ({ level: 0, exp: 0 }) },
        wisdom: { type: UserAttributeSchema, default: () => ({ level: 0, exp: 0 }) },
        discipline: { type: UserAttributeSchema, default: () => ({ level: 0, exp: 0 }) },
        charisma:  { type: UserAttributeSchema, default: () => ({ level: 0, exp: 0 }) },
        luck:      { type: UserAttributeSchema, default: () => ({ level: 0, exp: 0 }) },
        vitality:  { type: UserAttributeSchema, default: () => ({ level: 0, exp: 0 }) },
    },
    inventory:     { type: [InventoryItemSchema],     default: [] },
    gameInventory: { type: [GameInventoryItemSchema], default: [] },
    idleGame:      { type: IdleGameSchema,            default: () => ({}) },
    gameChests:    { type: [ChestSchema],             default: [] },
    gameState:     { type: GameStateSchema,           default: () => ({}) },
    /** Unified idle-game save blob. New game logic reads/writes this shape. */
    gameSave:      { type: Schema.Types.Mixed,         default: null },
}, {
    timestamps: true,
});

const Profile = mongoose.model('Profile', ProfileSchema);
module.exports = Profile;
