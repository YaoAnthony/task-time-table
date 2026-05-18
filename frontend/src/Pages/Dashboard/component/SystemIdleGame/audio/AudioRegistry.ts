import type { AudioRegistryEntry, AudioSource } from './AudioTypes';

/**
 * Central audio registry.
 *
 * Use source.kind='relative' for files in frontend/public, for example:
 *   { kind: 'relative', path: '/audio/music/village_morning.mp3' }
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
    label: 'Brook ambience test loop',
    channel: 'music',
    source: { kind: 'relative', path: '/audio/system/music_village_morning.wav' },
    preload: true,
    loop: true,
    volume: 0.62,
    tags: ['music', 'village', 'test', 'brook'],
    license: 'Project generated placeholder',
    notes: 'Local placeholder assigned to the music channel. Replace with final farm BGM later.',
  },
};

export function listAudioRegistry(): AudioRegistryEntry[] {
  return Object.values(AUDIO_REGISTRY).map((entry) => ({ ...entry, source: { ...entry.source } }));
}

export function getAudioEntry(id: string | undefined | null): AudioRegistryEntry | null {
  if (!id) return null;
  return AUDIO_REGISTRY[id] ?? null;
}

export function resolveAudioSourceUrl(source: AudioSource): string {
  return source.kind === 'relative' ? source.path : source.url;
}

export function getPreloadAudioEntries(): AudioRegistryEntry[] {
  return listAudioRegistry().filter((entry) => entry.enabled !== false && entry.preload !== false);
}
