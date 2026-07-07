# Systems

Put frame-based gameplay logic here.

Pattern:

```ts
import type { GameAPI } from "../Game";

export function registerMySystem(game: GameAPI): void {
  game.registerSystem("feature:name", (dt, api) => {
    const state = api.getResource<MyState>("resourceKey");
  });
}
```

Rules:

- Each system should focus on one job.
- Systems must retrieve state via `getResource`.
- Do not close over mutable scene-local gameplay state.
- Keep per-frame work lightweight.

Examples:

- `farm:clock`
- `farm:crops`
- `npc:wander`
- `save:auto`
