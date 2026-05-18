import { WORLD_LOCATION_MAP } from './WorldLocations';

const LOCATION_OFFSETS: Record<string, Array<{ dx: number; dy: number }>> = {
  room: [
    { dx: -48, dy: -24 },
    { dx: 0, dy: -24 },
    { dx: 48, dy: -24 },
    { dx: -32, dy: 24 },
    { dx: 32, dy: 24 },
  ],
  door: [
    { dx: -56, dy: 24 },
    { dx: 0, dy: 40 },
    { dx: 56, dy: 24 },
    { dx: -72, dy: -8 },
    { dx: 72, dy: -8 },
  ],
  pond: [
    { dx: -80, dy: -24 },
    { dx: 80, dy: -24 },
    { dx: -48, dy: 48 },
    { dx: 48, dy: 48 },
    { dx: 0, dy: 72 },
  ],
  farm: [
    { dx: -96, dy: -64 },
    { dx: -32, dy: -64 },
    { dx: 32, dy: -64 },
    { dx: 96, dy: -64 },
    { dx: -96, dy: 0 },
    { dx: 96, dy: 0 },
    { dx: -32, dy: 64 },
    { dx: 32, dy: 64 },
  ],
};

function hash(input: string): number {
  let value = 0;
  for (let i = 0; i < input.length; i += 1) {
    value = ((value << 5) - value) + input.charCodeAt(i);
    value |= 0;
  }
  return Math.abs(value);
}

export function resolveActorLocationTarget(
  place: string,
  actorId = 'actor',
): { x: number; y: number; worldId?: string } | null {
  const loc = WORLD_LOCATION_MAP[place];
  if (!loc) return null;
  const offsets = LOCATION_OFFSETS[place];
  if (!offsets?.length) return { x: loc.worldX, y: loc.worldY, worldId: loc.worldId };
  const offset = offsets[hash(`${actorId}:${place}`) % offsets.length];
  return {
    x: loc.worldX + offset.dx,
    y: loc.worldY + offset.dy,
    worldId: loc.worldId,
  };
}
