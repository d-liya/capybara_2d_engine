---
name: enemy-ai-waves
description: Patrol, chase, attack loops, spawn waves, and survival arena encounters. Use when implementing enemy AI, wave spawns, or combat encounters.
---

# Recipe: Enemy AI and Waves

Use this for simple enemy behavior, patrol/chase/attack loops, spawn waves, survival arenas, RPG encounters, and stationary hazards.

## Read first

- `docs/CAPYBARA_ENGINE.md`
- `src/data/assets.md` for actual enemy/NPC character handles, animation names, prop assets, placement targets, and audio
- `docs/recipes/combat-projectiles.md` if enemies or the player deal projectile/ranged damage
- `docs/recipes/world-pointer-input.md` only if enemy targeting or commands use pointer input

Do not inspect `src/core/` for normal enemy logic. Use resources, systems, entities, events, and widgets.

## Animation and movement rules

Before moving an enemy/NPC, check its available animations in `src/data/assets.md`.

- If it has a walk/run/move-style animation, a simple patrol/chase system is reasonable.
- If it only has idle/default animation, keep it stationary and use facing, dialogue, ranged attacks, or proximity triggers instead.
- Generated character art faces viewer's right by default; use `game.setEntityFacingX(id, -1 | 1)` to face left/right.

The public engine provides a simple grid-backed destination/pathfinding API through `game.setEntityDestination(...)`. Use it for obstacle-aware patrol routes and authored NPC destinations. For very tight combat movement, direct `x` / `y` patching is still acceptable when enemies are placed in open spaces.

Important navigation rules:

- Destinations are **feet/ground coordinates**, not sprite top-left.
- Use `spawnAtFeet(...)` for NPCs/enemies that will navigate.
- Do not manually convert destination feet points back into `x` / `y`; let `setEntityDestination(...)` preserve sprite foot anchors.
- Clear navigation with `game.clearEntityDestination(entityId)` after `arrived`, `blocked`, or `unreachable` before assigning a new patrol point.
- Typical patrol speeds are small: `12`–`30` for slow NPCs, `40`–`80` for brisk enemies. Player speed is usually much higher (`160`–`220`).

## State shape

Use resources for encounter/wave state and entity components for per-enemy runtime fields.

```ts
export interface EncounterState {
  active: boolean;
  waveIndex: number;
  enemiesRemaining: number;
  nextSpawnAtMs: number;
  spawnBudget: number;
  encounterComplete: boolean;
}
```

Enemy components can include:

```ts
{
  kind: "enemy",
  hp: 3,
  maxHp: 3,
  speed: 110, // normalized map units per second
  radius: 44,
  width: 180,
  height: 216,
  contactDamage: 1,
  attackCooldownRemaining: 0,
  attackRange: 36,
  aggroRange: 220,
  state: "idle" | "patrol" | "chase" | "attack" | "dead",
}
```

## Archetypes

Use actual handles from `src/data/assets.md`. Import `GameAPI` and `EntitySpriteSheet` from `../Game` where needed.

```ts
function registerAnimatedEnemy(
  game: GameAPI,
  enemy: { spriteSheets: EntitySpriteSheet[]; idleAnimation: string },
) {
  game.defineArchetype("enemy", {
    kind: "enemy",
    label: "Enemy",
    spriteSheets: enemy.spriteSheets,
    activeAnimation: enemy.idleAnimation,
    speed: 110, // normalized map units per second
    hp: 3,
    maxHp: 3,
    radius: 44,
    width: 180,
    height: 216,
  });
}
```

If no generated enemy character exists, use the nearest appropriate prop/static image and keep behavior simple:

```ts
function registerStaticEnemy(game: GameAPI, enemyImageUrl: string) {
  game.defineArchetype("enemy", {
    kind: "enemy",
    label: "Enemy",
    imageUrl: enemyImageUrl,
    width: 180,
    height: 216,
    hp: 3,
    maxHp: 3,
    radius: 44,
  });
}
```

