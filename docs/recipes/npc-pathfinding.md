---
name: npc-pathfinding
description: Move NPCs around obstacles using GameAPI navigation primitives. Use when sending NPCs to destinations, patrol routes, or walkable targets.
---

# NPC Pathfinding

Use the public `GameAPI` navigation primitives for RPG-style NPC movement. The runtime uses generated map colliders and walkable boxes, so NPCs route around static map obstacles.

## Send an NPC to a destination

Coordinates are normalized world coordinates. Destinations are feet/ground positions, not sprite top-left positions.

```ts
const villagerId = game.spawnAtFeet("villager", 520, 760);

game.setEntityDestination(villagerId, { x: 780, y: 640 }, {
  speed: 90,
  stopDistance: 12,
});
```

## React when movement finishes

```ts
game.on("navigation:arrived", (payload) => {
  const event = payload as { entityId?: string };
  if (event.entityId !== villagerId) return;
  game.emit("dialogue:open", { npcId: villagerId });
});
```

## Patrol pattern

```ts
const patrol = [
  { x: 420, y: 760 },
  { x: 720, y: 760 },
  { x: 720, y: 600 },
];
let patrolIndex = 0;

function goNext() {
  patrolIndex = (patrolIndex + 1) % patrol.length;
  game.setEntityDestination(villagerId, patrol[patrolIndex], { speed: 80 });
}

game.on("navigation:arrived", (payload) => {
  const event = payload as { entityId?: string };
  if (event.entityId === villagerId) goNext();
});

game.setEntityDestination(villagerId, patrol[0], { speed: 80 });
```

## Click-to-move selected NPC

```ts
const point = game.canvasClientToNormalizedPoint(event.clientX, event.clientY);
if (point) {
  game.setEntityDestination(selectedNpcId, point, { stopDistance: 10 });
}
```

## Low-level path query

```ts
const path = game.findPath(
  { x: 520, y: 760 },
  { x: 780, y: 640 },
  { cellSize: 20, allowDiagonal: true },
);

if (path.status === "found") {
  console.log(path.points);
}
```

## Animation while moving

`setEntityDestination` handles walk and idle animations for you. You do not need to call `setEntityAnimation` on every destination request.

The entity must have `spriteSheets` on its archetype with conventional names from `src/data/assets.md`:

- **Moving:** first sheet whose `name` contains `walk` or `run` (for example `char_marta_walk`)
- **Stopped:** first sheet whose `name` contains `default_animation` or `idle` (for example `char_marta_default_animation`)

The runtime switches to walk/run each frame while following the path and updates horizontal facing from movement direction (left is the same sheet mirrored).

Idle is restored automatically when:

- the entity reaches the destination (`navigation:arrived`)
- movement is blocked (`navigation:failed` with `blocked`)
- you cancel with `clearEntityDestination`

If a character has no walk/run sheet, it will keep its current animation while moving. Give it a patrol route only after confirming walk/run names exist in `src/data/assets.md`.

## Notes

- This is static-map pathfinding. It does not avoid other moving entities.
- Smaller `cellSize` values are more accurate but slower.
- If a target point is blocked, the runtime snaps to a nearby walkable point by default.
