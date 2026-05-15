/**
 * RoomGameState — shared world state for a multiplayer room.
 * roomId = hostUserId (matches Socket.IO room convention).
 * Single-player: roomId = userId (same model, no schema change needed).
 */

const mongoose = require('mongoose');
const Schema   = mongoose.Schema;

// ── Shared sub-schemas (mirrors Profile.js without _id) ───────────────────────

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

/** Persistent world items (drops that survive disconnect). */
const WorldItemSchema = new Schema({
    spawnId:   { type: String, required: true },
    itemId:    { type: String, required: true },
    x:         { type: Number, required: true },
    y:         { type: Number, required: true },
    spawnedAt: { type: Number, default: 0 },
    /** null = unclaimed; userId string = claimed by that player */
    claimedBy: { type: String, default: null },
}, { _id: false });

const TreeSaveSchema = new Schema({
    id:       { type: String, required: true },
    stage:    { type: String, enum: ['A', 'B', 'C', 'chopA', 'chopBC'], default: 'A' },
    hasFruit: { type: Boolean, default: false },
}, { _id: false });

// ── Root schema ───────────────────────────────────────────────────────────────

const RoomGameStateSchema = new Schema({
    /** roomId = hostUserId — same string used as Socket.IO room name */
    roomId:     { type: String, required: true, unique: true },
    /** Optimistic-lock counter: incremented on every mutating write */
    version:    { type: Number, default: 0 },

    farmTiles:  { type: [FarmTileSchema],     default: [] },
    creatures:  { type: [CreatureStateSchema], default: [] },
    worldItems: { type: [WorldItemSchema],    default: [] },
    trees:      { type: [TreeSaveSchema],     default: [] },

    /**
     * Generic world-state blob (beds, nests, future entities).
     * Schema is frontend-owned; backend stores as-is.
     */
    worldState: { type: Schema.Types.Mixed, default: null },
    gameTick:   { type: Number, default: 0 },
    /** Unified room save blob. New game logic reads/writes this shape. */
    gameSave:   { type: Schema.Types.Mixed, default: null },
}, { timestamps: true });

const RoomGameState = mongoose.model('RoomGameState', RoomGameStateSchema);
module.exports = RoomGameState;
