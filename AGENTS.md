# AGENTS.md

Shared guidance for coding agents working in this repository (Claude, Codex, Cursor, and others).

## Project Overview

This is a **Capybara 2.5D game template** — a primitives-first API for fast iteration and AI-assisted feature building. The engine uses a component-based architecture with generated assets, scenes, archetypes, systems, and widgets.

The public engine interface is **`src/Game.ts`**. Prefer that facade over `src/core/`. Server features (save/load, auth, multiplayer) go through **`src/sdk/`**.

## Development Commands

```bash
# Development (Vite: live reload + Tailwind/PostCSS)
npm run dev

# Type checking
npm run typecheck

# Production build (Vite → dist/)
npm run build
```

## Architecture & Code Organization

### Core Structure

- **`src/Game.ts`** — Public facade API (`createGame()`). This is the primary interface for all gameplay code.
- **`src/main.ts`** — Bootstrap entrypoint. Preloads assets/audio, creates loading gate, delegates to scene creation.
- **`src/core/`** — Runtime internals (camera, input, map, rendering, widgets manager). Do NOT import from here directly; use the GameAPI facade.
- **`src/scenes/`** — Scene entrypoints and orchestration. Each scene calls `createGame()` and orchestrates resources, archetypes, systems, inputs, and widgets.
- **`src/systems/`** — Per-frame gameplay logic (e.g., footstep audio, AI waves, combat). Systems receive `(dt, game)` and run each frame.
- **`src/archetypes/`** — Reusable entity defaults (body/render prefabs).
- **`src/widgets/`** — DOM HUD plugins mounted via `game.useWidget()`.
- **`src/data/`** — Generated JSON content and TypeScript handles (`map_*.json`, `char_*.json`, `prop_*.json`, `common.json`, exports in `index.ts`).
- **`src/sdk/`** — Capybara SDK facade for save/load, auth, multiplayer. Import from `src/sdk/index.ts`.

### Data Flow

1. **Generated assets** live in `src/data/` as JSON files with TypeScript exports
2. **Adapters** in `src/data/adapters.ts` convert flat JSON to engine shapes: `toMapData()`, `mergeMapSprites()`, `toArchetype()`, `toPlayerSprite()`. Map v2 cut-out sprites live in `map_*.sprites.json` and are merged before `toMapData`.
3. **Scenes** import generated handles and adapters, call `createGame()`, register archetypes/systems/widgets, spawn entities
4. **Systems** run per-frame logic via the GameAPI facade

## Key Architectural Rules

### Documentation Authority

This project uses **documentation-driven development**. When working with generated assets or engine patterns:

1. **`src/data/` JSON** — Source of truth for generated maps, characters, props, audio, animation names, and placement (`map_*.json`, `char_*.json`, `prop_*.json`, `common.json`; handles exported from `index.ts` / `props.ts`). Prefer lean `map_*.json` over `map_*.sprites.json` unless you need polygons.
2. **`src/scenes/SCENES.md`** — Scene composition facts (resources, archetypes, systems, inputs, widgets)
3. **`docs/recipes/`** — Optional implementation patterns (combat, inventory, NPCs, etc.)
4. **DO NOT** reverse-engineer `src/core/` or SDK internals — build from the docs and facades

### Coordinate System

- **Normalized coordinates**: 0-1000 per panel
- **Entity `x`, `y`**: Always **top-left** corner
- **Spawning methods**:
  - `spawnAtFeet(archetype, feetX, feetY, props)` — For characters (feetX = feet center, feetY = bottom edge)
  - `spawnCentered(archetype, centerX, centerY, props)` — For static props (arguments are center; entity stores top-left)
  - `placeProp(archetype, placement, props)` — For generated placement boxes (top-left + size)
- **Map extensions**: When stitching panels, world origin is the compiled map's top-left. Extending west/north shifts origin; adjust spawn coordinates to keep entities reachable.

### Asset Integration

When generating new assets (maps, characters, props, audio):

1. **Generation alone is incomplete** — assets must be wired into the game
2. Register new JSON in `src/data/index.ts` / `props.ts` / `common.json` and export handles
3. Import those handles in scenes using `src/data/` adapters
4. For common assets (HUD, reference art, music, SFX), add to `src/data/common.json` as `{ name, url }`

**Map edit UI sync (Capybara builder → this repo):** erase / state / VFX / grid patches arrive already compiled into `map_*.json` as unified `mapOverlays` (`kind`: `erase` | `state` | `vfx` | `grid`). Placed characters may appear as `characterPlacements` on the map JSON and in `src/data/assets.md`.

