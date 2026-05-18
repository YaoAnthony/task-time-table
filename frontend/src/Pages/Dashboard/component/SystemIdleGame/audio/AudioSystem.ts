import Phaser from 'phaser';
import { getAudioEntry, resolveAudioSourceUrl } from './AudioRegistry';
import type { AudioChannel, AudioMusicOptions, AudioPlayOptions } from './AudioTypes';

const DEFAULT_CHANNEL_VOLUME: Record<AudioChannel, number> = {
  master: 1,
  music: 0.85,
  ambience: 0.75,
  sfx: 1,
  ui: 0.9,
  dialogue: 0.85,
  vehicle: 0.9,
};

export class AudioSystem {
  private readonly channelVolumes = new Map<AudioChannel, number>();
  private readonly taggedSounds = new Map<string, Set<Phaser.Sound.BaseSound>>();
  private readonly pendingLoads = new Set<string>();
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private currentAmbience: Phaser.Sound.BaseSound | null = null;
  private muted = false;

  constructor(private readonly scene: Phaser.Scene) {
    for (const [channel, volume] of Object.entries(DEFAULT_CHANNEL_VOLUME) as Array<[AudioChannel, number]>) {
      this.channelVolumes.set(channel, volume);
    }
  }

  play(key: string, options: AudioPlayOptions = {}): Phaser.Sound.BaseSound | null {
    const entry = getAudioEntry(key);
    if (!entry || entry.enabled === false) {
      console.warn('[AudioSystem] unknown or disabled audio key', key);
      return null;
    }
    const cacheAfterEnsure = this.ensureLoaded(key);
    const locked = this.isLocked();
    if (!cacheAfterEnsure || locked) return null;

    const volume = this.resolveVolume(entry.channel, options.volume ?? entry.volume ?? 1);
    const sound = this.scene.sound.add(key, {
      volume,
      loop: options.loop ?? entry.loop ?? false,
      rate: options.rate ?? entry.rate ?? 1,
      detune: options.detune ?? 0,
    } as Phaser.Types.Sound.SoundConfig);

    const tag = options.tag ?? entry.tags?.[0];
    if (tag) this.trackTag(tag, sound);
    sound.once('complete', () => this.untrackSound(sound));
    sound.once('destroy', () => this.untrackSound(sound));
    sound.play();
    return sound;
  }

  resume(): void {
    const manager = this.scene.sound as any;
    manager.unlock?.();
    const resumeResult = manager.context?.resume?.();
    resumeResult?.catch?.(() => {});
  }

  isLocked(): boolean {
    const manager = this.scene.sound as any;
    const contextState = manager.context?.state;
    return Boolean(manager.locked) || contextState === 'suspended' || contextState === 'interrupted';
  }

  playSfx(key: string, options: AudioPlayOptions = {}): Phaser.Sound.BaseSound | null {
    return this.play(key, options);
  }

  playMusic(key: string, options: AudioMusicOptions = {}): Phaser.Sound.BaseSound | null {
    const next = this.play(key, { ...options, loop: options.loop ?? true, tag: options.tag ?? 'music' });
    if (!next) return null;
    const previous = this.currentMusic;
    this.currentMusic = next;
    if (previous && previous !== next) this.fadeOutAndStop(previous, options.fadeMs ?? 800);
    if (options.fadeMs && 'setVolume' in next) {
      const target = (next as any).volume ?? 1;
      (next as any).setVolume?.(0);
      this.scene.tweens.add({ targets: next as any, volume: target, duration: options.fadeMs });
    }
    return next;
  }

  playAmbience(key: string, options: AudioMusicOptions = {}): Phaser.Sound.BaseSound | null {
    const next = this.play(key, { ...options, loop: options.loop ?? true, tag: options.tag ?? 'ambience' });
    if (!next) return null;
    const previous = this.currentAmbience;
    this.currentAmbience = next;
    if (previous && previous !== next) this.fadeOutAndStop(previous, options.fadeMs ?? 800);
    return next;
  }

