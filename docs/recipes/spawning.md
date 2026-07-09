---
name: spawning
description: Spawn players, NPCs, props, pickups, and markers with correct coordinate conventions. Use when placing entities and converting placement box coordinates.
---

# Recipe: Spawning Entities and Props

Use this when placing players, NPCs, crop overlays, pickups, or markers. Read `docs/CAPYBARA_ENGINE.md` for the full API surface.

## Coordinate contract (critical)

All entity `x` / `y` values — in `spawn`, `patch`, `game.get`, and saved state — are **top-left** of the draw box in normalized map space (`0–1000` per panel).

Generated placement boxes in `src/data/assets.md` are always `[y1, x1, y2, x2]`, not `[x1, y1, x2, y2]`. Convert before storing runtime hit-test bounds:

```ts
function boxToBounds(box: readonly [number, number, number, number]) {
  const [y1, x1, y2, x2] = box;
  return { x1, y1, x2, y2, width: x2 - x1, height: y2 - y1 };
}

const bounds = boxToBounds([692, 235, 802, 290]);
// bounds is { x1: 235, y1: 692, x2: 290, y2: 802, ... }
```

Never write `const bounds = { x1: box[0], y1: box[1], ... }` for an `assets.md` placement box. That transposes the world position.

### Placement targets at runtime

`game.getPlacementTargets()` returns each target with:

- **`bounds`** — `{ x1, y1, x2, y2 }` already converted for gameplay math (**use this**)
- **`box_2d`** — still `[y1, x1, y2, x2]`; do not read as `[x1, y1, x2, y2]`

```ts
const spawn = game
  .getPlacementTargets()
  .find((t) => t.id === "player-spawn-point-452");

if (spawn) {
  const { x1, x2, y2 } = spawn.bounds;
  const playerId = game.spawnAtFeet("player", (x1 + x2) / 2, y2);
  game.setControlledEntity(playerId);
}
```

For proximity to grid cells or interactables, use **`game.getEntityFeet(controlledId)`** — not `game.get(id).x` / `.y` (top-left corner).

| API | Arguments mean | Resulting `entity.x` / `entity.y` |
|-----|----------------|-----------------------------------|
| `spawn({ x, y })` | Top-left | Same |
| `spawnAtFeet(feetX, feetY)` | Feet center + bottom edge | Top-left (computed from sprite foot anchor) |
| `spawnCentered(centerX, centerY)` | Center of box | Top-left (computed) |
| `placeProp(..., box_2d)` | Box `[y1,x1,y2,x2]` | Top-left at `(x1, y1)` |

**Common mistake:** storing cell center `(cx, cy)` in state and later `game.patch({ x: cx, y: cy })`. That shifts the sprite up-left by half its size. After `spawnCentered`, read top-left from `game.get(id)` if you need a stable position for animation.

**Navigation mistake:** pathfinding destinations use feet/ground points, but entity `x` / `y` is still top-left. Do not manually convert destination feet points back to top-left in gameplay systems. For walking NPCs, spawn with `spawnAtFeet(...)` and move with `game.setEntityDestination(...)`; the runtime preserves sprite foot anchors and avoids one-frame jumps.

```ts
const id = game.spawnCentered("cropOverlay", cell.cx, cell.cy, {
  width: Math.max(96, cell.width * 0.82),
  height: Math.max(96, cell.height * 0.82),
});
const entity = game.get(id);
const topLeftX = Number(entity?.x);
const topLeftY = Number(entity?.y);
```

`sync*` helpers should update `imageUrl` / `tooltip` / `visible` only unless you are intentionally moving the entity.

## Which spawn helper to use

- **Player / NPC / anything that walks** → `spawnAtFeet(feetX, feetY)` — horizontal stand point at `feetX`, ground/sort anchor at `feetY`. Use the same feet-coordinate convention for `game.findPath(...)` and `game.setEntityDestination(...)`.
- **One static image per grid cell or marker** → `spawnCentered` with explicit `width` or `height`; prefer passing only one dimension when the prop should preserve its source aspect ratio.
- **One prop filling a placement box** → `placeProp` with the target or `box_2d`; pass only `width` or only `height` in overrides when preserving prop aspect ratio matters.
- **Full control** → `spawn` with top-left `x` / `y`

## Character / NPC defaults

