# Capybara Engine Public Interface

This is the template-level contract for building games in this repository without reading engine internals.

It follows the same pattern Pi uses for its own extensibility: agents should learn the stable public surface from docs, generated manifests, and recipes instead of reverse-engineering implementation files.

## Mental model

Treat the repo as four layers:

1. **Public facade** — `src/Game.ts`
   - create the runtime
   - spawn/patch/query entities
   - register resources, systems, inputs, and widgets
   - resolve generated assets/audio
2. **SDK facade** — `src/sdk/index.ts` plus `docs/SDK_FACADE.md`
   - auth/session
   - save/load
    - save/load
3. **Generated facts** — `src/data/assets.md` and `src/scenes/SCENES.md`
   - current map handles, map VFX/spritesheets, characters, animations, props, widgets, audio, placement targets
   - active/recommended scene composition
4. **Gameplay modules** — `src/types`, `src/archetypes`, `src/systems`, `src/inputs`, `src/widgets`, `src/scenes`
   - game-specific behavior built on the facades above

Avoid inspecting `src/core/` for normal gameplay work. Do not inspect generated JSON just to find names or URLs. Avoid SDK internals except `src/sdk/index.ts`.

Keep game UI clean. Do not render developer/debug errors, stack traces, raw exception messages, or failed SDK response payloads into HUD/dialogue widgets. Log technical details to the browser console with `console.error(...)` / `console.warn(...)`; if the player needs feedback, show only neutral gameplay text such as "Something went wrong" or "Try again".

## First-read map

This section is the engine-side reference map once the task is clearly gameplay-facing.

For a gameplay feature, start with:

```txt
src/data/assets.md
src/scenes/SCENES.md
```

Then read only the targeted public reference that matches the task:

```txt
docs/SDK_FACADE.md                 # auth, save/load
docs/recipes/farming-sim.md        # day/season/crops/gold
docs/recipes/map-placement.md      # generated map placement zones
docs/recipes/inventory-tools.md    # hotbar/tool/cursor attachment
docs/recipes/npc-dialogue.md       # nearby NPC dialogue; scripted default
docs/recipes/save-load.md          # persistent game state
docs/recipes/hud-widget.md         # generated HUD widget adaptation
docs/recipes/season-atmosphere.md  # tint/overlay atmosphere
docs/recipes/combat-projectiles.md # combat, bullets, damage, cooldowns
docs/recipes/enemy-ai-waves.md     # simple enemy behavior and wave spawning
docs/recipes/rpg-quests-inventory.md # quests, inventory, pickups, equipment
docs/recipes/world-pointer-input.md # click/touch aiming and world targeting
```

Use `src/Game.ts` as reference only when you need exact TypeScript signatures.

## Manifest precedence

If generated/current-context docs conflict:

1. `src/data/assets.md` wins for asset handles, character handles, animation names, prop groups/items, widget factory exports, audio names, and placement target facts.
2. `src/scenes/SCENES.md` wins for the currently active/recommended scene structure.
3. After implementation, update `src/scenes/SCENES.md` to match reality.

Do not use stale example handles from recipes or scene manifests when `assets.md` lists different generated names.

## Public gameplay extension points

### Scene orchestration

Scenes live in `src/scenes/` and should orchestrate only:

1. preload assets/audio if needed
2. call `createGame(...)`
3. register resources
4. register archetypes
5. register systems
6. bind inputs
7. spawn initial entities
8. mount widgets
9. start any async SDK/save bootstrap without blocking scene return
10. return the `GameAPI`

Do not put long-lived gameplay logic directly in scene files.

### Async scene bootstrap

Scene creation should normally return `GameAPI` synchronously. For save/load or SDK startup work, use this pattern:

1. create the game synchronously
2. register default resources with loading flags such as `loadingSave: true`
3. define archetypes, spawn default entities/overlays, mount widgets
4. start an async bootstrap task without blocking scene return
5. after load completes, patch resources/entities and set loading flags false
6. keep modal/start widgets visible while loading via `game.patchUi` using your overlay ids

