# Widget Guide

Widgets are pluggable HUD modules. Each widget is a TypeScript file that exports a factory function.  
They render in a DOM overlay above the game canvas and can be styled with Tailwind classes.

Generated `Hud...` files in this folder are **temporary visual scaffolds** from asset generation. They are not part of the engine contract — your game chooses panel/overlay ids and passes bindings at mount time.

Before opening a generated widget, skim the factory export and comments in the `Hud...` scaffold under `src/widgets/`.

---

## Widget rules

- Generated `Hud...` files are layout/hotspot scaffolds only; replace placeholders with resource reads and events/input actions.
- Long-lived gameplay state belongs in `game.registerResource(...)`.
- Gameplay-facing text feedback should be surfaced through HUD/widgets so players do not miss it during movement: dialogue panels, bark subtitles, toasts, prompts, objective trackers, and result messages.
- Every widget should present newly shown or changed player-facing text with a typing/typewriter animation instead of replacing visible copy abruptly.
- HUD **shell visibility** uses the generic `ui` resource — ids are **defined by your game**, not by scaffold file names.
- Do not hide widget roots with `display: none` or `api.state.isOpen`.
- Use `blocksWorldInput` only for modals/menus/dialogue.

## Typed UI visibility (engine)

The engine provides `Record<string, boolean>` maps — no built-in `topBar` / `inventory` / `start` keys.

```ts
import { createUiState } from "../Game";

// Game-owned ids (example — name them for your design)
const initialUi = createUiState(
  { seasonBar: false, hotbar: false },
  { title: true, dialogue: false },
);
game.registerResource("ui", initialUi);

game.patchUi({
  overlays: { title: false },
  panels: { seasonBar: true, hotbar: true },
});
```

### Binding scaffolds at mount time

Pass `ui` in the **second argument** to `useWidget` so scaffold files stay generic:

```ts
import { createCozySeasonHudWidget } from "../widgets/HudSeasonBar";

game.useWidget(createCozySeasonHudWidget, {
  ui: { type: "panel", id: "seasonBar" },
});
game.useWidget(createHarvestHavenStartWidget, {
  ui: { type: "overlay", id: "title" },
});
```

Scaffold factories accept optional `WidgetMountOptions` (`{ ui?: UiBinding }`).  
If `ui` is omitted, the widget stays mounted and visible (useful for layout preview only).

### Widget hooks

| Hook | Purpose |
|------|---------|
| `ui` (via mount options) | Visibility from `ui.panels` / `ui.overlays` |
| `isVisible(api)` | Dynamic HUDs (tooltip, touch controls, atmosphere) |
| `isInteractive(api)` | Pointer hits when visible |
| `blocksWorldInput(api)` | Blocks WASD while **visible** |

The manager sets `hidden` and `pointer-events` after each `update`.

### Z-index layering

Every widget should choose a `zIndex` from its role, not by guessing a large number. World-aligned helper widgets are especially easy to over-layer: tutorial arrows, click pointers, crosshairs, crop markers, and nearby prompts should sit above the canvas but below HUD panels and modals.

Use these bands by default:

| Band | Use |
|------|-----|
| `0-99` | World-aligned markers, crosshairs, pointer listeners, atmosphere/tint layers. |
| `100-299` | Persistent gameplay HUD panels, hotbars, status bars, mobile controls. |
| `300-499` | Non-modal feedback such as toasts, objective pings, NPC bubbles, bark subtitles. |
| `500-649` | Hover tooltips and inspection affordances. |
| `700-899` | Blocking overlays: dialogue, shops, inventory menus, title/start screens, result screens. |
| `900+` | Rare full-screen blockers such as loading/transition/fatal-state overlays. |

Rules:

- Do not set a world-aligned marker, pointer, or tutorial arrow above modal/dialogue/menu layers.
- World markers that are only meaningful during movement should hide when a blocking overlay is visible. Check the `ui` resource in `isVisible(api)` when needed.
- If a tutorial pointer needs to point at a modal/HUD control, make it part of that modal/HUD widget or give it the same overlay visibility rules, not a global high `zIndex`.
- Non-interactive visual layers should use `isInteractive: () => false` and `pointer-events-none` on decorative children.

### Gameplay feedback HUDs

Use HUD widgets for gameplay-related text that the player needs to notice, not only tiny world labels or console logs. Common surfaces are dialogue overlays, bark subtitles/speech bubbles, toast/status messages, nearby interaction prompts, objective trackers, and result summaries. Non-modal toasts, prompts, and bark subtitles should not block movement; full dialogue, shops, menus, and story modals may block world input.

