import type { AudioSystem } from './AudioSystem';

export class MusicDirector {
  private activeMusicKey: string | null = null;
  private activeAmbienceKey: string | null = null;
  private manualMusicKey: string | null = null;
  private automaticMusicPaused = false;
  private lastUpdateMs = 0;

  constructor(
    private readonly audio: AudioSystem,
    private readonly getWorldId: () => string,
    private readonly getMinuteOfDay: () => number,
    private readonly getWeather: () => 'clear' | 'rain',
  ) {}

  update(timeMs: number): void {
    if (timeMs - this.lastUpdateMs < 2000) return;
    this.lastUpdateMs = timeMs;

    const musicKey = this.resolveMusicKey();
    if (musicKey && musicKey !== this.activeMusicKey) {
      const sound = this.audio.playMusic(musicKey, { fadeMs: 1200 });
      if (sound) this.activeMusicKey = musicKey;
    }

    const ambienceKey = this.resolveAmbienceKey();
    if (ambienceKey && ambienceKey !== this.activeAmbienceKey) {
      const sound = this.audio.playAmbience(ambienceKey, { fadeMs: 1000 });
      if (sound) this.activeAmbienceKey = ambienceKey;
    }
  }

  setMusic(key: string, fadeMs = 1000): void {
    this.manualMusicKey = key;
    this.automaticMusicPaused = false;
    const sound = this.audio.playMusic(key, { fadeMs });
    if (sound) this.activeMusicKey = key;
  }

  stopMusic(fadeMs = 800): void {
    this.manualMusicKey = null;
    this.automaticMusicPaused = true;
    this.activeMusicKey = null;
    this.audio.stopMusic(fadeMs);
  }

  useAutomaticMusic(fadeMs = 1000): void {
    this.manualMusicKey = null;
    this.automaticMusicPaused = false;
    this.activeMusicKey = null;
    this.audio.stopMusic(fadeMs);
    this.update(this.lastUpdateMs + 2001);
  }

  refresh(timeMs = 0): void {
    this.activeMusicKey = null;
    this.activeAmbienceKey = null;
    this.lastUpdateMs = 0;
    this.update(timeMs + 2001);
  }

  private resolveMusicKey(): string | null {
    if (this.automaticMusicPaused) return null;
    if (this.manualMusicKey) return this.manualMusicKey;

    const worldId = this.getWorldId();
    if (worldId === 'world:village') {
      return 'music.village_morning';
    }
    return null;
  }

  private resolveAmbienceKey(): string | null {
    const worldId = this.getWorldId();
    const minute = this.getMinuteOfDay();
    if (this.getWeather() === 'rain') {
      return 'ambience.rain_light';
    }
    if (worldId === 'world:village' && minute >= 360 && minute < 1140) {
      return 'ambience.village_morning';
    }
    return null;
  }
}