```ts
const game = createGame({
  canvasId: "game",
  map: toMapData(mapMain),
  cameraEdgePadding: 120,
});
game.registerResource("ui", createUiState({ hud: false }, { title: true }));
game.registerResource("farm", createDefaultFarmState());
game.patchUi({ overlays: { title: true } });

void (async () => {
  const farm = game.getResource<FarmState>("farm");
  try {
    const saved = await sdk.save.loadGameData(); // Auto guest-auths when needed.
    if (isSavePayload(saved)) hydrateFarmFromSave(game, saved);
  } finally {
    farm.loadingSave = false;
    if (farm.gameStarted) {
      game.patchUi({ overlays: { title: false }, panels: { hud: true } });
    }
  }
})();

return game;
```

### Separate map transitions

For registration, stitched extensions vs `loadMap`, and map overlay wiring, see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md).

Use `game.loadMap(...)` when moving between maps that are not stitched extension panels, such as house interior → village exterior or dungeon room → overworld. Existing resources, widgets, archetypes, and entities are preserved; gameplay code must deliberately destroy, hide, rebuild, or preserve map-local entities as needed. Do not assume `loadMap` clears NPCs, props, clue decals, or timers for the previous room.

```ts
import { mapInterior, mapExterior, toMapData } from "../data";

// Interior -> exterior. For characters, prefer the feet anchor.
game.loadMap(toMapData(mapExterior), {
  spawn: { x: 500, y: 820, anchor: "feet" },
});
```

A common gameplay pattern is to mark room-specific entities as map-local and clear them before loading the next room:

```ts
for (const id of game.query((c) => c.mapLocal === true)) {
  game.destroy(id);
}

game.loadMap(toMapData(mapInterior), {
  spawn: { x: 480, y: 760, anchor: "feet" },
});

// Respawn only the entities that belong in this room.
spawnInteriorNpcsAndClues(game);

game.emit("map:entered", { mapId: "interior" });
```

For multi-map games, keep an explicit lifecycle table in the scene/plan: each NPC, clue prop, pickup, and room-only marker should be either `mapLocal` and rebuilt, hidden while off-map, or intentionally persistent. A courtyard clue or NPC should not remain visible in an interior/study map unless that is deliberate.

`loadMap` resets active navigation/pathfinding state, clears hover state, stops held movement input, updates the camera bounds, moves the controlled entity if a spawn is supplied, and emits `map:changed`.

### Resources

Resources are long-lived mutable game state:

```ts
game.registerResource("farm", initialFarmState);
const farm = game.getResource<FarmState>("farm");
```

Use resources for day/season/gold, inventory selection, crop states, dialogue state, save flags, and NPC state.

### Archetypes

Archetypes define reusable entity defaults:

```ts
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
```

Use archetypes for player, NPCs, crop overlays, markers, props, projectiles, pickups, and interactables.

### Systems

Systems are per-frame gameplay loops:

```ts
game.registerSystem("farm:clock", (dt, api) => {
  const farm = api.getResource<FarmState>("farm");
  farm.elapsedDaySeconds += dt;
});
```

Use systems for clocks, growth, animations, NPC facing, ambient overlays, autosave queues, and lightweight movement.

### Inputs

Inputs convert keyboard/pointer/HUD intent into gameplay actions:

```ts
game.bindInputAction("interact", ["KeyE", "Space"]);
game.onInputAction("interact", ({ phase }) => {
  if (phase !== "down") return;
  game.emit("player:interact");
});
```

HUD widgets should dispatch the same input actions as keyboard/pointer controls.

### Widgets

For registering generated HUD scaffolds vs non-HUD widgets, see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md).

Widgets are DOM/HUD plugins mounted with:

```ts
game.useWidget(createHudWidget); // exact factory name comes from assets.md
```

