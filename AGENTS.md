# AGENTS.md

Shared guidance for coding agents in this checkout. Keep this file lean. **Current state** is the living project status — rewrite that section when the world or gameplay changes; do not append.

## Engine

This is a **Capybara 2.5D** game: fixed-camera top-down / 3/4 pixel-art stages, component runtime, generated assets.

- Public API: `src/Game.ts`. Do not import `src/core/`.
- Gameplay: extend `configureGameplay` in `src/scenes/mainScene.ts`. Bootstrap already loads the start map, archetypes, character/prop placements, BGM, atmosphere, default interact, and the controlled player. Do not re-spawn those.
- Generated projection: `src/data/`. Import handles from `src/data/index.ts`. Do not edit `generatedWorld.ts` or the asset ledger.
- HUD scaffolds: `src/widgets/`. Mount them in gameplay; use the Painted Pixel kit in `styles.css`.
- Coordinates: 0–1000 per map. Entity `x,y` is top-left. Spawn characters with `spawnAtFeet`. Map travel uses `transitionMap` / enterable metadata, not baked-pixel edits.
- Keyboard and touch share the same input actions.

`WORLD.md` is the generated-world contract (maps, IDs, animations, what code must wire). `DESIGN.md` is the playable beat sheet. Do not copy those ledgers into this file.

## Current state

- Phase: empty
- Design: none. Write `DESIGN.md` before generating the world.
- World: none. `WORLD.md` has no generated maps yet.
- Gameplay: stock `configureGameplay` only.
- Next: lock the beat sheet in `DESIGN.md`, create the world for those beats, then rewrite this section.

## How to work

1. Read **Current state** above.
2. If `DESIGN.md` is empty, write the playable beat sheet first. Do not generate the world or wire gameplay yet.
3. If the world is empty, generate it from `DESIGN.md` (Studio: staged `generate_asset_batch`, then `save_world_state`). Then read `WORLD.md` and the synced `src/data` projection.
4. Wire behavior in `configureGameplay` / small systems / widgets. Do not tour the engine to “understand the pipeline.”
5. After the world or gameplay changes, **replace** Current state (phase, what exists, what is still unwired, next action). Keep it under a short page.
6. If Current state does not cover a mechanic, open **one** matching file:
   - `.agents/skills/capybara-game-developer/CAPYBARA_ENGINE.md` — GameAPI contracts
   - `.agents/skills/capybara-game-developer/ASSET_INTEGRATION.md` — wiring synced assets
   - `docs/recipes/npc-primitives.md`, `hud-widget.md`, `rpg-quests-inventory.md`, `combat-projectiles.md`, `mobile-touch-controls.md` — specific patterns
