# Asset Integration Playbook

**Required after every asset-generation tool call.** Generating assets does not finish the task — the agent must register and wire them into the engine before stopping (unless the user asked for generation only).

Wire generated assets into gameplay. Read this **after** assets exist as JSON under `src/data/`, and **before** treating generation as complete.

For prompting/generation rules, see [PROMPT_GUIDE.md](PROMPT_GUIDE.md). For deep GameAPI contracts, see [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md).

## Source of truth

1. **`src/data/` generated JSON** — map/character/prop/audio handles for _this_ game (`map_*.json`, `char_*.json`, `prop_*.json`, `common.json`; exports from `index.ts` / `props.ts`). Never invent names from recipes or placeholders.
2. **`src/data/adapters.ts`** — shape bridges (`toMapData`, `mergeMapSprites`, `toArchetype`). Stable across regenerations.
3. **`src/Game.ts`** — public gameplay API (`createGame`, `loadMap`, overlays, audio helpers, spawning).

Prefer lean `map_*.json` (and `spriteIndex`) over opening `map_*.sprites.json` unless you need collision polygons. Do not hand-edit generated JSON unless explicitly asked.

Identifiers like `mapMain`, `charPlayer`, `"<prop_group>"`, `"<music_name>"` below are **placeholders**. Copy real names from generated JSON / `index.ts` exports.

## Registration checklist

When new generated files land, register them before using them in a scene:

1. **Maps / characters** — import `map_*.json` / `char_*.json` in [`src/data/index.ts`](../../../src/data/index.ts), export the handles, and include them in `allDataFiles`.
   - **Map v2 sprites sidecar**: keep lean layout in `map_<id>.json` (`url`, `walkableBoxes`, `placement`, `overwrites`, optional `spriteIndex`). Put full `sprites[]` (cut-outs + `collision_polygons`) in `map_<id>.sprites.json`. Merge at registration:
     ```ts
     import mapFarmBase from "./map_farm.json";
     import mapFarmSprites from "./map_farm.sprites.json";
     export const mapFarm = mergeMapSprites(mapFarmBase, mapFarmSprites);
     ```
     Scenes still call `toMapData(mapFarm)`. Do not open the sprites sidecar just to find labels — use `spriteIndex` / `placement` on the lean map file.
2. **Prop groups** — add each `prop_*.json` to `allPropFiles` in [`src/data/props.ts`](../../../src/data/props.ts).
3. **Music / portraits / shared art** — add `{ name, url }` entries to [`src/data/common.json`](../../../src/data/common.json).
4. **HUD art** — when a HUD is generated, a boilerplate `Hud...` widget scaffold is usually written under `src/widgets/`. Confirm factory names from the scaffold export; adapt it (do not treat it as finished gameplay UI).
5. **Scene status** — when a scene owns the map, update [`src/scenes/SCENES.md`](../../../src/scenes/SCENES.md) with the wired handles and placement usage.
6. **Preload** — in `src/main.ts`, keep `preloadDataAssets(allDataFiles)` and `preloadAllAudio()`.

## Which API? (decision tree)

```txt
Need different map geography?
  ├─ Same continuous world (stitched panels)
  │    → toMapData(base, { extensions: [...] })
  └─ Separate room / interior ↔ exterior
       → clear mapLocal entities, then game.loadMap(toMapData(...))

Change a map-baked door / chest / gate visual or collider?
  → game.setMapOverlayState(id, state)   // NOT a spawned prop

Portable item, crop stage, clue, or placement-box prop?
  → placeProp / spawn + getPropItemUrl(...) imageUrl patch

Map-authored spritesheet VFX?
  → background loops automatically
  → gameplay: triggerMapEffect / triggerNearestMapEffect
```

| Intent                                | API                                            |
| ------------------------------------- | ---------------------------------------------- |
| First / only panel at boot            | `createGame({ map: toMapData(mapHandle) })`    |
| Stitch adjacent panels into one world | `toMapData(base, { extensions })`              |
| Swap to a non-stitched map            | `game.loadMap(toMapData(...), { spawn })`      |
| Toggle baked overlay state            | `setMapOverlayState`                           |
| Spawn / stage portable props          | `placeProp` + `getPropItemUrl`                 |
| Trigger map VFX                       | `triggerMapEffect` / `triggerNearestMapEffect` |

## Recipe: new game / first map

