// Shared game item definitions — mirrors backend gameItems.js

export type ItemActionType =
  | 'eat' | 'plant' | 'harvest' | 'water' | 'till'
  | 'lay_egg' | 'collect' | 'chop' | 'feed'
  | 'place_house' | 'open_house' | 'place_storage_chest' | 'place_pet';

export interface ItemCapability {
  action: ItemActionType;
  /** Context constraints e.g. { tileState: 'tilled' } */
  requires?: Record<string, string>;
}

export type GameItemType = 'consumable' | 'tool' | 'seed' | 'crop' | 'material' | 'house_blueprint' | 'key' | 'storage' | 'pet';
export type GameItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface GameItemDefinition {
  id:           string;
  name:         string;
  nameZh:       string;
  type:         GameItemType;
  category:     'game';
  stackable:    boolean;
  maxStack:     number;
  rarity:       GameItemRarity;
  image:        string;
  description:  string;
  capabilities: ItemCapability[];
  tags:         string[];
  /** Real-seconds until crop is fully ready (seeds only) */
  growDuration?: number;
  /** Number of visual growth stages (seeds only) */
  numStages?:    number;
  /** Row index in Basic_Plants.png for the crop overlay sprite */
  plantRow?:     number;
  /** itemId of the produced crop (seeds only) */
  harvestItem?:  string;
  harvestQty?:   number;
}

export const GAME_ITEMS: Record<string, GameItemDefinition> = {
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
    growDuration: 40, numStages: 4, harvestItem: 'wheat', harvestQty: 2,
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
    rarity: 'uncommon', image: 'tools', description: '为耕地浇水。',
    capabilities: [{ action: 'water' }], tags: ['tool', 'farming'],
  },
  shovel: {
    id: 'shovel', name: 'Shovel', nameZh: '铲子',
    type: 'tool', category: 'game', stackable: false, maxStack: 1,
    rarity: 'uncommon', image: 'tools', description: '基础挖掘工具。',
    capabilities: [], tags: ['tool', 'digging'],
  },
  scythe: {
    id: 'scythe', name: 'Hoe', nameZh: '锄头',
    type: 'tool', category: 'game', stackable: false, maxStack: 1,
    rarity: 'uncommon', image: 'tools', description: '开垦土地用的锄头。',
    capabilities: [{ action: 'till' }], tags: ['tool', 'farming'],
  },
  axe: {
    id: 'axe', name: 'Axe', nameZh: '斧头',
    type: 'tool', category: 'game', stackable: false, maxStack: 1,
    rarity: 'uncommon', image: 'tools', description: '砍树专用。',
    capabilities: [{ action: 'chop' }], tags: ['tool'],
  },
  animal_feed: {
    id: 'animal_feed', name: 'Animal Feed', nameZh: '饲料',
    type: 'consumable', category: 'game', stackable: true, maxStack: 99,
    rarity: 'common', image: '', description: '喂鸡可加速成长。',
    capabilities: [{ action: 'feed' }], tags: ['food', 'animal'],
  },
  house_blueprint_greenhouse: {
    id: 'house_blueprint_greenhouse', name: 'Greenhouse Blueprint', nameZh: '温室蓝图',
    type: 'house_blueprint', category: 'game', stackable: true, maxStack: 99,
    rarity: 'rare', image: 'green-house/house-close', description: '可以在空地上建造一间温室小屋。',
    capabilities: [{ action: 'place_house' }], tags: ['house', 'blueprint', 'building'],
  },
  house_key: {
    id: 'house_key', name: 'House Key', nameZh: '房屋钥匙',
    type: 'key', category: 'game', stackable: false, maxStack: 1,
    rarity: 'rare', image: 'icon/key', description: '打开指定房子的钥匙。',
    capabilities: [{ action: 'open_house' }], tags: ['house', 'key'],
  },
  storage_chest_basic: {
    id: 'storage_chest_basic', name: 'Storage Chest', nameZh: '储物箱',
    type: 'storage', category: 'game', stackable: true, maxStack: 99,
    rarity: 'uncommon', image: 'chest', description: '放置在世界中，用来存放背包物品。',
    capabilities: [{ action: 'place_storage_chest', requires: { definitionId: 'basic' } }],
    tags: ['storage', 'chest', 'building'],
  },
  pet_laoli_cat: {
    id: 'pet_laoli_cat', name: "Lao Li's Cat", nameZh: '老李的猫',
    type: 'pet', category: 'game', stackable: false, maxStack: 1,
    rarity: 'rare', image: 'player', description: '老李牵挂的小猫。现在先复用玩家动作帧，之后可以替换成猫素材。',
    capabilities: [{ action: 'place_pet' }],
    tags: ['pet', 'cat', 'laoli', 'mainline'],
  },
};