## Spawning waves

Use placement targets from `game.getPlacementTargets()` when available. If no spawn targets exist, choose safe map coordinates from the generated map description and avoid known colliders.

```ts
game.registerSystem("encounter:waves", (_dt, api) => {
  const encounter = api.getResource<EncounterState>("encounter");
  if (!encounter.active || encounter.spawnBudget <= 0) return;

  const now = performance.now();
  if (now < encounter.nextSpawnAtMs) return;

  api.spawnAtFeet("enemy", 720, 780, { hp: 3, maxHp: 3, state: "chase" });
  encounter.spawnBudget -= 1;
  encounter.enemiesRemaining += 1;
  encounter.nextSpawnAtMs = now + 1500;
});
```

Listen for defeat events to update wave progress:

```ts
game.on("enemy:defeated", () => {
  const encounter = game.getResource<EncounterState>("encounter");
  encounter.enemiesRemaining = Math.max(0, encounter.enemiesRemaining - 1);
  if (encounter.spawnBudget === 0 && encounter.enemiesRemaining === 0) {
    encounter.waveIndex += 1;
    encounter.spawnBudget = 3 + encounter.waveIndex;
  }
});
```

## Obstacle-aware patrol with destinations

Use this for authored NPC/enemy patrol loops around generated map colliders. Keep loops small and place waypoints in open walkable space. If a waypoint is blocked, skip it instead of stalling the route.

```ts
import type { EntityId, GameAPI, PathPoint } from "../Game";

interface PatrolRoute {
  entityId: EntityId;
  waypoints: PathPoint[];
  next: number;
  speed: number;
  waitSeconds: number;
  waitRemaining: number;
}

interface PatrolState {
  routes: PatrolRoute[];
}

function registerPatrolSystem(game: GameAPI): void {
  game.registerResource("patrol", { routes: [] } satisfies PatrolState);

  game.registerSystem("npc:patrol", (dt, api) => {
    const patrol = api.getResource<PatrolState>("patrol");

    for (const route of patrol.routes) {
      if (route.waitRemaining > 0) {
        route.waitRemaining = Math.max(0, route.waitRemaining - dt);
        continue;
      }

      const nav = api.getEntityNavigation(route.entityId);
      if (nav?.status === "moving") continue;

      if (
        nav?.status === "arrived" ||
        nav?.status === "blocked" ||
        nav?.status === "unreachable"
      ) {
        api.clearEntityDestination(route.entityId);
        route.next = (route.next + 1) % route.waypoints.length;
        route.waitRemaining = route.waitSeconds;
        continue;
      }

      const result = api.setEntityDestination(
        route.entityId,
        route.waypoints[route.next],
        {
          speed: route.speed,
          stopDistance: 18,
          cellSize: 24,
          snapToNearestWalkable: true,
        },
      );

      if (result.status !== "found") {
        api.clearEntityDestination(route.entityId);
        route.next = (route.next + 1) % route.waypoints.length;
        route.waitRemaining = 0.25;
      }
    }
  });
}

function addPatrolRoute(
  game: GameAPI,
  entityId: EntityId,
  waypoints: PathPoint[],
): void {
  const patrol = game.getResource<PatrolState>("patrol");
  patrol.routes.push({
    entityId,
    waypoints,
    next: 0,
    speed: 20,
    waitSeconds: 1.2,
    waitRemaining: 0,
  });
}

const guardId = game.spawnAtFeet("guardNpc", 760, 720);
addPatrolRoute(game, guardId, [
  { x: 760, y: 720 },
  { x: 840, y: 720 },
  { x: 840, y: 820 },
  { x: 760, y: 820 },
]);
```

If patrols move once and then stop, check that the system clears `arrived` navigation state before moving to the next waypoint. If patrols appear to jump or ignore speed, make sure gameplay code is not converting feet coordinates into top-left `x` / `y` manually.

