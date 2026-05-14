import Phaser from 'phaser';

const GLOW_TEXTURE = 'idle-game-light-glow';
const CORE_TEXTURE = 'idle-game-light-core';
const LIGHT_DEPTH = 9810;
const SHADOW_DEPTH = LIGHT_DEPTH + 24;
const DIRECTION_BUCKETS = 16;

export interface LightConfig {
  id: string;
  x: number;
  y: number;
  radius: number;
  color?: number;
  intensity?: number;
  flicker?: number;
  verticalScale?: number;
  coreScale?: number;
  depth?: number;
}

export interface LightOccluder {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strength?: number;
  softness?: number;
  maxAngularWidth?: number;
  isActive?: () => boolean;
}

export interface LightSilhouetteOccluder {
  id: string;
  x: number;
  y: number;
  textureKey: string | (() => string | null);
  originX?: number;
  originY?: number;
  scaleX?: number;
  scaleY?: number;
  strength?: number;
  shadowDistance?: number;
  shadowLayers?: number;
  depth?: number | (() => number);
  isActive?: () => boolean;
}

export interface LightResponsiveSprite {
  id: string;
  x: number;
  y: number;
  textureKey: string | (() => string | null);
  originX?: number;
  originY?: number;
  scaleX?: number;
  scaleY?: number;
  strength?: number;
  shadeStrength?: number;
  depth?: number | (() => number);
  isActive?: () => boolean;
}

interface ResolvedLightConfig {
  id: string;
  x: number;
  y: number;
  radius: number;
  color: number;
  intensity: number;
  flicker: number;
  verticalScale: number;
  coreScale: number;
  depth: number;
}

interface ManagedLight {
  config: ResolvedLightConfig;
  glow: Phaser.GameObjects.Image;
  core: Phaser.GameObjects.Image;
  seed: number;
  power: number;
}

interface ResolvedOccluder {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  strength: number;
  softness: number;
  maxAngularWidth: number;
  isActive?: () => boolean;
}

interface ResolvedSilhouetteOccluder {
  id: string;
  x: number;
  y: number;
  textureKey: string | (() => string | null);
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  strength: number;
  shadowDistance: number;
  shadowLayers: number;
  depth: number | (() => number);
  isActive?: () => boolean;
}

interface ResolvedResponsiveSprite {
  id: string;
  x: number;
  y: number;
  textureKey: string | (() => string | null);
  originX: number;
  originY: number;
  scaleX: number;
  scaleY: number;
  strength: number;
  shadeStrength: number;
  depth: number | (() => number);
  isActive?: () => boolean;
}

type MaskKind = 'highlight' | 'shade';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function stableSeed(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = ((value << 5) - value) + input.charCodeAt(i);
    value |= 0;
  }
  return Math.abs(value % 1000) / 1000;
}

function normalizeAngle(angle: number): number {
  let next = angle;
  while (next <= -Math.PI) next += Math.PI * 2;
  while (next > Math.PI) next -= Math.PI * 2;
  return next;
}

/**
 * Soft world-space lighting layered above DayCycle's night overlay.
 *
 * This is intentionally shader-free: it uses generated radial textures plus
 * additive blending, so it works with the existing Phaser/Vite setup and does
 * not require normal maps for every pixel-art asset.
 */
export class LightingSystem {
  private readonly staticLights = new Map<string, ManagedLight>();
  private readonly dynamicLights = new Map<string, ManagedLight>();
  private readonly occluders = new Map<string, ResolvedOccluder>();
  private readonly silhouetteOccluders = new Map<string, ResolvedSilhouetteOccluder>();
  private readonly responsiveSprites = new Map<string, ResolvedResponsiveSprite>();
  private readonly shadowGraphics: Phaser.GameObjects.Graphics;
  private readonly silhouetteShadowPool: Phaser.GameObjects.Image[] = [];
  private readonly highlightPool: Phaser.GameObjects.Image[] = [];
  private readonly shadePool: Phaser.GameObjects.Image[] = [];
  private readonly directionalMaskKeys = new Map<string, string>();
  private silhouetteShadowIndex = 0;
  private highlightIndex = 0;
  private shadeIndex = 0;
  private enabled = true;

