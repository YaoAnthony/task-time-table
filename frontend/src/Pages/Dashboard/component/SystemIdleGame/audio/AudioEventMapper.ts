import { gameBus } from '../shared/EventBus';
import type { AudioSystem } from './AudioSystem';

export class AudioEventMapper {
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly audio: AudioSystem) {}

  start(): void {
    this.unsubscribers.push(
      gameBus.on('ui:show_message', () => {
        this.audio.playSfx('ui.confirm');
      }),
      gameBus.on('npc:speak', ({ npcName }) => {
        this.audio.playSfx(npcName === '玩家' ? 'dialogue.player_blip' : 'dialogue.npc_blip');
      }),
      gameBus.on('game:house_place_requested', () => {
        this.audio.playSfx('sfx.place_house');
      }),
      gameBus.on('chest:interact', ({ rewards }) => {
        if (Number(rewards?.coins ?? 0) <= 0) return;
        this.audio.playSfx('sfx.open_chest');
      }),
      gameBus.on('world:action_applied', ({ action, result }) => {
        if (!result.ok) return;
        if (action.type === 'PICKUP_DROP' || action.type === 'DROP_ITEM' || action.type === 'PLACE_OBJECT') {
          this.audio.playSfx('ui.confirm', { volume: 0.18 });
        }
      }),
    );
  }

  destroy(): void {
    for (const unsubscribe of this.unsubscribers.splice(0)) unsubscribe();
  }
}
