import type { EventAction, GameEventInstance } from './EventTypes';
import type { EventRuntimeContext } from './EventRuntimeContext';

export class EventActionExecutor {
  constructor(private readonly context: EventRuntimeContext) {}

  async execute(instance: GameEventInstance, actions: EventAction[]): Promise<void> {
    try {
      for (const action of actions) {
        const resolved = this.resolveAction(instance, action);
        console.log('[DEBUG-event-flow] EventActionExecutor.action start', {
          instanceId: instance.instanceId,
          definitionId: instance.definitionId,
          action: resolved,
        });
        await this.executeAction(resolved);
        console.log('[DEBUG-event-flow] EventActionExecutor.action done', {
          instanceId: instance.instanceId,
          action: resolved,
        });
      }
    } finally {
      this.context.cutscene.unlockPlayer();
    }
  }

  private async executeAction(action: EventAction): Promise<void> {
    switch (action.type) {
      case 'wait':
        await this.context.wait(Math.max(0, action.ticks) * 1000);
        return;
      case 'lock_player_control':
        this.context.cutscene.lockPlayer();
        return;
      case 'unlock_player_control':
        this.context.cutscene.unlockPlayer();
        return;
      case 'camera_pan_to':
        await this.context.cutscene.panTo(action.target, action.durationMs);
        return;
      case 'camera_follow':
        this.context.cutscene.follow(action.target);
        return;
      case 'spawn_vehicle':
        if (action.routeId === 'npc_arrival_bus') this.context.vehicles.spawnArrivalBus(action.vehicleId);
        return;
      case 'move_vehicle':
        await this.context.vehicles.moveToStation(action.vehicleId, action.durationMs);
        return;
      case 'vehicle_open_door':
        await this.context.vehicles.playDoor(action.vehicleId, 'open');
        return;
      case 'vehicle_close_door':
        await this.context.vehicles.playDoor(action.vehicleId, 'close');
        return;
      case 'despawn_vehicle':
        this.context.vehicles.remove(action.vehicleId);
        return;
      case 'spawn_npc_from_vehicle': {
        const npc = this.context.spawnNpcFromVehicle(action.npcId);
        if (!npc) throw new Error(`Unable to spawn NPC from event payload: ${action.npcId}`);
        return;
      }
      case 'unlock_npc':
        this.context.unlockNpc(action.npcId);
        return;
      case 'npc_say':
        this.context.makeNpcSay(
          action.npcId,
          this.context.resolveText(action.npcId, action.text, action.textKey),
          action.durationMs,
        );
        if (action.durationMs) await this.context.wait(action.durationMs);
        return;
      case 'add_npc_memory':
        this.context.addNpcMemory(
          action.npcId,
          this.context.resolveText(action.npcId, action.text, action.textKey),
        );
        return;
      case 'spawn_random_chest':
        this.context.spawnRandomChest();
        return;
      case 'set_flag':
        this.context.setFlag(action.key, action.value);
        return;
      default:
        return;
    }
  }

  private resolveAction(instance: GameEventInstance, action: EventAction): EventAction {
    const resolveValue = (value: string): string => {
      if (!value.startsWith('$')) return value;
      const key = value.slice(1);
      const resolved = instance.payload?.[key];
      return typeof resolved === 'string' ? resolved : value;
    };

    switch (action.type) {
      case 'spawn_npc_from_vehicle':
      case 'unlock_npc':
      case 'add_npc_memory':
      case 'npc_say':
        return { ...action, npcId: resolveValue(action.npcId) } as EventAction;
      default:
        return action;
    }
  }
}