Keep feedback messages in feature resources or a small feedback resource/queue. Prefer replacing, debouncing, or intentionally queueing short messages instead of stacking many independent toasts.

### Text animation

All widgets that render text should use a typing/typewriter reveal for player-facing copy. Store the full text and reveal progress in widget-local ephemeral state (`api.state`) or in the feature resource when multiple widgets need to coordinate. Reset the reveal when the source text changes; avoid storing typewriter timers as long-lived gameplay state.

Pacing rules: use a readable reveal for dialogue/story text, a fast reveal for short gameplay toasts, and instant or nearly instant reveal for urgent warnings/combat feedback. Modal dialogue should let interact/click complete the current reveal before advancing or closing.

### Text input / chat widgets

For widgets with `<input>` or `<textarea>`, prevent typed keys from reaching global game controls. Otherwise keys such as `W/A/S/D`, `E`, `Space`, arrows, or bound hotkeys can be consumed as movement/interact instead of text.

```ts
input.addEventListener("keydown", (event) => event.stopPropagation());
input.addEventListener("keyup", (event) => event.stopPropagation());
```

Modal chat/dialogue widgets should also block world movement while visible:

```ts
blocksWorldInput: () => true,
isInteractive: () => true,
```

Auto-focus text fields only when the widget is open and focus is not already inside the widget, so updates do not steal focus from buttons or selections:

```ts
update(api) {
  const elements = api.state.elements;
  if (
    isOpen &&
    document.activeElement !== elements.input &&
    !elements.root.contains(document.activeElement)
  ) {
    elements.input.focus({ preventScroll: true });
  }
}
```

Use `onKeyDown` for modal shortcuts such as Escape-to-close, but do not return `true` for normal text-entry keys unless you intentionally want to consume them.

### Dynamic action buttons and interactive children

Do **not** rebuild clickable buttons or attach event listeners every `update()` frame. Widgets update continuously, so replacing `innerHTML` in `update()` can remove the exact DOM node the player is clicking, reset hover/focus state, and race with parent region click handlers.

Bad pattern:

```ts
update(api) {
  actions.innerHTML = state.actions
    .map((action) => `<button data-action-id="${action.id}">${action.label}</button>`)
    .join("");

  actions.querySelectorAll("button[data-action-id]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      api.game.emit("dialogue:action", { actionId: button.dataset.actionId });
    });
  });
}
```

Preferred patterns:

1. Create stable child elements in `mount()` and update only their text/visibility in `update()`.
2. Or, if the action list is dynamic, rebuild only when the action signature changes.
3. Use one delegated click listener attached once in `mount()` instead of per-frame listeners.

Example:

```ts
mount(api) {
  const root = document.createElement("div");
  root.innerHTML = `<div id="dialogue-actions" class="pointer-events-auto"></div>`;

  const actions = root.querySelector("#dialogue-actions") as HTMLElement;
  actions.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-action-id]",
    );
    if (!button) return;

    event.preventDefault();
    event.stopPropagation();

    api.game.emit("dialogue:action", {
      actionId: button.dataset.actionId,
    });
  });

  api.setState({ actionSignature: "" });
  return root;
}

update(api) {
  const dialogue = api.game.getResource<DialogueState>("dialogue");
  const actions = root.querySelector("#dialogue-actions") as HTMLElement;
  const signature = dialogue.actions
    .map((action) => `${action.id}:${action.label}`)
    .join("|");

  if (api.state.actionSignature !== signature) {
    actions.replaceChildren(
      ...dialogue.actions.map((action) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.actionId = action.id;
        button.textContent = action.label;
        button.className = "rounded-lg border px-3 py-1.5";
        return button;
      }),
    );
    api.setState({ actionSignature: signature });
  }
}
```

If action buttons live inside a larger clickable generated HUD region, the child button handler must call both:

```ts
event.preventDefault();
event.stopPropagation();
```

Parent region click handlers should ignore clicks that start from interactive children:

```ts
parent.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest("button,input,textarea,select,[data-stop-region-click]")) {
    return;
  }
  api.game.emit("dialogue:advance");
});
```

Use `data-stop-region-click` for custom interactive child elements that are not native form controls or buttons.

### Optional: stricter game types

Add a small file in your game (not in `src/types/UiState.ts`):

```ts
// src/types/MyGameUi.ts
import { createUiState, type UiState } from "../Game";

export const myGameUiKeys = createUiState(
  { seasonBar: false, hotbar: false },
  { title: false, dialogue: false },
);

export type MyGameUi = typeof myGameUiKeys;
export type MyGameUiPatch = {
  panels?: Partial<MyGameUi["panels"]>;
  overlays?: Partial<MyGameUi["overlays"]>;
};
```

