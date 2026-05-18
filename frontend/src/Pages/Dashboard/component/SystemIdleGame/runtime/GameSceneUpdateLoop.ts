import Phaser from 'phaser';
import { gameBus } from '../shared/EventBus';

export function updateGameScene(scene: any, time: number, delta: number): void {
    const dt = delta / 1000;

    if (scene.idleRuntime) {
      scene.idleRuntime.updateSimulation({
        dtSeconds: dt,
        gameTick: scene.dayCycle?.gameTick ?? 0,
        timeMs: time,
        deltaMs: delta,
      });
    } else {
      // Fallback for tests or partial scene bootstraps.
      scene.dayCycle?.update(dt);
      scene.syncWorldStateMeta?.();
      scene.eventSystem?.update(scene.dayCycle?.gameTick ?? 0);
      scene.storylineRuntimeSystem?.update(scene.dayCycle?.gameTick ?? 0);
      scene.farmSystem?.update(scene.dayCycle?.gameTick ?? 0);
      scene.houseConstructionSystem?.update(scene.dayCycle?.gameTick ?? 0);
    }

    // Emit time string to React HUD (max once per real second)
    if (time - scene._lastTimeEmit > 1000) {
      scene._lastTimeEmit = time;
      gameBus.emit('tick:update', {
        gameTick:    scene.dayCycle.gameTick,
        timeStr:     scene.dayCycle.getTimeStr(),
        dateStr:     scene.dayCycle.getDateStr(),
        dateTimeStr: scene.dayCycle.getDateTimeStr(),
      });
    }

    // F-key: general world-object interaction
    if (Phaser.Input.Keyboard.JustDown(scene._fKey) && !scene._chatOpen) {
      scene.triggerFInteract();
    }

    // Q-key: drop held item as world drop
    if (Phaser.Input.Keyboard.JustDown(scene._qKey) && !scene._chatOpen) {
      scene._triggerQDrop();
    }

    // Remote player (multiplayer)
    scene.remotePlayer?.update();

    // Emit local player position to peers (throttled 20fps)
    if (scene.multiplayActive && time - scene._lastPosSend > 50) {
      scene._lastPosSend = time;
      const body = scene.player.sprite.body as Phaser.Physics.Arcade.Body;
      gameBus.emit('world:position_broadcast_requested', {
        x: scene.player.sprite.x,
        y: scene.player.sprite.y,
        facing: scene.player.facing,
        velX: body.velocity.x,
        velY: body.velocity.y,
      });
    }

    // Player
    if (scene._chatOpen) {
      (scene.player.sprite.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    } else {
      scene.player.update();
    }

    // House doors (player or any NPC triggers each door)
    scene.syncDynamicEntityStates();
    scene.npcSystem?.updateAI(dt, scene.dayCycle.gameTick, time, delta);
    const _hpx = scene.player.sprite.x, _hpy = scene.player.sprite.y;
    const npcDoorActors = scene.allNpcs()
      .map((npc: any) => npc?.sprite)
      .filter(Boolean);
    scene.house.update(_hpx, _hpy, undefined, undefined, npcDoorActors);
    scene.npcHouse?.update(_hpx, _hpy, undefined, undefined, npcDoorActors);

    // NPC + chickens
    scene.npcSystem?.updateActors(dt, scene.dayCycle.gameTick);
    scene.housePlacementSystem?.update();
    scene.updatePets?.(dt, scene.dayCycle.gameTick, time, delta);
    scene.houseInteractionSystem?.update(time);
    scene.locationSystem?.update(time);
    if (scene.player?.sprite) {
      scene.audioSystem?.updateListenerPosition(scene.player.sprite.x, scene.player.sprite.y);
    }
    scene.musicDirector?.update(time);
    scene.pathDebugSystem?.update(scene.allNpcs());
    scene.treeStateSystem?.update(time);
    scene.objectSystem?.update(time, delta);
    scene.lightingSystem?.update(time, scene.dayCycle.getCurrentMinute(), scene.getDynamicLightConfigs());
  
}
