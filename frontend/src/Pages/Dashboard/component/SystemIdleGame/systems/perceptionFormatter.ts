import type {
  PerceivedEntity,
  PerceptionResult,
} from './WorldPerceptionSystem';

function formatEntity(entity: PerceivedEntity): string {
  const label = entity.displayName || entity.id;
  return `${label}(${Math.round(entity.x)},${Math.round(entity.y)})`;
}

/**
 * Prompt formatter kept separate from the perception query layer.
 *
 * PerceptionSystem returns structured data. This formatter preserves the old
 * "Chinese environment description" behavior for the NPC chat request path.
 */
export function formatPerceptionForNpcPrompt(result: PerceptionResult): string {
  const parts: string[] = [];

  const liveTrees = result.visibleObjects.filter((objectItem) => (
    objectItem.type === 'tree' && objectItem.state !== 'chopped'
  ));
  if (liveTrees.length > 0) {
    const closest = liveTrees[0];
    parts.push(
      `视野内有 ${liveTrees.length} 棵树，最近的是 ${closest.id}，坐标约为 (${Math.round(closest.x)}, ${Math.round(closest.y)})。`,
    );
  } else {
    parts.push('视野内没有明显的树木。');
  }

  if (result.visibleDrops.length > 0) {
    parts.push(
      `地上有物品：${result.visibleDrops
        .slice(0, 6)
        .map((drop) => `${drop.itemId}(${Math.round(drop.x)},${Math.round(drop.y)})`)
        .join('，')}。`,
    );
  }

  const readyCrops = result.visibleCrops.filter((crop) => crop.state === 'ready');
  if (readyCrops.length > 0) {
    parts.push(
      `附近有 ${readyCrops.length} 个成熟作物地块，例如 ${readyCrops
        .slice(0, 3)
        .map((crop) => `${crop.cropId}(${crop.tx},${crop.ty})`)
        .join('，')}。`,
    );
  }

  const nearbyEntities = result.visibleEntities.filter((entity) => entity.type !== 'player');
  if (nearbyEntities.length > 0) {
    parts.push(
      `附近还能看到：${nearbyEntities
        .slice(0, 5)
        .map(formatEntity)
        .join('，')}。`,
    );
  }

  if (result.landmarks.length > 0) {
    parts.push(
      `附近地标有：${result.landmarks
        .slice(0, 5)
        .map((landmark) => `${landmark.label}(${Math.round(landmark.x)},${Math.round(landmark.y)})`)
        .join('，')}。`,
    );
  }

  if (result.nearest.water) {
    parts.push(
      `最近的水源大约在 (${Math.round(result.nearest.water.x)}, ${Math.round(result.nearest.water.y)})。`,
    );
  }

  return parts.join(' ');
}
