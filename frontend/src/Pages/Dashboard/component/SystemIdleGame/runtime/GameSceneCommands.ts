import Phaser from 'phaser';
import { getNpcDefinitionById } from '../shared/GameNpcCatalog';
import { gameBus } from '../shared/EventBus';

export function setAgentBrainEnabled(scene: any, enabled: boolean) : void {
    scene.npcDirectorSystem?.setEnabled(enabled);
  
}

export function setPhysicsDebug(scene: any, enabled: boolean) : void {
    const world = scene.physics.world;

    if (enabled) {
      // Ensure the debug graphic exists (createDebugGraphic also sets drawDebug=true)
      if (!world.debugGraphic) world.createDebugGraphic();
      world.drawDebug = true;
      world.defaults.debugShowBody         = true;
      world.defaults.debugShowStaticBody   = true;
      world.defaults.debugShowVelocity     = false;
      world.defaults.bodyDebugColor        = 0x2ee6a6; // cyan dynamic
      world.defaults.staticBodyDebugColor  = 0xff4d6d; // pink static/wall

      // Phaser sets body.debugShowBody at CREATION time from world.defaults.
      // Bodies created while debug=false have debugShowBody=false permanently
      // unless we patch them all here.
      world.bodies.iterate((body: Phaser.Physics.Arcade.Body) => {
        body.debugShowBody  = true;
        body.debugBodyColor = world.defaults.bodyDebugColor;
        return true;
      });
      (world.staticBodies as Phaser.Structs.Set<Phaser.Physics.Arcade.StaticBody>)
        .iterate((body: Phaser.Physics.Arcade.StaticBody) => {
          body.debugShowBody  = true;
          body.debugBodyColor = world.defaults.staticBodyDebugColor;
          return true;
        });

      world.debugGraphic!.setVisible(true);
      scene.physicsDebugEnabled = true;
      return;
    }

    world.drawDebug = false;
    if (world.debugGraphic) {
      world.debugGraphic.clear();
      world.debugGraphic.setVisible(false);
    }
    scene.physicsDebugEnabled = false;
  
}

export function _registerCommands(scene: any) : void {
    // /weather <rain|clear>
    scene.commands.register(
      'weather',
      'set weather: rain | clear',
      (args: string[]) => {
        const w = args[0]?.toLowerCase();
        if (w === 'rain')  { scene.weather.setWeather('rain');  return 'Weather set to rain'; }
        if (w === 'clear') { scene.weather.setWeather('clear'); return 'Weather set to clear'; }
        return `Usage: /weather rain | /weather clear`;
      },
    );

    // /time set <0-1439>
    scene.commands.register(
      'time',
      'set in-game time: /time set <0-1439>',
      (args: string[]) => {
        if (args[0] === 'set') {
          const mins = parseInt(args[1] ?? '');
          if (!isNaN(mins) && mins >= 0 && mins <= 1439) {
            scene.dayCycle.setTimeOfDay(mins);
            const h = Math.floor(mins / 60).toString().padStart(2, '0');
            const m = (mins % 60).toString().padStart(2, '0');
            return `Time set to ${h}:${m}`;
          }
        }
        return `Usage: /time set <0-1439>, e.g. /time set 480`;
      },
    );

    scene.commands.register(
      'debug',
      'toggle physics debug: /debug on | /debug off',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        if (mode === 'on') {
          scene.setPhysicsDebug(true);
          return 'Physics debug on';
        }
        if (mode === 'off') {
          scene.setPhysicsDebug(false);
          return 'Physics debug off';
        }
        return `Physics debug: ${scene.physicsDebugEnabled ? 'on' : 'off'}; usage: /debug on | /debug off`;
      },
    );

    scene.commands.register(
      'pathline',
      'toggle NPC path lines: /pathline on | off | status',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        if (mode === 'on') {
          scene.pathDebugSystem?.setEnabled(true);
          return 'NPC path lines on';
        }
        if (mode === 'off') {
          scene.pathDebugSystem?.setEnabled(false);
          return 'NPC path lines off';
        }
        return `NPC path lines: ${scene.pathDebugSystem?.isEnabled() ? 'on' : 'off'}; usage: /pathline on | /pathline off`;
      },
    );

    scene.commands.register(
      'shadow',
      'toggle lighting and shadows: /shadow on | off | status',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        if (mode === 'on') {
          scene.lightingSystem?.setEnabled(true);
          return 'Shadow lighting on';
        }
        if (mode === 'off') {
          scene.lightingSystem?.setEnabled(false);
          return 'Shadow lighting off';
        }
        if (mode === 'status' || !mode) {
          return `Shadow lighting: ${scene.lightingSystem?.isEnabled() ? 'on' : 'off'}`;
        }
        return 'Usage: /shadow on | /shadow off | /shadow status';
      },
    );

    scene.commands.register(
      'agent',
      'control NPC autonomy: /agent brain stop | start | status',
      (args: string[]) => {
        const scope = args[0]?.toLowerCase();
        const mode = args[1]?.toLowerCase();
        if (scope !== 'brain') {
          return 'Usage: /agent brain stop | /agent brain start | /agent brain status';
        }
        if (mode === 'stop' || mode === 'off') {
          scene.setAgentBrainEnabled(false);
          return 'Agent brain is off. NPC autonomous thinking is paused.';
        }
        if (mode === 'start' || mode === 'on') {
          scene.setAgentBrainEnabled(true);
          return 'Agent brain is on. NPC autonomous thinking resumed.';
        }
        if (mode === 'status' || !mode) {
          return `Agent brain: ${scene.npcDirectorSystem?.isEnabled() ? 'on' : 'off'}`;
        }
        return 'Usage: /agent brain stop | /agent brain start | /agent brain status';
      },
    );

    scene.commands.register(
      'event',
      'debug events: /event npc_arrival <npcId>',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        if (mode === 'npc_arrival') {
          const npcId = args[1];
          if (!npcId) return 'Usage: /event npc_arrival <npcId>';
          if (!getNpcDefinitionById(npcId)) return `Unknown NPC id: ${npcId}`;
          const event = scene.eventSystem?.enqueueNpcArrival(npcId, scene.dayCycle.gameTick + 1, scene.dayCycle.gameTick);
          return event ? `Queued NPC arrival for ${npcId}` : `${npcId} is already unlocked or already on the way`;
        }
        return 'Usage: /event npc_arrival <npcId>';
      },
    );

    scene.commands.register(
      'saving',
      'save management: /saving delete',
      (args: string[]) => {
        const mode = args[0]?.toLowerCase();
        if (mode !== 'delete') return 'Usage: /saving delete';
        gameBus.emit('game:save_delete_requested', {
          roomId: scene.initialGameSave?.worldStatus?.roomId ?? null,
        });
        return 'Deleting this world save. The game will reload into a fresh world...';
      },
    );

    scene.commands.register(
      'tp',
      'teleport: /tp 001 | /tp village',
      (args: string[]) => scene.locationSystem?.teleport(args[0]) ?? 'Location system is not ready',
    );

    // /help
    scene.commands.register('help', 'show available commands', () => scene.commands.listHelp());

    // /getInventory <name>
    scene.commands.register(
      'getInventory',
      'show NPC inventory: /getInventory <name>',
      (args: string[]) => {
        const name = args.join(' ').trim() || scene.npc?.name || 'NPC';
        const inv = scene.npc.getInventory(name);
        const entries = Object.entries(inv);
        if (entries.length === 0) return `${name} inventory is empty`;
        return `${name} inventory:\n${entries.map(([k, v]) => `  ${k} x${v}`).join('\n')}`;
      },
    );
  
}
