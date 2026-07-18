# Scenes

## Main (`createMainScene`)

| | |
|---|---|
| **Map** | Inline blank starter panel (no generated map yet). Replace with `toMapData(yourMap)`. |
| **Player** | _(none)_ — spawn after generating a character |
| **Widgets** | Default tooltip only (via `createGame`) |
| **Systems** | _(none)_ |

```ts
import { createMainScene } from "./scenes/mainScene";
createMainScene({ onAudioReady: loadingGate.onContinue });
```

Scene creation returns synchronously. Browser-gated audio (if any) should still register on the loading-gate continue hook from `src/main.ts`.

### After generating assets

1. Register JSON in `src/data/index.ts` and document handles in `src/data/assets.md`
2. In `mainScene.ts`, pass `toMapData(mapHandle)` into `createGame`
3. `defineArchetype` + `spawnAtFeet` + `setControlledEntity` for the player
4. Mount HUD widgets / systems as needed
