export const LAOLI_CAT_ITEM_ID = 'pet_laoli_cat';
export const LAOLI_CAT_ENTITY_ID = 'pet-laoli-cat';
export const LAOLI_CAT_PET_ID = 'laoli_cat';

export const PET_HOME_RADIUS = 130;
export const PET_FOLLOW_RADIUS = 210;
export const PET_FOLLOW_STOP_RADIUS = 58;
export const PET_PLAYER_CURIOSITY_RADIUS = 170;

export const PET_INTEREST_POINTS = [
  { id: 'village_path', x: 420, y: 720, weight: 1 },
  { id: 'player_house_yard', x: 260, y: 390, weight: 1 },
  { id: 'pond_edge', x: 828, y: 610, weight: 0.8 },
  { id: 'bus_stop', x: 1580, y: 1040, weight: 0.7 },
] as const;

export type PetMemorySeed = {
  id: string;
  kind: 'bond' | 'home' | 'behavior' | 'observation' | 'quest';
  text: string;
  importance: number;
  createdAtTick?: number;
  lastSeenTick?: number;
};

export const LAOLI_CAT_MEMORY_SEEDS: PetMemorySeed[] = [
  {
    id: 'laoli_cat_remembers_laoli',
    kind: 'bond',
    text: '记得老李的气味，会把老李当作家人。',
    importance: 0.95,
  },
  {
    id: 'laoli_cat_new_home',
    kind: 'home',
    text: '记得自己被接回了老李的新家，那里是安全的地方。',
    importance: 0.85,
  },
  {
    id: 'laoli_cat_silent_affection',
    kind: 'behavior',
    text: '不会说人类语言，只会通过靠近、停留和跟随表达亲近。',
    importance: 0.7,
  },
];
