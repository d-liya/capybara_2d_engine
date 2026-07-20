---
name: npc-primitives
description: Reusable NPC registration, bubbles, proximity, movement, and file organization patterns. Use when scaffolding named NPCs, archetypes, and world-context behavior.
---

# Recipe: NPC primitives

Use this when adding reusable NPC behavior such as registration, bubbles, proximity checks, movement, or world-context destinations.

## File organization

```txt
src/types/            game-specific NPC/dialogue/schedule state
src/archetypes/       reusable entity prefabs: sprite, size, speed, animation, tooltip
src/npcs/             one file per named NPC: identity, authored lines, optional AI tools
src/systems/          proximity checks, schedules, patrols, bark triggers
src/widgets/          DOM HUD/widgets such as NPC bubbles and tooltips
```

## Archetypes

Use generated character handles and animation names from `src/data/` generated JSON.

Keep render/body defaults in archetypes. It is also fine to include small static metadata such as a stable `npcId`, `label`, and `tooltip` if that helps spawn/setup code avoid duplicating strings. Do **not** put long prompt strings, line transcripts, cooldown flags, patrol route state, or dialogue state in the archetype; those belong in NPC modules/resources/systems.

```ts
import type { GameAPI } from "../Game";
import { charGuide, toArchetype } from "../data";

export function defineNpcArchetypes(game: GameAPI): void {
  game.defineArchetype(
    "npcGuide",
    toArchetype(charGuide, {
      kind: "character",
      npcId: "guide",
      label: "Guide",
      tooltip: "A calm trail guide.",
      speed: 28,
      width: 100,
      height: 120,
      activeAnimation: "char_guide_default_animation",
    }),
  );
}
```

## One file per named NPC

Put named character setup in `src/npcs/<name>.ts`. See `docs/recipes/npc-dialogue.md`.

```ts
import type { EntityId, GameAPI } from "../Game";
import { registerNpc } from "../npc-primitives";

export const GUIDE_NPC_ID = "guide" as const;

export function setupGuideNpc(game: GameAPI, entityId: EntityId): void {
  registerNpc(game, {
    id: GUIDE_NPC_ID,
    displayName: "Guide",
    canMove: true,
    barkCooldownMs: 8_000,
    thoughtDurationMs: 4_000,
  }, entityId);
}


```

The NPC id is the persistent gameplay identity. The entity id is the current spawned runtime body.

## Scene composition

Scenes decide what exists right now.

```ts
const game = createGame({
  canvasId: "game",
  map: toMapData(mapMain),
});

defineCharacterArchetypes(game);

const guideEntityId = game.spawnAtFeet("npcGuide", 520, 640);
setupGuideNpc(game, guideEntityId);

game.useWidget(createNpcBubbleWidget, {
  ui: { type: "panel", id: "npcBubbles" },
});
```

Keep scene files focused on composition. Put reusable behavior in NPC files, systems, widgets, or primitives.

## NPC state and bubbles

`registerNpc(...)` stores the named NPC state in the `npcPrimitives` resource. `barkNpc(...)` is the existing readable bubble-state helper. Use it when the game mounts `NpcBubbleWidget`. If the game uses a bark subtitle, toast, or dialogue resource instead, update that resource directly. Do not create additional generic bark/speech helper functions.

```ts
import { barkNpc, setNpcThought } from "../npc-primitives";

setNpcThought(game, "guide", "Checking the trail...", 3_000);
barkNpc(game, "guide", "The bridge is safer at dawn.", {
  ignoreCooldown: true,
});
```

Mount the widget from `src/widgets/NpcBubbleWidget.ts`:

```ts
import { createNpcBubbleWidget } from "../widgets/NpcBubbleWidget";

game.useWidget(createNpcBubbleWidget, {
  ui: { type: "panel", id: "npcBubbles" },
});
```

## First-pass NPC liveliness baseline

When a new game slice introduces friendly or neutral NPCs, do not leave them as silent statues unless the design explicitly calls for it. The default first-pass baseline is:

1. Spawn the NPC with `spawnAtFeet(...)` and register it with `registerNpc(...)` so it has stable named state.
2. Mount `createNpcBubbleWidget` and use existing `barkNpc(...)`, or provide an equivalent bark subtitle/toast/dialogue resource so barks are readable.
3. If `src/data/` generated JSON shows a walk/run/move animation for that character, give it a short patrol route through open walkable space using `game.setEntityDestination(...)` or `moveNpcToPoint(...)`.
4. If the character has only idle/default animation, keep it stationary; do not make it slide around.
5. In a proximity system, face the NPC toward the player and trigger an authored bark before the player interacts.
6. Gate the bark with a one-time flag and/or cooldown so it cannot repeat every frame or spam audio.


