import type { GameChest } from '../../../../../Types/Profile';
import type { Bed } from '../entities/Bed';
import type { NestView } from '../entities/NestView';
import type { TreeView } from '../entities/TreeView';
import type { LightConfig } from '../systems/LightingSystem';
import { VILLAGE_LAYOUT } from '../world/layouts/villageLayout';

export function registerDefaultLighting(scene: any) : void {
    const tile = 32;
    const addHouseOccluder = (
      id: string,
      house: { x: number; y: number; rows: number; cols: number },
    ) => {
      scene.lightingSystem.upsertOccluder({
        id: `wall:${id}`,
        x: house.x + house.cols * tile / 2,
        y: house.y + house.rows * tile / 2,
        width: house.cols * tile,
        height: house.rows * tile,
        strength: 0.38,
        softness: 0.12,
        maxAngularWidth: Math.PI * 0.2,
      });
    };
    const addHouseLights = (
      id: string,
      house: { x: number; y: number; rows: number; cols: number; doorCol: number; chimneys?: readonly number[] },
      color: number,
      intensity: number,
    ) => {
      const doorX = house.x + house.doorCol * tile + tile / 2;
      const doorY = house.y + (house.rows - 1) * tile + tile / 2;
      scene.lightingSystem.upsertStaticLight({
        id: `${id}:door`,
        x: doorX,
        y: doorY + 10,
        radius: house.cols > 10 ? 245 : 210,
        color,
        intensity,
        flicker: 0.06,
        verticalScale: 0.62,
      });

      scene.lightingSystem.upsertStaticLight({
        id: `${id}:window`,
        x: house.x + Math.round(house.cols * 0.68) * tile,
        y: house.y + Math.round(house.rows * 0.52) * tile,
        radius: house.cols > 10 ? 150 : 120,
        color,
        intensity: intensity * 0.55,
        flicker: 0.04,
        verticalScale: 0.7,
      });

      for (const chimneyCol of house.chimneys ?? []) {
        scene.lightingSystem.upsertStaticLight({
          id: `${id}:chimney:${chimneyCol}`,
          x: house.x + chimneyCol * tile + tile / 2,
          y: house.y + tile,
          radius: 110,
          color: 0xff9f66,
          intensity: 0.32,
          flicker: 0.12,
          verticalScale: 0.75,
          coreScale: 0.55,
        });
      }
    };

    addHouseOccluder('player-house', VILLAGE_LAYOUT.playerHouse);
    addHouseOccluder('mayor-house', VILLAGE_LAYOUT.mayorHouse);

    addHouseLights('player-house', VILLAGE_LAYOUT.playerHouse, 0xffc46f, 0.95);
    addHouseLights('mayor-house', VILLAGE_LAYOUT.mayorHouse, 0xffd895, 0.88);

    const nestCenter = VILLAGE_LAYOUT.nests.reduce(
      (acc, [x, y]) => ({ x: acc.x + x, y: acc.y + y }),
      { x: 0, y: 0 },
    );
    nestCenter.x /= VILLAGE_LAYOUT.nests.length;
    nestCenter.y /= VILLAGE_LAYOUT.nests.length;
    scene.lightingSystem.upsertStaticLight({
      id: 'chicken-yard:lantern',
      x: nestCenter.x + 18,
      y: nestCenter.y + 22,
      radius: 180,
      color: 0xffb25a,
      intensity: 0.62,
      flicker: 0.1,
      verticalScale: 0.58,
      coreScale: 0.72,
    });

    const pond = VILLAGE_LAYOUT.pond;
    scene.lightingSystem.upsertStaticLight({
      id: 'pond:moon-glint',
      x: pond.x + pond.cols * tile * 0.5,
      y: pond.y + pond.rows * tile * 0.5,
      radius: 220,
      color: 0x84bfff,
      intensity: 0.36,
      flicker: 0.015,
      verticalScale: 0.45,
      coreScale: 0.45,
    });

    scene.lightingSystem.upsertStaticLight({
      id: 'player-house:tool-shelf',
      x: 304,
      y: 218,
      radius: 105,
      color: 0xffdfa6,
      intensity: 0.48,
      flicker: 0.04,
      verticalScale: 0.75,
    });
  
}

