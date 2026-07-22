# Inputs

Put gameplay input binding and action handlers here.

Input modules should export setup functions that take `game: GameAPI` and call:

- `game.bindInputAction(...)`
- `game.onInputAction(...)`
- `game.dispatchInputAction(...)` only when bridging synthetic actions

Handlers should read and mutate resources via `game.getResource(...)`.

**Mobile parity:** every `bindInputAction` name should also appear on the default touch HUD (`createGame({ touchControls: { actions: [...] } })`) or a custom widget that calls `dispatchInputAction` with the same name. Movement is not an input action — touch uses `setMovementInput` via `TouchControlsWidget`. See `docs/recipes/mobile-touch-controls.md`.

Do not add feature-specific key handling to `src/core` unless a public primitive is missing.
