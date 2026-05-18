const fs = require('fs');
const path = require('path');

const Profile = require('../models/Profile');
const RoomGameState = require('../models/RoomGameState');

const STRESS_PREFIX = 'stress_npc_';
const STRESS_COUNT = 20;
const BACKUP_DIR = __dirname;

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function isStressNpcKey(key, npc) {
  return String(key || '').startsWith(STRESS_PREFIX)
    || String(npc?.id || '').startsWith(STRESS_PREFIX)
    || String(npc?.name || '').startsWith(STRESS_PREFIX)
    || npc?.stressTest === true;
}

function removeStressNpcs(save) {
  if (!save?.worldStatus) return 0;
  const npcs = save.worldStatus.npcs || {};
  let removed = 0;
  for (const [key, npc] of Object.entries(npcs)) {
    if (!isStressNpcKey(key, npc)) continue;
    delete npcs[key];
    removed += 1;
  }
  const worldState = save.worldStatus.entities?.worldState;
  for (const bucket of ['entities', 'npcMinds']) {
    const group = worldState?.[bucket];
    if (!group || typeof group !== 'object') continue;
    for (const [key, value] of Object.entries(group)) {
      if (isStressNpcKey(key, value)) delete group[key];
    }
  }
  return removed;
}

function addStressNpcs(save) {
  if (!save.worldStatus) save.worldStatus = {};
  if (!save.worldStatus.npcs || typeof save.worldStatus.npcs !== 'object') save.worldStatus.npcs = {};
  removeStressNpcs(save);
  const batch = new Date().toISOString();
  for (let i = 1; i <= STRESS_COUNT; i += 1) {
    const id = `${STRESS_PREFIX}${pad(i)}`;
    const col = (i - 1) % 5;
    const row = Math.floor((i - 1) / 5);
    save.worldStatus.npcs[id] = {
      id,
      name: id,
      position: {
        worldId: 'world:village',
        x: 560 + col * 56,
        y: 700 + row * 56,
        facing: 'down',
      },
      inventory: {},
      mind: null,
      memory: [{
        id: `${id}:stress_marker`,
        gameTick: Number(save.worldStatus.gameTick || 0),
        text: 'Temporary NPC for local performance stress testing. Safe to delete.',
        source: 'event',
        importance: 1,
        keywords: ['stress-test'],
        lastAccessed: Number(save.worldStatus.gameTick || 0),
      }],
      stressTest: true,
      stressTestBatch: batch,
    };
  }
  save.saveVersion = Number(save.saveVersion || 0) + 1;
  save.updatedAt = new Date().toISOString();
  return STRESS_COUNT;
}

async function findTargetRoom(roomId) {
  if (roomId) return RoomGameState.findOne({ roomId });
  const rooms = await RoomGameState
    .find({ gameSave: { $ne: null } })
    .select('roomId version gameSave.updatedAt gameSave.saveVersion')
    .lean();
  rooms.sort((a, b) => {
    const aTime = String(a.gameSave?.updatedAt || '');
    const bTime = String(b.gameSave?.updatedAt || '');
    if (aTime !== bTime) return bTime.localeCompare(aTime);
    return Number(b.gameSave?.saveVersion || b.version || 0) - Number(a.gameSave?.saveVersion || a.version || 0);
  });
  const latest = rooms[0];
  if (!latest) return null;
  return RoomGameState.findOne({ roomId: latest.roomId });
}

function writeBackup(room, profile) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `stress-npc-backup-${stamp}.json`);
  fs.writeFileSync(file, JSON.stringify({
    createdAt: new Date().toISOString(),
    roomId: room.roomId,
    roomGameSave: clone(room.gameSave),
    profileId: profile ? String(profile._id) : null,
    profileGameSave: profile ? clone(profile.gameSave) : null,
  }, null, 2));
  return file;
}

async function saveBoth(room, profile, save) {
  room.gameSave = save;
  room.version = Number(room.version || 0) + 1;
  room.markModified('gameSave');
  await room.save();
  if (profile) {
    profile.gameSave = save;
    profile.markModified('gameSave');
    await profile.save();
  }
}

async function main() {
  const mode = process.argv[2] || 'status';
  const roomId = process.argv[3] || process.env.STRESS_ROOM_ID || '';

  const room = await findTargetRoom(roomId);
  if (!room || !room.gameSave) throw new Error(`No game save found${roomId ? ` for room ${roomId}` : ''}`);
  const playerId = Object.keys(room.gameSave.players || {})[0] || '';
  const profile = playerId ? await Profile.findOne({ user: playerId }) : null;
  const save = clone(room.gameSave);

  if (mode === 'status') {
    const stressCount = Object.entries(save.worldStatus?.npcs || {})
      .filter(([key, npc]) => isStressNpcKey(key, npc))
      .length;
    console.log(JSON.stringify({
      mode,
      roomId: room.roomId,
      saveVersion: save.saveVersion,
      playerId,
      profileId: profile ? String(profile._id) : null,
      npcCount: Object.keys(save.worldStatus?.npcs || {}).length,
      stressCount,
    }, null, 2));
    return;
  }

  const backupFile = writeBackup(room, profile);
  if (mode === 'apply') {
    const added = addStressNpcs(save);
    await saveBoth(room, profile, save);
    console.log(JSON.stringify({
      mode,
      roomId: room.roomId,
      backupFile,
      added,
      npcCount: Object.keys(save.worldStatus?.npcs || {}).length,
      saveVersion: save.saveVersion,
    }, null, 2));
    return;
  }

  if (mode === 'cleanup') {
    const removed = removeStressNpcs(save);
    save.saveVersion = Number(save.saveVersion || 0) + 1;
    save.updatedAt = new Date().toISOString();
    await saveBoth(room, profile, save);
    console.log(JSON.stringify({
      mode,
      roomId: room.roomId,
      backupFile,
      removed,
      npcCount: Object.keys(save.worldStatus?.npcs || {}).length,
      saveVersion: save.saveVersion,
    }, null, 2));
    return;
  }

  throw new Error(`Unknown mode: ${mode}. Use status, apply, or cleanup.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