This small behavior pass makes the world feel inhabited while keeping deterministic gameplay simple.

## Proximity

Use proximity helpers for interactions, contextual barks, or simple scripted reactions. Proximity barks should normally run before explicit interaction so the player hears/sees signs of life as they approach.

```ts
import { barkNpc, facePlayer, isPlayerNearNpc } from "../npc-primitives";
import { GUIDE_NPC_ID, playGuideBridgeLine } from "../npcs/guide";

game.registerSystem("npc:nearbyGuide", (_dt, api) => {
  if (!isPlayerNearNpc(api, GUIDE_NPC_ID, 110)) return;
  facePlayer(api, GUIDE_NPC_ID);

  const state = api.getResource<{ greeted: boolean }>("guideState");
  if (!state.greeted) {
    state.greeted = true;
    barkNpc(api, GUIDE_NPC_ID, "I hear water beyond those trees.", {
      ignoreCooldown: true,
      durationMs: 3_500,
    });
    playGuideBridgeLine();
  }
});
```

For richer facts:

```ts
const proximity = getNpcPlayerProximity(game, "guide", { nearRadius: 120 });
```

## Movement and simple patrols

`moveNpcToPoint(...)` and `moveNpcToLocation(...)` are normal gameplay helpers. They can be used by scripts, schedules, cutscenes, or LLM tools.

Before adding patrol movement, confirm the generated character exposes a walk/run/move-style animation in `src/data/` generated JSON. If not, keep the NPC stationary and use facing/proximity barks instead.

```ts
import { moveNpcToLocation } from "../npc-primitives";

moveNpcToLocation(game, "guide", "forest-gate", {
  speed: 30,
  stopDistance: 12,
});
```

`moveNpcToLocation` uses world-context `itemId`s.

For a fixed local patrol, keep state in a resource/system and clear completed navigation before assigning the next waypoint:

```ts
import type { EntityId, GameAPI, PathPoint } from "../Game";

interface NpcPatrolRoute {
  entityId: EntityId;
  npcId: string;
  waypoints: PathPoint[];
  next: number;
  speed: number;
  waitRemaining: number;
  waitSeconds: number;
}

interface NpcPatrolState {
  routes: NpcPatrolRoute[];
}

export function registerNpcPatrolSystem(game: GameAPI): void {
  game.registerResource("npcPatrol", { routes: [] } satisfies NpcPatrolState);

  game.registerSystem("npc:patrol", (dt, api) => {
    const patrol = api.getResource<NpcPatrolState>("npcPatrol");

    for (const route of patrol.routes) {
      if (route.waitRemaining > 0) {
        route.waitRemaining = Math.max(0, route.waitRemaining - dt);
        continue;
      }

      const nav = api.getEntityNavigation(route.entityId);
      if (nav?.status === "moving") continue;

      if (["arrived", "blocked", "unreachable"].includes(String(nav?.status))) {
        api.clearEntityDestination(route.entityId);
        route.next = (route.next + 1) % route.waypoints.length;
        route.waitRemaining = route.waitSeconds;
        continue;
      }

      const result = api.setEntityDestination(route.entityId, route.waypoints[route.next], {
        speed: route.speed,
        stopDistance: 16,
        snapToNearestWalkable: true,
      });

      if (result.status !== "found") {
        api.clearEntityDestination(route.entityId);
        route.next = (route.next + 1) % route.waypoints.length;
        route.waitRemaining = 0.25;
      }
    }
  });
}

export function addNpcPatrolRoute(
  game: GameAPI,
  route: Omit<NpcPatrolRoute, "next" | "waitRemaining">,
): void {
  game.getResource<NpcPatrolState>("npcPatrol").routes.push({
    ...route,
    next: 0,
    waitRemaining: 0,
  });
}
```

## World context

`createGame(...)` automatically registers `npcWorldContext` from the current map data. `game.loadMap(...)` refreshes it.

World context is compact static generated-map context:

- walkable areas
- masks/colliders/landmarks
- generated placement points
- map overlays
- spritesheet VFX
- stitched map extension offsets
- stable `itemId`s for tools and movement helpers

Use:

```ts
import { getNpcWorldMarkdown, getNpcLocation } from "../npc-primitives";

const markdown = getNpcWorldMarkdown(game);
const location = getNpcLocation(game, "forest-gate");
```

Prompt/tool instructions should say: use `itemId` exactly.




