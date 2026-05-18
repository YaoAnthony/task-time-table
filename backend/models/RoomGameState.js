const { createDocumentModel } = require('../db/documentModel');

module.exports = createDocumentModel('RoomGameState', {
  collection: 'RoomGameState',
  timestamps: true,
  defaults: () => ({
    roomId: '',
    version: 0,
    farmTiles: [],
    creatures: [],
    worldItems: [],
    trees: [],
    worldState: null,
    gameTick: 0,
    gameSave: null,
  }),
});