  constructor(private readonly scene: Phaser.Scene) {
    this.ensureTextures();
    this.shadowGraphics = scene.add.graphics()
      .setDepth(SHADOW_DEPTH)
      .setBlendMode(Phaser.BlendModes.NORMAL);
  }

  upsertStaticLight(config: LightConfig): void {
    this.upsertLight(this.staticLights, config);
  }

  removeStaticLight(id: string): void {
    const light = this.staticLights.get(id);
    if (!light) return;
    this.destroyLight(light);
    this.staticLights.delete(id);
  }

  upsertOccluder(config: LightOccluder): void {
    this.occluders.set(config.id, {
      id: config.id,
      x: config.x,
      y: config.y,
      width: Math.max(1, config.width),
      height: Math.max(1, config.height),
      strength: config.strength ?? 0.72,
      softness: config.softness ?? 0.16,
      maxAngularWidth: config.maxAngularWidth ?? Math.PI * 0.32,
      isActive: config.isActive,
    });
  }

  removeOccluder(id: string): void {
    this.occluders.delete(id);
  }

  upsertSilhouetteOccluder(config: LightSilhouetteOccluder): void {
    this.silhouetteOccluders.set(config.id, {
      id: config.id,
      x: config.x,
      y: config.y,
      textureKey: config.textureKey,
      originX: config.originX ?? 0.5,
      originY: config.originY ?? 1,
      scaleX: config.scaleX ?? 1,
      scaleY: config.scaleY ?? 1,
      strength: config.strength ?? 0.56,
      shadowDistance: config.shadowDistance ?? 92,
      shadowLayers: config.shadowLayers ?? 5,
      depth: config.depth ?? (() => config.y + 4),
      isActive: config.isActive,
    });
  }

  removeSilhouetteOccluder(id: string): void {
    this.silhouetteOccluders.delete(id);
  }

  upsertResponsiveSprite(config: LightResponsiveSprite): void {
    this.responsiveSprites.set(config.id, {
      id: config.id,
      x: config.x,
      y: config.y,
      textureKey: config.textureKey,
      originX: config.originX ?? 0.5,
      originY: config.originY ?? 1,
      scaleX: config.scaleX ?? 1,
      scaleY: config.scaleY ?? 1,
      strength: config.strength ?? 0.36,
      shadeStrength: config.shadeStrength ?? 0.2,
      depth: config.depth ?? (() => config.y + 112),
      isActive: config.isActive,
    });
  }

  removeResponsiveSprite(id: string): void {
    this.responsiveSprites.delete(id);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) this.hideLightingArtifacts();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  update(timeMs: number, minuteOfDay: number, dynamicConfigs: LightConfig[]): void {
    const activeDynamicIds = new Set<string>();

    for (const config of dynamicConfigs) {
      activeDynamicIds.add(config.id);
      this.upsertLight(this.dynamicLights, config);
    }

    for (const [id, light] of this.dynamicLights) {
      if (activeDynamicIds.has(id)) continue;
      this.destroyLight(light);
      this.dynamicLights.delete(id);
    }

    if (!this.enabled) {
      this.hideLightingArtifacts();
      return;
    }

    const nightStrength = this.getNightStrength(minuteOfDay);
    for (const light of this.staticLights.values()) {
      this.applyLight(light, timeMs, nightStrength);
    }
    for (const light of this.dynamicLights.values()) {
      this.applyLight(light, timeMs, nightStrength);
    }

    this.drawOcclusionShadows(nightStrength);
  }

