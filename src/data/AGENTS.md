# Generated Data Directory

Use `src/data/assets.md` as the source of truth for generated maps, map VFX/spritesheets, characters, props, HUD intent, placement targets, audio names, import handles, and gameplay notes.

Do not open generated JSON files just to find names or URLs.

Do not hand-edit generated JSON unless explicitly asked.

Gameplay code should import generated handles from `src/data` and asset helpers from `src/Game.ts`.

The handle, prop-group, item, and audio names below are **placeholders** (`mapMain`, `charPlayer`, `"<prop_group>"`, `"<item>"`, `"<music_name>"`). Real names are game-specific — copy them from `src/data/assets.md`.

Examples:

```ts
import {
  allDataFiles,
  mapMain,
  charPlayer,
  toMapData,
  toArchetype,
} from "../data";
import { getPropItemUrl, getAssetUrl, playAudio } from "../Game";
```

Use:

- `toMapData(mapMain)` to wrap a flat generated map into the `{ panel }` shape `createGame` expects.
- `toArchetype(charPlayer, { speed: 190 })` to build an archetype component bag from a generated character. Speed is normalized map units per second.
- `getPropItemUrl("<prop_group>", "<item>")`
- `getAudio("<music_name>")`

Map spritesheets may be background/autoplay VFX or gameplay/triggered VFX. Background effects loop automatically; gameplay effects should be triggered with `game.triggerMapEffect(...)` or `game.triggerNearestMapEffect(...)`.

`mapOverlays` belong in generated map JSON files (`src/data/map_*.json`) as a top-level map field next to `masks`, `walkableBoxes`, `spriteSheets`, and `placement`. Use them for stateful map-baked props such as doors, safes, gates, barricades, or border/background props. Runtime code should switch them through `game.setMapOverlayState(id, state)` rather than spawning duplicate props. Overlay states may optionally include `blocksMovement: true` plus `collider`/`colliders` boxes to physically block movement/pathfinding; open/unblocked states should use `blocksMovement: false` or omit it.

Only open JSON if `assets.md` is missing required schema details.
