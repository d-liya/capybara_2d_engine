# Asset Integration Playbook

Wire assets into gameplay. For deep GameAPI contracts, see [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md).

## Hosted builder / OpenHands sync

Assets arrive from Maps / Jobs sync when `src/data/capybara-assets.json` and/or a non-stub `src/scenes/generatedWorld.ts` are present.

Each map is split across files (merged in `generated.ts` via `mergeMapSidecars` before `toMapData`):

| File | Contents |
| ---- | -------- |
| `map_<id>.json` | Lean: `url`, `walkableBoxes`, `mapOverlays` (`erase` / `state` / `vfx` / `grid`) |
| `map_<id>.sprites.json` | Cut-outs, `pixel_bbox`, `spriteUrl`, `collision_polygons` |
| `map_<id>.placements.json` | `placement`, `characterPlacements`, `hudPlacements`, `atmospherePlacements` |

What sync + `bootstrapWorldFromAssets` already do:

1. Registries (`generated.ts` / `generated-props.ts` / `common.json` / `huds.json`) are written by sync.
2. Bootstrap defines character archetypes, spawns `characterPlacements` (player vs NPC), starts map-scoped BGM / ambience / autoplay SFX, and binds default interact (enterables → `transitionMap`, state overlays, gameplay VFX). Forward enterables get a synthetic return exit at `destinationSpawnBox2d` when the destination has no authored back-link.
3. Atmosphere loads automatically from `toMapData(...).atmospherePlacements` inside the map runtime — bootstrap does **not** call a separate atmosphere API.
4. Treat manifest-owned JSON and `generatedWorld.ts` as read-only; import handles from `src/data/index.ts`.
5. Extend gameplay in `configureGameplay` (`src/scenes/mainScene.ts`): systems, custom widgets, overlay triggers, dialogue, combat, quests, inventory, plus any entities you invent.

Bootstrap does **not** auto-spawn props from `placement[]`, mount HUDs from `hudPlacements` / `huds.json`, or run dialogue. Those are gameplay work.

Identifiers like `mapMain`, `charPlayer` below are **placeholders**. Copy real names from generated JSON / exports.

Overlays from the builder are already on the lean map — wire interactions with the overlay APIs below.

HUD catalog lives in `huds.json` with widget TS under `src/widgets/`. `hudPlacements` may be authored on the map sidecar; mount and adapt those widgets yourself (they are not auto-mounted).

## Source of truth

1. **`src/data/capybara-assets.json`** — revision + ownership of the synced projection (absent until assets sync).
2. **`src/data/` generated JSON** — map/character/prop/audio/HUD handles (`map_*.json` + `.sprites.json` / `.placements.json` sidecars, `char_*.json`, `prop_*.json`, `huds.json`, `common.json`; exports from `generated.ts` / `generated-props.ts`, re-exported by `index.ts`). Copy real names from these files.
3. **`src/data/adapters.ts`** — shape bridges (`toMapData`, `mergeMapSidecars`, `mergeMapSprites`, `toArchetype`, `toPlayerSprite`). Stable across regenerations.
4. **`src/Game.ts`** — public gameplay API (`createGame`, `transitionMap` / `loadMap`, overlays, audio helpers, spawning).
5. **`src/scenes/generatedWorld.ts` + `bootstrapWorldFromAssets`** — what is already live this revision. Extend via `configureGameplay`, do not re-bootstrap by hand.

Prefer lean `map_*.json` for layout/overlays. Open `map_*.sprites.json` for collision polygons and `map_*.placements.json` for placement / character / HUD / atmosphere lists.

---

## Which API? (decision tree)

```txt
Need different map geography?
  └─ Separate room / interior ↔ exterior / any travel
       → clear mapLocal in `during`, then game.transitionMap(toMapData(...))

Change a map-baked door / chest / gate visual or collider?
  → game.setMapOverlayState(id, state)

Portable item, crop stage, clue, or placement-box prop?
  → placeProp / spawn + getPropItemUrl(...) imageUrl patch

Map-authored spritesheet VFX?
  → background loops automatically
  → gameplay: triggerMapEffect / triggerNearestMapEffect
```

