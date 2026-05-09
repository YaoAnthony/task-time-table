# Architecture Boundaries

This project is a split frontend/backend application:

- `frontend/` owns React views, client-only UI state, Phaser rendering, and browser integrations.
- `backend/` owns authentication, authorization, persistence, payment/AI integrations, and server-side validation.
- Shared contracts should be expressed as typed request/response shapes, not inferred from Redux slices or Mongoose documents.

## Frontend State

- RTK Query is the source of truth for remote server data.
- Redux slices should store session data, UI state, and client-only game state.
- Components should not dispatch remote queries during render. Use RTK Query hooks or effects.
- Large feature routes should stay lazy-loaded from `App.tsx`.

## Backend Routes

- Route files should stay thin: parse request, authorize, call a service, and return a response.
- Domain rules belong in services under `backend/routes/modules/services/` or a future `backend/services/` folder.
- Mongoose models define persistence shape only; avoid putting business workflows directly in models.

## Realtime

- Socket.io must use the same access-token secret as REST auth.
- Anonymous socket fallback is disabled by default.
- Broad origin allowlists should only be enabled through explicit local-development environment flags.

## Game Persistence

- Persisted game snapshots need a `schemaVersion`.
- Backend may store flexible game state, but it should still validate size, version, and top-level shape before saving.
- Schema migrations should be additive and explicit.

## Build

- Heavy routes and vendors should remain code-split.
- Phaser, Three.js, Ant Design, and Redux-related libraries should not be pulled into the initial route unless the route needs them.
