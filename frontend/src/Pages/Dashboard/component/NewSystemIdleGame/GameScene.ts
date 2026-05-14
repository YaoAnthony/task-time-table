import Phaser from 'phaser';
import type { IdleGameState } from '../../../../Types/Profile';
import { gameBus } from './Utils/EventBus';
import {
  ActionSystem,
  AnimationSystem,
  CommandSystem,
  FarmSystem,
  NavigationSystem,
  NPCSystem,
  ObjectSystem,
  SavingSystem,
  TimeSystem,
  WeatherSystem,
} from './Systems';

export interface GameSceneInitData {
    save?: IdleGameState | null;
}

export default class GameScene extends Phaser.Scene {
    private initialState: Partial<IdleGameState> = {};

    public readonly systems = {
        action: new ActionSystem(),
        animation: new AnimationSystem(),
        command: new CommandSystem(),
        farm: new FarmSystem(),
        navigation: new NavigationSystem(),
        npc: new NPCSystem(),
        object: new ObjectSystem(),
        saving: new SavingSystem(),
        time: new TimeSystem(),
        weather: new WeatherSystem(),
    };

    constructor() {
        super('GameScene');
    }

    init(data: GameSceneInitData): void {
        this.initialState = data.save ?? {};
    }

    setInitialSave(save: IdleGameState | null): void {
        this.initialState = save ?? {};
    }

    preload(){

    }

    
    create(){
        void this.initialState;
        Object.values(this.systems).forEach((system) => system.init());
        gameBus.emit('game:ready', {});
    }
    
    update(){

    }

    destroy(){

    }

}