Generated `Hud...` widgets are scaffolds produced alongside HUD art, not complete gameplay UI. They usually map generated HUD artwork to DOM overlays, hotspots, and approximate display positions. Preserve that visual layout, but replace placeholder labels/handlers with resource reads and event/input dispatch. Not every widget needs generated HUD art (bubbles, tooltips, markers, tints).

Widgets display resource state and dispatch intent. They should not own long-lived gameplay state. Gameplay-facing text feedback should go through a HUD/widget layer so players do not miss it. Use dialogue, bark subtitle, toast, prompt, objective, or result-message widgets for text such as NPC barks, quest updates, locked-door reasons, inventory-full messages, tutorial prompts, and action outcomes instead of relying only on console logs or tiny world-only labels. Every widget should reveal newly shown or changed player-facing text with a typing/typewriter effect; keep reveal progress in widget-local ephemeral state unless coordinating text across widgets requires a resource.

Typewriter pacing should match urgency: readable and noticeable for dialogue/objectives, fast for short gameplay toasts, and instant or nearly instant for urgent warnings/combat feedback. Modal dialogue should allow the interact key/click to complete the reveal before advancing/closing. Non-modal toasts, bark subtitles, and passive trackers should not block movement; full dialogue, menus, shops, and story modals may block world input.

## Generic gameplay patterns

Use these patterns when no genre-specific recipe matches. Build mechanics from small resources, archetypes, systems, inputs, events, and widgets instead of adding logic to scenes or core.

### Health and damage

Store long-lived stats in a resource or stable entity components:

```ts
game.registerResource("combat", { playerHp: 5, playerMaxHp: 5 });
game.defineArchetype("enemy", {
  kind: "enemy",
  hp: 3,
  maxHp: 3,
  radius: 44,
  width: 180,
  height: 216,
});
```

Apply damage in systems/events with `get(...)`, `patch(...)`, `destroy(...)`, and `emit(...)`. Save stable stats and flags, not transient hit flashes or entity ids.

### Projectiles and attacks

Represent bullets, spells, arrows, and thrown objects as normal entities with components such as `kind: "projectile"`, `vx`, `vy`, `damage`, `owner`, `radius`, and `expiresAtMs`. Move them in a `registerSystem(...)` loop and use simple distance/AABB checks against targets. The public facade does not provide physics, raycasts, or pixel-perfect collision; use approximations unless the task explicitly requires new engine support.

### Enemy behavior

Use systems for simple patrol/chase/attack loops. Before moving an enemy/NPC, check `src/data/assets.md` for walk/run/move animations. If only idle/default animation exists, prefer stationary interaction, facing, ranged attacks, or proximity triggers.

Friendly/neutral NPCs should usually get a first-pass liveliness baseline instead of standing silently: a short authored patrol route when movement animation exists, facing toward the player when approached, and a simple one-time or cooldown-gated proximity bark before the player presses interact. Keep barks readable through `NpcBubbleWidget`, a bark subtitle, toast, or dialogue widget.

For obstacle-aware NPC movement, prefer the public destination API (`game.setEntityDestination(...)`) over manually patching `x` / `y`. Destinations use feet/ground coordinates and preserve animated sprite anchoring internally. If you build patrol loops on top of navigation, clear an entity's destination after `arrived`, `blocked`, or `unreachable` before assigning the next patrol point.

### Quests, inventory, pickups, and objectives

Use stable string IDs for quests, items, chests, pickups, doors, and defeated bosses. Keep quest/inventory state in resources, emit events like `quest:progress` or `inventory:use`, and let widgets display state. Persist serializable IDs/counts/flags through the SDK save facade; rebuild runtime entities from those stable records after load.

### Pointer aiming and click targeting

Use widgets for pointer listeners and store gameplay-relevant aim/selection state in resources. The exact public routing patterns are in the `Pointer/click routing` section below.

### Map spritesheet VFX

Generated map data may include map-level spritesheets for environmental animation or triggered effects. Check `src/data/assets.md` first, then use the `Map spritesheets / VFX` section below for exact public API behavior.

## Stable GameAPI patterns

