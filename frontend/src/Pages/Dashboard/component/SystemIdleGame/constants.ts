/** Game-wide constants for the idle game. */

// ─── World ────────────────────────────────────────────────────────────────────
export const WORLD_W      = 832;   // 26 tiles × 32px
export const WORLD_H      = 640;   // 20 tiles × 32px
export const SPAWN_X      = 250;
export const SPAWN_Y      = 320;
export const NPC_X        = 430;
export const NPC_Y        = 280;
export const NPC_NAME     = '老李';

// ─── Camera / rendering ───────────────────────────────────────────────────────
export const ZOOM         = 2.0;
export const OBJ_SCALE    = 2;   // all map-objects are drawn at 2× source pixels

// ─── Physics ─────────────────────────────────────────────────────────────────
export const PLAYER_SPEED = 200;  // px / s
export const NPC_SPEED    = 70;

// ─── Sprite-sheet frame sizes ─────────────────────────────────────────────────
export const CHAR_FRAME_W   = 48;   // Basic Charakter Spritesheet.png
export const CHAR_FRAME_H   = 48;
export const ACTION_FRAME_W = 48;   // Basic Charakter Actions.png
export const ACTION_FRAME_H = 48;
export const CHICK_FRAME_W  = 16;   // Free Chicken Sprites.png
export const CHICK_FRAME_H  = 16;
export const CHEST_FRAME_W  = 48;   // Chest.png (240×96, 5 cols × 2 rows @ 48px)
export const CHEST_FRAME_H  = 48;   // row 0 = closed variants, row 1 = opened variants
export const TOOL_ICON_SIZE = 16;   // Basic tools and meterials.png

// ─── Chest ────────────────────────────────────────────────────────────────────
/** Pixel radius within which the player can interact with a chest. */
export const CHEST_INTERACT_RADIUS = 80;

// ─── Time ─────────────────────────────────────────────────────────────────────
export const GAME_MINS_PER_SEC = 5;   // 5 in-game minutes per real second
export const MINS_PER_DAY      = 1440;

// ─── NPC AI ───────────────────────────────────────────────────────────────────
/** Real seconds between autonomous GPT think calls.
 *  Set very high — NPC autonomous thinking is disabled until RTK Query
 *  auth integration is complete.  Player-initiated chat still works fine. */
export const NPC_THINK_INTERVAL = 999999;
export const NPC_MAX_MEMORY     = 20;

// ─── Asset frame definitions (same pattern as ozguradmin/sprout-lands-portfolio)
// (x, y, w, h) in source PNG pixels
export const FRAMES = {
  // Grass.png — col 1 row 1 = plain fill (used by invisible collision blocks)
  grass1:   { src: 'grass',   x:  16, y: 16, w: 16, h: 16 },
  grass2:   { src: 'grass',   x:  32, y: 16, w: 16, h: 16 },
  // Water.png — 4-frame animation
  water0:   { src: 'water',   x:   0, y:  0, w: 16, h: 16 },
  water1:   { src: 'water',   x:  16, y:  0, w: 16, h: 16 },
  water2:   { src: 'water',   x:  32, y:  0, w: 16, h: 16 },
  water3:   { src: 'water',   x:  48, y:  0, w: 16, h: 16 },
  // Basic_Grass_Biom_things.png — trees, decorations
  treeA:    { src: 'objects', x:   0, y:  0, w: 32, h: 48 },
  treeB:    { src: 'objects', x:  32, y:  0, w: 32, h: 48 },
  bush:     { src: 'objects', x:  64, y:  0, w: 16, h: 16 },
  rock:     { src: 'objects', x:  80, y: 48, w: 16, h: 16 },
  flower1:  { src: 'objects', x:  96, y: 48, w: 16, h: 16 },
  flower2:  { src: 'objects', x: 112, y: 48, w: 16, h: 16 },
  flower3:  { src: 'objects', x: 128, y: 48, w: 16, h: 16 },
  // Wooden House.png
  house:    { src: 'house',   x:   0, y:  0, w: 112, h: 80 },
  // Hills.png — island cliff edges (each tile 16×16 px)
  // Top cliff: col=0 rows 1-3  →  x=0,  y=16/32/48
  hillTop1: { src: 'hills',   x:  0, y: 16, w: 16, h: 16 },
  hillTop2: { src: 'hills',   x:  0, y: 32, w: 16, h: 16 },
  hillTop3: { src: 'hills',   x:  0, y: 48, w: 16, h: 16 },
  // Bottom cliff: col=2 rows 1-3  →  x=32, y=16/32/48
  hillBot1: { src: 'hills',   x: 32, y: 16, w: 16, h: 16 },
  hillBot2: { src: 'hills',   x: 32, y: 32, w: 16, h: 16 },
  hillBot3: { src: 'hills',   x: 32, y: 48, w: 16, h: 16 },
} as const;