| Intent                               | API                                                     |
| ------------------------------------ | ------------------------------------------------------- |
| Boot from synced assets              | `bootstrapWorldFromAssets` via `generatedWorld.ts`      |
| Door / room travel (fade by default) | `game.transitionMap(toMapData(...), { spawn, during })` |
| Instant swap (tools / custom fade)   | `game.loadMap(toMapData(...), { spawn })`               |
| Toggle baked overlay state           | `setMapOverlayState`                                    |
| Spawn / stage portable props         | `placeProp` + `getPropItemUrl`                          |
| Trigger map VFX                      | `triggerMapEffect` / `triggerNearestMapEffect`          |

## Recipe: map travel (`transitionMap`)

Each map is a **self-contained** space. Prefer `transitionMap` for house interior → village exterior, dungeon room → overworld, and any other travel between authored maps. It fades to black by default, runs your mid-fade work, swaps the map, then fades back in.

`loadMap` is the instant primitive underneath (same preserve/reset rules). Use it only for tools, tests, or when you already own a custom transition.

Both **preserve** resources, widgets, archetypes, and existing entities. They **reset** navigation/pathfinding, hover, held movement input, and camera bounds; move the controlled entity if `spawn` is set; emit `map:changed`.

Clear room-only entities in `during` when traveling — each map is self-contained:

```ts
import { mapInterior, mapExterior, toMapData } from "../data";

await game.transitionMap(toMapData(mapExterior), {
  spawn: { x: 500, y: 820, anchor: "feet" },
  during: (swap) => {
    for (const id of game.query((c) => c.mapLocal === true)) {
      game.destroy(id);
    }
    swap();
    spawnExteriorStuff(game);
    game.emit("map:entered", { mapId: "exterior" });
  },
});
```

Call `swap()` inside `during` when you want the map load to apply — clear before it, respawn after. If you omit `during`, the map swaps automatically mid-fade.

Optional: `{ fadeMs: 400 }` (default). Live pattern: `src/scenes/bootstrapWorldFromAssets.ts` (enterable placements). Pair with spawn points **outside** the destination trigger zone (and suppress re-entry until the player walks out) to avoid transition loops.

Keep an explicit lifecycle: each NPC/clue/pickup is either `mapLocal` (rebuild), hidden off-map, or intentionally persistent.

Low-level fade helper (rarely needed if you use `transitionMap`): `runScreenFade` from `src/utils/screenFade.ts`.

## Recipe: map overlays (baked state changes)

Prefer **unified `mapOverlays`** on flat `map_*.json` (next to `walkableBoxes`). Each entry has a `kind`:

| `kind`           | Meaning                                                                    | Runtime                         |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------- |
| `state` / `grid` | Multi-state structural patch (door, chest, crop stages)                    | `setMapOverlayState(id, state)` |
| `erase`          | Static remove patch + clear overlapping sprite collision                   | Already applied at load         |
| `vfx`            | Spritesheet loop or trigger (`states[0].mode`: `background` \| `gameplay`) | Autoplay, or `triggerMapEffect` |

**Detached grids** (`kind: "grid"`, `layout: "detached_stages"`): each state has its own `box_2d` (stage art size may differ). Runtime follows `currentState` / `currentMapStateLabel`:

- `"initial"` or `"none"` → draw nothing (base map only)
- a real state name → draw that state's art across the full grid via `gridDimensions` + `gridSpacing` (Maps playground tiling)

`ghostCellDisplay` is Maps-editor only and is not synced to the engine. Do not author or depend on `cellBboxes` (legacy load fallback only).

Overlays from the builder are already on the lean map and placements are in `map_*.placements.json`. Wire interactions with the overlay APIs:

```ts
game.getMapOverlays();
game.getMapOverlayState("north_door"); // e.g. "closed"
game.setMapOverlayState("north_door", "open");

game.on("mapOverlay:changed", ({ id, state }) => {
  // unlock path, start cutscene, etc.
});
```

For a map-baked door/gate, change state with `setMapOverlayState` (same overlay id) — that is the runtime switch.
Optional per-state physics: `blocksMovement: true` plus `collider`/`colliders` (or the state’s full `box_2d`) blocks movement/pathfinding. Open states use `blocksMovement: false` or omit it. Successful changes clear pathfinding cache and emit `mapOverlay:changed`.

## Map walkability / collision (generated JSON)

All of this lives in the generated map files (`walkableBoxes` / overlays in lean `map_*.json`; placement lists in `map_*.placements.json`; sprite colliders in `map_*.sprites.json`). Prefer editing those boxes over gameplay hacks. Ask the user to adjust boxes in the Maps panel rather than hand-editing generated JSON.