> Identifiers like `mapMain`, `charPlayer`, `charNpc`, `"<prop_group>"`, `"<item>"`, `createHudWidget`, and `"<music_name>"` in these examples are **placeholders**. Real map/character/prop/widget/animation/audio names are game-specific — copy them from `src/data/assets.md`. The only names safe to copy verbatim are the stable API symbols (`createGame`, `toMapData`, `getPropItemUrl`, `spawnAtFeet`, etc.).

Import the stable API symbols from the facade, and generated handles + adapters from `src/data`:

```ts
import {
  createGame,
  getAssetUrl,
  getPropItemUrl,
  getAudio,
  playAudio,
  preloadAudio,
  stopAudio,
  type GameAPI,
  type EntityId,
} from "../Game";
import { mapMain, charPlayer, toMapData, toArchetype } from "../data";
```

### Map data shape (`toMapData`)

Generated map JSON is **flat**. Map-level generated fields such as `masks`, `walkableBoxes`, `spriteSheets`, `placement`, and `mapOverlays` belong next to `url` in the generated `src/data/map_*.json` file:

```jsonc
{
  "name": "...",
  "url": "...",
  "masks": [...],
  "walkableBoxes": [...],
  "spriteSheets": [...],
  "placement": [...],
  "mapOverlays": [...]
}
```

`createGame` expects the engine's nested `{ panel: { ... } }` `MapData`. Use `toMapData(...)` to bridge the two instead of hand-wrapping. It also accepts `extensions` for multi-panel maps, so single-panel scenes stay simple while staying extensible:

```ts
// Single panel:
const game = createGame({
  canvasId: "game",
  map: toMapData(mapMain),
  cameraEdgePadding: 120,
});

// Multi-panel (stitch flat panels together):
createGame({
  canvasId: "game",
  map: toMapData(mapMain, {
    extensions: [{ direction: "east", panel: toMapData(mapEast) }],
  }),
});
```

Create games with camera padding by default so map corners are explorable behind HUD:

```ts
const game = createGame({
  canvasId: "game",
  map: toMapData(mapMain),
  cameraEdgePadding: 120,
});
```

Spawn and control:

```ts
const playerId = game.spawnAtFeet("player", 500, 820);
game.setControlledEntity(playerId);

const npcId = game.spawnAtFeet("villager", 520, 760);
const propId = game.spawnCentered("marker", 500, 500);
```

Patch/query:

```ts
const entity = game.get(entityId);
game.patch(entityId, { visible: true, imageUrl: nextUrl });
game.destroy(entityId);
const crops = game.query((c) => c.kind === "crop");
```

Generated placement:

```ts
for (const target of game.getPlacementTargets()) {
  if (target.contents === "<prop_group>") {
    game.placeProp("cropOverlay", target, { cropId: target.id });
  }
}
```

Generated map overlay states:

For the overlay vs spawned-prop decision and wiring checklist, see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md).

`mapOverlays` are authored in the generated map JSON, not as spawned props in scene code. Use them for stateful map-baked props such as doors, safes, gates, barricades, or border/background props that need to swap images. Each overlay has an `id`, an initial `currentMapStateLabel`, and a list of `states` with image URLs and `box_2d` draw bounds:

```jsonc
{
  "id": "north_door",
  "anchorLabel": "North Door",
  "currentMapStateLabel": "closed",
  "states": [
    {
      "name": "closed",
      "url": "https://example.com/door-closed.png",
      "box_2d": [300, 500, 460, 590],
      "blocksMovement": true,
      "collider": [
        { "box_2d": [330, 520, 455, 570], "label": "door collider" },
      ],
    },
    {
      "name": "open",
      "url": "https://example.com/door-open.png",
      "box_2d": [300, 500, 460, 590],
      "blocksMovement": false,
    },
  ],
}
```

Gameplay swaps overlay states through the engine API:

```ts
game.getMapOverlays();
game.getMapOverlayState("north_door");
game.setMapOverlayState("north_door", "open");
```

Physical collision is optional per overlay state:

