// Shared game item definitions — mirrors frontend gameItems.ts
// category: 'game' distinguishes these from system store items

const GAME_ITEMS = {
  egg: {
    id: 'egg', name: 'Egg', nameZh: '鸡蛋',
    type: 'consumable', category: 'game', stackable: true, maxStack: 99,
    rarity: 'common', image: 'egg-nest', description: '新鲜鸡蛋，可以食用。',
    capabilities: [{ action: 'eat' }, { action: 'collect' }],
    tags: ['food', 'animal_product'],
  },
  fruit: {
    id: 'fruit', name: 'Fruit', nameZh: '果实',
    type: 'consumable', category: 'game', stackable: true, maxStack: 99,
    rarity: 'common', image: 'objects', description: '新鲜果实，甘甜可口。',
    capabilities: [{ action: 'eat' }, { action: 'collect' }],
    tags: ['food', 'tree_drop'],
  },
  wheat_seed: {
    id: 'wheat_seed', name: 'Wheat Seed', nameZh: '小麦种子',
    type: 'seed', category: 'game', stackable: true, maxStack: 99,
    rarity: 'common', image: 'wheat_seed', description: '种入耕地后会长成小麦。',
    capabilities: [{ action: 'plant', requires: { tileState: 'tilled' } }],
    tags: ['seed', 'farming'],
    // 4 stages × 10 real-seconds each = 40 gameTick total
    growDuration: 40, numStages: 4, harvestItem: 'wheat', harvestQty: 2,
    // row in Basic_Plants.png (0-indexed)
    plantRow: 0,
  },
  wheat: {
    id: 'wheat', name: 'Wheat', nameZh: '小麦',
    type: 'crop', category: 'game', stackable: true, maxStack: 99,
    rarity: 'common', image: 'wheat', description: '成熟的小麦。',
    capabilities: [{ action: 'eat' }], tags: ['crop', 'food'],
  },
  tomato_seed: {
    id: 'tomato_seed', name: 'Tomato Seed', nameZh: '番茄种子',
    type: 'seed', category: 'game', stackable: true, maxStack: 99,
    rarity: 'common', image: 'tomato_seed', description: '种入耕地后会长成番茄。',
    capabilities: [{ action: 'plant', requires: { tileState: 'tilled' } }],
    tags: ['seed', 'farming'],
    growDuration: 40, numStages: 4, harvestItem: 'tomato', harvestQty: 2,
    plantRow: 1,
  },
  tomato: {
    id: 'tomato', name: 'Tomato', nameZh: '番茄',
    type: 'crop', category: 'game', stackable: true, maxStack: 99,
    rarity: 'common', image: 'tomato', description: '新鲜的番茄，多汁可口。',
    capabilities: [{ action: 'eat' }], tags: ['crop', 'food'],
  },
  watering_can: {
    id: 'watering_can', name: 'Watering Can', nameZh: '水壶',
    type: 'tool', category: 'game', stackable: false, maxStack: 1,
    rarity: 'common', image: 'tools', description: '为耕地浇水。',
    capabilities: [{ action: 'water' }], tags: ['tool', 'farming'],
  },
  scythe: {
    id: 'scythe', name: 'Scythe', nameZh: '镰刀',
    type: 'tool', category: 'game', stackable: false, maxStack: 1,
    rarity: 'common', image: 'tools', description: '开垦土地用的镰刀。',
    capabilities: [{ action: 'till' }], tags: ['tool', 'farming'],
  },
  axe: {
    id: 'axe', name: 'Axe', nameZh: '斧头',
    type: 'tool', category: 'game', stackable: false, maxStack: 1,
    rarity: 'common', image: 'tools', description: '砍树专用。',
    capabilities: [{ action: 'chop' }], tags: ['tool'],
  },
  animal_feed: {
    id: 'animal_feed', name: 'Animal Feed', nameZh: '饲料',
    type: 'consumable', category: 'game', stackable: true, maxStack: 99,
    rarity: 'common', image: '', description: '喂鸡可加速成长。',
    capabilities: [{ action: 'feed' }], tags: ['food', 'animal'],
  },
};

module.exports = { GAME_ITEMS };