- Do **not** paste overlay image URLs or recreate patches by hand.
- Wire gameplay only: `game.setMapOverlayState(id, state)`, `game.triggerMapEffect(...)` for gameplay VFX, and `spawnAtFeet` / `toArchetype` for `characterPlacements`.
- See `.agents/skills/capybara-game-developer/ASSET_INTEGRATION.md`.

### Player Entity Pattern

- Player is an entity, not a constructor argument
- Spawn player archetype in the scene, then call `game.setControlledEntity(playerId)`
- This keeps RPG and tower-defense style scenes unified

### Mobile-first (required)

Treat phone browsers as a first-class target whenever you add gameplay:

1. **Never ship keyboard-only intent.** Bind discrete actions with `bindInputAction`, handle them with `onInputAction`, and expose the same names on touch via `createGame({ touchControls: { actions: [...] } })` or `dispatchInputAction`.
2. **Movement is shared.** WASD and the default touch D-pad both drive `setMovementInput` / the controlled entity. Do not invent a separate touch movement system.
3. **Pad the camera for HUD chrome.** Use `cameraEdgePadding` (and optional `followZoom` / `maxViewportScale`) so edge controls do not cover walkable corners. Default touch controls sit in the bottom corners (`zIndex` 100–299).
4. **High-res maps.** The canvas uses a DPR-aware backing store; prefer `image-rendering: auto` for photographic maps. See `docs/recipes/mobile-touch-controls.md`.

### Scene Creation Pattern

Scenes should:

- Return synchronously (no top-level `async`)
- Accept optional `onAudioReady` hook from loading gate for browser-gated playback (music, `AudioContext.resume()`)
- Also unlock looping BGM on first `keydown`/`pointerdown` — in local/dev `onContinue` is a no-op
- Register resources, archetypes, systems, inputs, widgets in scene setup
- Start SDK/save-load as async tasks that update resources when complete
- Configure touch action buttons to match keyboard bindings (or pass `touchControls: false` only for non-interactive tools)

Example:

```typescript
import { createGame, getAudio } from "../Game";
import { mapMain, toMapData, charPlayer, toArchetype } from "../data";

export function createMainScene({
  onAudioReady,
}: {
  onAudioReady?: (start: () => void) => void;
}) {
  const game = createGame({
    canvasId: "game",
    map: toMapData(mapMain),
    cameraEdgePadding: 120,
    touchControls: {
      actions: [{ action: "interact", label: "E" }],
    },
  });

  game.bindInputAction("interact", ["KeyE"]);
  game.onInputAction("interact", ({ phase }) => {
    if (phase !== "down") return;
    game.emit("player:interact");
  });

  // Register resources, archetypes, systems, inputs, widgets
  game.defineArchetype("player", toArchetype(charPlayer, { speed: 190 }));
  const playerId = game.spawnAtFeet("player", 500, 820);
  game.setControlledEntity(playerId);


  // Browser-gated audio: production gate + first-input fallback (required in local/dev)
  let musicStarted = false;
  const startMusic = () => {
    if (musicStarted) return;
    const music = getAudio("music_main");
    if (!music) return;
    musicStarted = true;
    music.loop = true;
    music.volume = 0.05;
    void music.play().catch(() => {
      musicStarted = false;
    });
  };
  onAudioReady?.(startMusic);
  window.addEventListener("pointerdown", startMusic, {
    once: true,
    passive: true,
  });
  window.addEventListener("keydown", startMusic, { once: true });
}
```

## Common Patterns

### Importing Generated Assets

```typescript
// Maps and characters
import { mapStudy, charPlayer, toMapData, toArchetype } from "./data";

// Asset and audio helpers
import {
  getAssetUrl,
  getPropData,
  getPropItemUrl,
  playAudio,
  stopAudio,
} from "./Game";

// SDK
import { sdk } from "./sdk";
```

### Entity Lifecycle

```typescript
// Define archetype
game.defineArchetype("enemy", {
  spriteSheets: [{ name: "idle", url: "/sprites/enemy.png", frame_count: 4 }],
  speed: 100,
  radius: 30,
  width: 64,
  height: 64,
});

// Spawn
const enemyId = game.spawnAtFeet("enemy", 300, 400, { health: 100 });

// Update
game.patch(enemyId, { health: 80 });

// Query
const enemies = game.query({ tags: ["enemy"] });

// Destroy
game.destroy(enemyId);
```

### Systems

