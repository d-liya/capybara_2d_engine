---
name: hud-widget
description: Wiring and adapting generated HUD scaffolds, layout, and z-index rules. Use when building or customizing HUD panels, hotbars, menus, and on-screen UI.
---

# Recipe: HUD Widgets

Use this when wiring or adapting generated HUD scaffolds.

## Read first

- `src/widgets/AGENTS.md` — widget rules, hooks, text animation, input handling, and anatomy
- Widget contracts in `src/data/assets.md`

## Recipe-specific notes

- Check which HUD panels stay open during normal gameplay (top bars, bottom hotbars, side panels, touch controls). If persistent edge chrome exists, set scene-level padding with `createGame({ cameraEdgePadding })` so world corners and the player are not covered.
- Keep game UI clean: do not display developer/debug errors, stack traces, raw exception messages, or failed SDK response payloads in HUD widgets. Log technical details to the browser console and show only neutral player-facing fallback text when needed.
- Keep modal HUDs above world-aligned helper widgets. Tutorial arrows, click pointers, crosshairs, crop markers, and nearby prompts should not use high `zIndex` values that cover dialogue, shops, inventory menus, or title/result screens. See `src/widgets/AGENTS.md` for the z-index bands.

## Scene-owned UI ids

```ts
import { createUiState } from "../Game";
import { createCozySeasonHudWidget } from "../widgets/HudSeasonBar";
import { createHarvestHavenStartWidget } from "../widgets/HudStartScreen";

game.registerResource(
  "ui",
  createUiState(
    { seasonBar: false, hotbar: false },
    { title: true, dialogue: false },
  ),
);

game.useWidget(createHarvestHavenStartWidget, {
  ui: { type: "overlay", id: "title" },
});
game.useWidget(createCozySeasonHudWidget, {
  ui: { type: "panel", id: "seasonBar" },
});

game.patchUi({
  overlays: { title: false, dialogue: false },
  panels: { seasonBar: true, hotbar: true },
});
```

Name ids for your game design — there are no global `topBar` / `start` constants in the engine.

## Flow transitions

```ts
// Title screen
game.patchUi({ overlays: { title: true }, panels: { seasonBar: false, hotbar: false } });

// Gameplay
game.patchUi({ overlays: { title: false, dialogue: false }, panels: { seasonBar: true, hotbar: true } });

// Dialogue modal
game.patchUi({ overlays: { dialogue: true }, panels: { seasonBar: true, hotbar: true } });
```

Use `setExclusiveOverlay(uiState, "dialogue")` when only one overlay should be active.

## Adapting generated stubs

1. Accept `options?: WidgetMountOptions` and spread `options?.ui` on the returned widget object.
2. Remove `isOpen` / `display:none` from `update`.
3. Wire handlers to resources and `game.patchUi(...)`.
4. Add typing/typewriter reveal for player-facing text — see `src/widgets/AGENTS.md`.

```ts
export function onCloseDialogue(api: WidgetAPI<GameAPI>): void {
  const dialogue = api.game.getResource<DialogueState>("dialogue");
  dialogue.isOpen = false;
  api.game.patchUi({ overlays: { dialogue: false } });
}
```

## Dynamic HUDs (no `ui` binding)

Tooltips, mobile controls, atmosphere tints:

```ts
isVisible(api) {
  return !!api.game.getResource<InventoryState>("inventory")?.cursorIconUrl;
},
isInteractive: () => false,
```

## Layout

- `absolute` inside `#hud-root`; avoid `position: fixed` for gameplay HUDs.
- Blocking overlays such as dialogue, shops, menus, title screens, and result screens should use the modal z-index band (`700-899`). Persistent HUD chrome should stay below that, and world-aligned markers/pointers should stay below persistent HUD chrome.
- For persistent edge-anchored HUDs, choose `cameraEdgePadding` at least as large as the always-visible bar thickness plus margin.

See `src/widgets/AGENTS.md` for positioning, hooks, and widget anatomy.
