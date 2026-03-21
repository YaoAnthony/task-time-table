/**
 * DayCycle — ambient-light and time system for the idle/exploration game.
 *
 * Inspired by Josh Morony's day-night cycle tutorial:
 * https://www.joshmorony.com/how-to-create-a-day-night-cycle-in-phaser/
 *
 * Technique (matching the tutorial's "sprite tint" approach):
 *   · Named time-of-day keyframes hold an overlay colour + alpha and a sky colour
 *   · Every frame, the two surrounding keyframes are found and linearly interpolated
 *   · Result is applied as:
 *       1. A full-screen fixed rectangle tinted to the ambient colour (overlay)
 *       2. Camera background colour for sky / ground-clear tint
 *       3. Direct tinting of any registered world sprites (grass, objects …)
 *
 * Public API:
 *   gameTick          – real-seconds elapsed (saved to / loaded from server)
 *   update(dt)        – advance time + repaint; call every game frame
 *   getTimeStr()      – "HH:MM" current in-game time string
 *   getDayProgress()  – 0…1, fraction through the 24-hour cycle
 *   registerSprites() – optional: world sprites to receive ambient tinting
 */

import Phaser from 'phaser';
import { GAME_MINS_PER_SEC, MINS_PER_DAY } from '../constants';

// ─── Keyframe definition ──────────────────────────────────────────────────────
interface Keyframe {
  /** In-game minute (0–1440). */
  minute: number;
  /** Overlay RGB (tints the entire screen). */
  r: number; g: number; b: number;
  /** Overlay opacity: 0 = no effect, 1 = fully opaque. */
  alpha: number;
  /** Camera background / sky RGB. */
  bgR: number; bgG: number; bgB: number;
}

// ─── Time-of-day keyframes ────────────────────────────────────────────────────
// Values between entries are linearly interpolated every frame.
// Tuning guide:
//   · Adjust `alpha`   to control darkness depth
//   · Adjust `r/g/b`   to set the hue of the ambient light
//   · Adjust `bgR/G/B` to set the camera-clear / sky colour
const KEYFRAMES: Keyframe[] = [
  //  minute   R    G    B   α     bgR bgG bgB     time
  { minute:    0, r: 10, g: 10, b: 52, alpha: 0.68, bgR:  3, bgG:  6, bgB: 22 }, // 00:00 deep night
  { minute:  180, r:  8, g:  8, b: 44, alpha: 0.73, bgR:  2, bgG:  4, bgB: 18 }, // 03:00 darkest
  { minute:  300, r: 18, g: 12, b: 58, alpha: 0.62, bgR:  8, bgG:  8, bgB: 30 }, // 05:00 pre-dawn
  { minute:  330, r: 95, g: 40, b: 18, alpha: 0.46, bgR: 32, bgG: 18, bgB: 18 }, // 05:30 first light
  { minute:  360, r:245, g:112, b: 35, alpha: 0.26, bgR: 62, bgG: 30, bgB: 14 }, // 06:00 sunrise
  { minute:  420, r:255, g:198, b:112, alpha: 0.09, bgR: 32, bgG: 56, bgB: 18 }, // 07:00 early morning
  { minute:  480, r:  0, g:  0, b:  0, alpha: 0.00, bgR: 22, bgG: 56, bgB: 15 }, // 08:00 full daylight
  { minute:  600, r:  0, g:  0, b:  0, alpha: 0.00, bgR: 18, bgG: 52, bgB: 14 }, // 10:00 noon
  { minute: 1020, r:  0, g:  0, b:  0, alpha: 0.00, bgR: 18, bgG: 52, bgB: 14 }, // 17:00 afternoon
  { minute: 1050, r:245, g:152, b: 45, alpha: 0.13, bgR: 46, bgG: 44, bgB: 12 }, // 17:30 pre-sunset
  { minute: 1080, r:255, g: 88, b: 25, alpha: 0.32, bgR: 58, bgG: 28, bgB:  8 }, // 18:00 sunset
  { minute: 1110, r:185, g: 52, b: 92, alpha: 0.50, bgR: 32, bgG: 14, bgB: 28 }, // 18:30 dusk
  { minute: 1140, r: 92, g: 32, b:135, alpha: 0.60, bgR: 16, bgG: 10, bgB: 42 }, // 19:00 evening
  { minute: 1200, r: 28, g: 14, b: 80, alpha: 0.66, bgR:  6, bgG:  8, bgB: 32 }, // 20:00 night
  { minute: 1320, r: 10, g: 10, b: 52, alpha: 0.68, bgR:  3, bgG:  6, bgB: 22 }, // 22:00 deep night
  { minute: 1440, r: 10, g: 10, b: 52, alpha: 0.68, bgR:  3, bgG:  6, bgB: 22 }, // 24:00 ≡ 00:00
];

// ─── Linear interpolation helper ──────────────────────────────────────────────
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