```typescript
game.registerSystem("combat", (dt, game) => {
  const player = game.getControlledEntity();
  const enemies = game.query({ tags: ["enemy"] });

  enemies.forEach((enemy) => {
    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (distance < 100) {
      // Combat logic
    }
  });
});
```

### Widget Mounting

```typescript
import { createHealthBarWidget } from "./widgets/HealthBarWidget";

game.useWidget(createHealthBarWidget, { position: "top-left" });
```

## SDK Usage

The SDK lazy-initializes from `window.gameId` in `index.html`. No explicit init required for most cases.

```typescript
import { sdk } from "./sdk";

// Save/Load
await sdk.save.saveGameData({ level: 5, gold: 1000 });
const data = await sdk.save.loadGameData();

// Auth
await sdk.auth.ensureGuestSession();
const user = sdk.auth.getCurrentUser();

// Multiplayer
await sdk.multiplayer.joinRoom("room-123", { playerName: "Alice" });
const state = sdk.multiplayer.getRoomState();
```

## Recipes Reference

When implementing specific gameplay features, consult `docs/recipes/`:

- `spawning.md` — Entity placement patterns
- `combat-projectiles.md` — Combat systems and projectile handling
- `enemy-ai-waves.md` — Enemy AI and wave spawning
- `farming-sim.md` — Farming mechanics
- `inventory-tools.md` — Inventory and tool systems
- `rpg-quests-inventory.md` — RPG quest and inventory patterns
- `npc-primitives.md` — NPC state, movement, bubbles, proximity, speech
- `npc-dialogue.md` — Scripted dialogue and dialogue widgets
- `hud-widget.md` — HUD widget creation patterns
- `world-pointer-input.md` — Pointer/click input handling
- `mobile-touch-controls.md` — Touch D-pad + action buttons (keyboard parity)
- `save-load.md` — Save/load persistence patterns
- `map-placement.md` — Prop placement with generated placement boxes
- `season-atmosphere.md` — Seasonal effects

## Special Notes

### Map Effects

- Background/autoplay spritesheets loop automatically
- Gameplay/triggered spritesheets: use `game.triggerMapEffect(tag)` or `game.triggerNearestMapEffect(tag, x, y)`

### Pathfinding

```typescript
const path = game.findPath({ x: startX, y: startY }, { x: endX, y: endY });
game.setEntityDestination(entityId, { x: targetX, y: targetY });

// Check walkability
const isBlocked = game.isFeetPositionBlocked(feetX, feetY);
const { feetX, feetY } = game.resolveNearestWalkableFeet(targetX, targetY);
```

### Hover & Tooltips

```typescript
// In archetype definition
game.defineArchetype("chest", {
  // ...
  label: "Treasure Chest",
  tooltip: "Contains gold and items",
});

// In gameplay
const target = game.getHoverTargetAt(clientX, clientY);
const current = game.getCurrentHoverTarget();
```

### Input Actions

```typescript
game.bindInputAction("interact", ["KeyE"]);
game.onInputAction("interact", () => {
  // Handle interaction
});

// Mobile/HUD can dispatch same actions
game.dispatchInputAction("interact");
```

Touch D-pad movement uses `game.setMovementInput` / `clearMovementInput` (same path as WASD). Configure default on-screen buttons with `createGame({ touchControls: { actions: [...] } })`. See `docs/recipes/mobile-touch-controls.md`.
## Notes

Do not cast type to unknow to bypass typescript error

## Build Output

- **Dev:** `npm run dev` runs Vite on port 3000 (auto-opens browser, full-page reload on save)
- **Production:** `npm run build` typechecks then runs `vite build` → `dist/` with hashed assets and rewritten `index.html`
- CSS uses root `styles.css` with `@import "tailwindcss"` and the `@tailwindcss/vite` plugin (no PostCSS config)
- TypeScript strict mode is **disabled** for flexibility during rapid prototyping

## Agent harness layout

| Path              | Role                                                               |
| ----------------- | ------------------------------------------------------------------ |
| `AGENTS.md`       | Shared instructions (this file) — source of truth for all agents   |
| `CLAUDE.md`       | Claude entry — imports this file via `@AGENTS.md`                  |
| `.claude/skills/` | Project skills for Claude Code                                     |
| `.agents/skills/` | Same skills for Codex / other harnesses (real copy, not a symlink) |

Keep `.claude/skills/` and `.agents/skills/` in sync when editing a skill. Load **`capybara-game-developer`** before asset generation or gameplay work.
