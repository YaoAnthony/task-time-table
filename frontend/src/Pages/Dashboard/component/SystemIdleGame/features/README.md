# Idle Game Features

Feature folders hold domain-specific gameplay rules and adapters. New feature
work should prefer these folders over adding more logic to `GameSceneRuntime`,
`GameSceneBootstrap`, or generic `systems/`.

- `farming/`: crop catalog, farm rules, tile view adapters, growth behavior.
- `npc/`: NPC catalog, knowledge, memory, needs, schedule, thinking, dialogue.
- `housing/`: house placement, construction, contracts, rooms, doors.
- `storage/`: storage chest views, transfer behavior, save adapters.
- `events/`: event definitions, event runtime, cutscenes, vehicle actions.
- `creatures/`: animal and nest lifecycle systems.

During the phase-1 migration, existing implementations may remain in their
legacy folders with compatibility exports. New code should be placed here.