## Direct chase movement

Only use this if the enemy has movement animation or if sliding/static enemies are acceptable for the game style, and the chase area is mostly open. Direct movement does not route around colliders.

```ts
game.registerSystem("enemy:chase", (dt, api) => {
  const playerId = api.getControlledEntity();
  const player = playerId ? api.get(playerId) : null;
  if (!player || typeof player.x !== "number" || typeof player.y !== "number")
    return;

  for (const enemyId of api.query(
    (c) => c.kind === "enemy" && c.state !== "dead",
  )) {
    const enemy = api.get(enemyId);
    if (!enemy || typeof enemy.x !== "number" || typeof enemy.y !== "number")
      continue;

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const distance = Math.hypot(dx, dy);
    const aggroRange = Number(enemy.aggroRange ?? 220);
    if (distance > aggroRange || distance <= 1) continue;

    api.setEntityFacingX(enemyId, dx < 0 ? -1 : 1);

    const attackRange = Number(enemy.attackRange ?? 36);
    if (distance <= attackRange) {
      api.patch(enemyId, { state: "attack" });
      continue;
    }

    // Speed is normalized map units per second; multiply by dt exactly once.
    const speed = Number(enemy.speed ?? 70);
    const x = enemy.x + (dx / distance) * speed * dt;
    const y = enemy.y + (dy / distance) * speed * dt;
    api.patch(enemyId, { x, y, renderY: y, state: "chase" });
  }
});
```

This is a simple approximation. It does not route around map obstacles. Place enemies where direct movement is acceptable or use stationary/ranged behavior.

## Contact or melee damage

```ts
game.registerSystem("enemy:melee", (dt, api) => {
  const combat = api.getResource<{ playerHp: number }>("combat");
  const playerId = api.getControlledEntity();
  const player = playerId ? api.get(playerId) : null;
  if (!player || typeof player.x !== "number" || typeof player.y !== "number")
    return;

  for (const enemyId of api.query(
    (c) => c.kind === "enemy" && c.state !== "dead",
  )) {
    const enemy = api.get(enemyId);
    if (!enemy || typeof enemy.x !== "number" || typeof enemy.y !== "number")
      continue;

    const cooldown = Math.max(
      0,
      Number(enemy.attackCooldownRemaining ?? 0) - dt,
    );
    api.patch(enemyId, { attackCooldownRemaining: cooldown });
    if (cooldown > 0) continue;

    const distance = Math.hypot(player.x - enemy.x, player.y - enemy.y);
    if (distance <= Number(enemy.attackRange ?? 36)) {
      combat.playerHp = Math.max(
        0,
        combat.playerHp - Number(enemy.contactDamage ?? 1),
      );
      api.patch(enemyId, { attackCooldownRemaining: 1.0, state: "attack" });
      api.emit("player:damaged", {
        amount: Number(enemy.contactDamage ?? 1),
        enemyId,
      });
    }
  }
});
```

## Ranged enemy attacks

Use the projectile recipe. Spawn enemy-owned projectiles with `owner: "enemy"`, aim at the player position, and have the hit system damage the player instead of enemies.

## Death and drops

When HP reaches zero:

```ts
game.on("enemy:defeated", (payload) => {
  const { enemyId } = payload as { enemyId?: EntityId };
  if (!enemyId) return;
  const enemy = game.get(enemyId);
  if (!enemy) return;

  game.spawnCentered("coinPickup", Number(enemy.x ?? 0), Number(enemy.y ?? 0));
  game.destroy(enemyId);
});
```

Import `EntityId` from `../Game` if needed in TypeScript files.

## HUD and save/load

Use widgets for wave counters, enemy health bars, boss bars, damage overlays, and game-over menus.

Save stable encounter progress only if needed: wave number, defeated boss flags, checkpoint, rewards, and player stats. Do not save active enemy entity ids unless they are stable authored IDs that can be recreated.