| Symptom                                        | Fix                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------ |
| Walking over edge props (fences, borders)      | Shrink `walkableBoxes` inward from the edges                                   |
| Walking on top of / too far behind an obstacle | Enlarge that obstacle’s collider box                                           |
| Can walk “behind” props visually               | Expected — y-sorting + layered masks; colliders block movement, not draw order |
| Bound total roam area                          | `walkableBoxes` = the playable footprint                                       |

**Roles:** walkable boxes = where the player may go; colliders = solid blockers; masks + y-sort = depth (walk-behind look).

## Recipe: spawned prop state (not overlays)

Portable items, crop stages, and clues use placement + entity image swaps:

```ts
import { getPropItemUrl } from "../Game";

const overlayId = game.placeProp("cropOverlay", target, { cropId: target.id });
game.patch(overlayId, {
  imageUrl: getPropItemUrl("<prop_group>", "<item>"),
});
```

Details: [`docs/recipes/map-placement.md`](../../../docs/recipes/map-placement.md), [`docs/recipes/spawning.md`](../../../docs/recipes/spawning.md).

### Prop aspect ratio (generated art)

**Integrating with the correct aspect ratio matters.** Generated prop images have a natural width/height relationship; forcing arbitrary fixed `width` + `height` (or reusing one size for every prop/stage) stretches or squashes the art and ruins how the image feels in-world. Prefer matching each asset’s proportions over a convenient constant size.

**If art looks stretched, squashed, or “wrong,” check sizing before regenerating assets.**

- Prefer **one** of `width` or `height` in archetype/spawn/patch so the engine preserves source proportions (see `docs/recipes/spawning.md`).
- Set **both** only when you know the target box matches the art’s aspect ratio, or when intentionally filling a box (UI icon, floor decal, stretched fill).
- Do **not** slap the same fixed dimensions on unrelated props — each item’s layout should follow its own image.
- **Growth / lifecycle props** (crops, plants, trees): early stages are often flat patches; later stages are taller. Patch `width` _and_ `height` per stage when height should grow (keep each stage’s aspect ratio), and **bottom-anchor** on a ground line (`y = groundY - height`) so the base stays on soil.
- Tall sprites need room in the placement grid — tighten `spacingScale` or allow slight overlap within bounds so mature stages do not clip awkwardly.

```ts
// Patch stage + size together; anchor bottom on soil
game.patch(cropId, {
  imageUrl: getPropItemUrl(
    "prop_tomato_growth",
    "mature plant with red tomatoes",
  ),
  width: 54,
  height: 78,
  x: cell.x - 27,
  y: groundY - 78,
  renderY: groundY + 2,
});
```

Growth-stage layout patterns: [`docs/recipes/farming-sim.md`](../../../docs/recipes/farming-sim.md) and [`docs/recipes/spawning.md`](../../../docs/recipes/spawning.md).

## Recipe: HUD scaffolds and widgets

**HUD art** and **widgets** are related but not the same thing.

| Kind                            | What you get                                                                                         | Needs generated HUD art?                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Generated HUD scaffold**      | Asset art + a boilerplate `createHud…` factory in `src/widgets/` (layout, hotspots, image positions) | Yes — generation creates both               |
| **Hand-written / stock widget** | Factory you own or already in the repo (NPC bubbles, tooltips, season tint, world markers)           | No — mount with `useWidget` only            |
| **Gameplay feedback widget**    | Dialogue, toast, bark subtitle, prompt, objective tracker                                            | Often no new art; reuse DOM + typing reveal |

Generated `Hud...` files are temporary visual scaffolds. Your game owns panel/overlay ids. Preserve the visual layout; replace placeholder labels/handlers with resource reads and input/events. Synced widgets come from `huds.json` + `src/widgets/` — mount and adapt those.

### Wiring generated HUD scaffolds

1. Read the HUD scaffold factory export under `src/widgets/` (and catalog entry in `huds.json` when present).
2. Register a game-owned `ui` resource (`createUiState(panels, overlays)`).
3. Mount with `useWidget(factory, { ui: { type: "panel" \| "overlay", id } })`.
4. Toggle visibility with `game.patchUi(...)`.
5. Persist long-lived state in resources; widgets only display and dispatch intent.

