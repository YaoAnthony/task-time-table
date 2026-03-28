import { createSlice, PayloadAction } from '@reduxjs/toolkit';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface GameInventoryItem {
  itemId:       string;
  quantity:     number;
  instanceData?: {
    durability?: number | null;
    freshness?:  number | null;
    customMeta?: Record<string, unknown>;
  };
}

/** A single draggable item in a slot (backpack or hotbar). */
export interface SlotItem {
  itemId:   string;
  quantity: number;
}

export type FarmTileState =
  | 'tilled' | 'watered' | 'seeded' | 'growing' | 'ready' | 'harvested';

export interface FarmTile {
  tx:           number;
  ty:           number;
  state:        FarmTileState;
  cropId?:      string | null;
  plantRow?:    number;
  numStages?:   number;
  plantedAt?:   number | null;
  readyAt?:     number | null;
  waterExpiry?: number | null;
}

export type CreatureStateName =
  | 'wandering' | 'moving_to_water' | 'drinking' | 'moving_to_nest' | 'laying';

export interface CreatureState {
  creatureId: string;
  type:       'chicken';
  x:          number;
  y:          number;
  thirst:     number;
  growth:     number;
  state:      CreatureStateName;
}

// ── Slot zone references ───────────────────────────────────────────────────────
export type SlotZone = 'hotbar' | 'backpack';

export interface SlotRef {
  zone:  SlotZone;
  index: number;
}

// ── Slice State ───────────────────────────────────────────────────────────────

export const HOTBAR_SIZE  = 10;
export const BACKPACK_SIZE = 40;

export interface GameReduxState {
  gameInventory: GameInventoryItem[];
  /** 10 hotbar slots — the in-game equipment bar */
  hotbarSlots:   (SlotItem | null)[];
  /** 40 backpack slots — the storage grid */
  backpackSlots: (SlotItem | null)[];
  farmTiles:     FarmTile[];
  creatures:     CreatureState[];
  /** NPC inventories — keyed by NPC name, value is itemId → quantity */
  npcInventories: Record<string, Record<string, number>>;
}