- `blocksMovement: true` makes that state block player movement and pathfinding.
- `blocksMovement: false` or omitted makes the state visual-only unless an overlay-level default says otherwise.
- Use `collider` or `colliders` with `box_2d` entries for the physical footprint.
- If `blocksMovement: true` and no colliders are provided, the state's full `box_2d` is used as the collider.
- Successful state changes clear pathfinding cache and emit `mapOverlay:changed`.

Optional render placement can be set with `renderLayer: "background" | "ground" | "occluder" | "prop"` on the overlay or individual state. Default is `"occluder"`.

Animations/facing (animation names come from `assets.md`):

```ts
game.setEntityAnimation(playerId, "<character>_walk");
game.setEntityAnimation(playerId, "<character>_default_animation");

// Generated characters face viewer's right by default.
game.setEntityFacingX(npcId, player.x < npc.x ? -1 : 1);
```

Coordinates are normalized per map panel: `0-1000`.

### NPC pathfinding / destinations

The facade includes a simple grid-backed A\* primitive for RPG navigation. It uses the same generated map colliders and walkable boxes as player collision.

Use feet/ground coordinates for path requests and destinations:

```ts
const npcId = game.spawnAtFeet("villager", 520, 760);
game.setEntityDestination(npcId, { x: 780, y: 640 }, { speed: 30 });
```

Typical destination speeds are lower than player speeds because large sprites/camera motion make movement feel faster than the raw number: use about `12`–`30` for slow NPC patrols, `40`–`80` for brisk NPCs/enemies, and `160`–`220` for player control.

Useful calls:

```ts
const path = game.findPath({ x: 520, y: 760 }, { x: 780, y: 640 });
game.setEntityDestination(npcId, { x: 780, y: 640 }, { stopDistance: 12 });
game.clearEntityDestination(npcId);
const nav = game.getEntityNavigation(npcId);
```

Navigation emits:

- `navigation:started`
- `navigation:arrived`
- `navigation:failed`

While an entity is following a destination, the runtime switches to a walk/run spritesheet and updates facing from movement direction. When the entity arrives, is blocked, or `clearEntityDestination` is called, it switches back to the idle/default spritesheet. This is automatic when the entity's `spriteSheets` use conventional names (`walk`/`run` for movement, `default_animation`/`idle` for stopping). Check exact names in `src/data/assets.md`; you do not need to call `setEntityAnimation` for basic destination movement.

Defaults are intentionally simple: static map obstacles only, no crowd avoidance, no entity/entity pushing. Use `cellSize` to tune accuracy/performance; smaller values are more accurate but slower. If the target point is inside a collider, the runtime snaps to a nearby walkable cell by default.

For full patrol-loop code, including clearing stale `arrived` / failed navigation state, use `docs/recipes/enemy-ai-waves.md`. Do not convert destination feet points back into entity top-left positions yourself in gameplay code; let `setEntityDestination(...)` preserve sprite foot anchors.

### Controlled movement contract

`game.setControlledEntity(entityId)` gives that entity built-in keyboard movement and camera follow.

- WASD and arrow keys move the controlled entity.
- Movement uses the entity's `speed` component.
- Speed is normalized map units per second, matching custom systems that move entities with `speed * dt`.
- Typical player speed is `160`–`220`; default to about `190`.
- Collision uses generated map walkable/collider data.
- Diagonal movement is supported by the runtime movement input.
- Horizontal facing updates automatically while the controlled actor moves left/right.
- The runtime chooses idle/move animations from sprite sheet names when they follow generated/default conventions, but gameplay that needs exact generated animation names should still use a small animation system and call `game.setEntityAnimation(...)` based on position delta.

### Hit feedback effects

Gameplay can trigger short visual hit feedback by patching transient entity fields:

```ts
const now = performance.now();
game.patch(enemyId, {
  hitFlashUntilMs: now + 150,
  hitShakeUntilMs: now + 150,
  hitGlitchUntilMs: now + 90,
  hitFlashIntensity: 1,
  hitShakeMagnitude: 4,
});
```

