import type { StorageChestDefinition, StorageChestDefinitionId } from './StorageChestTypes';
import { STORAGE_CHEST_ITEM_ID } from './StorageChestTypes';

export const STORAGE_CHEST_CATALOG: Record<StorageChestDefinitionId, StorageChestDefinition> = {
  basic: {
    id: 'basic',
    itemId: STORAGE_CHEST_ITEM_ID,
    name: 'Storage Chest',
    nameZh: 'Storage Chest',
    price: 15,
    capacity: 24,
    footprint: { w: 32, h: 28 },
  },
};

export function getStorageChestDefinition(id: string | undefined | null): StorageChestDefinition | null {
  return STORAGE_CHEST_CATALOG[id as StorageChestDefinitionId] ?? null;
}

export function getStorageChestDefinitionByItemId(itemId: string | undefined | null): StorageChestDefinition | null {
  return Object.values(STORAGE_CHEST_CATALOG).find((entry) => entry.itemId === itemId) ?? null;
}
