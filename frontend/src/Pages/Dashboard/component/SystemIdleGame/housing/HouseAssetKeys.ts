import type { HouseDefinitionId, HouseStage } from './HouseTypes';

export const HOUSE_TEXTURE_KEYS: Record<HouseDefinitionId, Record<HouseStage, string>> = {
  greenhouse: {
    step0: 'house-greenhouse-step0',
    step1: 'house-greenhouse-step1',
    step2: 'house-greenhouse-step2',
    step3: 'house-greenhouse-step3',
    step4: 'house-greenhouse-step4',
    ready_closed: 'house-greenhouse-close',
    ready_open: 'house-greenhouse-open',
  },
};

export const HOUSE_KEY_TEXTURE = 'house-key';

export function getHouseTextureKey(definitionId: HouseDefinitionId, stage: HouseStage): string {
  return HOUSE_TEXTURE_KEYS[definitionId][stage] ?? HOUSE_TEXTURE_KEYS[definitionId].ready_closed;
}
