import { resolveActorLocationTarget } from './locationSlots';

export type NpcKnowledgeStep =
  | {
      kind: 'move_to';
      target:
        | { kind: 'named'; place: string }
        | { kind: 'coords'; x: number; y: number };
      note?: string;
    }
  | {
      kind: 'farm_action';
      action: 'till' | 'water' | 'plant' | 'harvest';
      target: 'nearest';
      itemId?: string;
      note?: string;
    };

export interface NpcKnowledgeSkill {
  id: string;
  label: string;
  description: string;
  triggers: string[];
  requiredTime?: 'day' | 'night' | 'any';
  steps: NpcKnowledgeStep[];
}

export const NPC_KNOWLEDGE_SKILLS: NpcKnowledgeSkill[] = [
  {
    id: 'go_to_room',
    label: 'Go to room',
    description: 'Navigate to the shared room interior.',
    triggers: ['go room', 'inside', 'go home'],
    requiredTime: 'any',
    steps: [
      { kind: 'move_to', target: { kind: 'named', place: 'room' }, note: 'Use the room named location.' },
    ],
  },
  {
    id: 'go_to_farm',
    label: 'Go to farm',
    description: 'Navigate to the farm area before doing crop work.',
    triggers: ['go farm', 'field', 'crops'],
    requiredTime: 'any',
    steps: [
      { kind: 'move_to', target: { kind: 'named', place: 'farm' }, note: 'Use the farm named location.' },
    ],
  },
  {
    id: 'farm_till_day',
    label: 'Till soil',
    description: 'During daytime, move to the farm and till the nearest empty farm cell with a scythe.',
    triggers: ['till', 'plow', 'prepare soil'],
    requiredTime: 'day',
    steps: [
      { kind: 'move_to', target: { kind: 'named', place: 'farm' } },
      { kind: 'farm_action', action: 'till', target: 'nearest', itemId: 'scythe' },
    ],
  },
  {
    id: 'farm_sow_wheat_day',
    label: 'Sow wheat',
    description: 'During daytime, plant wheat on the nearest prepared tile; if none exists, prepare one first.',
    triggers: ['plant', 'sow', 'seed', 'wheat'],
    requiredTime: 'day',
    steps: [
      { kind: 'move_to', target: { kind: 'named', place: 'farm' } },
      { kind: 'farm_action', action: 'plant', target: 'nearest', itemId: 'wheat_seed' },
    ],
  },
  {
    id: 'farm_water_day',
    label: 'Water crops',
    description: 'During daytime, water the nearest prepared or planted crop tile.',
    triggers: ['water', 'watering can'],
    requiredTime: 'day',
    steps: [
      { kind: 'move_to', target: { kind: 'named', place: 'farm' } },
      { kind: 'farm_action', action: 'water', target: 'nearest', itemId: 'watering_can' },
    ],
  },
  {
    id: 'farm_harvest_day',
    label: 'Harvest crops',
    description: 'During daytime, harvest the nearest ready crop.',
    triggers: ['harvest', 'collect crop'],
    requiredTime: 'day',
    steps: [
      { kind: 'move_to', target: { kind: 'named', place: 'farm' } },
      { kind: 'farm_action', action: 'harvest', target: 'nearest' },
    ],
  },
];

export function getNpcKnowledgeSkills(): NpcKnowledgeSkill[] {
  return NPC_KNOWLEDGE_SKILLS;
}

export function findNpcKnowledgeSkill(skillId: string | undefined): NpcKnowledgeSkill | null {
  if (!skillId) return null;
  return NPC_KNOWLEDGE_SKILLS.find((skill) => skill.id === skillId) ?? null;
}

export function resolveKnowledgeMoveTarget(step: NpcKnowledgeStep, actorId = 'actor'): { x: number; y: number } | null {
  if (step.kind !== 'move_to') return null;
  if (step.target.kind === 'coords') return { x: step.target.x, y: step.target.y };
  return resolveActorLocationTarget(step.target.place, actorId);
}

export function serializeNpcKnowledgeForPrompt(): Array<{
  id: string;
  label: string;
  description: string;
  requiredTime: NpcKnowledgeSkill['requiredTime'];
  steps: NpcKnowledgeStep[];
}> {
  return NPC_KNOWLEDGE_SKILLS.map((skill) => ({
    id: skill.id,
    label: skill.label,
    description: skill.description,
    requiredTime: skill.requiredTime,
    steps: skill.steps,
  }));
}
