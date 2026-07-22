---
name: world-pointer-input
description: Click/touch targeting, aiming, crosshairs, and world-aligned UI markers. Use when attacks, spells, or interactions follow the pointer or use drag-select.
---

# Recipe: World Pointer Input and Aiming

Use this for click/touch targeting, aiming, shooting, spell placement, drag-select, crosshairs, and world-aligned UI markers.

## Read first

- `docs/CAPYBARA_ENGINE.md`
- `src/widgets/AGENTS.md` for widget hook details
- `src/data/` generated JSON for actual crosshair, cursor, marker, HUD, or tool assets
- `docs/recipes/combat-projectiles.md` if pointer input fires projectiles or attacks
- `docs/recipes/map-placement.md` if clicks interact with generated placement zones

## Public primitives

The public `GameAPI` exposes coordinate conversion:

```ts
const point = game.canvasClientToNormalizedPoint(event.clientX, event.clientY);
const screen = game.normalizedToCanvasPoint(worldX, worldY);
const hover = game.getHoverTargetAt(event.clientX, event.clientY);
```

Use widgets for DOM pointer listeners and crosshair/cursor visuals. Widget hooks receive `api.canvas`, `api.hudRoot`, `api.game`, and `api.now` as documented in `src/widgets/AGENTS.md`.

## State shape

Store gameplay-relevant pointer state in a resource. Widget-local state is fine only for purely visual pointer coordinates.

```ts
export interface AimState {
  pointerWorldX: number | null;
  pointerWorldY: number | null;
  pointerCanvasX: number | null;
  pointerCanvasY: number | null;
  pointerInsideWorld: boolean;
  isPointerDown: boolean;
  lastClickedWorldX?: number;
  lastClickedWorldY?: number;
}
```

Register it during scene setup:

```ts
game.registerResource("aim", {
  pointerWorldX: null,
  pointerWorldY: null,
  pointerCanvasX: null,
  pointerCanvasY: null,
  pointerInsideWorld: false,
  isPointerDown: false,
});
```

Use `game.getResource<AimState>("aim")` when reading it.

## Widget pointer listener pattern

Create or adapt a widget that listens to pointer events. Keep the root non-blocking unless it intentionally captures clicks.

Pointer/crosshair widgets should stay in the low world-helper z-index band (`0-99`). Do not raise pointer markers above HUDs to make them visible; instead hide or restyle them when panels/modals are open. If a tutorial pointer is meant to point at a HUD/modal button, put that pointer inside the HUD/modal widget or bind it to the same `ui` overlay state.

```ts
export function createAimInputWidget() {
  return {
    id: "aim-input",
    zIndex: 50,
    mount(api) {
      const el = document.createElement("div");
      el.className = "absolute inset-0 pointer-events-none";

      const updatePointer = (event: PointerEvent) => {
        const aim = api.game.getResource<AimState>("aim");
        const point = api.game.canvasClientToNormalizedPoint(event.clientX, event.clientY);
        const rect = api.canvas.getBoundingClientRect();
        aim.pointerCanvasX = event.clientX - rect.left;
        aim.pointerCanvasY = event.clientY - rect.top;
        aim.pointerWorldX = point?.x ?? null;
        aim.pointerWorldY = point?.y ?? null;
        aim.pointerInsideWorld = Boolean(point);
      };

      api.canvas.addEventListener("pointermove", updatePointer);
      api.canvas.addEventListener("pointerdown", (event) => {
        updatePointer(event);
        const aim = api.game.getResource<AimState>("aim");
        aim.isPointerDown = true;
        if (aim.pointerWorldX !== null && aim.pointerWorldY !== null) {
          aim.lastClickedWorldX = aim.pointerWorldX;
          aim.lastClickedWorldY = aim.pointerWorldY;
          api.game.emit("world:pointerdown", {
            x: aim.pointerWorldX,
            y: aim.pointerWorldY,
            button: event.button,
          });
        }
      });
      api.canvas.addEventListener("pointerup", () => {
        api.game.getResource<AimState>("aim").isPointerDown = false;
        api.game.emit("world:pointerup");
      });

      return el;
    },
  };
}
```

