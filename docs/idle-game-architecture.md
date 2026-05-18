# Idle Game Architecture

This document defines the first-phase target architecture for the top-down idle
farm game inside `frontend/src/Pages/Dashboard/component/SystemIdleGame`.

## Boundaries

- Only files inside this repository may be changed for this game.
- `NewSystemIdleGame` is reserved for a future path and must not be deleted,
  moved, or edited during the current `SystemIdleGame` cleanup.
- `SystemIdleGame/index.tsx` is the React shell. It owns Phaser mounting,
  React HUD/modal state, auth, RTK Query hooks, and SSE wiring only.
- Phaser sprite classes are render views. They mirror world records but are not
  the source of truth.
- `WorldStateManager` is the runtime world-state source of truth.
- `WorldActionSystem` is the world mutation entrypoint. Player input, NPC AI,
  server sync, and scripted events should submit `WorldAction` commands instead
  of directly mutating feature systems.
- `gameBus` is a boundary/event bridge for UI, React/Phaser integration, and
  multiplayer relay. It should not be the primary way to mutate domain state.

## Folder Responsibilities

### `api/`

Game API exports and request/response adapters. This folder may depend on RTK
Query and app-level API clients, but it should not contain world rules.

### `runtime/`

Phaser scene lifecycle and system orchestration. Scene files create, preload,
update, and destroy runtime systems. Long-term orchestration belongs in
`IdleGameRuntime`, while `GameSceneRuntime` stays a thin Phaser-facing shell.

### `runtime/systems/`

Frame runners and lifecycle helpers. Systems registered here should be plain
objects with `id`, optional `enabled`, and `update` behavior.

### `world/state/`

Pure world state and spatial data structures: grid, cells, entities, objects,
drops, crops, trees, nests, NPC minds, and spatial indexes. This folder must not
depend on React.

### `world/actions/`

World command types, mutation dispatch, action results, and domain events.
Feature systems can implement rules, but mutations should be routed through this
layer so sync, persistence, debugging, and rollback have one boundary.

### `world/layouts/`

Map layouts, village slots, landmarks, and placement data. Layout files should
be declarative data where possible.

### `features/farming/`

Crop catalog, farm rules, farm growth, watering, planting, harvesting, and farm
tile views. Farming must expose commands or rule helpers to `WorldActionSystem`
instead of using `gameBus` as the write path.

### `features/npc/`

NPC catalog, knowledge, memory, needs, schedule, thinking, director, and
dialogue systems. NPC behavior should submit actions to the world layer for any
world-changing operation.

### `features/housing/`

House catalog, placement, construction, contracts, room entry, door locks, and
save adapters. Backend house services remain the authoritative validator for
purchase and contract persistence.

### `features/storage/`

Storage chest catalog, world view, modal interaction, transfer behavior, and
save adapters. Inventory transfer rules should stay aligned with backend
storage services.

### `features/events/`

Event definitions, event runtime state, cutscenes, vehicle actions, and event
action execution. Events may emit `DomainEvent` records and submit
`WorldAction` commands, but should not directly own UI presentation.

### `features/creatures/`

Animal and nest lifecycle systems. Chicken/nest state should remain in the
world model and render through view classes.

### `entities/`

Phaser sprite/view classes such as player, NPC, drops, chests, houses, trees,
and creature views. Business rules should move out of this folder over time.

### `components/` and `ui/`

React game UI. `ui/` is for always-on in-game UI such as HUD, hotbar, dialog,
and chat input. `components/` is for feature modals such as shops, contracts,
storage, and rewards.

### `persistence/`

Save types, save mappers, compatibility adapters, and migrations. `GameSaveV1`
is preserved in this phase; schema changes require explicit migrations.

### `sync/`

SSE/socket/multiplayer sync policy. Sync should consume world action results
and domain events instead of knowing every feature's internal implementation.

## Current Migration Policy

- Existing imports from `shared/WorldStateManager`, `shared/WorldGrid`, and
  `systems/WorldActionSystem` remain supported through compatibility exports.
- New code should import from `world/state/*` and `world/actions/*`.
- Do not add new domain mutation events to `gameBus`; add a `WorldAction`
  instead.
- Do not expand `GameSceneBootstrap` with new feature wiring. Add orchestration
  to `IdleGameRuntime` or a feature-specific runtime adapter.

## Backend Policy

- `backend/routes/modules/game.*Routes.js` files remain thin: authenticate,
  parse input, call a service, return a response.
- `backend/shared/gameSaveService.js` owns save normalization and version
  compatibility, not feature-specific rule growth.
- Feature rules belong in `backend/shared/game*Service.js`, with catalogs in
  `backend/shared/game*Catalog.js`.

## Follow-Up Refactors

- Move farming, NPC, housing, storage, event, and creature systems into their
  `features/*` folders in small slices.
- Introduce shared catalog data for frontend/backend once build tooling is ready
  for a shared package or generated JSON.
- Add tests around `WorldActionSystem`, `normalizeGameSave`, and crop growth
  before changing save schema.
