const NPC_CATALOG_VERSION = 2;
const STARTER_NPC_ID = 'laoli';

const GAME_NPC_CATALOG = [
    {
        id: 'laoli',
        name: '老李',
        role: 'starter',
        title: '村口老手',
        description: '最早陪玩家熟悉村子的老朋友。',
        price: 0,
        ownedByDefault: true,
        spawn: { x: 384, y: 760 },
        tint: 0x88ffaa,
        skill: { type: 'file', path: 'laoli.md' },
    },
    {
        id: 'farmer_tian_xiaohe',
        name: '田小禾',
        role: 'farmer',
        title: '农夫',
        description: '会种田、浇水、收菜，喜欢把问题拆成一垄一垄慢慢做。',
        price: 450,
        spawn: { x: 340, y: 500 },
        tint: 0x91d76f,
        skill: { type: 'file', path: 'tian-xiaohe.md' },
    },
    {
        id: 'carpenter_liang_musheng',
        name: '梁木生',
        role: 'carpenter',
        title: '木匠',
        description: '会砍树、修家具、造桥，话少但手稳。',
        price: 650,
        spawn: { x: 520, y: 520 },
        tint: 0xc8915f,
        skill: { type: 'file', path: 'liang-musheng.md' },
    },
    {
        id: 'merchant_su_ling',
        name: '苏铃',
        role: 'merchant',
        title: '商人',
        description: '会定时刷新商品，记得行情，也记得每个人的偏好。',
        price: 800,
        spawn: { x: 760, y: 430 },
        tint: 0xffc85a,
        skill: { type: 'file', path: 'su-ling.md' },
    },
    {
        id: 'scholar_ji_wenqiu',
        name: '纪闻秋',
        role: 'scholar',
        title: '学者',
        description: '会总结记忆、任务和世界事件，说话像在给混乱装订目录。',
        price: 900,
        spawn: { x: 900, y: 520 },
        tint: 0x9bb7ff,
        skill: { type: 'file', path: 'ji-wenqiu.md' },
    },
    {
        id: 'rancher_mu_aqing',
        name: '牧阿青',
        role: 'rancher',
        title: '牧场工',
        description: '会照顾鸡、捡蛋、喂水，做事安静但很可靠。',
        price: 700,
        spawn: { x: 1240, y: 820 },
        tint: 0xffb3c7,
        skill: { type: 'file', path: 'mu-aqing.md' },
    },
];

function listNpcDefinitions() {
    return GAME_NPC_CATALOG.map((entry) => ({ ...entry, spawn: { ...entry.spawn }, skill: { ...entry.skill } }));
}

function getNpcDefinitionById(id) {
    return GAME_NPC_CATALOG.find((entry) => entry.id === id) || null;
}

function getNpcDefinitionByName(name) {
    return GAME_NPC_CATALOG.find((entry) => entry.name === name) || null;
}

function getDefaultUnlockedNpcIds() {
    return GAME_NPC_CATALOG.filter((entry) => entry.ownedByDefault).map((entry) => entry.id);
}

function normalizeUnlockedNpcIds(input) {
    const known = new Set(GAME_NPC_CATALOG.map((entry) => entry.id));
    const result = new Set(getDefaultUnlockedNpcIds());
    if (Array.isArray(input)) {
        input.forEach((id) => {
            if (known.has(id)) result.add(id);
        });
    }
    return [...result];
}

function createDefaultNpcSave(definition) {
    return {
        id: definition.name,
        name: definition.name,
        catalogId: definition.id,
        role: definition.role,
        position: {
            x: definition.spawn.x,
            y: definition.spawn.y,
            facing: 'down',
        },
        inventory: {},
        mind: null,
        memory: [],
    };
}

function ensureUnlockedNpcSaves(gameSave) {
    if (!gameSave.worldStatus) gameSave.worldStatus = {};
    gameSave.worldStatus.npcCatalogVersion = NPC_CATALOG_VERSION;
    gameSave.worldStatus.unlockedNpcs = normalizeUnlockedNpcIds(gameSave.worldStatus.unlockedNpcs);
    if (!gameSave.worldStatus.npcs || typeof gameSave.worldStatus.npcs !== 'object') {
        gameSave.worldStatus.npcs = {};
    }
    gameSave.worldStatus.unlockedNpcs.forEach((npcId) => {
        const definition = getNpcDefinitionById(npcId);
        if (!definition) return;
        if (!gameSave.worldStatus.npcs[definition.name]) {
            gameSave.worldStatus.npcs[definition.name] = createDefaultNpcSave(definition);
        } else {
            gameSave.worldStatus.npcs[definition.name].catalogId = definition.id;
            gameSave.worldStatus.npcs[definition.name].role = definition.role;
        }
    });
    return gameSave;
}

function toShopItem(definition, unlockedIds) {
    const owned = unlockedIds.includes(definition.id);
    return {
        id: definition.id,
        name: definition.name,
        role: definition.role,
        title: definition.title,
        description: definition.description,
        price: definition.price,
        owned,
        ownedByDefault: Boolean(definition.ownedByDefault),
    };
}

module.exports = {
    NPC_CATALOG_VERSION,
    STARTER_NPC_ID,
    listNpcDefinitions,
    getNpcDefinitionById,
    getNpcDefinitionByName,
    getDefaultUnlockedNpcIds,
    normalizeUnlockedNpcIds,
    createDefaultNpcSave,
    ensureUnlockedNpcSaves,
    toShopItem,
};