- `hitFlashUntilMs` brightens the entity until the timestamp.
- `hitShakeUntilMs` jitters the entity in screen space until the timestamp.
- `hitGlitchUntilMs` draws short chromatic/glitch duplicates until the timestamp.
- Effects work on animated actors and static image entities.
- Treat these as runtime-only feedback fields; do not persist them in saves.

### Map spritesheets / VFX

Generated map spritesheets are rendered as map effects from either `panel.spriteSheets` / `panel.spritesheets` entries or inline mask `spriteSheetUrl` fields.

- Standalone map spritesheets do **not** need `linkedColliderLabel` or a linked obstacle to render.
- If `type` / `spriteSheetType` is omitted, map spritesheets default to `background` and autoplay in a loop.
- Use `type: "gameplay"` for one-shot triggered effects, then call `game.triggerMapEffect(...)` or `game.triggerNearestMapEffect(...)`.
- `linkedColliderLabel` explicitly controls Y-sort anchoring / static obstacle replacement behavior.
- Without `linkedColliderLabel`, the renderer infers a Y-sort anchor from an overlapping/containing map mask when possible, so effects like torches on a wall draw with that wall instead of behind it.

Background/autoplay VFX loop automatically. Gameplay/triggered effects should be activated through the public facade:

```ts
game.triggerMapEffect("door");
game.triggerNearestMapEffect("door", player.x, player.y);
```

Use `triggerNearestMapEffect(...)` for player interactions when multiple effects share the same tag. Do not spawn duplicate entity animations for map-authored effects unless the requested effect is not present in `assets.md`.

### Render ordering

World draw order is a single Y-sorted queue (map masks + spawned entities).

| Layer          | Source                                                  | Sorting                                                    |
| -------------- | ------------------------------------------------------- | ---------------------------------------------------------- |
| Map background | `drawBackground`                                        | Behind the queue (panel art + mask shadows)                |
| `ground`       | Map masks with `type: "ground_patch"`                   | Painted in `drawBackground` only (behind the Y-sort queue) |
| `occluder`     | Houses, trees, wells, etc.                              | By `renderY` with spawned entities                         |
| `prop`         | `spawn` / `spawnAtFeet` / `spawnCentered` / `placeProp` | By `renderY`; always above `ground_patch`                  |

- Animated actors use feet/bottom as `renderY`.
- Static entities default to `renderY = y + height`; set `renderY` explicitly for grid tiles and standing props (usually cell/bounds `y2`).
- Flat floor decals spawned as props (puddles, stains, rugs, shadows, floor clues) often need a low `renderY` so characters draw on top of them instead of depth-sorting behind them like obstacles.
- Visibility still wins. If a required clue decal is covered by generated map occluder art, blends into the floor, or becomes hard to notice, raise its `renderY` enough to be visible or add a separate visible affordance such as a glow ring, pulse marker, label, or arrow.
- HUD widgets use `zIndex`, not world `renderY`.

See `docs/recipes/spawning.md` for the `x`/`y` top-left contract, spawn helper choice, and box format.

### Pointer/click routing

Use one of these public patterns:

1. **Geometry checks** for grids/zones:
   - convert pointer to world with `game.canvasClientToNormalizedPoint(clientX, clientY)`
   - compare against bounds stored in resources
2. **Hover/entity checks** for labeled interactables:
   - set `label`, `tooltip`, and optionally `hoverBounds`
   - call `game.getHoverTargetAt(clientX, clientY)`
3. **Proximity checks** for NPCs:
   - use player/NPC entity positions and a normalized distance threshold such as `80`–`120`
   - for first-pass NPC liveliness, face the NPC toward the player and trigger a one-time or cooldown-gated bark before explicit interaction

For crop grids, prefer resource-stored tile bounds plus `canvasClientToNormalizedPoint(...)`.

### Audio/music pattern

For registering audio in `common.json` and the loading-gate bootstrap pattern, see [ASSET_INTEGRATION.md](ASSET_INTEGRATION.md).

