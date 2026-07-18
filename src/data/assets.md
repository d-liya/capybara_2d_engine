# Generated Assets Manifest

Agent-facing source of truth for handles in this game. Prefer this file over opening raw JSON for names and placement facts.

**Starter state:** no generated maps, characters, or props yet. After generation, list handles here and register them in `src/data/index.ts`.

## Maps

_(none registered yet)_

### Map format (v2)

Use this shape when wiring a generated map with `toMapData(...)` from `src/data/adapters.ts`.

- **`url`** — full background image (map size = this image's natural width/height when loaded)
- **`walkableBoxes`** — playable floor regions (`bbox` is `[y1,x1,y2,x2]` normalized 0–1000)
- **`sprites[]`** — cut-out overlays for Y-sorting + collision
  - `label` — name
  - `category`: `boundary` | `walkable_area`
  - `pixel_bbox` — placement crop on the background (`{x,y,w,h}` in pixels)
  - `spriteUrl` — cut-out image
  - `collision_polygons` — solid movement footprint (normalized `{x,y}` points)
  - `collision_bbox` — optional AABB collider
  - Map size comes from the loaded background `url`

- **`overwrites[]`** — visual (and sometimes collision) patches on the map
  - `type: "spritesheet"` — animated overlay
    - `mode: "background"` — loops automatically
    - `mode: "gameplay"` — one-shot; trigger with `game.triggerMapEffect(label)`
    - `url`, `frame_count`, `pixel_bbox`
  - `type: "remove"` — static image patch that covers an area
    - `url`, `pixel_bbox`
    - Overlapping map sprites lose **collision + cut-out visual** (obstacle removed)

Wire with:

```ts
import { mapMain, toMapData } from "../data";
createGame({ canvasId: "game", map: toMapData(mapMain) });
```

## Characters

_(none registered yet)_

## Props

_(none registered yet)_

## Common / audio

See `common.json`.