  private hideLightingArtifacts(): void {
    this.shadowGraphics.clear();
    this.silhouetteShadowIndex = 0;
    this.highlightIndex = 0;
    this.shadeIndex = 0;
    for (const light of this.staticLights.values()) {
      light.power = 0;
      light.glow.setVisible(false);
      light.core.setVisible(false);
    }
    for (const light of this.dynamicLights.values()) {
      light.power = 0;
      light.glow.setVisible(false);
      light.core.setVisible(false);
    }
    this.hideUnusedSilhouetteShadows();
    this.hideUnusedResponsiveSprites();
  }

  private upsertLight(target: Map<string, ManagedLight>, config: LightConfig): void {
    const resolved = this.resolveConfig(config);
    const existing = target.get(resolved.id);
    if (existing) {
      existing.config = resolved;
      return;
    }

    const glow = this.scene.add.image(resolved.x, resolved.y, GLOW_TEXTURE)
      .setOrigin(0.5)
      .setDepth(resolved.depth)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(resolved.color)
      .setAlpha(0)
      .setVisible(false);

    const core = this.scene.add.image(resolved.x, resolved.y, CORE_TEXTURE)
      .setOrigin(0.5)
      .setDepth(resolved.depth + 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTint(resolved.color)
      .setAlpha(0)
      .setVisible(false);

    target.set(resolved.id, {
      config: resolved,
      glow,
      core,
      seed: stableSeed(resolved.id),
      power: 0,
    });
  }

  private applyLight(light: ManagedLight, timeMs: number, nightStrength: number): void {
    const { config, seed } = light;
    const slowPulse = Math.sin(timeMs * 0.0014 + seed * 12.9) * 0.035;
    const flameWave = Math.sin(timeMs * 0.0075 + seed * 30.1) * 0.55
      + Math.sin(timeMs * 0.012 + seed * 17.3) * 0.25;
    const flicker = 1 + config.flicker * flameWave;
    const power = clamp01(nightStrength * config.intensity * flicker);
    const visible = power > 0.012;

    light.glow.setVisible(visible);
    light.core.setVisible(visible);
    light.power = visible ? power : 0;
    if (!visible) return;

    const size = config.radius * 2 * (1 + slowPulse);
    light.glow
      .setPosition(config.x, config.y)
      .setDisplaySize(size, size * config.verticalScale)
      .setTint(config.color)
      .setAlpha(power * 0.62);

    const coreSize = config.radius * config.coreScale * (1 + slowPulse * 0.5);
    light.core
      .setPosition(config.x, config.y)
      .setDisplaySize(coreSize, coreSize * config.verticalScale)
      .setTint(config.color)
      .setAlpha(power * 0.28);
  }

  private resolveConfig(config: LightConfig): ResolvedLightConfig {
    return {
      id: config.id,
      x: config.x,
      y: config.y,
      radius: config.radius,
      color: config.color ?? 0xffd28a,
      intensity: config.intensity ?? 0.8,
      flicker: config.flicker ?? 0.05,
      verticalScale: config.verticalScale ?? 0.72,
      coreScale: config.coreScale ?? 0.82,
      depth: config.depth ?? LIGHT_DEPTH,
    };
  }

  private getNightStrength(minute: number): number {
    const dusk = smoothstep(1020, 1215, minute);
    const dawn = 1 - smoothstep(300, 450, minute);
    if (minute >= 1215 || minute < 300) return 1;
    if (minute >= 1020) return dusk;
    if (minute < 450) return dawn;
    return 0;
  }

  private drawOcclusionShadows(nightStrength: number): void {
    this.shadowGraphics.clear();
    this.silhouetteShadowIndex = 0;
    this.highlightIndex = 0;
    this.shadeIndex = 0;
    if (nightStrength <= 0.01) {
      this.hideUnusedSilhouetteShadows();
      this.hideUnusedResponsiveSprites();
      return;
    }

    const allLights = [...this.staticLights.values(), ...this.dynamicLights.values()];
    for (const light of allLights) {
      if (light.power <= 0.012) continue;
      for (const occluder of this.occluders.values()) {
        if (occluder.isActive && !occluder.isActive()) continue;
        this.drawOccluderShadow(light, occluder, nightStrength);
      }
    }

    this.drawSilhouetteShadows(allLights, nightStrength);
    this.drawResponsiveSpriteLighting(allLights, nightStrength);
    this.hideUnusedSilhouetteShadows();
    this.hideUnusedResponsiveSprites();
  }

  private drawOccluderShadow(
    light: ManagedLight,
    occluder: ResolvedOccluder,
    nightStrength: number,
  ): void {
    const { config } = light;
    const dx = occluder.x - config.x;
    const dy = occluder.y - config.y;
    const halfW = occluder.width / 2;
    const halfH = occluder.height / 2;
    const diagonal = Math.sqrt(halfW * halfW + halfH * halfH);
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 10 || dist > config.radius + diagonal) return;
    if (
      config.x > occluder.x - halfW &&
      config.x < occluder.x + halfW &&
      config.y > occluder.y - halfH &&
      config.y < occluder.y + halfH
    ) {
      return;
    }

    const corners = [
      { x: occluder.x - halfW, y: occluder.y - halfH },
      { x: occluder.x + halfW, y: occluder.y - halfH },
      { x: occluder.x + halfW, y: occluder.y + halfH },
      { x: occluder.x - halfW, y: occluder.y + halfH },
    ];
    const centerAngle = Math.atan2(dy, dx);

    let minDelta = Infinity;
    let maxDelta = -Infinity;
    let minCorner = corners[0];
    let maxCorner = corners[0];

    for (const corner of corners) {
      const delta = normalizeAngle(Math.atan2(corner.y - config.y, corner.x - config.x) - centerAngle);
      if (delta < minDelta) {
        minDelta = delta;
        minCorner = corner;
      }
      if (delta > maxDelta) {
        maxDelta = delta;
        maxCorner = corner;
      }
    }

    const angularWidth = maxDelta - minDelta;
    if (angularWidth <= 0.005 || angularWidth > occluder.maxAngularWidth) return;

    const reach = Math.min(config.radius * 0.88, dist + diagonal * 1.4);
    const minAngle = centerAngle + minDelta;
    const maxAngle = centerAngle + maxDelta;
    const falloff = 1 - clamp01((dist - diagonal * 0.35) / config.radius);
    const shadowAlpha = clamp01(light.power * occluder.strength * nightStrength * falloff);
    if (shadowAlpha <= 0.01) return;

    this.fillShadowWedge(minCorner, maxCorner, minAngle, maxAngle, reach, shadowAlpha);

    const edgeSoftness = Math.min(occluder.softness, angularWidth * 0.8);
    this.fillShadowWedge(
      minCorner,
      minCorner,
      minAngle - edgeSoftness,
      minAngle,
      reach,
      shadowAlpha * 0.32,
    );
    this.fillShadowWedge(
      maxCorner,
      maxCorner,
      maxAngle,
      maxAngle + edgeSoftness,
      reach,
      shadowAlpha * 0.32,
    );
  }

