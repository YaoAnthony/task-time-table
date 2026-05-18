import Phaser from 'phaser';
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
import {
  getPreloadAudioEntries,
  resolveAudioSourceUrl,
} from '../audio';

export function preloadGameSceneAssets(scene: Phaser.Scene): void {
  createLoadingOverlay(scene);
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
  for (const entry of getPreloadAudioEntries()) {
    scene.load.audio(entry.id, resolveAudioSourceUrl(entry.source));
  }
}

function createLoadingOverlay(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const barWidth = Math.min(360, Math.max(220, width * 0.46));
  const barHeight = 14;
  const x = width / 2;
  const y = height / 2;
  const panelWidth = barWidth + 72;
  const panelHeight = 116;
  const panelX = x - panelWidth / 2;
  const panelY = y - panelHeight / 2;
  const barX = x - barWidth / 2;
  const barY = y + 10;

  const panel = scene.add.graphics();
  panel.fillStyle(0x101620, 0.88);
  panel.fillRoundedRect(panelX, panelY, panelWidth, panelHeight, 10);
  panel.lineStyle(2, 0xd99a17, 1);
  panel.strokeRoundedRect(panelX, panelY, panelWidth, panelHeight, 10);
  panel.setDepth(100000);
  panel.setScrollFactor(0);

  const title = scene.add.text(x, panelY + 24, 'LOADING WORLD', {
    fontFamily: 'monospace',
    fontSize: '16px',
    color: '#fff6d8',
    align: 'center',
  });
  title.setOrigin(0.5);
  title.setDepth(100001);
  title.setScrollFactor(0);

  const detail = scene.add.text(x, panelY + 48, 'Preparing assets...', {
    fontFamily: 'monospace',
    fontSize: '11px',
    color: '#9fb0c8',
    align: 'center',
  });
  detail.setOrigin(0.5);
  detail.setDepth(100001);
  detail.setScrollFactor(0);

  const barBack = scene.add.graphics();
  barBack.fillStyle(0x273244, 1);
  barBack.fillRoundedRect(barX, barY, barWidth, barHeight, 7);
  barBack.setDepth(100001);
  barBack.setScrollFactor(0);

  const barFill = scene.add.graphics();
  barFill.setDepth(100002);
  barFill.setScrollFactor(0);

  const percentText = scene.add.text(x, barY + 34, '0%', {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#ffd36a',
    align: 'center',
  });
  percentText.setOrigin(0.5);
  percentText.setDepth(100001);
  percentText.setScrollFactor(0);

  const overlayObjects: Phaser.GameObjects.GameObject[] = [
    panel,
    title,
    detail,
    barBack,
    barFill,
    percentText,
  ];
  let disposed = false;

  const destroyOverlay = () => {
    for (const object of overlayObjects) {
      if (object.active) object.destroy();
    }
  };

  const cleanupListeners = () => {
    scene.load.off('progress', onProgress);
    scene.load.off('fileprogress', onFileProgress);
    scene.load.off('complete', onComplete);
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
  };

  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cleanupListeners();
    destroyOverlay();
  };

  const onProgress = (value: number) => {
    if (disposed || !barFill.active || !percentText.active) return;
    const progress = Phaser.Math.Clamp(value, 0, 1);
    barFill.clear();
    barFill.fillStyle(0xf2b233, 1);
    barFill.fillRoundedRect(barX, barY, Math.max(barHeight, barWidth * progress), barHeight, 7);
    percentText.setText(`${Math.round(progress * 100)}%`);
  };

  const onFileProgress = (file: { key?: string; type?: string }) => {
    if (disposed || !detail.active) return;
    const label = [file?.type, file?.key].filter(Boolean).join(': ');
    if (label) detail.setText(label);
  };

  const onComplete = () => {
    cleanupListeners();
    if (disposed || !barFill.active || !percentText.active || !detail.active) return;
    barFill.clear();
    barFill.fillStyle(0xf2b233, 1);
    barFill.fillRoundedRect(barX, barY, barWidth, barHeight, 7);
    percentText.setText('100%');
    detail.setText('Starting scene...');
    scene.tweens.add({
      targets: [panel, title, detail, barBack, barFill, percentText],
      alpha: 0,
      duration: 180,
      onComplete: () => {
        disposed = true;
        destroyOverlay();
      },
    });
  };

  const onShutdown = () => dispose();

  scene.load.on('progress', onProgress);
  scene.load.on('fileprogress', onFileProgress);
  scene.load.once('complete', onComplete);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, onShutdown);
}
