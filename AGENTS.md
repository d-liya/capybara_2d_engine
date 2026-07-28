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
- **`src/data/`** — Generated JSON content and TypeScript handles (`map_*.json`, `char_*.json`, `prop_*.json`, `huds.json`, `common.json`, `capybara-assets.json`, synced exports in `generated.ts`; stable barrel in `index.ts`).
- **`src/sdk/`** — Capybara SDK facade for save/load, auth, multiplayer. Import from `src/sdk/index.ts`.

### Data Flow

1. **Generated assets** live in `src/data/` as JSON (revision ownership in `capybara-assets.json`)
2. **Adapters** in `src/data/adapters.ts` convert flat JSON to engine shapes: `toMapData()`, `mergeMapSidecars()` / `mergeMapSprites()`, `toArchetype()`, `toPlayerSprite()`. Map v2 cut-out sprites live in `map_*.sprites.json` and placements in `map_*.placements.json`; both are merged before `toMapData`.
3. **Hosted / synced projects**: `src/scenes/generatedWorld.ts` calls `bootstrapWorldFromAssets` — map load, archetypes, `characterPlacements`, BGM, atmosphere, default interact are already live. Extend via `configureGameplay` / systems / widgets.
4. **Systems** run per-frame logic via the GameAPI facade

## Key Architectural Rules

### Documentation Authority

This project uses **documentation-driven development**. When working with generated assets or engine patterns:

1. **`src/data/capybara-assets.json`** — Revision + ownership SoT for the synced projection. Read it first to know which generated files exist.
2. **`src/data/` JSON** — Generated maps, characters, props, audio, overlays, placements (`map_*.json`, `map_*.sprites.json`, `map_*.placements.json`, `char_*.json`, `prop_*.json`, `huds.json`, `common.json`; handles from `generated.ts` / `props.ts`, re-exported by `index.ts`). Prefer lean `map_*.json`; open sidecars for polygons / placement lists. `assets.md` is optional placement hints.
3. **`src/scenes/SCENES.md`** — Scene composition facts (bootstrap, configureGameplay, inputs, widgets)
4. **`docs/recipes/`** — Optional implementation patterns (combat, inventory, NPCs, etc.)
5. Build from the docs and public facades (`src/Game.ts`, `src/sdk/`)

### Coordinate System

- **Normalized coordinates**: 0-1000 per map
- **Entity `x`, `y`**: Always **top-left** corner
- **Spawning methods** (for entities you invent in custom gameplay):
  - `spawnAtFeet(archetype, feetX, feetY, props)` — For characters (feetX = feet center, feetY = bottom edge)
  - `spawnCentered(archetype, centerX, centerY, props)` — For static props (arguments are center; entity stores top-left)
  - `placeProp(archetype, placement, props)` — For generated placement boxes (top-left + size)
- **Map travel**: Each map is a self-contained space. Prefer `game.transitionMap(toMapData(...))` for doors / room swaps (fades by default). Use instant `game.loadMap(...)` when you already own the transition.

### Asset Integration

Maps and Jobs write Postgres; sync compiles a full projection into `src/data` and regenerates `generatedWorld.ts`. After sync:

- `bootstrapWorldFromAssets` loads the map, defines character archetypes, spawns `characterPlacements` (player vs NPC), starts BGM, registers atmosphere, and binds default interact (state overlays / gameplay VFX / enterables).
- Manifest-owned JSON, `generated.ts` / `generated-props.ts`, and `generatedWorld.ts` are read-only — import handles from `src/data/index.ts`.
- Extend gameplay: `configureGameplay`, systems, custom widgets, overlay triggers (`setMapOverlayState`, `triggerMapEffect`), dialogue, combat, quests, inventory.
- Overlays arrive as unified `mapOverlays` on lean `map_*.json` (`kind`: `erase` | `state` | `vfx` | `grid`).
- HUD catalog + widget TS: `huds.json` + `src/widgets/`. Placements may also list `hudPlacements` when authored.
- Replace-mode VFX may include a paired erase underlay with `clearsCollision: false` (hide pixels, keep collider) plus `linkedObstacleLabel`.
- See `.agents/skills/capybara-game-developer/ASSET_INTEGRATION.md`.

### Player Entity Pattern

- Player is an entity (not a constructor argument)
- Bootstrap already spawns the player from Maps role and calls `setControlledEntity`

### Mobile-first (required)

Treat phone browsers as a first-class target whenever you add gameplay:

1. Bind discrete actions with `bindInputAction`, handle them with `onInputAction`, and expose the same names on touch via `createGame({ touchControls: { actions: [...] } })` or `dispatchInputAction`.
2. **Movement is shared.** WASD and the default floating touch joystick both drive `setMovementInput` / the controlled entity.
3. **Pad the camera for HUD chrome.** Use `cameraEdgePadding` (and optional `followZoom` / `cameraFollowLerp` / `maxViewportScale`) so edge controls leave walkable corners clear. Default touch controls use a floating left-side joystick plus bottom-right actions (`zIndex` 100–299).
4. **High-res maps.** The canvas uses a DPR-aware backing store; prefer `image-rendering: auto` for photographic maps. See `docs/recipes/mobile-touch-controls.md`.

### Scene Creation Pattern

Prefer `createMainScene` + `generatedWorld` / `bootstrapWorldFromAssets` and put custom logic in `configureGameplay` (see `src/scenes/SCENES.md`). Use `spawnAtFeet` for entities you invent in custom gameplay.

Scenes should:

- Return synchronously (no top-level `async`)
- Accept optional `onAudioReady` hook from loading gate for browser-gated playback (music, `AudioContext.resume()`)
- Unlock looping BGM on first `keydown`/`pointerdown` when needed — in local/dev `onContinue` is a no-op
- Register systems, inputs, and custom widgets in `configureGameplay` / scene setup
- Start SDK/save-load as async tasks that update resources when complete
- Configure touch action buttons to match keyboard bindings (or pass `touchControls: false` only for non-interactive tools)

Example — extend gameplay after bootstrap:

```typescript
import type { GameAPI } from "../Game";

export function configureGameplay(game: GameAPI) {
  game.bindInputAction("interact", ["KeyE"]);
  game.onInputAction("interact", ({ phase }) => {
    if (phase !== "down") return;
    game.emit("player:interact");
  });

  game.registerSystem("quest", (_dt, g) => {
    // custom quest / dialogue / combat on top of the bootstrapped world
  });
}
```

For entity lifecycle helpers (`spawnAtFeet`, `patch`, `query`) used on extras you invent, see Common Patterns below.

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
- `mobile-touch-controls.md` — Floating touch joystick + action buttons (keyboard parity)
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

Touch joystick movement uses `game.setMovementInput` / `clearMovementInput` (same path as WASD). Configure default on-screen buttons with `createGame({ touchControls: { actions: [...] } })`. See `docs/recipes/mobile-touch-controls.md`.
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
| `.agents/skills/` | Engine skill pack (`capybara-game-developer`)                      |

Read **`AGENTS.md`** first. Open `.agents/skills/capybara-game-developer/` for integration recipes and API contracts. Assets arrive via Maps / Jobs sync — extend gameplay on the bootstrap-already-live world.
