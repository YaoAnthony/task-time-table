const fs = require('fs');
const path = require('path');
const {
    STARTER_NPC_ID,
    listNpcDefinitions,
    getNpcDefinitionById,
    getNpcDefinitionByName,
} = require('../shared/gameNpcCatalog');

const NPC_SKILL_DIR = path.join(__dirname, '..', 'npc-skills');

const NPC_SKILL_REGISTRY = {
    '王村长': { type: 'file', path: 'wang-cunzhang.md' },
    '张雪峰': { type: 'package', path: 'zhang-xuefeng' },
};

function parseFrontmatter(content) {
    const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (!match) return { metadata: {}, body: content };

    const metadata = {};
    for (const line of match[1].split(/\r?\n/)) {
        const idx = line.indexOf(':');
        if (idx <= 0) continue;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        metadata[key] = value;
    }

    return {
        metadata,
        body: content.slice(match[0].length),
    };
}

function readJsonFile(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readTextFile(filePath) {
    return fs.readFileSync(filePath, 'utf8');
}

function resolveEntry(npcName) {
    const catalogEntry = getNpcDefinitionByName(npcName);
    if (catalogEntry?.skill) return catalogEntry.skill;
    return NPC_SKILL_REGISTRY[npcName] ?? getNpcDefinitionById(STARTER_NPC_ID)?.skill ?? { type: 'file', path: 'laoli.md' };
}

function normalizeMode(mode) {
    return String(mode || 'chat').trim() || 'chat';
}

function readSingleFileSkill(npcName, entry) {
    const filename = entry.path;
    const filePath = path.join(NPC_SKILL_DIR, filename);
    const content = readTextFile(filePath);
    const { metadata, body } = parseFrontmatter(content);
    return {
        npcName,
        slug: path.basename(filename, '.md'),
        filename,
        entryType: 'file',
        metadata,
        content,
        body,
        files: [{ path: filename, content, kind: 'entry' }],
    };
}

function uniqueFileList(files) {
    return [...new Set((files || []).filter(Boolean))];
}

function readPackageSkill(npcName, entry, mode = 'chat') {
    const packageDir = path.join(NPC_SKILL_DIR, entry.path);
    const manifestPath = path.join(packageDir, 'skill.json');
    const manifest = readJsonFile(manifestPath);
    const normalizedMode = normalizeMode(mode);
    const modeFiles = manifest.modes?.[normalizedMode]
        ?? manifest.modes?.chat
        ?? manifest.publicFiles
        ?? [manifest.entry || 'SKILL.md'];
    const filesToLoad = uniqueFileList(modeFiles);
    const files = filesToLoad.map((fileName) => {
        const content = readTextFile(path.join(packageDir, fileName));
        return {
            path: `${entry.path}/${fileName}`,
            content,
            kind: fileName === manifest.entry ? 'entry' : 'module',
        };
    });
    const content = files
        .map((file) => `# File: ${file.path}\n\n${file.content}`)
        .join('\n\n---\n\n');
    return {
        npcName,
        slug: entry.path,
        filename: manifest.entry || 'SKILL.md',
        entryType: 'package',
        mode: normalizedMode,
        metadata: {
            name: manifest.name || entry.path,
            version: manifest.version || '1.0.0',
            description: manifest.description || '',
            npc: manifest.npc || npcName,
            source: manifest.source || '',
            license: manifest.license || '',
            modules: filesToLoad.join(', '),
        },
        manifest,
        content,
        body: content,
        files,
    };
}

function readNpcSkill(npcName, mode = 'chat') {
    const entry = resolveEntry(npcName);
    if (entry.type === 'package') {
        return readPackageSkill(npcName, entry, mode);
    }
    return readSingleFileSkill(npcName, entry);
}

function getNpcSkillForPrompt(npcName, mode = 'chat') {
    const skill = readNpcSkill(npcName, mode);
    return {
        ...skill,
        prompt: [
            'NPC_PERSONA_SKILL is the only source of truth for this NPC personality, speech style, boundaries, and reply behavior.',
            'If any generic prompt conflicts with this skill, follow NPC_PERSONA_SKILL.',
            'Example sections, if present, are style calibration only. Never copy their wording, structure, facts, numbers, or answer templates.',
            'Current player message, recent conversation memory, world state, and inventory are higher priority than any example.',
            'For memory or recall questions, answer the remembered fact directly first, then add personality style briefly.',
            'Do not say you are reading or referencing a skill.',
            'This is an in-game fictional simulation. Do not claim to be the real-world person.',
            '',
            'NPC_PERSONA_SKILL:',
            skill.content,
        ].join('\n'),
    };
}

function listNpcSkills() {
    const names = [
        ...listNpcDefinitions().map((npc) => npc.name),
        ...Object.keys(NPC_SKILL_REGISTRY),
    ];
    return [...new Set(names)].map((npcName) => {
        const skill = readNpcSkill(npcName);
        return {
            npcName,
            slug: skill.slug,
            filename: skill.filename,
            entryType: skill.entryType,
            metadata: skill.metadata,
        };
    });
}

module.exports = {
    getNpcSkillForPrompt,
    listNpcSkills,
    readNpcSkill,
};