```ts
import { createGame, getAssetUrl } from "../Game";
import { mapMain, charPlayer, toMapData, toArchetype } from "../data";

const game = createGame({
  canvasId: "game",
  map: toMapData(mapMain),
  cameraEdgePadding: 120,
});

game.defineArchetype(
  "player",
  toArchetype(charPlayer, {
    kind: "character",
    label: "Player",
    speed: 190,
    radius: 34,
    width: 140,
    height: 168,
  }),
);

const spawn = game.getPlacementTargets().find((t) => t.id === "<spawn-id-from-map-json>");
const playerId = game.spawnAtFeet(
  "player",
  /* feet x,y from spawn box — see docs/recipes/spawning.md */,
);
game.setControlledEntity(playerId);
// Portrait / HUD art: getAssetUrl("<portrait_name_from_common.json>")
```

## Recipe: extended (stitched) map

One continuous world from multiple generated panels:

```ts
import { mapMain, mapEast, toMapData } from "../data";
import { createGame } from "../Game";

const game = createGame({
  canvasId: "game",
  map: toMapData(mapMain, {
    extensions: [{ direction: "east", panel: toMapData(mapEast) }],
  }),
  cameraEdgePadding: 120,
});
```

**Origin gotcha:** stitched world origin is the top-left of the _compiled_ map. Extending east/south is easiest; west/north can shift the origin so spawn coords must be adjusted. Prefer extending right/down when designing the layout.

You can also pass the same `extensions` option into `loadMap(toMapData(...))` when replacing the whole stitched world.

## Recipe: separate map load (room swap)

Use when maps are **not** stitched panels (house interior → village exterior, dungeon room → overworld).

`loadMap` **preserves** resources, widgets, archetypes, and existing entities. It **resets** navigation/pathfinding, hover, held movement input, and camera bounds; moves the controlled entity if `spawn` is set; emits `map:changed`.

Clear room-only entities yourself — do not assume the previous map’s NPCs/props disappear:

```ts
import { mapInterior, mapExterior, toMapData } from "../data";
import { runScreenFade } from "../utils/screenFade";

await runScreenFade(() => {
  for (const id of game.query((c) => c.mapLocal === true)) {
    game.destroy(id);
  }

  game.loadMap(toMapData(mapExterior), {
    spawn: { x: 500, y: 820, anchor: "feet" },
  });
  spawnExteriorStuff(game);
  game.emit("map:entered", { mapId: "exterior" });
});
```

### Screen fade around `loadMap`

`loadMap` is instant — wrap it in `runScreenFade` from `src/utils/screenFade.ts` for door/room transitions. The helper fades to black, runs your callback (destroy `mapLocal`, `loadMap`, respawn room content), waits one paint, then fades back in. Blocks pointer input during the fade.

```ts
import { runScreenFade } from "../utils/screenFade";

await runScreenFade(
  () => {
    game.loadMap(toMapData(nextMap), {
      spawn: { x: 500, y: 900, anchor: "feet" },
    });
  },
  { fadeMs: 400 },
);
```

Live pattern: `src/systems/MapTransitionSystem.ts`. Pair with spawn points **outside** the destination trigger zone (and suppress re-entry until the player walks out) to avoid transition loops.

Keep an explicit lifecycle: each NPC/clue/pickup is either `mapLocal` (rebuild), hidden off-map, or intentionally persistent.

## Recipe: map overlays (baked state changes)

`mapOverlays` live in generated `map_*.json` next to `masks`, `walkableBoxes`, `spriteSheets`, and `placement`. Use them for doors, safes, gates, barricades, and other map-baked structures.

Runtime switches state — **do not** spawn a duplicate prop for the same door/gate:

```ts
game.getMapOverlays();
game.getMapOverlayState("north_door"); // e.g. "closed"
game.setMapOverlayState("north_door", "open");

game.on("mapOverlay:changed", ({ id, state }) => {
  // unlock path, start cutscene, etc.
});
```

Optional per-state physics: `blocksMovement: true` plus `collider`/`colliders` (or the state’s full `box_2d`) blocks movement/pathfinding. Open states use `blocksMovement: false` or omit it. Successful changes clear pathfinding cache and emit `mapOverlay:changed`.

## Map walkability / collision (generated JSON)

All of this lives in the generated map files (`walkableBoxes` / placement in lean `map_*.json`; sprite colliders in `map_*.sprites.json`). Prefer editing those boxes over gameplay hacks.

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

Live pattern: `src/systems/FarmingSystem.ts` (`TOMATO_STAGE_LAYOUTS`, `syncCropVisual`).

## Recipe: HUD scaffolds and widgets

**HUD art** and **widgets** are related but not the same thing.

