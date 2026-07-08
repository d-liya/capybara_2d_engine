---
name: capybara-game-developer
description: REQUIRED GROUNDING. Load this skill BEFORE calling any asset generation tools or writing code. After generating assets, the agent MUST wire them into the game per ASSET_INTEGRATION.md — generation alone is incomplete. Covers Capybara 2.5D engine design rules, asset prompts, and architectural patterns.
metadata:
  author: Capybara-Developer
  version: 1.3.0
---

# Capybara Game Developer Skill

Required grounding for the Capybara 2.5D game engine and asset pipeline. Load this skill **before** calling asset generation tools or writing gameplay code.

Tool payload structures and field validation are defined in Zod schemas. These docs focus on implementation rules, prompting practices, and integration patterns.

## Mandatory post-generation rule

**Generating assets is not done until they are wired into the game.** After every successful asset-generation tool call:

1. Read `src/data/assets.md` for the new handles, placement ids, overlays, audio names, and HUD/widget exports.
2. Follow [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md) — register files (`index.ts` / `props.ts` / `common.json`), preload, and connect maps, characters, props, overlays, HUD scaffolds, and music into `createGame` / the active scene / `main.ts`.
3. Do not stop at “assets were generated” or leave new JSON unused on disk. Wiring is part of the same task unless the user explicitly asks for generation only.

## Quick workflow

1. **Asset prompts** — follow perspective, composition, and style rules before generating maps, characters, props, audio, or HUD art.
2. **Call the asset tool** — generate the batch.
3. **Wire immediately** — register and integrate per [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md) (required after step 2).
4. **Gameplay code** — use the public facade (`src/Game.ts`), generated manifests (`src/data/assets.md`, `src/scenes/SCENES.md`), and gameplay modules. Do not modify `src/core/` unless fixing a platform issue.
5. **Cloud features** — import `sdk` from `src/sdk/index.ts` for save/load, auth, and multiplayer; do not open SDK internals by default.

## Additional resources

- For visual design and asset prompting rules, see [PROMPT_GUIDE.md](PROMPT_GUIDE.md)
- For wiring generated maps, characters, props, overlays, HUD scaffolds, and music into the engine, see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md)
- For engine architecture, gameplay patterns, and API contracts, see [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md)
- For SDK auth, save/load, storage, and multiplayer, see [SDK_FACADE.md](SDK_FACADE.md)