  private fillShadowWedge(
    startCorner: { x: number; y: number },
    endCorner: { x: number; y: number },
    startAngle: number,
    endAngle: number,
    reach: number,
    alpha: number,
  ): void {
    const startFar = {
      x: startCorner.x + Math.cos(startAngle) * reach,
      y: startCorner.y + Math.sin(startAngle) * reach,
    };
    const endFar = {
      x: endCorner.x + Math.cos(endAngle) * reach,
      y: endCorner.y + Math.sin(endAngle) * reach,
    };

    this.shadowGraphics.fillStyle(0x020716, alpha);
    this.shadowGraphics.beginPath();
    this.shadowGraphics.moveTo(startCorner.x, startCorner.y);
    this.shadowGraphics.lineTo(startFar.x, startFar.y);
    this.shadowGraphics.lineTo(endFar.x, endFar.y);
    this.shadowGraphics.lineTo(endCorner.x, endCorner.y);
    this.shadowGraphics.closePath();
    this.shadowGraphics.fillPath();
  }

  private drawSilhouetteShadows(allLights: ManagedLight[], nightStrength: number): void {
    for (const occluder of this.silhouetteOccluders.values()) {
      if (occluder.isActive && !occluder.isActive()) continue;
      const textureKey = this.resolveTextureKey(occluder.textureKey);
      if (!textureKey || !this.scene.textures.exists(textureKey)) continue;

      const frame = this.scene.textures.getFrame(textureKey);
      if (!frame) continue;

      const approxRadius = Math.max(
        frame.width * occluder.scaleX,
        frame.height * occluder.scaleY,
      ) * 0.55;
      let best: { light: ManagedLight; falloff: number; dist: number } | null = null;

      for (const light of allLights) {
        if (light.power <= 0.012) continue;
        const dx = occluder.x - light.config.x;
        const dy = occluder.y - light.config.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 10 || dist > light.config.radius + approxRadius) continue;
        const falloff = 1 - clamp01((dist - approxRadius * 0.45) / light.config.radius);
        if (falloff <= 0) continue;
        if (!best || falloff * light.power > best.falloff * best.light.power) {
          best = { light, falloff, dist };
        }
      }

      if (!best) continue;
      this.drawSilhouetteShadow(best.light, occluder, textureKey, best.falloff, best.dist, nightStrength);
    }
  }

  private drawSilhouetteShadow(
    light: ManagedLight,
    occluder: ResolvedSilhouetteOccluder,
    textureKey: string,
    falloff: number,
    dist: number,
    nightStrength: number,
  ): void {
    const dx = occluder.x - light.config.x;
    const dy = occluder.y - light.config.y;
    const baseAlpha = clamp01(light.power * nightStrength * occluder.strength * falloff);
    if (baseAlpha <= 0.012) return;

    const dirX = dx / dist;
    const dirY = dy / dist;
    const lateral = Math.abs(dirX);
    const desiredLength = occluder.shadowDistance * (0.85 + falloff * 1.28);
    const frame = this.scene.textures.getFrame(textureKey);
    const frameHeight = Math.max(1, frame?.height ?? 64);
    const stretch = Phaser.Math.Clamp(desiredLength / frameHeight, 0.72, 2.2);
    const width = 0.74 + lateral * 0.1;
    const rotation = Math.atan2(dirX, -dirY);
    const shadow = this.nextSilhouetteShadow(textureKey);

    shadow
      .setTexture(textureKey)
      .setOrigin(occluder.originX, occluder.originY)
      .setPosition(occluder.x, occluder.y)
      .setDepth(this.resolveDepth(occluder.depth))
      .setScale(occluder.scaleX * width, occluder.scaleY * stretch)
      .setRotation(rotation)
      .setTint(0x020716)
      .setAlpha(baseAlpha * 0.52)
      .setVisible(true);
  }

  private drawResponsiveSpriteLighting(allLights: ManagedLight[], nightStrength: number): void {
    for (const sprite of this.responsiveSprites.values()) {
      if (sprite.isActive && !sprite.isActive()) continue;
      const textureKey = this.resolveTextureKey(sprite.textureKey);
      if (!textureKey || !this.scene.textures.exists(textureKey)) continue;

      const frame = this.scene.textures.getFrame(textureKey);
      if (!frame) continue;

      let best: { light: ManagedLight; falloff: number; dist: number } | null = null;
      const approxRadius = Math.max(frame.width * sprite.scaleX, frame.height * sprite.scaleY) * 0.55;

      for (const light of allLights) {
        if (light.power <= 0.012) continue;
        const dx = light.config.x - sprite.x;
        const dy = light.config.y - sprite.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const falloff = 1 - clamp01((dist - approxRadius * 0.35) / light.config.radius);
        if (falloff <= 0) continue;
        if (!best || falloff * light.power > best.falloff * best.light.power) {
          best = { light, falloff, dist };
        }
      }

      if (!best || best.dist < 8) continue;

      const toLightX = (best.light.config.x - sprite.x) / best.dist;
      const toLightY = (best.light.config.y - sprite.y) / best.dist;
      const bucket = this.getDirectionBucket(toLightX, toLightY);
      const power = clamp01(best.light.power * best.falloff * nightStrength);
      const warmAlpha = power * sprite.strength;
      const shadeAlpha = power * sprite.shadeStrength;
      const depth = this.resolveDepth(sprite.depth);

      if (shadeAlpha > 0.01) {
        const shadeTexture = this.getDirectionalMaskTexture(textureKey, bucket, 'shade');
        if (shadeTexture) {
          const shade = this.nextShadeSprite(shadeTexture);
          shade
            .setTexture(shadeTexture)
            .setOrigin(sprite.originX, sprite.originY)
            .setPosition(sprite.x, sprite.y)
            .setDepth(depth)
            .setScale(sprite.scaleX, sprite.scaleY)
            .setRotation(0)
            .setTint(0x07101d)
            .setAlpha(shadeAlpha)
            .setVisible(true);
        }
      }

      if (warmAlpha > 0.01) {
        const highlightTexture = this.getDirectionalMaskTexture(textureKey, bucket, 'highlight');
        if (highlightTexture) {
          const highlight = this.nextHighlightSprite(highlightTexture);
          highlight
            .setTexture(highlightTexture)
            .setOrigin(sprite.originX, sprite.originY)
            .setPosition(sprite.x, sprite.y)
            .setDepth(depth + 1)
            .setScale(sprite.scaleX, sprite.scaleY)
            .setRotation(0)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(best.light.config.color)
            .setAlpha(warmAlpha)
            .setVisible(true);
        }
      }
    }
  }

  private resolveTextureKey(textureKey: string | (() => string | null)): string | null {
    return typeof textureKey === 'function' ? textureKey() : textureKey;
  }

  private resolveDepth(depth: number | (() => number)): number {
    return typeof depth === 'function' ? depth() : depth;
  }

  private getDirectionBucket(dirX: number, dirY: number): number {
    const angle = Math.atan2(dirY, dirX);
    const normalized = (angle + Math.PI * 2) % (Math.PI * 2);
    return Math.round(normalized / (Math.PI * 2) * DIRECTION_BUCKETS) % DIRECTION_BUCKETS;
  }

  private getDirectionalMaskTexture(textureKey: string, bucket: number, kind: MaskKind): string | null {
    const cacheKey = `${textureKey}:${bucket}:${kind}`;
    const existing = this.directionalMaskKeys.get(cacheKey);
    if (existing && this.scene.textures.exists(existing)) return existing;

    const maskKey = `idle-game-${kind}-mask-${textureKey.replace(/[^a-z0-9_-]/gi, '-')}-${bucket}`;
    if (!this.scene.textures.exists(maskKey)) {
      const mask = this.createDirectionalMask(textureKey, bucket, kind);
      if (!mask) return null;
      this.scene.textures.addCanvas(maskKey, mask);
    }

    this.directionalMaskKeys.set(cacheKey, maskKey);
    return maskKey;
  }

  private createDirectionalMask(textureKey: string, bucket: number, kind: MaskKind): HTMLCanvasElement | null {
    const texture = this.scene.textures.get(textureKey);
    const source = texture?.getSourceImage() as CanvasImageSource | undefined;
    const frame = this.scene.textures.getFrame(textureKey);
    if (!source || !frame) return null;

    const width = frame.width;
    const height = frame.height;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(source, frame.cutX, frame.cutY, width, height, 0, 0, width, height);

    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    const angle = bucket / DIRECTION_BUCKETS * Math.PI * 2;
    const dirX = Math.cos(angle);
    const dirY = Math.sin(angle);

    for (let y = 0; y < height; y += 1) {
      const yNorm = height <= 1 ? 0 : y / (height - 1);
      const verticalBias = (0.5 - yNorm) * -dirY * 0.62;
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const alpha = data[offset + 3];
        if (alpha === 0) continue;

        const xNorm = width <= 1 ? 0 : x / (width - 1);
        const horizontalBias = (xNorm - 0.5) * dirX * 1.28;
        const lit = clamp01(0.5 + horizontalBias + verticalBias);
        const mask = kind === 'highlight'
          ? smoothstep(0.52, 0.9, lit)
          : smoothstep(0.5, 0.88, 1 - lit);

        data[offset] = 255;
        data[offset + 1] = 255;
        data[offset + 2] = 255;
        data[offset + 3] = Math.round(alpha * mask);
      }
    }

    ctx.putImageData(image, 0, 0);
    return canvas;
  }

  private nextSilhouetteShadow(textureKey: string): Phaser.GameObjects.Image {
    let image = this.silhouetteShadowPool[this.silhouetteShadowIndex];
    if (!image) {
      image = this.scene.add.image(0, 0, textureKey)
        .setDepth(SHADOW_DEPTH + 1)
        .setBlendMode(Phaser.BlendModes.NORMAL)
        .setVisible(false);
      this.silhouetteShadowPool.push(image);
    }
    this.silhouetteShadowIndex += 1;
    return image;
  }

  private nextHighlightSprite(textureKey: string): Phaser.GameObjects.Image {
    let image = this.highlightPool[this.highlightIndex];
    if (!image) {
      image = this.scene.add.image(0, 0, textureKey)
        .setDepth(SHADOW_DEPTH + 12)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false);
      this.highlightPool.push(image);
    }
    this.highlightIndex += 1;
    return image;
  }

  private nextShadeSprite(textureKey: string): Phaser.GameObjects.Image {
    let image = this.shadePool[this.shadeIndex];
    if (!image) {
      image = this.scene.add.image(0, 0, textureKey)
        .setDepth(SHADOW_DEPTH + 10)
        .setBlendMode(Phaser.BlendModes.NORMAL)
        .setVisible(false);
      this.shadePool.push(image);
    }
    this.shadeIndex += 1;
    return image;
  }

  private hideUnusedSilhouetteShadows(): void {
    for (let i = this.silhouetteShadowIndex; i < this.silhouetteShadowPool.length; i += 1) {
      this.silhouetteShadowPool[i].setVisible(false);
    }
  }

  private hideUnusedResponsiveSprites(): void {
    for (let i = this.highlightIndex; i < this.highlightPool.length; i += 1) {
      this.highlightPool[i].setVisible(false);
    }
    for (let i = this.shadeIndex; i < this.shadePool.length; i += 1) {
      this.shadePool[i].setVisible(false);
    }
  }

  private destroyLight(light: ManagedLight): void {
    light.glow.destroy();
    light.core.destroy();
  }

  private ensureTextures(): void {
    if (!this.scene.textures.exists(GLOW_TEXTURE)) {
      this.scene.textures.addCanvas(GLOW_TEXTURE, this.createRadialTexture([
        [0.0, 0.88],
        [0.18, 0.55],
        [0.42, 0.28],
        [0.72, 0.08],
        [1.0, 0],
      ]));
    }

    if (!this.scene.textures.exists(CORE_TEXTURE)) {
      this.scene.textures.addCanvas(CORE_TEXTURE, this.createRadialTexture([
        [0.0, 0.95],
        [0.22, 0.52],
        [0.55, 0.12],
        [1.0, 0],
      ]));
    }
  }

  private createRadialTexture(stops: Array<[number, number]>): HTMLCanvasElement {
    const size = 192;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;

    const ctx = canvas.getContext('2d')!;
    const center = size / 2;
    const gradient = ctx.createRadialGradient(center, center, 0, center, center, center);

    for (const [offset, alpha] of stops) {
      gradient.addColorStop(offset, `rgba(255,255,255,${alpha})`);
    }

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    return canvas;
  }
}
