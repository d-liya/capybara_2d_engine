---
name: capybara-game-developer
description: REQUIRED GROUNDING for Capybara 2.5D engine work in hosted builder / OpenHands projects. Assets arrive under src/data via sync and bootstrapWorldFromAssets. Covers engine design rules, integration patterns, and gameplay wiring.
metadata:
  author: Capybara-Developer
  version: 1.5.2
---

# Capybara Game Developer Skill

Required grounding for the Capybara 2.5D game engine. Load this skill **before** writing gameplay code.

Art is authored in the Capybara Maps / Jobs UI (or first-pass chat). Your lane is gameplay code against the synced projection.

## Hosted builder / OpenHands

Synced projects have `src/data/capybara-assets.json` and/or `src/scenes/generatedWorld.ts`.

- Sync wrote manifests, registries, and `generatedWorld.ts`. `bootstrapWorldFromAssets` loads the map, spawns `characterPlacements`, starts BGM, registers atmosphere, and binds default interact.
- Extend custom gameplay (`configureGameplay`, systems, widgets, overlay triggers, dialogue, combat, quests). See [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md).
- Treat manifest-owned files as read-only. Spawn only entities you invent for custom gameplay.

## When the user says an asset looks bad

If the user complains that a prop/character/image “isn’t good,” “looks wrong,” or “feels off,” **check integration aspect ratio before asking them to regenerate**. Prefer preserving source proportions (see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md) — Prop aspect ratio). Ask for Maps / Jobs regeneration when the art itself is the problem.

## Generated bounding box order

Generated asset JSON stores all 2D bounds as **`[y1, x1, y2, x2]`** (y before x).

This applies to `box_2d`, colliders, walkable masks, placement boxes, overlay draw bounds, and any other generated bounding array.

- `box_2d[0]` = ymin, `box_2d[1]` = xmin, `box_2d[2]` = ymax, `box_2d[3]` = xmax
- At runtime, use `parseBox2d()` or facade helpers such as `game.getPlacementTargets()[].bounds` (`{ x1, y1, x2, y2 }`)

## Quick workflow

1. Read `AGENTS.md`, `src/data/capybara-assets.json`, `src/scenes/generatedWorld.ts`, and relevant manifests.
2. Separate Maps authoring (user) from gameplay code (you).
3. Extend gameplay with the public facade (`src/Game.ts`). Keep changes outside `src/core/` unless fixing a platform issue.
4. Cloud features: import `sdk` from `src/sdk/index.ts`.
5. Run `npm run typecheck`, then confirm with the user in preview.

## Mandatory handoff check

Before telling the user work is ready to look at:

1. Run `npm run typecheck`.
2. Fix any type errors that fail the check.
3. Ask the user whether they see the expected change in the browser.

## Additional resources

- For asset prompting style notes (Maps / Jobs copy), see [PROMPT_GUIDE.md](PROMPT_GUIDE.md)
- For wiring synced assets into gameplay, see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md)
- For engine architecture, gameplay patterns, and API contracts, see [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md)
- For SDK auth, save/load, storage, and multiplayer, see [SDK_FACADE.md](SDK_FACADE.md)
