# Idle Game Audio Architecture

## Registry First

All game audio must be declared in:

`frontend/src/Pages/Dashboard/component/SystemIdleGame/audio/AudioRegistry.ts`

Each entry has a stable key, channel, and source:

```ts
{
  id: 'music.village_morning',
  channel: 'music',
  source: { kind: 'relative', path: '/audio/music/village_morning.mp3' }
}
```

Use `source.kind = 'relative'` for files placed under `frontend/public`.
Use `source.kind = 'url'` for remote audio:

```ts
{
  id: 'music.remote_example',
  channel: 'music',
  source: { kind: 'url', url: 'https://example.com/audio/theme.mp3' },
  enabled: false
}
```

Do not put raw audio URLs inside storyline JSON. Storylines should reference
registered keys through audio skills.

## Runtime Layers

- `AudioSystem` is the only Phaser sound wrapper.
- `MusicDirector` chooses looping music and ambience from world/time context.
- `AudioEventMapper` maps existing game events to small UI, dialogue, and world sounds.
- Storyline JSON can call `audio.play_sfx`, `audio.play_music`, and `audio.stop_tag`.

## Channels

- `master`
- `music`
- `ambience`
- `sfx`
- `ui`
- `dialogue`
- `vehicle`

Settings UI should adjust channel volumes through `AudioSystem`, not individual
sounds.

## Asset Location

Prototype sounds currently live in:

`frontend/public/audio/system/`

These are generated placeholders. Replace them later with real `.mp3` or `.wav`
files and update only the registry paths.
