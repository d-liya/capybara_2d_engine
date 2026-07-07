# Inputs

Put gameplay input binding and action handlers here.

Input modules should export setup functions that take `game: GameAPI` and call:

- `game.bindInputAction(...)`
- `game.onInputAction(...)`
- `game.dispatchInputAction(...)` only when bridging synthetic actions

Handlers should read and mutate resources via `game.getResource(...)`.

Do not add feature-specific key handling to `src/core` unless a public primitive is missing.