For the generated top-down character sheets in this template, these are good visual defaults unless the specific art needs different proportions:

```ts
const characterSize = {
  width: 76 * 1.3,
  height: 114 * 1.3,
};

game.defineArchetype(
  "guardNpc",
  toArchetype(charGuard, {
    kind: "npc",
    radius: 24,
    ...characterSize,
    speed: 20, // slow patrol; current NPC defaults are roughly 14-20
    frameDurationMs: 125,
  }),
);
```

Use `spawnAtFeet(...)` with these character sizes so the visible foot anchor, collision, and Y-sort stay consistent. In the current stitched/camera setup, comfortable movement is about `95` for the player and `14`-`20` for slow NPC patrols; tune by visual feel.

## Prop aspect ratio

When spawning or placing props from generated assets, prefer specifying **only one** of `width` or `height` if the prop should keep its original aspect ratio. Specify both only when intentionally stretching/filling a box.

For the current generated clue/marker/tabletop props, good default display sizes are usually in the `20`-`40` normalized-unit range. The active scene uses widths like `28` for the council bell and `34` for clue/marker props.

```ts
// Keeps aspect ratio from the source prop image. Good clue/tabletop defaults: 28-40.
game.defineArchetype("clueProp", {
  kind: "clue",
  imageUrl: getPropItemUrl("prop_medieval_clues", "folded_parchment_note"),
  width: 34,
  label: "Clue",
});

// Smaller interactive tabletop prop.
game.defineArchetype("councilBellProp", {
  kind: "councilBell",
  imageUrl: getPropData("prop_council_bell")?.url,
  width: 28,
  label: "Council Bell",
});

// Only do this when a prop should be stretched to a specific rectangle.
game.placeProp("tableOverlay", target, { width: 220, height: 96 });
```

## Render depth

The world queue Y-sorts by `renderY` (ascending = behind first).

1. Map **`ground_patch`** masks (tilled beds, floor decals) — always **behind** spawned props.
2. Map **occluders** (houses, trees, wells) — depth-sort with spawned entities by `renderY`.
3. **Spawned props** (everything from `spawn` / `placeProp`) — above `ground_patch`; sort with occluders and each other by `renderY`.

For crop cells and other upright/tall props, set `renderY` to the visual ground contact point, usually the cell/bounds bottom (`cell.y2` or `bounds.y2`), so tiles and characters stack correctly in the row.

```ts
game.spawnCentered("cropOverlay", cell.cx, cell.cy, {
  width: Math.max(96, cell.width * 0.82),
  height: Math.max(96, cell.height * 0.82),
  renderY: cell.y2,
  hoverBounds: [cell.y1, cell.x1, cell.y2, cell.x2],
});
```

For flat floor decals spawned as props — puddles, stains, rugs, shadows, chalk marks, floor clues — use a low `renderY` when characters should always draw on top of the decal instead of appearing to walk behind it.

```ts
const FLOOR_DECAL_RENDER_OFFSET = -10000;

game.spawnCentered("clueProp", (bounds.x1 + bounds.x2) / 2, (bounds.y1 + bounds.y2) / 2, {
  imageUrl: getPropItemUrl("prop_detective_items", "beer_puddle_on_wood"),
  width: 92,
  height: 46,
  label: "Slippery Yeast Clue",
  tooltip: "Inspect the suspicious spill.",
  hoverBounds: [bounds.y1, bounds.x1, bounds.y2, bounds.x2],
  renderY: FLOOR_DECAL_RENDER_OFFSET + bounds.y2,
});
```

Rule of thumb:

- **Floor decal / ground-only visual in open floor** → low `renderY` so actors draw above it.
- **Required clue near generated occluder art** → visibility first: use `renderY: bounds.y2` or add a separate visible marker/glow/label if a low renderY hides the clue behind map art.
- **Standing prop / obstacle-like object** → `renderY: bounds.y2`.

Do not ship a first required clue that is technically spawned but hard to see. Add an obvious affordance when in doubt.

## Grid placement

For `4×4` zones, subdivide the placement box yourself (see `docs/recipes/map-placement.md`). `placeProp` creates **one** entity per call, not one per cell.

## Related docs

- `docs/recipes/map-placement.md` — `getPlacementTargets`, box format, crop grid
- `docs/CAPYBARA_ENGINE.md` — render ordering, hover, movement
