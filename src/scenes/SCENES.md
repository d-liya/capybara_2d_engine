# Scenes

## Main (`createMainScene`)

| | |
|---|---|
| **Map** | Inline blank starter panel (full walkable) |
| **Player** | `charPlayer` via `toArchetype` (directional multi-clip JSON) |
| **Spawn** | Feet `(500, 520)` |
| **4-way** | **Native on Actor** (no separate facing system) |
| **Inputs** | Built-in WASD / arrows |

```ts
import { createMainScene } from "./scenes/mainScene";
createMainScene({ onAudioReady: loadingGate.onContinue });
```