  stopByTag(tag: string, fadeMs = 0): void {
    const sounds = [...(this.taggedSounds.get(tag) ?? [])];
    for (const sound of sounds) {
      if (fadeMs > 0) this.fadeOutAndStop(sound, fadeMs);
      else sound.stop();
    }
    this.taggedSounds.delete(tag);
  }

  stopMusic(fadeMs = 600): void {
    if (!this.currentMusic) return;
    this.fadeOutAndStop(this.currentMusic, fadeMs);
    this.currentMusic = null;
  }

  setChannelVolume(channel: AudioChannel, volume: number): void {
    this.channelVolumes.set(channel, Phaser.Math.Clamp(volume, 0, 1));
    if (channel === 'master') this.scene.sound.setVolume(this.channelVolumes.get('master') ?? 1);
  }

  setMusicVolume(volume: number): void {
    this.setChannelVolume('music', volume);
  }

  setAudioVolume(volume: number): void {
    const next = Phaser.Math.Clamp(volume, 0, 1);
    for (const channel of ['ambience', 'sfx', 'ui', 'dialogue', 'vehicle'] as const) {
      this.setChannelVolume(channel, next);
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.scene.sound.setMute(muted);
  }

  updateListenerPosition(x: number, y: number): void {
    (this.scene.sound as any).setListenerPosition?.(x, y);
  }

  destroy(): void {
    for (const tag of [...this.taggedSounds.keys()]) this.stopByTag(tag);
    this.currentMusic?.stop();
    this.currentAmbience?.stop();
    this.taggedSounds.clear();
  }

  private resolveVolume(channel: AudioChannel, base: number): number {
    if (this.muted) return 0;
    return Phaser.Math.Clamp(
      base * (this.channelVolumes.get(channel) ?? 1) * (this.channelVolumes.get('master') ?? 1),
      0,
      1,
    );
  }

  private ensureLoaded(key: string): boolean {
    if (this.hasAudio(key)) return true;
    if (this.pendingLoads.has(key)) return false;
    const entry = getAudioEntry(key);
    if (!entry || entry.enabled === false) return false;
    const url = resolveAudioSourceUrl(entry.source);
    const loader = this.scene.load as any;
    const cleanup = () => {
      this.pendingLoads.delete(key);
      loader.off?.('loaderror', onLoadError);
    };
    const onLoadError = (file: any) => {
      if (file?.key !== key) return;
      cleanup();
      console.warn('[AudioSystem] failed to load audio', { key, url });
    };

    this.pendingLoads.add(key);
    loader.once?.(`filecomplete-audio-${key}`, cleanup);
    loader.once?.('complete', cleanup);
    loader.on?.('loaderror', onLoadError);
    this.scene.load.audio(key, url);
    if (!loader.isLoading?.()) {
      this.scene.load.start();
    }
    return false;
  }

  private hasAudio(key: string): boolean {
    return Boolean((this.scene.cache.audio as any).exists?.(key));
  }

  private trackTag(tag: string, sound: Phaser.Sound.BaseSound): void {
    const set = this.taggedSounds.get(tag) ?? new Set<Phaser.Sound.BaseSound>();
    set.add(sound);
    this.taggedSounds.set(tag, set);
  }

  private untrackSound(sound: Phaser.Sound.BaseSound): void {
    for (const [tag, sounds] of this.taggedSounds.entries()) {
      sounds.delete(sound);
      if (!sounds.size) this.taggedSounds.delete(tag);
    }
  }

  private fadeOutAndStop(sound: Phaser.Sound.BaseSound, durationMs: number): void {
    if (durationMs <= 0) {
      sound.stop();
      return;
    }
    this.scene.tweens.add({
      targets: sound as any,
      volume: 0,
      duration: durationMs,
      onComplete: () => sound.stop(),
    });
  }

}
