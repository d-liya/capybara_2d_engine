---
name: farming-sim
description: Day/season/crop/gold gameplay loops and farming mechanics. Use when building farming sims, harvest cycles, or crop-based economy systems.
---

# Recipe: Farming Sim Loop

Use this for day/season/crop/gold loops.

## Read first

- `src/data/assets.md`
- `docs/CAPYBARA_ENGINE.md`
- `docs/recipes/map-placement.md`
- `docs/recipes/inventory-tools.md`
- `docs/recipes/save-load.md` only if persistence/autosave is requested

`src/data/assets.md` wins for actual generated prop names, crop lifecycle item names, widget factories, and placement ids.

## HUD visibility

Use the generic `ui` resource with **game-defined** panel/overlay ids. Keep gameplay fields on `farm`:

```ts
game.patchUi({ overlays: { title: false }, panels: { seasonBar: true, hotbar: true } });
```

Pass bindings when mounting scaffolds: `game.useWidget(createHudWidget, { ui: { type: "panel", id: "seasonBar" } })`. See `docs/recipes/hud-widget.md`.

## Recommended files

- `src/types/<GameName>State.ts`
- `src/archetypes/register<GameName>Archetypes.ts`
- `src/systems/registerFarmClockSystem.ts`
- `src/systems/registerCropGrowthSystem.ts`
- `src/systems/registerSeasonAtmosphereSystem.ts`
- `src/inputs/registerToolInputs.ts`
- `src/scenes/<GameName>Scene.ts`

## State shape

```ts
export type Season = "spring" | "summer" | "autumn" | "winter";
export type ToolId = "hoe" | "watering_can" | "seed_packet" | "scythe" | string;
export type CropState = 0 | 1 | 2 | 3 | 4 | 5;

export interface CropPlotState {
  id: string;
  placementId: string;
  row?: number;
  col?: number;
  bounds?: { x1: number; y1: number; x2: number; y2: number };
  state: CropState;
  daysSincePlanting: number;
  overlayEntityId: EntityId | null;
  feedbackUntilMs?: number;
}

export interface FarmState {
  gameStarted: boolean;
  loadingSave: boolean;
  loadedFromSave: boolean;
  season: Season;
  globalDay: number;
  seasonDay: number;
  seasonLengthDays: number;
  gold: number;
  elapsedDaySeconds: number;
  secondsPerDay: number;
  crops: CropPlotState[];
  pendingSave: boolean;
  saveInFlight: boolean;
  lastSaveError?: string;
}
```

### Day fields convention

Store both:

- `globalDay` — monotonically increasing day count for saves/progression.
- `seasonDay` — day within the current season for HUD display, usually `1..seasonLengthDays`.

If the prompt says “Day X / 7” or “Day X / 30”, display `seasonDay / seasonLengthDays`.

## Day/season clock

- One real minute = one in-game day, so `secondsPerDay = 60` unless the prompt says otherwise.
- On day advance:
  - increment `globalDay`
  - increment `seasonDay`
  - if `seasonDay > seasonLengthDays`, set `seasonDay = 1` and advance season
  - increment crop `daysSincePlanting` where relevant
  - mark `pendingSave = true`

```ts
const seasons: Season[] = ["spring", "summer", "autumn", "winter"];

function nextSeason(season: Season): Season {
  return seasons[(seasons.indexOf(season) + 1) % seasons.length];
}
```

## Crop states

Use task-facing state numbers even if prop item names differ per generated game:

- State 0: no overlay; raw map planter
- State 1: dry/tilled soil
- State 2: wet soil
- State 3: sprout
- State 4: mid-growth
- State 5: mature/harvestable crop

Map these states to actual generated item names from `src/data/assets.md`:

```ts
const cropImageByState: Partial<Record<CropState, string>> = {
  1: getPropItemUrl("prop_wheat_lifecycle", "dry_cracked_soil"),
  2: getPropItemUrl("prop_wheat_lifecycle", "wet_soil"),
  3: getPropItemUrl("prop_wheat_lifecycle", "wheat_sprout"),
  4: getPropItemUrl("prop_wheat_lifecycle", "young_green_wheat"),
  5: getPropItemUrl("prop_wheat_lifecycle", "mature_golden_wheat"),
};
```

If `assets.md` lists different prop group/item names, use those exact names.

Typical tool transitions:

- Hoe on 0 => 1
- Watering can on 1 => 2
- Seed packet on 2 => 3, reset `daysSincePlanting = 0`
- Auto after N in-game days: 3 => 4
- Auto after N more days: 4 => 5
- Harvest tool/click on 5 => gold reward, reset to configured post-harvest state

If the high-level prompt starts all tiles at State 1, keep the hoe as an inventory item but make hoe-on-State-1 a no-op/invalid unless the prompt defines re-tilling.

## Overlay spawning/syncing

Use `docs/recipes/map-placement.md` for target grid subdivision.

For states 1-5, spawn/patch crop overlay entities over placement cells. For State 0, either hide/destroy the overlay or patch it invisible so raw map art shows through.

```ts
function syncCropOverlay(game: GameAPI, crop: CropPlotState) {
  if (!crop.overlayEntityId) return;
  const imageUrl = cropImageByState[crop.state];
  game.patch(crop.overlayEntityId, {
    visible: crop.state !== 0,
    imageUrl,
    tooltip: crop.state === 5 ? "Ready to harvest" : "Growing crop",
  });
}
```

## Pointer/crop click pattern

Store crop bounds in the resource and use `canvasClientToNormalizedPoint(...)` for deterministic tile hit testing:

```ts
const point = game.canvasClientToNormalizedPoint(event.clientX, event.clientY);
if (!point) return;

const crop = farm.crops.find((crop) => crop.bounds &&
  point.x >= crop.bounds.x1 &&
  point.x <= crop.bounds.x2 &&
  point.y >= crop.bounds.y1 &&
  point.y <= crop.bounds.y2,
);
```

## Wrong-tool feedback

Use public feedback patterns; do not rely on CSS classes for canvas entities.

Recommended:

- set `crop.feedbackUntilMs = performance.now() + 350`
- have a small non-blocking HUD/widget draw a marker/shake near the crop using `normalizedToCanvasPoint(...)`
- optionally patch overlay `x/y` briefly in a system and restore it
- optionally play a one-shot SFX with `playAudio(...)` if available

## Save payload pattern

Save stable serializable data only:

```ts
export interface FarmSaveData {
  version: 1;
  globalDay: number;
  seasonDay: number;
  season: Season;
  gold: number;
  crops: Array<{
    id: string;
    placementId: string;
    row?: number;
    col?: number;
    state: CropState;
    daysSincePlanting: number;
  }>;
}
```

Do not save entity ids. Reconnect saved crop records to fresh overlay entities by stable crop ids after scene setup.

## Scene responsibilities

The scene should only:

1. Create game with `toMapData(<map handle>)`, using the generated map handle from `assets.md`.
2. Register default resources.
3. Register archetypes, systems, inputs.
4. Spawn player/NPC/crop overlays.
5. Mount widgets with `useWidget(..., { ui })` and initial `game.patchUi(...)` for your chosen ids.
6. Start async load/bootstrap if needed.
7. Return `game`.

Do not put day advancement, crop logic, save logic, or NPC behavior directly in the scene.