| Kind                            | What you get                                                                                         | Needs generated HUD art?                    |
| ------------------------------- | ---------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| **Generated HUD scaffold**      | Asset art + a boilerplate `createHud…` factory in `src/widgets/` (layout, hotspots, image positions) | Yes — generation creates both               |
| **Hand-written / stock widget** | Factory you own or already in the repo (NPC bubbles, tooltips, season tint, world markers)           | No — mount with `useWidget` only            |
| **Gameplay feedback widget**    | Dialogue, toast, bark subtitle, prompt, objective tracker                                            | Often no new art; reuse DOM + typing reveal |

Generated `Hud...` files are **temporary visual scaffolds**, not the engine contract. Your game owns panel/overlay ids. Preserve the visual layout; replace placeholder labels/handlers with resource reads and input/events.

### Wiring generated HUD scaffolds

1. Read the HUD scaffold factory export under `src/widgets/`.
2. Register a game-owned `ui` resource (`createUiState(panels, overlays)`).
3. Mount with `useWidget(factory, { ui: { type: "panel" \| "overlay", id } })`.
4. Toggle visibility with `game.patchUi(...)` — never `display: none` / `api.state.isOpen` on the root.
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

If `ui` is omitted at mount, the widget stays always visible (preview only). Modals/title screens use `type: "overlay"` and may `blocksWorldInput`. Persistent edge chrome should motivate `cameraEdgePadding` on `createGame`.

### Widgets that are not HUDs

Mount stock or custom widgets the same way without a generated HUD asset — e.g. `NpcBubbleWidget`, `TooltipWidget`, atmosphere tints, world-aligned markers. Prefer `isVisible` / `isInteractive` when visibility is dynamic rather than a shell panel id. Keep marker `zIndex` in the world-helper band (`0-99`); persistent HUD chrome `100-299`; blocking modals `700-899`.

Depth: [`src/widgets/AGENTS.md`](../../../src/widgets/AGENTS.md), [`docs/recipes/hud-widget.md`](../../../docs/recipes/hud-widget.md).

## Minimal scene bootstrap

Scenes orchestrate; systems/inputs/widgets/archetypes hold the logic. Return the game synchronously; run save/load async.

```ts
// src/main.ts
preloadDataAssets(allDataFiles);
void preloadAllAudio();
const canvas = document.getElementById("game") as HTMLCanvasElement;
const loadingGate = createLoadingGate(canvas);
createMainScene({ onAudioReady: loadingGate.onContinue });
await loadingGate.waitForCompletion();
loadingGate.teardown();
```

Inside the scene, start looping BGM with the **dual-path** unlock (`onAudioReady` **and** one-shot `keydown`/`pointerdown`) — see [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md) “Audio/music pattern”. Gate-only wiring fails in local/dev.

After wiring a scene, update `src/scenes/SCENES.md` (active file, map/extensions, resources, archetypes, systems, inputs, widgets, audio, SDK). Checklist: [`src/scenes/README.md`](../../../src/scenes/README.md).

## Name collisions: “overlay”

| Term                      | What it is                                                | API                                |
| ------------------------- | --------------------------------------------------------- | ---------------------------------- |
| **`mapOverlays`**         | Map-baked stateful visuals/colliders in map JSON          | `setMapOverlayState`               |
| **HUD `ui.overlays`**     | DOM modal/full-screen UI visibility                       | `patchUi({ overlays: ... })`       |
| **Season “prop overlay”** | Atmosphere/tint layers in season recipes                  | season systems — not `mapOverlays` |
| **Spawned prop**          | Entity from `placeProp` / spawn with swappable `imageUrl` | `getPropItemUrl` + `patch`         |

## See also

- [PROMPT_GUIDE.md](PROMPT_GUIDE.md) — generate maps, overlays, characters, music, HUD art
- [CAPYBARA_ENGINE.md](CAPYBARA_ENGINE.md) — scene orchestration, GameAPI, pathfinding, VFX
- [`src/data/`](../../../src/data/) — generated JSON handles (`map_*.json`, `char_*.json`, `prop_*.json`, `common.json`)
- [`src/scenes/SCENES.md`](../../../src/scenes/SCENES.md) — scene composition status
- [`src/widgets/AGENTS.md`](../../../src/widgets/AGENTS.md) — widget hooks, z-index, text animation
- [`docs/recipes/hud-widget.md`](../../../docs/recipes/hud-widget.md) — adapting generated HUD scaffolds
- [`docs/recipes/map-placement.md`](../../../docs/recipes/map-placement.md) — placement targets and props
