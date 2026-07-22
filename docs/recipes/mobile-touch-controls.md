# Mobile touch controls

description: First-class phone-browser controls. Use when adding movement, interact/attack, or any keyboard-bound gameplay so touch and keyboard share one pipeline.

## Goal

Keyboard and touch must drive the **same** gameplay intents:

| Intent | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD / arrows | Default D-pad → `setMovementInput` |
| Discrete actions | `bindInputAction` | Touch buttons → `dispatchInputAction` |

Do not add key-only features. If a player can press `KeyE` on desktop, they need a touch button (or equivalent HUD) that fires the same action name.

## Scene setup

```ts
const game = createGame({
  canvasId: "game",
  map: toMapData(mapMain),
  cameraEdgePadding: 120, // leave room for bottom-corner controls
  // Optional: tune phone FOV / upscale cap
  // followZoom: 1.45,
  // maxViewportScale: 1,
  touchControls: {
    actions: [
      { action: "interact", label: "E" },
      { action: "attack", label: "A" },
    ],
  },
});

game.bindInputAction("interact", ["KeyE"]);
game.bindInputAction("attack", ["Space"]);

game.onInputAction("interact", ({ phase }) => {
  if (phase !== "down") return;
  game.emit("player:interact");
});

game.onInputAction("attack", ({ phase }) => {
  if (phase !== "down") return;
  game.emit("combat:attack");
});
```

- Pass `touchControls: false` only when the scene has no player controls (tools, cinematics).
- Omit `actions` to mount the D-pad alone.
- The default widget is visible only on touch-primary devices (`pointer: coarse` or `maxTouchPoints > 0`).

## Manual / custom HUD

```ts
// Movement (same path as WASD)
game.setMovementInput({ up: true });
game.clearMovementInput();

// Actions
game.dispatchInputAction("interact", { phase: "down", source: "touch" });
```

Custom widgets should use `zIndex` 100–299, stay bottom-edge anchored, and **not** set `blocksWorldInput` unless they are modals.

## Canvas / high-res maps

- The engine sizes the canvas backing store with `devicePixelRatio` (capped at 2) while gameplay math stays in logical panel pixels.
- Default CSS uses `image-rendering: auto` so photographic / high-res map art stays smooth. Pixel-art games can override the canvas rule to `pixelated`.
- `cameraEdgePadding`, `followZoom`, and `maxViewportScale` are public `createGame` options.

## Checklist when adding a feature

1. Bind the action with `bindInputAction` (keyboard).
2. Handle it once with `onInputAction` / systems — not separate keyboard and touch branches.
3. Add the same action to `touchControls.actions` (or a custom button that `dispatchInputAction`s).
4. Confirm `cameraEdgePadding` clears the new HUD chrome.
5. Aiming / world taps still use `docs/recipes/world-pointer-input.md`.

## Related

- `docs/recipes/world-pointer-input.md` — click/touch aiming and world markers
- `docs/recipes/hud-widget.md` — HUD chrome and padding
- `src/widgets/TouchControlsWidget.ts` — default D-pad + action buttons
- `src/inputs/README.md` — where to put binding modules
