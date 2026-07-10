# AGENTS.md

Shared guidance for coding agents working in this repository (Claude, Codex, Cursor, and others).

## Project Overview

This is a **Capybara 2.5D game template** — a primitives-first API for fast iteration and AI-assisted feature building. The engine uses a component-based architecture with generated assets, scenes, archetypes, systems, and widgets.

The public engine interface is **`src/Game.ts`**. Prefer that facade over `src/core/`. Server features (save/load, auth, multiplayer) go through **`src/sdk/`**.

## Development Commands

```bash
# Development (watch mode with CSS and TypeScript bundling)
npm run dev

# Type checking
npm run typecheck
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
- **`src/data/`** — Generated JSON content and TypeScript handles. `assets.md` is the agent-facing manifest.
- **`src/sdk/`** — Capybara SDK facade for save/load, auth, multiplayer. Import from `src/sdk/index.ts`.

### Data Flow

1. **Generated assets** live in `src/data/` as JSON files with TypeScript exports
2. **Adapters** in `src/data/adapters.ts` convert flat JSON to engine shapes: `toMapData()`, `toArchetype()`, `toPlayerSprite()`
3. **Scenes** import generated handles and adapters, call `createGame()`, register archetypes/systems/widgets, spawn entities
4. **Systems** run per-frame logic via the GameAPI facade

## Key Architectural Rules

### Documentation Authority

This project uses **documentation-driven development**. When working with generated assets or engine patterns:

1. **`src/data/assets.md`** — Source of truth for generated maps, characters, props, widgets, audio, animation names, placement targets
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
2. After generation, update `src/data/assets.md` with new handles and facts
3. Import handles in scenes using `src/data/` adapters
4. For common assets (HUD, reference art, music, SFX), add to `src/data/common.json` as `{ name, url }`

### Player Entity Pattern

- Player is an entity, not a constructor argument
- Spawn player archetype in the scene, then call `game.setControlledEntity(playerId)`
- This keeps RPG and tower-defense style scenes unified

### Scene Creation Pattern

Scenes should:

- Return synchronously (no top-level `async`)
- Accept optional `onAudioReady` hook from loading gate for browser-gated playback (music, `AudioContext.resume()`)
- Register resources, archetypes, systems, inputs, widgets in scene setup
- Start SDK/save-load as async tasks that update resources when complete

Example:

```typescript
import { createGame } from "../Game";
import { mapMain, toMapData, charPlayer, toArchetype } from "../data";

export function createMainScene({
  onAudioReady,
}: {
  onAudioReady?: () => void;
}) {
  const game = createGame({
    canvasId: "game",
    map: toMapData(mapMain),
    cameraEdgePadding: 120,
  });

  // Register resources, archetypes, systems, inputs, widgets
  game.defineArchetype("player", toArchetype(charPlayer, { speed: 190 }));
  const playerId = game.spawnAtFeet("player", 500, 820);
  game.setControlledEntity(playerId);

  // Browser-gated audio
  if (onAudioReady) {
    onAudioReady(() => {
      playAudio("music_main", { loop: true });
    });
  }
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

## Notes

Do not cast type to unknow to bypass typescript error

## Build Output

- Production build outputs to `dist/` with hashed filenames
- `scripts/build.ts` bundles TypeScript with esbuild, builds CSS with Tailwind, and updates `index.html` with hashed asset references
- TypeScript strict mode is **disabled** for flexibility during rapid prototyping

## Agent harness layout

| Path | Role |
|------|------|
| `AGENTS.md` | Shared instructions (this file) — source of truth for all agents |
| `CLAUDE.md` | Claude entry — imports this file via `@AGENTS.md` |
| `.claude/skills/` | Project skills for Claude Code |
| `.agents/skills/` | Same skills for Codex / other harnesses (real copy, not a symlink) |

Keep `.claude/skills/` and `.agents/skills/` in sync when editing a skill. Load **`capybara-game-developer`** before asset generation or gameplay work.
