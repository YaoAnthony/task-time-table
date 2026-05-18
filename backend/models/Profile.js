const { createDocumentModel } = require('../db/documentModel');

const ATTRIBUTE_DEFAULTS = {
  stamina: { level: 0, exp: 0 },
  strength: { level: 0, exp: 0 },
  wisdom: { level: 0, exp: 0 },
  discipline: { level: 0, exp: 0 },
  charisma: { level: 0, exp: 0 },
  luck: { level: 0, exp: 0 },
  vitality: { level: 0, exp: 0 },
};

module.exports = createDocumentModel('Profile', {
  collection: 'Profile',
  timestamps: true,
  refs: {
    systems: 'System',
  },
  defaults: () => ({
    user: null,
    systems: [],
    wallet: { coins: 0 },
    npcMemories: {},
    attributes: ATTRIBUTE_DEFAULTS,
    inventory: [],
    gameInventory: [],
    idleGame: {
      x: 10,
      y: 7,
      gameTick: 0,
      facing: 'down',
      trees: [],
      worldState: null,
    },
    gameChests: [],
    gameState: {
      farmTiles: [],
      creatures: [],
    },
    gameSave: null,
  }),
});
