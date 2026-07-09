---
name: map-placement
description: Spawn and interact using generated map placement targets instead of hardcoded coordinates. Use when placing entities or reading placement zones from assets.md.
---

# Recipe: Map Placement Targets

Use generated map placement data instead of hardcoded coordinates when possible.

## Source of truth

Read `src/data/assets.md` for placement IDs, contents, boxes, grid metadata, labels, and gameplay intent.

If `src/scenes/SCENES.md` or an older recipe mentions different asset/placement handles, `src/data/assets.md` wins for generated facts.

Use `game.getPlacementTargets()` at runtime. Do not read map JSON just to discover placement names.

## Box coordinate convention

Generated boxes use normalized `[y1, x1, y2, x2]` order. Convert before use — see `docs/recipes/spawning.md` for the coordinate contract and `boxToBounds` helper.

**At runtime, prefer `target.bounds` from `game.getPlacementTargets()`** — it is already `{ x1, y1, x2, y2 }`. Do not destructure `target.box_2d` as `[x1, y1, x2, y2]`; that transposes the grid off the map.

```ts
function boxToRect(box: readonly [number, number, number, number]) {
  const [y1, x1, y2, x2] = box;
  return { x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 };
}

// Preferred at runtime:
const target = game.getPlacementTargets().find((t) => t.id === "crop-field-1");
if (target) {
  const { x1, y1, x2, y2 } = target.bounds;
}
```

## Simple placement pattern

For one prop per placement target:

```ts
const targets = game.getPlacementTargets();
const cropTargets = targets.filter((target) => target.contents === "<prop_group>"); // contents value comes from assets.md

for (const target of cropTargets) {
  game.placeProp("cropOverlay", target, {
    cropId: target.id,
    visible: false,
  });
}
```

For a target with a point or single box, `game.placeProp(archetype, target, props)` lets the engine fit/center the prop.

## Grid target pattern

Some placement targets describe one large zone plus grid metadata. At runtime each target exposes `gridDimensions: number[]` as **`[cols, rows]`** (e.g. `[4, 3]` = 4 columns × 3 rows). `assets.md` renders the same fact as `cols x rows` (e.g. `4 x 3`). `game.placeProp(...)` places one prop for the target; it does **not** automatically create one entity per grid cell.

For crop tiles, manually subdivide the target box and store the cell bounds in a resource.

```ts
export interface PlacementGridCell {
  id: string;
  placementId: string;
  row: number;
  col: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cx: number;
  cy: number;
  width: number;
  height: number;
}

export function expandPlacementGrid(
  target: {
    id: string;
    bounds: { x1: number; y1: number; x2: number; y2: number };
    gridDimensions?: number[];
  },
  fallbackCols = 1,
  fallbackRows = 1,
): PlacementGridCell[] {
  const { x1, y1, x2, y2 } = target.bounds;
  const width = x2 - x1;
  const height = y2 - y1;
  // gridDimensions is [cols, rows] (e.g. [4, 3] for a 4×3 bed).
  const [gridCols, gridRows] = target.gridDimensions ?? [];
  const cols = Number(gridCols) || fallbackCols;
  const rows = Number(gridRows) || fallbackRows;
  const cellW = width / cols;
  const cellH = height / rows;
  const cells: PlacementGridCell[] = [];

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const cellX1 = x1 + col * cellW;
      const cellY1 = y1 + row * cellH;
      const cellX2 = cellX1 + cellW;
      const cellY2 = cellY1 + cellH;
      cells.push({
        id: `${target.id}_r${row}_c${col}`,
        placementId: target.id,
        row,
        col,
        x1: cellX1,
        y1: cellY1,
        x2: cellX2,
        y2: cellY2,
        cx: (cellX1 + cellX2) * 0.5,
        cy: (cellY1 + cellY2) * 0.5,
        width: cellW,
        height: cellH,
      });
    }
  }

  return cells;
}
```

`getPlacementTargets()` is the source of truth for `gridDimensions` and `bounds`. If `assets.md` shows a grid for a target but the runtime `gridDimensions` is missing, pass explicit `fallbackCols` / `fallbackRows`; do not open generated JSON unless `assets.md` lacks the grid facts.

## Proximity checks (keyboard / tool range)

Entity `x` / `y` from `game.get(id)` is the sprite **top-left**. For “stand near this cell” gameplay, compare against **`game.getEntityFeet(playerId)`** (feet center + ground line), not top-left.

```ts
const feet = game.getEntityFeet(playerId);
if (!feet) return;

const distance = Math.hypot(feet.x - cell.cx, feet.y - cell.cy);
if (distance < 150) {
  // plant, harvest, water, etc.
}
```

See `src/systems/FarmingSystem.ts` for a working nearest-cell pattern over an expanded grid.

## Crop overlay sizing

For one overlay per grid cell:

```ts
const box = cropTilePlacementBox({
  x1: cell.x1,
  y1: cell.y1,
  x2: cell.x2,
  y2: cell.y2,
});
const overlayId = game.placeProp("cropOverlay", box, {
  cropId: cell.id,
  renderY: cell.y2,
  hoverBounds: [cell.y1, cell.x1, cell.y2, cell.x2],
  label: "Crop tile",
  tooltip: "Select a tool, then click to tend this crop.",
});
const overlay = game.get(overlayId);
const baseX = Number(overlay?.x);
const baseY = Number(overlay?.y);
```

Guidelines:

- Prefer `placeProp(..., cellBox)` per grid cell (top-left + size). Use `expandPlacementGrid` with a small `insetRatio` so cells avoid the bed frame.
- Overlay sync helpers should patch `imageUrl` / `tooltip` only — not `x`/`y` from cell centers.
- Set `renderY: cell.y2` for row-wise depth vs the player. Map `ground_patch` bed art draws behind the Y-sort queue automatically.
- Store each cell's `bounds` in crop state for pointer hit testing.

Full spawn/coordinate rules: `docs/recipes/spawning.md`.

## Crop plot initialization

Create one `CropPlotState` per generated placement target or per expanded grid cell. Store stable ids, placement id, bounds, crop state, and overlay entity id in a resource.

```ts
game.registerResource("farm", {
  crops: cells.map((cell) => ({
    id: cell.id,
    placementId: cell.placementId,
    row: cell.row,
    col: cell.col,
    bounds: { x1: cell.x1, y1: cell.y1, x2: cell.x2, y2: cell.y2 },
    state: 0,
    daysSincePlanting: 0,
    overlayEntityId: null,
  })),
});
```

## Pointer hit testing

For grid/crop clicks, prefer resource bounds:

```ts
const point = game.canvasClientToNormalizedPoint(event.clientX, event.clientY);
if (!point) return;

const crop = farm.crops.find((crop) =>
  point.x >= crop.bounds.x1 &&
  point.x <= crop.bounds.x2 &&
  point.y >= crop.bounds.y1 &&
  point.y <= crop.bounds.y2,
);
```

Use `game.getHoverTargetAt(...)` for labeled single interactables, tooltips, or debug hover UI. For crop grids, bounds checks are simpler and more deterministic.

## Collider overlap

Placement targets may overlap collider/obstacle boxes. That is valid: a crop bed or table can block movement while still being interactable/clickable from nearby.

Treat:

- colliders/walkable boxes as movement rules
- placement targets as interaction/spawn/layout rules

Do not assume a placement target is walkable.

## Hover labels

Use labels/tooltips for debug and player feedback:

```ts
game.placeProp("cropOverlay", target, {
  label: "Planter bed",
  tooltip: "Select a tool, then click to tend this crop.",
});
```
