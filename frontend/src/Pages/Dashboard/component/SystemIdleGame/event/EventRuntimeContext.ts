import type { GameChest } from '../../../../../Types/Profile';
import { Npc } from '../entities/Npc';
import { gameBus } from '../shared/EventBus';
import { GAME_NPC_CATALOG, getNpcDefinitionById } from '../shared/GameNpcCatalog';
import { resolveSafeChestPlacement } from '../world/chestPlacement';
import { VILLAGE_LAYOUT } from '../world/layouts/villageLayout';
import type { CutsceneDirector } from './CutsceneDirector';
import type { VehicleSystem } from './VehicleSystem';

const ARRIVAL_LINES: Record<string, string> = {
  farmer: '我到了。先让我看看这片地适合种些什么。',
  carpenter: '路上还算顺利。这里需要修的东西，看起来不少。',
  merchant: '新地方，新生意，我喜欢。',
  scholar: '我会先把村子的事情整理成记录。',
  rancher: '我来了，动物和水源我会帮忙盯着。',
  starter: '车站都热闹起来了。',
};

export interface EventRuntimeContext {
  cutscene: CutsceneDirector;
  vehicles: VehicleSystem;
  getGameTick(): number;
  wait(ms: number): Promise<void>;
  spawnNpcFromVehicle(npcId: string): Npc | null;
  unlockNpc(npcId: string): void;
  addNpcMemory(npcId: string, text: string): void;
  makeNpcSay(npcId: string, text: string, durationMs?: number): void;
  spawnRandomChest(): GameChest | null;
  setFlag(key: string, value: unknown): void;
  resolveText(npcId: string, text?: string, textKey?: string): string;
}

export function createEventRuntimeContext(scene: any): EventRuntimeContext {
  return {
    cutscene: scene.cutsceneDirector,
    vehicles: scene.vehicleSystem,
    getGameTick: () => scene.dayCycle?.gameTick ?? 0,
    wait: (ms: number) => new Promise((resolve) => scene.time.delayedCall(ms, () => resolve(undefined))),
    spawnNpcFromVehicle: (npcId: string) => spawnNpcFromVehicle(scene, npcId),
    unlockNpc: (npcId: string) => scene.eventSystem?.markNpcUnlocked(npcId),
    addNpcMemory: (npcId: string, text: string) => {
      const definition = getNpcDefinitionById(npcId);
      const npc = definition ? scene.findNpcByName(definition.name) : null;
      npc?.addMemory(text, 'event', scene.dayCycle?.gameTick ?? 0);
    },
    makeNpcSay: (npcId: string, text: string, durationMs = 2200) => {
      const definition = getNpcDefinitionById(npcId);
      if (!definition) return;
      const npc = scene.findNpcByName(definition.name);
      if (!npc) return;
      scene.npcDirectorSystem?.pauseNpc(definition.name, scene.dayCycle?.gameTick ?? 0, Math.ceil(durationMs / 1000), 'event_cutscene');
      npc.say(text, scene.dayCycle?.gameTick ?? 0);
    },
    spawnRandomChest: () => spawnRandomChest(scene),
    setFlag: (key: string, value: unknown) => scene.eventSystem?.setFlag(key, value),
    resolveText: (npcId: string, text?: string, textKey?: string) => resolveEventText(npcId, text, textKey),
  };
}

function spawnNpcFromVehicle(scene: any, npcId: string): Npc | null {
  const definition = getNpcDefinitionById(npcId);
  console.log('[DEBUG-event-flow] spawnNpcFromVehicle called', {
    npcId,
    definition,
    existingNames: scene.allNpcs?.().map((npc: Npc) => npc.name),
    hasNpcSystem: Boolean(scene.npcSystem?.addNpc),
  });
  if (!definition) return null;

  const existing = scene.findNpcByName(definition.name);
  if (existing) {
    console.log('[DEBUG-event-flow] spawnNpcFromVehicle existing npc found', {
      npcId,
      name: definition.name,
      position: { x: existing.sprite.x, y: existing.sprite.y },
    });
    return existing;
  }

  const exit = VILLAGE_LAYOUT.busStation.arrivalRoute.npcExit;
  const npc = new Npc(scene, exit.x, exit.y, definition.name);
  npc.sprite.setTint(definition.tint);
  if (scene.npcSystem?.addNpc) {
    scene.npcSystem.addNpc(npc);
  } else {
    scene.extraNpcs.push(npc);
  }

  scene.physics.add.collider(npc.sprite, scene.obstacles);
  if (scene.player?.sprite) scene.physics.add.collider(scene.player.sprite, npc.sprite);

  scene.worldStateManager?.registerEntity?.({
    id: definition.name,
    kind: 'npc',
    x: npc.sprite.x,
    y: npc.sprite.y,
    displayName: definition.name,
    meta: {
      interactable: false,
      catalogId: definition.id,
      role: definition.role,
    },
  });
  scene.ensureAllNpcMindStates?.();
  scene.syncNpcAgentWorldContexts?.();
  console.log('[DEBUG-event-flow] spawnNpcFromVehicle spawned', {
    npcId,
    name: definition.name,
    position: { x: npc.sprite.x, y: npc.sprite.y },
    allNames: scene.allNpcs?.().map((entry: Npc) => entry.name),
  });
  return npc;
}

function spawnRandomChest(scene: any): GameChest | null {
  const existingCount = scene.chests?.size ?? 0;
  if (existingCount >= 3) return null;

  const points = [
    { x: 640, y: 760 },
    { x: 1160, y: 700 },
    { x: 1500, y: 980 },
    { x: 440, y: 900 },
  ];
  const point = points[Math.floor(Math.random() * points.length)] ?? points[0];

  const chest: GameChest = resolveSafeChestPlacement(scene, {
    id: `event-chest-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    x: point.x,
    y: point.y,
    rewards: {
      coins: 25 + Math.floor(Math.random() * 26),
      items: [],
    },
    opened: false,
    createdAt: scene.dayCycle?.gameTick ?? 0,
  });
  scene.addChest(chest);
  gameBus.emit('game:chest_spawned', { chest });
  gameBus.emit('game:save_requested', { reason: 'event:random_chest_spawned' });
  return chest;
}

function resolveEventText(npcId: string, text?: string, textKey?: string): string {
  if (text) return text;
  const definition = getNpcDefinitionById(npcId);
  if (textKey === 'arrival_by_bus') {
    return '今天乘车来到村子，正式开始在这里生活。';
  }
  if (textKey === 'arrival_line') {
    return ARRIVAL_LINES[definition?.role ?? 'starter'] ?? '我到了，以后请多关照。';
  }
  return definition
    ? `${definition.name} 来到了村子。`
    : '新的村民来到了村子。';
}

export function getKnownNpcIds(): string[] {
  return GAME_NPC_CATALOG.map((npc) => npc.id);
}
