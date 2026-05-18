const { createDocumentModel } = require('../db/documentModel');

module.exports = createDocumentModel('System', {
  collection: 'System',
  timestamps: true,
  refs: {
    'members.user': 'User',
  },
  defaults: () => ({
    profile: null,
    name: '',
    image: null,
    description: '',
    modules: {
      taskChain: true,
      store: true,
      lottery: true,
    },
    attributeBoard: [],
    obtainableItems: [],
    missionLists: [],
    storeProducts: [],
    lotteryPools: [],
    dailyQuestPool: [],
    dailyQuestSettings: {
      dailyCount: 3,
      enabled: true,
    },
    members: [],
  }),
});