// ─── Interpolate between the two keyframes surrounding a given minute ─────────
function interpolateKeyframes(minute: number): Keyframe {
  // Default: wrap correctly within the keyframe list
  let lo = KEYFRAMES[0];
  let hi = KEYFRAMES[KEYFRAMES.length - 1];

  for (let i = 0; i < KEYFRAMES.length - 1; i++) {
    if (minute >= KEYFRAMES[i].minute && minute < KEYFRAMES[i + 1].minute) {
      lo = KEYFRAMES[i];
      hi = KEYFRAMES[i + 1];
      break;
    }
  }

  const span = hi.minute - lo.minute;
  const t    = span > 0 ? (minute - lo.minute) / span : 0;

  return {
    minute,
    r:     Math.round(lerp(lo.r,     hi.r,     t)),
    g:     Math.round(lerp(lo.g,     hi.g,     t)),
    b:     Math.round(lerp(lo.b,     hi.b,     t)),
    alpha:              lerp(lo.alpha, hi.alpha, t),
    bgR:   Math.round(lerp(lo.bgR,   hi.bgR,   t)),
    bgG:   Math.round(lerp(lo.bgG,   hi.bgG,   t)),
    bgB:   Math.round(lerp(lo.bgB,   hi.bgB,   t)),
  };
}

// ─── DayCycle class ───────────────────────────────────────────────────────────
export class DayCycle {

  // ── Public state ─────────────────────────────────────────────────────────
  /** Real seconds elapsed since game-start (this value is persisted to the server). */
  gameTick = 0;

  // ── Private Phaser objects ────────────────────────────────────────────────
  private readonly overlay: Phaser.GameObjects.Rectangle;
  private readonly camera:  Phaser.Cameras.Scene2D.Camera;
  /** World sprites that should be tinted with the ambient light colour. */
  private readonly tinted: Phaser.GameObjects.GameObject[] = [];

  // ─────────────────────────────────────────────────────────────────────────
  constructor(scene: Phaser.Scene, initialTick = 0) {
    this.gameTick = initialTick;
    this.camera   = scene.cameras.main;

    // Full-screen ambient overlay — fixed to camera, always on top of world
    const { width, height } = scene.scale;
    this.overlay = scene.add
      .rectangle(0, 0, width * 4, height * 4, 0x000000, 0)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(9800);               // below speech bubbles (9998/9999)

    // Apply initial colour immediately so there is no single-frame white flash
    this._applyKeyframe(interpolateKeyframes(this._currentMinute()));
  }

  // ── Optional sprite registration ─────────────────────────────────────────
  /**
   * Register world-layer sprites (ground tiles, objects, etc.) to receive
   * direct ambient tinting — the tutorial's core technique.
   * Characters / UI elements should NOT be registered here.
   */
  registerSprites(sprites: Phaser.GameObjects.GameObject[]): void {
    this.tinted.push(...sprites);
  }

  // ── Per-frame update ──────────────────────────────────────────────────────
  /** Advance time by `dt` real seconds and repaint the ambient light. */
  update(dt: number): void {
    this.gameTick += dt;
    this._applyKeyframe(interpolateKeyframes(this._currentMinute()));
  }

  // ── Public getters ────────────────────────────────────────────────────────
  /** Returns the current in-game time as "HH:MM". */
  getTimeStr(): string {
    const totalMins = Math.floor(this.gameTick * GAME_MINS_PER_SEC) % MINS_PER_DAY;
    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Returns the fraction of the 24-hour cycle elapsed (0 = midnight, 0.5 = noon). */
  getDayProgress(): number {
    return this._currentMinute() / MINS_PER_DAY;
  }

  // ── Private helpers ───────────────────────────────────────────────────────
  private _currentMinute(): number {
    return (this.gameTick * GAME_MINS_PER_SEC) % MINS_PER_DAY;
  }

  private _applyKeyframe(kf: Keyframe): void {
    // 1. Screen-space overlay (colour + transparency)
    const overlayColor = Phaser.Display.Color.GetColor(kf.r, kf.g, kf.b);
    this.overlay.setFillStyle(overlayColor, kf.alpha);

    // 2. Camera background colour (visible in empty/black border areas)
    this.camera.setBackgroundColor(
      Phaser.Display.Color.GetColor(kf.bgR, kf.bgG, kf.bgB),
    );

    // 3. Registered world-sprite tinting (Josh Morony technique)
    if (this.tinted.length > 0) {
      const tintHex = kf.alpha < 0.02
        ? 0xffffff   // full daylight → no tint change
        : this._spriteTint(kf);
      for (const obj of this.tinted) {
        (obj as Phaser.GameObjects.Sprite).setTint(tintHex);
      }
    }
  }

  /**
   * Compute the ambient sprite-tint colour by blending from white (full day)
   * towards the overlay hue (night/dawn/dusk).  Keeps sprites readable.
   */
  private _spriteTint(kf: Keyframe): number {
    const t = Math.min(kf.alpha * 0.9, 1);
    return Phaser.Display.Color.GetColor(
      Math.round(lerp(255, kf.r, t)),
      Math.round(lerp(255, kf.g, t)),
      Math.round(lerp(255, kf.b, t)),
    );
  }
}
