# Capybara Primitives Template

2.5D game template with a primitives-first API for fast iteration and AI-assisted feature building.

## Documentation Ownership

This project exposes a public interface for coding agents

- `docs/CAPYBARA_ENGINE.md` owns the stable template-level public interface: facades, extension points, module boundaries, and conventions.
- `src/data/assets.md` owns generated asset/widget/map/placement/audio facts for the current game.
- `src/scenes/SCENES.md` owns active scene composition facts.
- `docs/SDK_FACADE.md` owns SDK reference details.
- `docs/recipes/` owns optional implementation patterns.

Agents should build from these docs and manifests, not by reverse-engineering `src/core/`, SDK internals, or generated JSON.

## Folder Layout

- docs/CAPYBARA_ENGINE.md
  - Stable public interface for agents: GameAPI facade patterns, gameplay extension points, character rules, SDK/session rules, and escalation rules.
- docs/SDK_FACADE.md
  - Capybara SDK facade usage for AI, TTS, save/load, auth, and multiplayer.
- docs/recipes/
  - Optional implementation recipes for farming loops, inventory/tools, NPC dialogue, combat/projectiles, enemy waves, RPG quests/inventory, pointer aiming, save/load, map placement, HUDs, and seasonal atmosphere.
- src/Game.ts
  - Public facade API.
- src/core/
  - Runtime internals (camera, input, map, rendering, widgets manager).
- src/scenes/
  - Scene entrypoints and orchestration. `src/scenes/SCENES.md` summarizes active scene composition for agents.
- src/archetypes/
  - Reusable defaults for entity types.
- src/systems/
  - Focused per-frame gameplay logic.
- src/widgets/
  - DOM HUD plugins.
- src/data/
  - Generated JSON content, TypeScript handles, and `assets.md`. `src/data/assets.md` is the agent-facing source of truth for generated maps, characters, props, import handles, placement targets, widgets, and audio.
- src/data/common.json
  - Shared `{ name, url }` assets (HUD, props, reference art, music, SFX).
- src/sdk/
  - Capybara SDK facade and internals. Gameplay code should import from `src/sdk/index.ts` and follow `docs/SDK_FACADE.md` instead of reading SDK internals.

## Common assets and audio

`common.json` is a flat `{ name, url }` array for shared HUD, reference art, music, and SFX. `prop_*.json` files are prop groups with optional `items` stages. Maps, characters, common, and props are listed in `src/data/index.ts` as `allDataFiles` for `preloadDataAssets()`. In gameplay code, import generated asset helpers like `getAssetUrl`, `getPropItemUrl`, and `playAudio` from `src/Game.ts`.

Generated map/character JSON is flat. `src/data` exports small adapters to convert it to the shapes the engine expects: `toMapData(map)` wraps a flat map into the `{ panel }` `MapData` for `createGame`, `toArchetype(character, extra)` builds an archetype component bag, and `toPlayerSprite(character)` builds the bootstrap player `sprite`.

## Quick Start

1. Create a scene module in `src/scenes/myScene.ts`.
2. Import generated map/character handles plus `toMapData` / `toArchetype` from `src/data`, and asset/audio helpers from `src/Game.ts`.
3. Call `createGame({ canvasId: "game", map: toMapData(<map handle>) })` in that scene.
4. Register resources, archetypes, systems, inputs, spawn initial entities/props, and mount widgets.
5. Import and call your scene from `src/main.ts`.

## Coordinate Notes

- Coordinates are normalized per panel: 0-1000.
- Entity `x` / `y` are always **top-left** (see `docs/recipes/spawning.md`).
- `spawnAtFeet` — characters (`feetX` = feet center, `feetY` = bottom edge).
- `spawnCentered` — static props (arguments are center; entity stores top-left).
- `placeProp` — generated placement boxes (top-left + size).
- For static image entities, width-only or height-only preserves aspect ratio automatically.
- Spawned props draw above map `ground_patch` masks; set `renderY` (e.g. cell `y2`) for depth vs buildings/characters.

## Map Extensions Gotcha

When maps are stitched with extensions, world origin is the top-left of the compiled map, not always the original base panel.

- Extending to the right/down is easiest to reason about.
- Extending west/north can shift stitched origin.
- If origin shifts, adjust spawn coordinates to keep player/props reachable.

## Placement Guidance

- Read `docs/recipes/spawning.md` before placing entities.
- Prefer spawnAtFeet for actors/player-like entities.
- Prefer spawnCentered for per-cell image props (use `game.get(id)` for top-left after spawn).
- Prefer placeProp with getPlacementTargets for one prop per placement box.
- Keep archetypes for shared defaults only.
- Ensure spawned player/props are reachable in the current walkable map area.

## Player Flow

- Player is an entity, not a special constructor argument.
- Spawn the player archetype in the scene, then call setControlledEntity(playerId).
- This keeps RPG and tower-defense style scenes on the same entity model.

## Public Features

- Spritesheet changes: `setEntityAnimation`, `setEntitySpriteSheets`.
- Data-driven prop placement: `getPlacementTargets`, `placeProp`.
- Hover labels/tooltips: entity `label`/`tooltip`, `getHoverTargetAt`, `createTooltipWidget`.
- Map VFX: background/autoplay spritesheets loop automatically; gameplay/triggered spritesheets use `triggerMapEffect` or `triggerNearestMapEffect`.
- Generated asset/audio helpers exported from `src/Game.ts`: `getAssetUrl`, `getPropData`, `getPropItemUrl`, `listAudioNames`, `getAudio`, `playAudio`, `preloadAudio`, `stopAudio`.