Use this split by default:

- **NPC barks/dialogue** -> default to scripted/resource-driven lines.
- **Background music / ambient music beds** -> use provided audio assets from `src/data/assets.md` with `getAudio(...)`, `stopAudio(...)`, and low volume.
- **Non-vocal frequent SFX** -> footsteps, UI bleeps, impacts, pickups, weapon sounds, alerts, and short non-verbal stingers should usually be procedural WebAudio by default. Do not invent or import new SFX files unless the task explicitly provides them.

For looping music, use `getAudio(name)`, but start playback from the loading gate continue gesture (or another direct player interaction), not from passive scene startup:

```ts
// src/main.ts
const loadingGate = createLoadingGate(canvas);
createMainScene({ onAudioReady: loadingGate.onContinue });
await loadingGate.waitForCompletion();
loadingGate.teardown();

// scene/audio setup
export function createMainScene(
  options: {
    onAudioReady?: (listener: () => void) => () => void;
  } = {},
) {
  const music = getAudio("<music_name>");
  if (music) {
    music.loop = true;
    music.volume = 0.05; // keep BGM subtle; raise only if the asset is mastered very quietly
    music.playbackRate = 1;
    options.onAudioReady?.(() => {
      void music.play();
    });
  }
}
```

The template's production loading gate emits `onContinue` synchronously from the **Tap To Continue** click/tap/key gesture. Put browser-gated work there: `music.play()`, `AudioContext.resume()`, and other APIs that rely on user activation. Preloading audio on startup is fine; playback should wait for `onContinue` or a later gameplay input. In local dev the gate completes immediately and `onContinue` is a no-op, so use normal gameplay inputs when testing gated audio.

Use a low volume for background music by default, around `0.05`, so BGM does not overpower UI feedback or gameplay sounds.

Stop cached looping music with:

```ts
stopAudio("<music_name>");
```

For small procedural SFX, create short, user-gesture-safe WebAudio tones/noise envelopes in a tiny audio utility or system:

```ts
const audioCtx = new AudioContext();

export function playUiClickSfx() {
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(660, now);
  gain.gain.setValueAtTime(0.04, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.09);
}
```

`playAudio(name)` only plays existing named audio assets and does not expose loop/volume options. Prefer `getAudio(...)` for BGM and procedural WebAudio for new gameplay/UI SFX.

### Feedback effects

Canvas-rendered world entities do not have DOM CSS classes. For public wrong-tool/hit feedback, use one of these patterns:

- store `shakeUntilMs` or `feedbackUntilMs` in a resource and render a small HUD/world-aligned marker widget using `normalizedToCanvasPoint(...)`
- temporarily patch a static overlay entity's `x/y` in a system, then restore it
- play a one-shot sound with `playAudio(...)` if an appropriate SFX exists

Do not rely on CSS classes for canvas entities.

## Character rules

Use `src/data/assets.md` animation names as the source of truth.

- Prefer `game.setEntityDestination(...)` for obstacle-aware NPC movement.
- If an NPC has no walk/run/move-style animation, avoid wandering by default unless the game explicitly accepts sliding/idle-only movement.
- Keep idle-only NPCs stationary and make them face the player when nearby/interacting.
- Generated character art faces viewer's right by default.
- Use `game.setEntityFacingX(id, -1)` to flip left and `game.setEntityFacingX(id, 1)` to face right.

## SDK rules

This engine guide only identifies when SDK capabilities are appropriate. For import paths, lazy initialization, auth/session behavior, save/load, storage, and multiplayer contracts, follow `docs/SDK_FACADE.md`.

## If the public surface is insufficient

For long-running autonomous tasks, do not stop and wait for user approval.

Instead:

1. try the public facade/docs first
2. if insufficient, inspect the smallest necessary internal file
3. make the smallest public-facing fix or addition
4. continue implementing the requested feature
5. mention the reason for the internal inspection/fix in the final summary

Do not use internals for ordinary gameplay code; use them only to repair or expose missing public primitives.