export function getDynamicLightConfigs(scene: any) : LightConfig[] {
    const lights: LightConfig[] = [];

    if (scene.player?.sprite) {
      lights.push({
        id: 'player:lantern',
        x: scene.player.sprite.x,
        y: scene.player.sprite.y + 18,
        radius: 165,
        color: 0xffe2a3,
        intensity: 0.82,
        flicker: 0.035,
        verticalScale: 0.82,
        coreScale: 0.62,
      });
    }

    scene.allNpcs().forEach((npc: any, index: number) => {
      if (!npc?.sprite) return;
      lights.push({
        id: `npc:${npc.name}`,
        x: npc.sprite.x,
        y: npc.sprite.y + 16,
        radius: 105,
        color: index % 2 === 0 ? 0xbcecff : 0xd7ffc2,
        intensity: 0.34,
        flicker: 0.018,
        verticalScale: 0.78,
        coreScale: 0.55,
      });
    });

    if (scene.remotePlayer?.sprite) {
      lights.push({
        id: 'remote-player:lantern',
        x: scene.remotePlayer.sprite.x,
        y: scene.remotePlayer.sprite.y + 18,
        radius: 135,
        color: 0x9fc7ff,
        intensity: 0.48,
        flicker: 0.025,
        verticalScale: 0.8,
        coreScale: 0.58,
      });
    }

    return lights;
  
}

export function registerBedLight(scene: any, bed: Bed, id: string) : void {
    const color =
      bed.color === 'blue' ? 0x9ec8ff :
      bed.color === 'green' ? 0xafffc5 :
      0xffa9d2;
    scene.lightingSystem?.upsertStaticLight({
      id: `bed:${id}`,
      x: bed.worldX,
      y: bed.worldY + 4,
      radius: 95,
      color,
      intensity: 0.32,
      flicker: 0.025,
      verticalScale: 0.72,
      coreScale: 0.52,
    });
  
}

export function registerNestLight(scene: any, nest: NestView) : void {
    scene.lightingSystem?.upsertStaticLight({
      id: `nest:${nest.id}`,
      x: nest.x,
      y: nest.y + 6,
      radius: 78,
      color: 0xffcc78,
      intensity: 0.28,
      flicker: 0.07,
      verticalScale: 0.58,
      coreScale: 0.5,
    });
  
}

export function refreshNestLights(scene: any) : void {
    for (const nest of scene.nests) {
      if (!nest.gone) scene.registerNestLight(nest);
    }
  
}

export function registerChestLight(scene: any, chest: Pick<GameChest, 'id' | 'x' | 'y'>) : void {
    scene.lightingSystem?.upsertStaticLight({
      id: `chest:${chest.id}`,
      x: chest.x,
      y: chest.y,
      radius: 115,
      color: 0xffe071,
      intensity: 0.55,
      flicker: 0.11,
      verticalScale: 0.66,
      coreScale: 0.58,
    });
  
}

export function registerTreeOccluder(scene: any, tree: TreeView) : void {
    scene.lightingSystem?.upsertSilhouetteOccluder({
      id: `tree:${tree.id}`,
      x: tree.worldX,
      y: tree.worldY,
      textureKey: () => tree.getShadowTextureKey(),
      originX: 0.5,
      originY: 1,
      scaleX: 1,
      scaleY: 1,
      strength: 0.42,
      shadowDistance: 86,
      depth: () => tree.worldY + 4,
      isActive: () => !tree.isChopped(),
    });
    scene.lightingSystem?.upsertResponsiveSprite({
      id: `tree-light:${tree.id}`,
      x: tree.worldX,
      y: tree.worldY,
      textureKey: () => tree.getShadowTextureKey(),
      originX: 0.5,
      originY: 1,
      scaleX: 1,
      scaleY: 1,
      strength: 0.24,
      shadeStrength: 0.16,
      depth: () => tree.worldY + 111,
      isActive: () => !tree.isChopped(),
    });
  
}
