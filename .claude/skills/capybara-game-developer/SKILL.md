---
name: capybara-game-developer
description: REQUIRED GROUNDING. Load this skill BEFORE calling any asset generation tools or writing code. Requires capybara-mcp to be active — if MCP tools are unavailable, direct the user to https://developer.capybara.build/ for the install command and API key. After generating assets, the agent MUST wire them into the game per ASSET_INTEGRATION.md — generation alone is incomplete. Covers Capybara 2.5D engine design rules, asset prompts, and architectural patterns.
metadata:
  author: Capybara-Developer
  version: 1.4.2
---

# Capybara Game Developer Skill

Required grounding for the Capybara 2.5D game engine and asset pipeline. Load this skill **before** calling asset generation tools or writing gameplay code.

Tool payload structures and field validation are defined in Zod schemas. These docs focus on implementation rules, prompting practices, and integration patterns.

## Capybara MCP prerequisite

This repository requires **`capybara-mcp`** to be activated before asset generation tools can be used.

If the capybara-mcp tools are **not** available in the assistant's tool list:

1. **Notify the user** that asset generation is unavailable until the Capybara MCP is installed and enabled.
2. **Direct them to** [https://developer.capybara.build/](https://developer.capybara.build/) — sign in, create an API key, and copy the MCP install command from the developer console.
3. **Do not** attempt workarounds or treat generation as complete without real tool output. Wait for MCP setup, or ask the user to confirm once it is active.

### Generation timing, batching, and job recovery

- **Expect 3–4 minutes** for a typical generation job. Larger batches (more assets) can take longer — wait for the job to finish rather than assuming it hung.
- **Do not call the generate tool in parallel.** Submit **one generation call at a time**. The tool accepts a **batch of assets** in a single request — put related assets in that one batch instead of firing multiple generate calls together.
- **Cancelling a submitted job still costs credits.** Prefer waiting for the in-flight job to complete. Client cancel does not stop a job already submitted on the server.
- **If the user cancels mid-way, do not start a new generate call.** Recover the existing request: check `.capybara` for logs/job IDs and use `get_job_status` (or the equivalent status/result tool) to fetch the submitted job.
- **When polling job status, stop after three attempts.** Do not poll continuously. After three unsuccessful polls, tell the user generation is still running and that it is better to wait a while before checking again.

## Mandatory post-generation rule

**Generating assets is not done until they are wired into the game.** After every successful asset-generation tool call:

1. Read `src/data/assets.md` for the new handles, placement ids, overlays, audio names, and HUD/widget exports.
2. Follow [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md) — register files (`index.ts` / `props.ts` / `common.json`), preload, and connect maps, characters, props, overlays, HUD scaffolds, and music into `createGame` / the active scene / `main.ts`.
3. Do not stop at “assets were generated” or leave new JSON unused on disk. Wiring is part of the same task unless the user explicitly asks for generation only.

## When the user says an asset looks bad

If the user complains that a particular prop/character/image “isn’t good,” “looks wrong,” or “feels off,” **check integration aspect ratio before regenerating**. Stretching or squashing via arbitrary fixed `width`/`height` often ruins the feel of otherwise fine art. Prefer preserving source proportions (see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md) — Prop aspect ratio). Only regenerate when the art itself is the problem.

## Generated bounding box order

Generated asset JSON stores all 2D bounds as **`[y1, x1, y2, x2]`** — **y before x**, not `[x1, y1, x2, y2]`.

This applies to `box_2d`, colliders, walkable masks, placement boxes, overlay draw bounds, and any other generated bounding array.

- `box_2d[0]` = ymin, `box_2d[1]` = xmin, `box_2d[2]` = ymax, `box_2d[3]` = xmax
- Do **not** assign `box_2d[0]` to `x1` or treat the array as x-first
- At runtime, use `parseBox2d()` or facade helpers such as `game.getPlacementTargets()[].bounds` (`{ x1, y1, x2, y2 }`) instead of indexing raw arrays

## Quick workflow

1. **Asset prompts** — follow perspective, composition, and style rules before generating maps, characters, props, audio, or HUD art.
2. **Call the asset tool** — one generate call at a time; put related assets in a single batch (expect ~3–4+ minutes).
3. **Wire immediately** — register and integrate per [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md) (required after step 2).
4. **Gameplay code** — use the public facade (`src/Game.ts`), generated manifests (`src/data/assets.md`, `src/scenes/SCENES.md`), and gameplay modules. Do not modify `src/core/` unless fixing a platform issue.
5. **Cloud features** — import `sdk` from `src/sdk/index.ts` for save/load, auth, and multiplayer; do not open SDK internals by default.

## Additional resources

- For visual design and asset prompting rules, see [PROMPT_GUIDE.md](PROMPT_GUIDE.md)
- For wiring generated maps, characters, props, overlays, HUD scaffolds, and music into the engine, see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md)
- For engine architecture, gameplay patterns, and API contracts, see [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md)
- For SDK auth, save/load, storage, and multiplayer, see [SDK_FACADE.md](SDK_FACADE.md)
