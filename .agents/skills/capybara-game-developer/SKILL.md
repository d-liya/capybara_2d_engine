---
name: capybara-game-developer
description: On-demand Capybara 2.5D reference. Start from AGENTS.md Current state. Open this skill pack only when wiring a mechanic that file does not cover.
metadata:
  author: Capybara-Developer
  version: 1.7.0
---

# Capybara Game Developer Skill

Start from repo-root `AGENTS.md` (living **Current state**). This pack is the deeper engine reference — not a required preload before writing gameplay.

Art/world assets arrive via Studio `generate_asset_batch` / `save_world_state` or Maps / Jobs sync. Your lane is gameplay against the synced projection (`bootstrapWorldFromAssets` + `configureGameplay`).

When a hosted sandbox also injects `system.md`, treat that as the operational contract. Do not contradict it on sync/bootstrap facts.

## Hosted / synced projects

Synced projects have `src/data/capybara-assets.json` and/or a non-stub `src/scenes/generatedWorld.ts`.

- Sync wrote manifests, registries, and `generatedWorld.ts`. Each map is lean `map_*.json` plus optional sidecars (merged via `mergeMapSidecars`).
- `bootstrapWorldFromAssets` loads the start map, defines calibrated character archetypes, starts map-scoped BGM, loads props/atmosphere, and binds default interact. Gameplay spawns characters explicitly. Synthetic return exits are added for forward enterables when needed.
- Extend custom gameplay in `configureGameplay` (`src/scenes/mainScene.ts`). See [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md).
- Treat manifest-owned files as read-only. Spawn the controlled player and zone NPCs from generated archetypes at explicit feet coordinates. Bootstrap does **not** auto-spawn characters, generic `placement[]` props, or `hudPlacements`.

## When the user says an asset looks bad

Check integration aspect ratio before asking them to regenerate. Prefer preserving source proportions (see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md) — Prop aspect ratio). Ask for regeneration when the art itself is the problem.

## Generated bounding box order

Generated asset JSON stores 2D bounds as **`[y1, x1, y2, x2]`** (y before x).

- `box_2d[0]` = ymin, `box_2d[1]` = xmin, `box_2d[2]` = ymax, `box_2d[3]` = xmax
- At runtime, use facade helpers such as `game.getPlacementTargets()[].bounds` (`{ x1, y1, x2, y2 }`)

## When to open this pack

- Studio first build: follow `AGENTS.md` Current state → generate the world → update Current state. Do not load this skill first.
- Studio / later edit: `AGENTS.md` + `WORLD.md` + the gameplay file you will change.
- Need a GameAPI contract, asset-wiring rule, or SDK detail Current state does not cover: open the matching file below.

## Additional resources

- [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md) — wiring synced assets
- [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md) — engine architecture and API contracts
- [SDK_FACADE.md](SDK_FACADE.md) — auth, save/load, storage, multiplayer
