import type { AudioRegistryEntry, AudioSource } from './AudioTypes';

const SYSTEM_VILLAGE_MUSIC_PATH = '/audio/system/music_village_morning.wav';

/**
 * Central audio registry.
 *
 * Use source.kind='relative' for files in frontend/public, for example:
 *   { kind: 'relative', path: '/audio/system/music_village_morning.wav' }
 *
 * Use source.kind='url' for remote assets that are allowed to be streamed:
 *   { kind: 'url', url: 'https://example.com/audio/theme.mp3' }
 */
export const AUDIO_REGISTRY: Record<string, AudioRegistryEntry> = {
  'ui.confirm': {
    id: 'ui.confirm',
    label: 'UI confirm blip',
    channel: 'ui',
    source: { kind: 'relative', path: '/audio/system/ui_confirm.wav' },
    preload: true,
    volume: 0.32,
    tags: ['ui'],
  },
  'dialogue.npc_blip': {
    id: 'dialogue.npc_blip',
    label: 'NPC dialogue blip',
    channel: 'dialogue',
    source: { kind: 'relative', path: '/audio/system/dialogue_npc_blip.wav' },
    preload: true,
    volume: 0.24,
    tags: ['dialogue'],
  },
  'dialogue.player_blip': {
    id: 'dialogue.player_blip',
    label: 'Player dialogue blip',
    channel: 'dialogue',
    source: { kind: 'relative', path: '/audio/system/dialogue_player_blip.wav' },
    preload: true,
    volume: 0.22,
    tags: ['dialogue'],
  },
  'vehicle.bus_engine': {
    id: 'vehicle.bus_engine',
    label: 'Bus engine loop',
    channel: 'vehicle',
    source: { kind: 'relative', path: '/audio/system/bus_engine.wav' },
    preload: true,
    loop: true,
    volume: 0.34,
    tags: ['vehicle', 'bus'],
    license: 'Project generated placeholder',
    notes: 'Local file is used because Mixkit preview CDN blocks hotlinking with 403 in browser builds.',
  },
  'vehicle.bus_door': {
    id: 'vehicle.bus_door',
    label: 'Bus door placeholder',
    channel: 'vehicle',
    source: { kind: 'relative', path: '/audio/system/bus_door.wav' },
    preload: true,
    volume: 0.42,
    tags: ['vehicle', 'bus'],
  },
  'vehicle.bus_pass_by': {
    id: 'vehicle.bus_pass_by',
    label: 'Bus pass-by one-shot',
    channel: 'vehicle',
    source: { kind: 'relative', path: '/audio/system/bus_engine.wav' },
    preload: true,
    volume: 0.5,
    tags: ['vehicle', 'bus'],
    license: 'Project generated placeholder',
    notes: 'Local fallback for pass-by vehicle sound.',
  },
  'sfx.place_house': {
    id: 'sfx.place_house',
    label: 'House placement placeholder',
    channel: 'sfx',
    source: { kind: 'relative', path: '/audio/system/place_house.wav' },
    preload: true,
    volume: 0.42,
    tags: ['sfx', 'house'],
  },
  'sfx.open_chest': {
    id: 'sfx.open_chest',
    label: 'Open coin chest',
    channel: 'sfx',
    source: { kind: 'relative', path: '/audio/system/open_chest.wav' },
    preload: true,
    volume: 0.58,
    tags: ['sfx', 'chest', 'coins'],
  },
  'ambience.village_morning': {
    id: 'ambience.village_morning',
    label: 'Birds singing in garden',
    channel: 'ambience',
    source: { kind: 'relative', path: '/audio/system/village_morning.wav' },
    preload: true,
    loop: true,
    volume: 0.45,
    tags: ['ambience', 'village', 'farm', 'birds'],
    license: 'Project generated placeholder',
    notes: 'Local placeholder used so ambience playback does not depend on remote hotlinking.',
  },
  'ambience.farm_morning': {
    id: 'ambience.farm_morning',
    label: 'Birds singing in garden',
    channel: 'ambience',
    source: { kind: 'relative', path: '/audio/system/village_morning.wav' },
    preload: true,
    loop: true,
    volume: 0.45,
    tags: ['ambience', 'farm', 'birds'],
    license: 'Project generated placeholder',
    notes: 'Local placeholder used so ambience playback does not depend on remote hotlinking.',
  },
  'ambience.rain_light': {
    id: 'ambience.rain_light',
    label: 'Rain against the window',
    channel: 'ambience',
    source: { kind: 'relative', path: '/audio/system/rain_light.wav' },
    preload: true,
    loop: true,
    volume: 0.5,
    tags: ['ambience', 'rain', 'weather'],
    license: 'Project generated placeholder',
    notes: 'Weather ambience used while /weather rain is active.',
  },
  'music.village_morning': {
    id: 'music.village_morning',
    label: 'Village morning theme',
    channel: 'music',
    source: { kind: 'relative', path: SYSTEM_VILLAGE_MUSIC_PATH },
    preload: true,
    loop: true,
    volume: 0.62,
    tags: ['music', 'village', 'morning'],
    notes: 'Default village BGM. Replace /audio/system/music_village_morning.wav to swap it without code changes.',
  },
  'music.system_village_morning': {
    id: 'music.system_village_morning',
    label: 'System village morning',
    channel: 'music',
    source: { kind: 'relative', path: SYSTEM_VILLAGE_MUSIC_PATH },
    preload: true,
    loop: true,
    volume: 0.58,
    tags: ['music', 'village', 'fallback'],
    notes: 'Alias for music.village_morning.',
  },
  'music.celestial': {
    id: 'music.celestial',
    label: 'Legacy village music alias',
    channel: 'music',
    source: { kind: 'relative', path: SYSTEM_VILLAGE_MUSIC_PATH },
    preload: false,
    loop: true,
    volume: 0.56,
    tags: ['music', 'morning', 'calm'],
    notes: 'Legacy key kept for existing storyline data; it now uses the local system village BGM.',
  },
  'music.windless_slopes': {
    id: 'music.windless_slopes',
    label: 'Legacy village music alias',
    channel: 'music',
    source: { kind: 'relative', path: SYSTEM_VILLAGE_MUSIC_PATH },
    preload: false,
    loop: true,
    volume: 0.58,
    tags: ['music', 'day', 'village'],
    notes: 'Legacy key kept for existing storyline data; it now uses the local system village BGM.',
  },
  'music.red_carpet_wooden_floor': {
    id: 'music.red_carpet_wooden_floor',
    label: 'Legacy village music alias',
    channel: 'music',
    source: { kind: 'relative', path: SYSTEM_VILLAGE_MUSIC_PATH },
    preload: false,
    loop: true,
    volume: 0.55,
    tags: ['music', 'evening', 'cozy'],
    notes: 'Legacy key kept for existing storyline data; it now uses the local system village BGM.',
  },
  'music.nocturnal_mysteries': {
    id: 'music.nocturnal_mysteries',
    label: 'Legacy village music alias',
    channel: 'music',
    source: { kind: 'relative', path: SYSTEM_VILLAGE_MUSIC_PATH },
    preload: false,
    loop: true,
    volume: 0.5,
    tags: ['music', 'night'],
    notes: 'Legacy key kept for existing storyline data; it now uses the local system village BGM.',
  },
  'music.foggy_woods': {
    id: 'music.foggy_woods',
    label: 'Legacy village music alias',
    channel: 'music',
    source: { kind: 'relative', path: SYSTEM_VILLAGE_MUSIC_PATH },
    preload: false,
    loop: true,
    volume: 0.54,
    tags: ['music', 'rain', 'forest'],
    notes: 'Legacy key kept for existing storyline data; it now uses the local system village BGM.',
  },
  'music.the_arrival_battle': {
    id: 'music.the_arrival_battle',
    label: 'Legacy event music alias',
    channel: 'music',
    source: { kind: 'relative', path: SYSTEM_VILLAGE_MUSIC_PATH },
    preload: false,
    loop: true,
    volume: 0.58,
    tags: ['music', 'event', 'battle'],
    notes: 'Legacy key kept for existing storyline data; it now uses the local system village BGM.',
  },
};

export function listAudioRegistry(): AudioRegistryEntry[] {
  return Object.values(AUDIO_REGISTRY).map((entry) => ({ ...entry, source: { ...entry.source } }));
}

export function getAudioEntry(id: string | undefined | null): AudioRegistryEntry | null {
  if (!id) return null;
  return AUDIO_REGISTRY[id] ?? null;
}

export function listMusicAudioEntries(): AudioRegistryEntry[] {
  return listAudioRegistry().filter((entry) => entry.channel === 'music');
}

export function resolveAudioSourceUrl(source: AudioSource): string {
  return source.kind === 'relative' ? source.path : source.url;
}

export function getPreloadAudioEntries(): AudioRegistryEntry[] {
  return listAudioRegistry().filter((entry) => entry.enabled !== false && entry.preload !== false);
}
