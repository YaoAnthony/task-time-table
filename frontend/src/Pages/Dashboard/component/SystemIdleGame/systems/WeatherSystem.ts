/**
 * WeatherSystem — manages weather state and visual effects.
 *
 * Based on the technique from Josh Morony's weather tutorial:
 *   https://www.joshmorony.com/how-to-add-weather-effects-in-phaser-games/
 *
 * Rain particles live in world space (no scrollFactor tricks),
 * spawned just above the world top and given enough lifespan to
 * cross the visible viewport at any camera position.
 *
 * Depth 9700 — above world objects, below the day/night overlay (9800).
 */

import Phaser from 'phaser';
import { WORLD_W } from '../constants';

export type WeatherType = 'clear' | 'rain';

// Spawn strip: y range above world top (world y=0)
const SPAWN_Y_MIN = -300;
const SPAWN_Y_MAX = -30;

// Rain particle color — from Josh Morony's tutorial
const RAIN_COLOR = 0x9cc9de;

export class WeatherSystem {
  private scene:       Phaser.Scene;
  private emitter:     Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private rainOverlay: Phaser.GameObjects.Rectangle | null = null;

  current: WeatherType = 'clear';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this._buildTexture();
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  setWeather(type: WeatherType): void {
    if (this.current === type) return;
    this.current = type;
    if (type === 'rain') this._startRain();
    else                  this._stopRain();
  }

  destroy(): void { this._stopRain(); }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Generate a 2×8 light-blue rectangle as the rain-drop particle texture.
   * Using `scene.add.graphics` (Phaser 3.88 compatible — no `make.graphics`).
   */
  private _buildTexture(): void {
    // Always rebuild — safe to call each time weather is first created in a session.
    if (this.scene.textures.exists('rain-drop')) {
      this.scene.textures.remove('rain-drop');
    }
    const g = this.scene.add.graphics();
    g.fillStyle(RAIN_COLOR, 1);
    g.fillRect(0, 0, 2, 8);
    g.generateTexture('rain-drop', 2, 8);
    g.destroy();
  }

  private _startRain(): void {
    this._stopRain();

    // ── Particle emitter (world-space) ──────────────────────────────────────
    // Spawns a strip of particles across the full world width, just above
    // the visible top edge, and lets them fall through the viewport.
    // ZOOM=2 means world pixels × 2 = screen pixels, so speedY 400-700
    // world-px/s → 800-1400 screen-px/s, which reads as fast rain.
    this.emitter = this.scene.add.particles(0, 0, 'rain-drop', {
      // Spawn zone: full world width, just above world top
      x:        { min: -50,            max: WORLD_W + 50 },
      y:        { min: SPAWN_Y_MIN,    max: SPAWN_Y_MAX  },

      // Falling velocity — slight rightward drift for wind effect
      speedY:   { min: 400, max: 700 },
      speedX:   { min: 20,  max: 50  },

      // Tilt the raindrop texture ~10° to match the drift direction
      rotate:   10,

      // Scale: particles look different sizes (depth illusion)
      scale:    { min: 0.5, max: 2.0 },

      // Lifespan long enough to cross the visible viewport
      //   at ZOOM=2, visible height ≈ canvas_h / 2 ≈ 300 world-px
      //   at speedY 400, crossing time = 300/400 = 750ms  →  lifespan >750
      lifespan: { min: 900, max: 1600 },

      // Continuous emission
      quantity:  4,
      frequency: 16,   // ms between emissions — ~250 bursts/s × 4 = 1000 drops/s

      // ADD blend gives a bright, luminous rain look (same as LIGHTEN but reliable)
      blendMode: Phaser.BlendModes.ADD,
      alpha:     { min: 0.4, max: 0.85 },
    });

    this.emitter.setDepth(9700);

    // ── Atmospheric overlay (screen-fixed) ─────────────────────────────────
    // A subtle dark-blue tint over the whole viewport during rain.
    // scrollFactor 0 → fixed to screen even as camera moves.
    const { width, height } = this.scene.scale;
    this.rainOverlay = this.scene.add
      .rectangle(0, 0, width * 4, height * 4, 0x112244, 0.12)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      .setDepth(9701);
  }

  private _stopRain(): void {
    this.emitter?.destroy();
    this.emitter = null;
    this.rainOverlay?.destroy();
    this.rainOverlay = null;
  }
}