If the widget framework supports teardown in the local generated widget style, remove event listeners on teardown. If not, register this widget once per scene and avoid remounting it repeatedly.

## Crosshair or cursor visual

Use a non-interactive DOM element in the widget. The visual can follow pointer coordinates, but selected weapon/tool state should live in a resource.

```ts
mount(api) {
  const root = document.createElement("div");
  root.className = "absolute inset-0 pointer-events-none";

  const crosshair = document.createElement("div");
  crosshair.className = "absolute w-6 h-6 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80";
  root.appendChild(crosshair);

  return root;
},
update(api) {
  const aim = api.game.getResource<AimState>("aim");
  // set transform from aim.pointerCanvasX/Y when available
}
```

For world-aligned markers, convert world coordinates back to canvas coordinates:

```ts
const point = api.game.normalizedToCanvasPoint(marker.worldX, marker.worldY);
el.style.transform = `translate(${point.x}px, ${point.y}px)`;
```

## Click-to-interact pattern

For clicks on labelled entities or props:

```ts
game.on("world:pointerdown", (payload) => {
  const { x, y } = payload as { x?: number; y?: number };
  if (typeof x !== "number" || typeof y !== "number") return;

  const playerId = game.getControlledEntity();
  const player = playerId ? game.get(playerId) : null;
  if (!player || typeof player.x !== "number" || typeof player.y !== "number") return;

  for (const npcId of game.query((c) => c.kind === "npc")) {
    const npc = game.get(npcId);
    if (!npc || typeof npc.x !== "number" || typeof npc.y !== "number") continue;
    if (Math.hypot(npc.x - x, npc.y - y) <= Number(npc.radius ?? 40)) {
      game.emit("npc:interact", { npcId });
      return;
    }
  }
});
```

If direct click precision matters and entities have labels/hover bounds, `getHoverTargetAt(event.clientX, event.clientY)` can be used inside the widget before converting to world coordinates.

## Click-to-shoot pattern

```ts
game.on("world:pointerdown", (payload) => {
  const { x, y, button } = payload as { x?: number; y?: number; button?: number };
  if (button !== 0 || typeof x !== "number" || typeof y !== "number") return;
  game.emit("combat:attack", { x, y });
});
```

The combat/projectile system should consume `combat:attack` and apply cooldown/ammo rules. Do not put long-lived weapon state in the pointer widget.

## Drag-select or area targeting

Store drag start/end in the aim/resource state and use a widget to draw the rectangle/circle. On pointer up, emit a gameplay event with normalized world coordinates.

Use simple shape checks in gameplay systems. The public facade does not provide selection volumes or physics queries.

## Blocking input

- Crosshair/aim widgets should use `isVisible` / `isInteractive: () => false` (or inner `pointer-events-none`); do not block world input.
- Do not hide pointer widgets with CSS; use `isVisible(api)` when the tool/aim mode is inactive.
- Buttons, inventory slots, radial menus, and modal target confirmation panels may use `pointer-events-auto` on those controls only.
- `blocksWorldInput` should return true only for menus/dialogue/modal targeting states that should stop movement.

## Mobile/touch

Pointer events work for mouse and touch-capable browsers. For mobile action buttons, use the default touch HUD (`createGame({ touchControls: { actions: [...] } })`) or widgets that call `api.game.dispatchInputAction("attack", { phase: "down", source: "touch" })` / emit gameplay events. Keep the same gameplay systems consuming the intent so keyboard, mouse, and touch share behavior.

Movement uses the shared D-pad → `setMovementInput` path (same as WASD). Full checklist: `docs/recipes/mobile-touch-controls.md`.
