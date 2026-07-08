---
name: capybara-game-developer
description: REQUIRED GROUNDING. Load this skill BEFORE calling any asset generation tools or writing code. This skill provides the mandatory design rules and architectural patterns for "Capybara," the repository's 2.5D game engine and asset generation framework.
metadata:
  author: Capybara-Developer
  version: 1.2.0
---

# Capybara Game Developer Skill

Required grounding for the Capybara 2.5D game engine and asset pipeline. Load this skill **before** calling asset generation tools or writing gameplay code.

Tool payload structures and field validation are defined in Zod schemas. These docs focus on implementation rules, prompting practices, and integration patterns.

## Quick workflow

1. **Asset prompts** — follow perspective, composition, and style rules before generating maps, characters, props, audio, or HUD art.
2. **Asset wiring** — after assets land in `src/data/`, register handles and connect maps/characters/props/audio into `createGame` / scenes. See [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md).
3. **Gameplay code** — use the public facade (`src/Game.ts`), generated manifests (`src/data/assets.md`, `src/scenes/SCENES.md`), and gameplay modules. Do not modify `src/core/` unless fixing a platform issue.
4. **Cloud features** — import `sdk` from `src/sdk/index.ts` for save/load, auth, and multiplayer; do not open SDK internals by default.

## Additional resources

- For visual design and asset prompting rules, see [PROMPT_GUIDE.md](PROMPT_GUIDE.md)
- For wiring generated maps, characters, props, overlays, HUD scaffolds, and music into the engine, see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md)
- For engine architecture, gameplay patterns, and API contracts, see [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md)
- For SDK auth, save/load, storage, and multiplayer, see [SDK_FACADE.md](SDK_FACADE.md)
