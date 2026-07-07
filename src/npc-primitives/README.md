# NPC primitives

Shared lightweight helpers for named NPCs.

These files are gameplay primitives, not an NPC framework. Scripted NPCs, scheduled NPCs, and LLM-backed NPCs can all wrap these helpers.

## Files

- `types.ts` — NPC ids, definitions, runtime state, world-context item types, and tool-result shape.
- `state.ts` — `registerNpc`, `getNpcState`, `listNpcStates`, and the `npcPrimitives` resource.
- `bark.ts` — short visible speech/bark bubble state.
- `thought.ts` — thought/typing state for NPC bubbles.
- `proximity.ts` — player/NPC proximity and distance helpers.
- `movement.ts` — move, stop, and face-player helpers for registered NPCs.
- `worldContext.ts` — generated map data to compact static world context with stable `itemId`s.

- `errors.ts` — re-exported SDK service/usage-limit helpers.
- `index.ts` — public exports for gameplay code.

## Usage

Register a named NPC after spawning its entity:

```ts
const entityId = game.spawnAtFeet("npcGuide", 520, 640);

registerNpc(game, {
  id: "guide",
  displayName: "Guide",
  canMove: true,
}, entityId);
```

Use helpers from game code, systems, NPC files, or AI tools:

```ts
setNpcThought(game, "guide", "Checking the path...", 3_000);
barkNpc(game, "guide", "The bridge is safer at dawn.");
moveNpcToLocation(game, "guide", "forest-gate");


```

World context is registered automatically by `createGame(...)` and refreshed by `game.loadMap(...)`:

```ts
const markdown = getNpcWorldMarkdown(game);
const gate = getNpcLocation(game, "forest-gate");
```



The NPC bubble renderer lives in `src/widgets/NpcBubbleWidget.ts`.