const initialState: GameReduxState = {
  gameInventory:  [],
  hotbarSlots:    Array(HOTBAR_SIZE).fill(null),
  backpackSlots:  Array(BACKPACK_SIZE).fill(null),
  farmTiles:      [],
  creatures:      [],
  npcInventories: {},
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Rebuild flat gameInventory from both slot arrays. */
function rebuildInventory(hotbar: (SlotItem | null)[], backpack: (SlotItem | null)[]): GameInventoryItem[] {
  const map = new Map<string, number>();
  for (const s of [...hotbar, ...backpack]) {
    if (!s) continue;
    map.set(s.itemId, (map.get(s.itemId) ?? 0) + s.quantity);
  }
  return Array.from(map.entries()).map(([itemId, quantity]) => ({ itemId, quantity }));
}

// ── Slice ─────────────────────────────────────────────────────────────────────

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    /**
     * Sync both raw inventory AND hotbar/backpack slots from a backend inventory array.
     * Use this instead of setGameInventory so hotbar display stays accurate.
     * Preserves existing slot positions where itemId matches; fills empties from new data.
     */
    setGameInventory(state, action: PayloadAction<GameInventoryItem[]>) {
      const incoming = action.payload;
      state.gameInventory = incoming;

      // Update quantities in existing slots (or null out slots whose item hit 0)
      for (const arr of [state.hotbarSlots, state.backpackSlots]) {
        for (let i = 0; i < arr.length; i++) {
          const slot = arr[i];
          if (!slot) continue;
          const updated = incoming.find(it => it.itemId === slot.itemId);
          if (!updated || updated.quantity <= 0) {
            arr[i] = null;          // item gone — clear slot
          } else {
            arr[i] = { itemId: slot.itemId, quantity: updated.quantity };
          }
        }
      }

      // Place any new items not yet in any slot
      for (const item of incoming) {
        if (item.quantity <= 0) continue;
        const inHotbar  = state.hotbarSlots.some(s => s?.itemId === item.itemId);
        const inBackpack = state.backpackSlots.some(s => s?.itemId === item.itemId);
        if (inHotbar || inBackpack) continue;
        // Slot it in first empty hotbar, then backpack
        const hi = state.hotbarSlots.findIndex(s => s === null);
        if (hi >= 0) { state.hotbarSlots[hi] = { itemId: item.itemId, quantity: item.quantity }; continue; }
        const bi = state.backpackSlots.findIndex(s => s === null);
        if (bi >= 0) { state.backpackSlots[bi] = { itemId: item.itemId, quantity: item.quantity }; }
      }
    },

    /**
     * Load inventory from backend into slots.
     * Priority: hotbar first (slots 0-9), then backpack.
     * Call this on game-ready after getGameInventory().
     */
    initSlotsFromInventory(state, action: PayloadAction<GameInventoryItem[]>) {
      state.gameInventory = action.payload;
      state.hotbarSlots   = Array(HOTBAR_SIZE).fill(null);
      state.backpackSlots = Array(BACKPACK_SIZE).fill(null);
      let hi = 0, bi = 0;
      for (const item of action.payload) {
        if (hi < HOTBAR_SIZE) {
          state.hotbarSlots[hi++] = { itemId: item.itemId, quantity: item.quantity };
        } else if (bi < BACKPACK_SIZE) {
          state.backpackSlots[bi++] = { itemId: item.itemId, quantity: item.quantity };
        }
      }
    },

    /**
     * Pick up an item: hotbar first, then backpack (Minecraft style).
     * Stacks with existing slot of same itemId before claiming a new slot.
     */
    addItemToBackpack(state, action: PayloadAction<SlotItem>) {
      const { itemId, quantity } = action.payload;

      // 1. Stack in existing hotbar slot
      const hotbarStack = state.hotbarSlots.findIndex(s => s?.itemId === itemId);
      if (hotbarStack >= 0) {
        state.hotbarSlots[hotbarStack]!.quantity += quantity;
        if (state.hotbarSlots[hotbarStack]!.quantity <= 0) {
          state.hotbarSlots[hotbarStack] = null;   // slot depleted — clear it
        }
        state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
        return;
      }

      // 2. Stack in existing backpack slot
      const packStack = state.backpackSlots.findIndex(s => s?.itemId === itemId);
      if (packStack >= 0) {
        state.backpackSlots[packStack]!.quantity += quantity;
        if (state.backpackSlots[packStack]!.quantity <= 0) {
          state.backpackSlots[packStack] = null;   // slot depleted — clear it
        }
        state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
        return;
      }

      // 3. First empty hotbar slot
      const hotbarEmpty = state.hotbarSlots.findIndex(s => s === null);
      if (hotbarEmpty >= 0) {
        state.hotbarSlots[hotbarEmpty] = { itemId, quantity };
        state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
        return;
      }

      // 4. Overflow to backpack
      const packEmpty = state.backpackSlots.findIndex(s => s === null);
      if (packEmpty >= 0) {
        state.backpackSlots[packEmpty] = { itemId, quantity };
      }
      state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
    },

    /**
     * Move/swap items between any two slots (hotbar ↔ backpack, within same zone).
     * This is the drag-and-drop action.
     */
    moveSlot(state, action: PayloadAction<{ from: SlotRef; to: SlotRef }>) {
      const { from, to } = action.payload;
      const fromArr = from.zone === 'hotbar' ? state.hotbarSlots : state.backpackSlots;
      const toArr   = to.zone   === 'hotbar' ? state.hotbarSlots : state.backpackSlots;

      if (from.zone === to.zone && from.index === to.index) return; // same slot, no-op

      // Swap contents
      const temp          = toArr[to.index];
      toArr[to.index]     = fromArr[from.index];
      fromArr[from.index] = temp;

      state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
    },

    // ── Farm & creature actions (unchanged) ───────────────────────────────────

    upsertGameInventoryItem(state, action: PayloadAction<{ itemId: string; quantity: number }>) {
      const { itemId, quantity } = action.payload;
      const existing = state.gameInventory.find(i => i.itemId === itemId);
      if (existing) {
        existing.quantity = Math.max(0, existing.quantity + quantity);
        state.gameInventory = state.gameInventory.filter(i => i.quantity > 0);
      } else if (quantity > 0) {
        state.gameInventory.push({ itemId, quantity });
      }
    },

    setFarmTiles(state, action: PayloadAction<FarmTile[]>) {
      state.farmTiles = action.payload;
    },

    upsertFarmTile(state, action: PayloadAction<FarmTile>) {
      const tile = action.payload;
      const idx = state.farmTiles.findIndex(t => t.tx === tile.tx && t.ty === tile.ty);
      if (idx >= 0) state.farmTiles[idx] = tile;
      else state.farmTiles.push(tile);
    },

    removeFarmTile(state, action: PayloadAction<{ tx: number; ty: number }>) {
      const { tx, ty } = action.payload;
      state.farmTiles = state.farmTiles.filter(t => !(t.tx === tx && t.ty === ty));
    },

    setCreatures(state, action: PayloadAction<CreatureState[]>) {
      state.creatures = action.payload;
    },

    // ── Hotbar slot management ─────────────────────────────────────────────────
    /** Remove the item from a specific hotbar slot (used by Q-drop). */
    clearHotbarSlot(state, action: PayloadAction<number>) {
      state.hotbarSlots[action.payload] = null;
      state.gameInventory = rebuildInventory(state.hotbarSlots, state.backpackSlots);
    },

    // ── NPC inventory ──────────────────────────────────────────────────────────
    setNpcInventory(state, action: PayloadAction<{ npcName: string; inv: Record<string, number> }>) {
      state.npcInventories[action.payload.npcName] = action.payload.inv;
    },

    addItemToNpcInventory(state, action: PayloadAction<{ npcName: string; itemId: string; qty: number }>) {
      const { npcName, itemId, qty } = action.payload;
      if (!state.npcInventories[npcName]) state.npcInventories[npcName] = {};
      state.npcInventories[npcName][itemId] = (state.npcInventories[npcName][itemId] ?? 0) + qty;
    },

    removeItemFromNpcInventory(state, action: PayloadAction<{ npcName: string; itemId: string; qty: number }>) {
      const { npcName, itemId, qty } = action.payload;
      if (!state.npcInventories[npcName]) return;
      const current = state.npcInventories[npcName][itemId] ?? 0;
      const next = Math.max(0, current - qty);
      if (next === 0) {
        delete state.npcInventories[npcName][itemId];
      } else {
        state.npcInventories[npcName][itemId] = next;
      }
    },
  },
});

export const {
  setGameInventory,
  upsertGameInventoryItem,
  initSlotsFromInventory,
  addItemToBackpack,
  moveSlot,
  clearHotbarSlot,
  setFarmTiles,
  upsertFarmTile,
  removeFarmTile,
  setCreatures,
  setNpcInventory,
  addItemToNpcInventory,
  removeItemFromNpcInventory,
} = gameSlice.actions;

export default gameSlice.reducer;
