# Scene Manifest

This file gives agents a fast overview of scene composition without scanning the codebase.

If this file conflicts with `src/data/assets.md`, `assets.md` wins for generated asset handles, widget factories, animation names, prop names, audio names, and placement target facts. Update this file after implementation so it does not remain stale.

> Names like `mapMain`, `charPlayer`, `charNpc`, and `createHudWidget` below are placeholders. The real map/character/prop/widget/animation/audio handles are game-specific — copy them from `src/data/assets.md`, not from this manifest.

## Current status

No project-specific scene is currently wired in this template. `src/main.ts` preloads generated assets/audio, creates the loading gate, and leaves scene creation to the game implementation.

Scene creation should return synchronously. Start save-load/SDK bootstrap inside scenes as async tasks that update resources when complete. Browser-gated playback (looping music, `AudioContext.resume()`, intro `sdk.audio.speak(...)`, and similar APIs) should be registered on the loading gate continue hook passed from `src/main.ts`, for example `createMainScene({ onAudioReady: loadingGate.onContinue })`, so playback starts from the production **Tap To Continue** gesture instead of passive scene startup.

## Recommended scene shape

A scene file should orchestrate only. Heavy logic lives in `src/systems`, `src/inputs`, `src/widgets`, `src/archetypes`, and named NPC modules in `src/npcs`.

Game config — wrap the flat generated map handle with `toMapData(...)`:

```ts
import { createGame } from "../Game";
import { mapMain, toMapData } from "../data";

const game = createGame({
  canvasId: "game",
  map: toMapData(mapMain),
  cameraEdgePadding: 120,
});
```

Typical composition:

- **Resources** — register long-lived state such as dialogue, inventory, schedules, quests, save flags, or NPC-specific state.
- **Archetypes** — define reusable body/render prefabs from generated characters and props.
- **NPC modules** — one file per named NPC in `src/npcs`; setup identity, voice profile, prompts, memory ids, and behavior hooks.
- **Systems** — generic per-frame loops such as clocks, footstep audio, schedules, proximity scans, or autosave queues.
- **Inputs** — `bindInputAction` + `onInputAction`; mobile/HUD should dispatch the same actions.
- **Widgets** — mount generated HUD widgets and reusable widgets with `game.useWidget(...)`.
- **Audio start** — accept an optional `onAudioReady`/loading-gate continue hook from `src/main.ts`; set up `getAudio(...)` elements during scene creation, but call `play()`, `AudioContext.resume()`, or intro `sdk.audio.speak(...)` only inside that hook or from later gameplay inputs.
- **SDK** — `import { sdk } from "../sdk";` for save/load, AI NPCs, and TTS. SDK calls lazy-initialize from `window.gameId` in `index.html`.

## NPC and dialogue references

- `docs/recipes/npc-primitives.md` — NPC state, movement, bubbles, proximity, world context, speech, and one-file-per-character structure.
- `docs/recipes/npc-dialogue.md` — scripted dialogue, sparse voiced barks, dialogue widgets, and LLM-backed dialogue.
- `docs/recipes/llm-backed-npc-tools.md` — direct `sdk.ai.addTool(...)` examples for NPC agents.
- `docs/recipes/tts-prompting.md` — grounded TTS prompt structure, voice profiles, tags, animals/creatures, and playback policy.

## Maintenance rule

When a scene is added or rewired, update this manifest with:

- active scene file
- map and stitched extensions
- resources
- archetypes/NPC modules
- systems
- inputs
- widgets
- SDK usage
