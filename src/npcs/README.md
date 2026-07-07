# NPCs

Put one file per named character here.

NPC files define character identity and character-specific behavior, not render prefabs.
Use `src/archetypes/` for sprite/body defaults and `src/scenes/` for spawning/composition.

Pattern:

```ts
import type { EntityId, GameAPI } from "../Game";
import { registerNpc } from "../npc-primitives";
import { sdk } from "../sdk";

export function setupGuideNpc(game: GameAPI, entityId: EntityId): void {
  registerNpc(game, {
    id: "guide",
    displayName: "Guide",
    canMove: true,
  }, entityId);
}
```

Typical named NPC files may include:

- `setup<Name>Npc(...)`
- scripted dialogue line selection
- schedule/autonomy setup for that character

Scenes should call NPC setup after spawning the matching archetype:

```ts
const guideEntityId = game.spawnAtFeet("npcGuide", 520, 640);
setupGuideNpc(game, guideEntityId);
```

See `docs/recipes/npc-primitives.md` and `docs/recipes/npc-dialogue.md`.