```ts
import { createUiState } from "../Game";
import { createHudWidget } from "../widgets/HudExample"; // real name from generated JSON in `src/data/`

game.registerResource(
  "ui",
  createUiState(
    { seasonBar: false, hotbar: false },
    { title: true, dialogue: false },
  ),
);

game.useWidget(createHudWidget, { ui: { type: "panel", id: "seasonBar" } });
game.patchUi({
  overlays: { title: false },
  panels: { seasonBar: true, hotbar: true },
});
```

If `ui` is omitted at mount, the widget stays always visible (preview only). Modals/title screens use `type: "overlay"` and may `blocksWorldInput`. Persistent edge chrome should motivate `cameraEdgePadding` on `createGame` (and matching `touchControls.actions` for mobile). See `docs/recipes/mobile-touch-controls.md`.

### Widgets that are not HUDs

Mount stock or custom widgets the same way without a generated HUD asset — e.g. `NpcBubbleWidget`, `TooltipWidget`, atmosphere tints, world-aligned markers. Prefer `isVisible` / `isInteractive` when visibility is dynamic rather than a shell panel id. Keep marker `zIndex` in the world-helper band (`0-99`); persistent HUD chrome `100-299`; blocking modals `700-899`.

Depth: [`src/widgets/AGENTS.md`](../../../src/widgets/AGENTS.md), [`docs/recipes/hud-widget.md`](../../../docs/recipes/hud-widget.md).

## Minimal scene bootstrap

Scenes orchestrate; systems/inputs/widgets/archetypes hold the logic. Return the game synchronously; run save/load async.

Entry path: `main.ts` → `createMainScene(opts)` → `createGeneratedWorld(opts)` → `bootstrapWorldFromAssets({ maps, characters, commonAudio, ...opts })` → `configureGameplay(game)`. When sync has no maps, `createGeneratedWorld` returns `null` and `mainScene` boots a blank SVG starter with a placeholder player.

```ts
// src/main.ts (template shape)
preloadDataAssets(allDataFiles);
void preloadAllAudio();
const canvas = document.getElementById("game") as HTMLCanvasElement;
const loadingGate = createLoadingGate(canvas, { dataFiles: allDataFiles });
createMainScene({ onAudioReady: loadingGate.onContinue });
await loadingGate.waitForCompletion();
loadingGate.teardown();
```

Put custom systems / widgets / patches in `configureGameplay` (`src/scenes/mainScene.ts`). Pass camera / touch / interact opts through `createMainScene({ ... })` — never hand-edit `generatedWorld.ts`.

Synced bootstrap already starts map BGM with the dual-path unlock (`onAudioReady` + one-shot `keydown`/`pointerdown`). Do not add a second BGM start path for the same track. See [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md) “Audio/music pattern” only when you add *extra* looping music yourself.

After wiring a scene, update `src/scenes/SCENES.md`. Checklist: [`src/scenes/README.md`](../../../src/scenes/README.md).

## Name collisions: “overlay”

| Term                      | What it is                                                | API                                |
| ------------------------- | --------------------------------------------------------- | ---------------------------------- |
| **`mapOverlays`**         | Unified map-baked patches (`kind`: erase/state/vfx/grid)  | `setMapOverlayState` / map effects |
| **HUD `ui.overlays`**     | DOM modal/full-screen UI visibility                       | `patchUi({ overlays: ... })`       |
| **Season “prop overlay”** | Atmosphere/tint layers in season recipes                  | season systems — not `mapOverlays` |
| **Spawned prop**          | Entity from `placeProp` / spawn with swappable `imageUrl` | `getPropItemUrl` + `patch`         |

## See also

- [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md) — scene orchestration, GameAPI, pathfinding, VFX
- [`src/data/`](../../../src/data/) — generated JSON handles (`map_*.json`, `char_*.json`, `prop_*.json`, `huds.json`, `common.json`, `capybara-assets.json`)
- [`src/scenes/SCENES.md`](../../../src/scenes/SCENES.md) — scene composition status
- [`src/widgets/AGENTS.md`](../../../src/widgets/AGENTS.md) — widget hooks, z-index, text animation
- [`docs/recipes/hud-widget.md`](../../../docs/recipes/hud-widget.md) — adapting generated HUD scaffolds
- [`docs/recipes/map-placement.md`](../../../docs/recipes/map-placement.md) — placement targets and props
