import type { NpcDailyActivity } from '../shared/worldStateTypes';

export type NpcAutonomyMode =
  | 'free'
  | 'scheduled'
  | 'sleeping'
  | 'working'
  | 'eating'
  | 'social';

export function autonomyModeForActivity(activity: NpcDailyActivity | null | undefined): NpcAutonomyMode {
  switch (activity) {
    case 'sleep':
      return 'sleeping';
    case 'breakfast':
    case 'lunch':
    case 'dinner':
      return 'eating';
    case 'work_farm':
    case 'work_forest':
      return 'working';
    case 'relax':
      return 'social';
    default:
      return 'free';
  }
}

export function canRunScheduleDrivenThink(activity: NpcDailyActivity | null | undefined): boolean {
  return activity === 'work_farm';
}

export function canRunFreeThink(activity: NpcDailyActivity | null | undefined): boolean {
  return activity == null || activity === 'relax';
}

export function canNeedsSpeak(activity: NpcDailyActivity | null | undefined): boolean {
  return activity == null || activity === 'relax';
}

export function canGossip(activity: NpcDailyActivity | null | undefined): boolean {
  return activity == null || activity === 'relax';
}

export function isPrivateScheduleActivity(activity: NpcDailyActivity | null | undefined): boolean {
  return activity === 'sleep'
    || activity === 'breakfast'
    || activity === 'lunch'
    || activity === 'dinner'
    || activity === 'work_farm'
    || activity === 'work_forest';
}
