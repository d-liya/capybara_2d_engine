# Archetypes

Put reusable entity defaults here.

Pattern:

```ts
import type { GameAPI } from "../Game";

export function registerMyArchetypes(game: GameAPI): void {
  game.defineArchetype("player", {
    kind: "character",
    spriteSheets: [],
    speed: 190,
    radius: 34,
    width: 140,
    height: 168,
  });
}
```

Examples:

- NPC archetypes with `spriteSheets`, `speed`, `label`, `tooltip`
- prop archetypes with `sprite` / `imageUrl` and size
- crop overlay archetypes with `kind: "crop"`

Keep archetypes generic. Put per-instance placement and gameplay state in scene setup/resources.