## Widget anatomy

```ts
import type { WidgetMountOptions } from "../types/UiState";

export function createMyWidget(options?: WidgetMountOptions) {
  return {
    id: "my-widget",
    zIndex: 100,
    ...(options?.ui ? { ui: options.ui } : {}),

    mount(api) {
      const el = document.createElement("div");
      el.className = "absolute bottom-4 right-4";
      return el;
    },

    update(api) {
      const data = api.game.getResource("myResource");
      // sync DOM only; reveal player-facing text with a typing/typewriter effect
    },

    blocksWorldInput: () => false,
  };
}
```

---

## The `api` object

| Property              | Description |
| --------------------- | ----------- |
| `api.state`           | Widget-local ephemeral state (not HUD visibility). |
| `api.setState(patch)` | Merge widget-local state. |
| `api.game`            | `GameAPI` — `getResource`, `patchUi`, `emit`, etc. |
| `api.canvas`          | Game canvas. |
| `api.hudRoot`         | HUD overlay root. |
| `api.now`             | `performance.now()` for this frame. |

---

## Wiring

```ts
game.registerResource("ui", createUiState({ hudA: false }, { modal: true }));
game.useWidget(createHudScaffold, { ui: { type: "panel", id: "hudA" } });
game.patchUi({ overlays: { modal: false }, panels: { hudA: true } });
```

---

## Positioning

- Use `absolute` inside `#hud-root`; avoid `position: fixed` for gameplay HUDs.
- Choose `zIndex` from the widget role. World-aligned pointers/markers should stay below persistent HUD panels and blocking overlays.
- Decorative inner nodes may use `pointer-events-none`; the engine sets root `pointer-events` from `isInteractive`.

### World-aligned markers (canvas + HUD)

The game has two layers:

- **`#game` canvas** — world art, camera pan/zoom applied inside the render loop.
- **`#hud-root`** — DOM overlay (`position: absolute; inset: 0` on `#game-shell`) for widgets.

They use **different coordinate spaces**. A marker pinned with static CSS (`top: 40%`, `left: 200px`, `position: fixed`, or screen pixels computed once on load) will drift when the window resizes, the camera pans/zooms, or the canvas is letterboxed/centered inside the shell (common on touch / camera-follow).

**Rules for markers that point at map obstacles, props, NPCs, or placement zones:**

1. **Store anchors in normalized world coords (0–1000 per panel)** — not CSS pixels, not canvas buffer pixels.
   - Entity top-left: `entity.x`, `entity.y`
   - Collider / placement `box_2d`: `[y_min, x_min, y_max, x_max]` — anchor at center, corner, or edge as needed:
     ```ts
     const anchorX = (bounds.x1 + bounds.x2) / 2;
     const anchorY = bounds.y1;
     ```
2. **Re-project every frame in `update()`** — never cache screen positions across frames or only on `resize`.
3. **Convert with `game.normalizedToCanvasPoint(worldX, worldY)`** — this applies camera pan, zoom, and CSS scale.
4. **Convert canvas-local pixels to HUD-local pixels** — `normalizedToCanvasPoint` returns coords relative to the canvas top-left. `#hud-root` covers `#game-shell`, which may be larger than the canvas when letterboxing/centering is active. Include both rects:
   ```ts
   update({ game, canvas, hudRoot }) {
     const point = game.normalizedToCanvasPoint(marker.worldX, marker.worldY);
     const canvasRect = canvas.getBoundingClientRect();
     const hudRect = hudRoot.getBoundingClientRect();
     const x = point.x + canvasRect.left - hudRect.left;
     const y = point.y + canvasRect.top - hudRect.top;
     markerEl.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
   }
   ```
5. **Mount the widget root as `absolute inset-0 pointer-events-none`** and position children with `transform`, not `top`/`left` percentages.
6. **Use `zIndex` 0–99** for world-aligned markers (see z-index table above).

Reference implementations: `NpcBubbleWidget.ts`, `TooltipWidget.ts`. See also `docs/recipes/world-pointer-input.md`.

**Do not:**

- Use `position: fixed` or viewport `%` for world-aligned markers.
- Compute marker screen position only on load or `window.resize`.
- Assume `#hud-root` and the canvas share the same origin without reading `getBoundingClientRect()`.

**Alternative:** simple icons/shapes that do not need HTML can be drawn on the canvas or spawned as props — they inherit the camera transform automatically. Use HUD widgets when you need styled labels, arrows, or DOM animations.
