import type { HouseDefinition, HouseDefinitionId, HouseStage } from './HouseTypes';

export const HOUSE_BLUEPRINT_GREENHOUSE = 'house_blueprint_greenhouse';
export const HOUSE_KEY_ITEM_ID = 'house_key';
const GREENHOUSE_STAGE_DURATION_SECONDS = 5;

export const HOUSE_CATALOG: Record<HouseDefinitionId, HouseDefinition> = {
  greenhouse: {
    id: 'greenhouse',
    name: 'Greenhouse',
    nameZh: '温室小屋',
    blueprintItemId: HOUSE_BLUEPRINT_GREENHOUSE,
    price: 50,
    rentPerDay: 5,
    roomTemplateId: 'two_bedroom_living_room',
    stageDuration: GREENHOUSE_STAGE_DURATION_SECONDS,
    stageDurations: {
      step0: GREENHOUSE_STAGE_DURATION_SECONDS,
      step1: GREENHOUSE_STAGE_DURATION_SECONDS,
      step2: GREENHOUSE_STAGE_DURATION_SECONDS,
      step3: GREENHOUSE_STAGE_DURATION_SECONDS,
      step4: GREENHOUSE_STAGE_DURATION_SECONDS,
    },
    displaySize: { w: 260, h: 242 },
    footprint: { w: 192, h: 142 },
    collisionBoxes: [
      { x: -88, y: -64, w: 180, h: 34 },
      { x: -88, y: -34, w: 52, h: 86 },
      { x: 42, y: -34, w: 50, h: 86 },
      { x: -36, y: -20, w: 72, h: 42 },
      { x: -88, y: 42, w: 64, h: 20 },
      { x: 24, y: 42, w: 68, h: 20 },
    ],
    doorOffset: { x: 0, y: 64 },
  },
};

export function getHouseDefinition(id: string | undefined | null): HouseDefinition | null {
  return HOUSE_CATALOG[id as HouseDefinitionId] ?? null;
}

export function totalConstructionDuration(definition: HouseDefinition): number {
  return Object.values(definition.stageDurations).reduce((sum, value) => sum + value, 0);
}

export function getStageAtTick(definition: HouseDefinition, startedAtTick: number, readyAtTick: number, gameTick: number, doorOpen: boolean): HouseStage {
  const catalogReadyAtTick = startedAtTick + totalConstructionDuration(definition);
  const effectiveReadyAtTick = Math.min(readyAtTick, catalogReadyAtTick);
  if (gameTick >= effectiveReadyAtTick) return doorOpen ? 'ready_open' : 'ready_closed';
  const elapsed = Math.max(0, gameTick - startedAtTick);
  let cursor = 0;
  const stageOrder: Array<keyof HouseDefinition['stageDurations']> = ['step0', 'step1', 'step2', 'step3', 'step4'];
  for (const stage of stageOrder) {
    cursor += definition.stageDurations[stage] ?? definition.stageDuration;
    if (elapsed < cursor) return stage;
  }
  return 'step4';
}
