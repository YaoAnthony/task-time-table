import type Phaser from 'phaser';
import {
  ACTION_FRAME_H,
  ACTION_FRAME_W,
  CHAR_FRAME_H,
  CHAR_FRAME_W,
  CHEST_FRAME_H,
  CHEST_FRAME_W,
  CHICK_FRAME_H,
  CHICK_FRAME_W,
} from '../constants';

// @ts-ignore
import tileGrassUrl from '../../../../../assets/Sprout-Lands/Tilesets/Grass.png';
// @ts-ignore
import tileWaterUrl from '../../../../../assets/Sprout-Lands/Tilesets/Water.png';
// @ts-ignore
import tileHillsUrl from '../../../../../assets/Sprout-Lands/Tilesets/Hills.png';
// @ts-ignore
import objsUrl from '../../../../../assets/Sprout-Lands/Objects/Basic_Grass_Biom_things.png';
// @ts-ignore
import charUrl from '../../../../../assets/Sprout-Lands/Characters/Basic Charakter Spritesheet.png';
// @ts-ignore
import actionsUrl from '../../../../../assets/Sprout-Lands/Characters/Basic Charakter Actions.png';
// @ts-ignore
import chickenUrl from '../../../../../assets/Sprout-Lands/Characters/Free Chicken Sprites.png';
// @ts-ignore
import houseUrl from '../../../../../assets/Sprout-Lands/Tilesets/Wooden House.png';
// @ts-ignore
import chestUrl from '../../../../../assets/Sprout-Lands/Objects/Chest.png';
// @ts-ignore
import eggNestUrl from '../../../../../assets/Sprout-Lands/Characters/Egg_And_Nest.png';
// @ts-ignore
import tilledDirtUrl from '../../../../../assets/Sprout-Lands/Tilesets/Tilled Dirt.png';
// @ts-ignore
import toolsUrl from '../../../../../assets/Sprout-Lands/Objects/Basic tools and meterials.png';
// @ts-ignore
import basicPlantsUrl from '../../../../../assets/Sprout-Lands/Objects/Basic_Plants.png';
// @ts-ignore
import furnitureUrl from '../../../../../assets/Sprout-Lands/Objects/Basic_Furniture.png';
// @ts-ignore
import busStationUrl from '../../../../../assets/bus/bus-station.png';
// @ts-ignore
import busUrl from '../../../../../assets/bus/bus.png';
// @ts-ignore
import busOpen1Url from '../../../../../assets/bus/bus-open1.png';
// @ts-ignore
import busOpen2Url from '../../../../../assets/bus/bus-open2.png';
// @ts-ignore
import busOpen3Url from '../../../../../assets/bus/bus-open3.png';
// @ts-ignore
import greenhouseStep0Url from '../../../../../assets/house/green-house/step0.png';
// @ts-ignore
import greenhouseStep1Url from '../../../../../assets/house/green-house/step1.png';
// @ts-ignore
import greenhouseStep2Url from '../../../../../assets/house/green-house/step2.png';
// @ts-ignore
import greenhouseStep3Url from '../../../../../assets/house/green-house/step3.png';
// @ts-ignore
import greenhouseStep4Url from '../../../../../assets/house/green-house/step4.png';
// @ts-ignore
import greenhouseCloseUrl from '../../../../../assets/house/green-house/close.png';
// @ts-ignore
import greenhouseOpenUrl from '../../../../../assets/house/green-house/open.png';
// @ts-ignore
import houseKeyUrl from '../../../../../assets/icon/key.png';

export function preloadGameSceneAssets(scene: Phaser.Scene): void {
  scene.load.image('grass', tileGrassUrl);
  scene.load.spritesheet('water', tileWaterUrl, { frameWidth: 16, frameHeight: 16 });
  scene.load.image('hills', tileHillsUrl);
  scene.load.image('objects', objsUrl);
  scene.load.image('house', houseUrl);
  scene.load.spritesheet('player', charUrl, { frameWidth: CHAR_FRAME_W, frameHeight: CHAR_FRAME_H });
  scene.load.spritesheet('actions', actionsUrl, { frameWidth: ACTION_FRAME_W, frameHeight: ACTION_FRAME_H });
  scene.load.spritesheet('chicken', chickenUrl, { frameWidth: CHICK_FRAME_W, frameHeight: CHICK_FRAME_H });
  scene.load.spritesheet('chest', chestUrl, { frameWidth: CHEST_FRAME_W, frameHeight: CHEST_FRAME_H });
  scene.load.spritesheet('egg-nest', eggNestUrl, { frameWidth: 16, frameHeight: 16 });
  scene.load.image('tilled-dirt', tilledDirtUrl);
  scene.load.image('tools', toolsUrl);
  scene.load.image('basic-plants', basicPlantsUrl);
  scene.load.image('furniture', furnitureUrl);
  scene.load.image('bus-station', busStationUrl);
  scene.load.image('bus', busUrl);
  scene.load.image('bus-open1', busOpen1Url);
  scene.load.image('bus-open2', busOpen2Url);
  scene.load.image('bus-open3', busOpen3Url);
  scene.load.image('house-greenhouse-step0', greenhouseStep0Url);
  scene.load.image('house-greenhouse-step1', greenhouseStep1Url);
  scene.load.image('house-greenhouse-step2', greenhouseStep2Url);
  scene.load.image('house-greenhouse-step3', greenhouseStep3Url);
  scene.load.image('house-greenhouse-step4', greenhouseStep4Url);
  scene.load.image('house-greenhouse-close', greenhouseCloseUrl);
  scene.load.image('house-greenhouse-open', greenhouseOpenUrl);
  scene.load.image('house-key', houseKeyUrl);
}
