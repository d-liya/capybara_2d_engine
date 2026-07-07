---
name: combat-projectiles
description: Attacks, shooters, projectiles, enemy damage, and wave-combat loops. Use when implementing action RPG combat or projectile-based gameplay.
---

# Recipe: Combat and Projectiles

Use this for action RPG attacks, shooters, bullet/projectile mechanics, simple enemy damage, and wave-combat loops.

## Read first

- `docs/CAPYBARA_ENGINE.md`
- `docs/recipes/shooter-game-design.md` for shooter/action-combat convention checklist
- `src/data/assets.md` for actual character, enemy, weapon, projectile, prop, HUD, and audio handles
- `docs/recipes/world-pointer-input.md` if attacks aim at the pointer or use click/touch targeting
- `docs/recipes/enemy-ai-waves.md` if enemies move, chase, attack, or spawn in waves
- `docs/recipes/save-load.md` only if combat progress must persist

Do not inspect `src/core/` just to add combat. Public entities, resources, systems, inputs, and widgets are enough for simple combat.

## What the public engine supports

Use public `GameAPI` primitives:

- `defineArchetype(...)` for players, enemies, projectiles, hit flashes, pickups, and impact markers.
- `spawn(...)`, `spawnCentered(...)`, or `spawnAtFeet(...)` for bullets, enemies, drops, and effects.
- `patch(...)`, `get(...)`, `query(...)`, and `destroy(...)` for movement, damage, cleanup, visibility, and short hit feedback effects.
- `registerSystem(...)` for projectile motion, collision checks, attack cooldowns, enemy damage, and cleanup.
- `bindInputAction(...)`, `onInputAction(...)`, `dispatchInputAction(...)`, and `emit(...)` for attacks/reload/swap intent.
- `registerResource(...)` for HP, ammo, cooldowns, wave state, score, selected weapon, and combat flags.

## Limitations to plan around

The public facade does **not** guarantee:

- a physics engine
- raycasts
- pixel-perfect hit tests
- collision normals, ricochet, or rigid-body impulses
- navmesh/pathfinding

For most games, use simple distance or box overlap checks. If a task explicitly requires true physics/raycasting and approximations are unacceptable, note that public primitives are insufficient before considering a core change.

## State shape

Keep long-lived combat state in resources, not scene-local variables.

```ts
export interface CombatState {
  playerHp: number;
  playerMaxHp: number;
  ammo: number;
  maxAmmo: number;
  fireCooldownSeconds: number;
  fireCooldownRemaining: number;
  selectedWeaponId: "wand" | "bow" | "blaster";
  score: number;
}

export interface ProjectileState {
  id: EntityId;
  owner: "player" | "enemy";
  damage: number;
  vx: number;
  vy: number;
  radius: number;
  expiresAtMs: number;
}
```

Import `EntityId` from the facade when using it in types:

```ts
import type { EntityId } from "../Game";
```

For many projects, projectile data can also live directly on projectile entity components (`vx`, `vy`, `damage`, `owner`, `radius`, `expiresAtMs`) and be queried each frame.

## Archetypes

Use actual asset names from `src/data/assets.md`. Import `GameAPI` from `../Game` where needed.

```ts
function registerCombatArchetypes(
  game: GameAPI,
  assets: { projectileImageUrl: string; enemyImageUrl: string },
) {
  game.defineArchetype("projectile", {
    kind: "projectile",
    imageUrl: assets.projectileImageUrl,
    width: 46,
    height: 46,
    damage: 1,
    radius: 26,
  });

  game.defineArchetype("enemy", {
    kind: "enemy",
    label: "Enemy",
    imageUrl: assets.enemyImageUrl,
    width: 180,
    height: 216,
    hp: 3,
    maxHp: 3,
    radius: 44,
    contactDamage: 1,
  });
}
```

If the asset registry has no projectile/enemy art, use the nearest available generated prop/static image or a simple labelled marker archetype. Do not invent handles that are not in `assets.md`.

## Input pattern

Bind keyboard/gamepad-style intent through actions:

```ts
game.bindInputAction("attack", ["Space"]);
game.onInputAction("attack", ({ phase }) => {
  if (phase !== "down") return;
  game.emit("combat:attack");
});
```

For pointer/touch aiming, use `docs/recipes/world-pointer-input.md` to convert pointer coordinates to world coordinates, store aim state in a resource, and emit an attack event.

Prefer `game.emit("combat:attack", payload)` for rich payloads such as target coordinates. `dispatchInputAction(...)` is best for action intent; the public TypeScript handler only guarantees `action` and `phase`.

## Spawning a projectile

```ts
game.on("combat:attack", (payload) => {
  const combat = game.getResource<CombatState>("combat");
  if (combat.fireCooldownRemaining > 0 || combat.ammo <= 0) return;

  const playerId = game.getControlledEntity();
  const player = playerId ? game.get(playerId) : null;
  if (!player || typeof player.x !== "number" || typeof player.y !== "number")
    return;

  const target = payload as { x?: number; y?: number } | undefined;
  const dx = typeof target?.x === "number" ? target.x - player.x : 1;
  const dy = typeof target?.y === "number" ? target.y - player.y : 0;
  const length = Math.max(1, Math.hypot(dx, dy));
  const speed = 420;

  game.spawnCentered("projectile", player.x, player.y, {
    owner: "player",
    vx: (dx / length) * speed,
    vy: (dy / length) * speed,
    expiresAtMs: performance.now() + 1200,
  });

  combat.ammo -= 1;
  combat.fireCooldownRemaining = combat.fireCooldownSeconds;
});
```

## Projectile system

```ts
game.registerSystem("combat:projectiles", (dt, api) => {
  const now = performance.now();
  for (const id of api.query((c) => c.kind === "projectile")) {
    const p = api.get(id);
    if (!p) continue;

    if (typeof p.expiresAtMs === "number" && now > p.expiresAtMs) {
      api.destroy(id);
      continue;
    }

    const x = Number(p.x ?? 0) + Number(p.vx ?? 0) * dt;
    const y = Number(p.y ?? 0) + Number(p.vy ?? 0) * dt;
    api.patch(id, { x, y, renderY: y });
  }
});
```

Use normalized map coordinates for `x` and `y`; tune projectile speeds against the current game feel. Projectile `vx` / `vy` values are normalized map units per second because the projectile system multiplies by `dt`.

## Simple hit checks

Use distance checks for circular-ish sprites:

```ts
function overlaps(
  a: { x: number; y: number; radius: number },
  b: { x: number; y: number; radius: number },
) {
  return Math.hypot(a.x - b.x, a.y - b.y) <= a.radius + b.radius;
}
```

Damage system example:

```ts
game.registerSystem("combat:hits", (_dt, api) => {
  const projectiles = api.query(
    (c) => c.kind === "projectile" && c.owner === "player",
  );
  const enemies = api.query((c) => c.kind === "enemy" && Number(c.hp ?? 0) > 0);

  for (const projectileId of projectiles) {
    const projectile = api.get(projectileId);
    if (!projectile) continue;

    for (const enemyId of enemies) {
      const enemy = api.get(enemyId);
      if (!enemy) continue;

      const hit = overlaps(
        {
          x: Number(projectile.x ?? 0),
          y: Number(projectile.y ?? 0),
          radius: Number(projectile.radius ?? 12),
        },
        {
          x: Number(enemy.x ?? 0),
          y: Number(enemy.y ?? 0),
          radius: Number(enemy.radius ?? 28),
        },
      );
      if (!hit) continue;

      const hp = Number(enemy.hp ?? 1) - Number(projectile.damage ?? 1);
      const now = performance.now();
      api.patch(enemyId, {
        hp,
        hitFlashUntilMs: now + 150,
        hitShakeUntilMs: now + 150,
        hitGlitchUntilMs: now + 90,
        hitFlashIntensity: 1,
        hitShakeMagnitude: 4,
      });
      api.destroy(projectileId);
      if (hp <= 0) api.emit("enemy:defeated", { enemyId });
      break;
    }
  }
});
```

For rectangular actors, store explicit `hitBox` or use `width`/`height` conventions and do an AABB overlap check in gameplay code.

## Hit feedback effects

The engine renders short visual feedback when gameplay patches these transient entity fields:

```ts
const now = performance.now();
game.patch(enemyId, {
  hitFlashUntilMs: now + 150,
  hitShakeUntilMs: now + 150,
  hitGlitchUntilMs: now + 90,
  hitFlashIntensity: 1,
  hitShakeMagnitude: 4,
});
```

Supported fields:

- `hitFlashUntilMs` — bright flash/filter until this timestamp.
- `hitShakeUntilMs` — small screen-space jitter until this timestamp.
- `hitGlitchUntilMs` — short chromatic/glitch duplicate pass until this timestamp.
- `hitFlashIntensity` — optional multiplier, default `1`.
- `hitShakeMagnitude` — optional screen-pixel jitter amount, default `3`.

These fields work on animated actor entities and static image entities. They are intentionally transient runtime feedback; do not save them in persistent save payloads.

For melee attacks, apply the same patch when range/aim checks succeed. For player damage, patch the controlled player id to show the impact.

## Cooldowns and reloads

```ts
game.registerSystem("combat:cooldowns", (dt, api) => {
  const combat = api.getResource<CombatState>("combat");
  combat.fireCooldownRemaining = Math.max(0, combat.fireCooldownRemaining - dt);
});
```

Reload or weapon swap should update the combat/inventory resources, then let widgets display the result.

## HUD

Use widgets for HP bars, ammo, crosshairs, wave counters, damage indicators, and game-over menus. Bind shells to `ui.panels` / `ui.overlays` and call `game.patchUi(...)` for flow changes — see `docs/recipes/hud-widget.md`.

- Passive combat HUDs should not block world input.
- Menus, pause screens, and game-over dialogs can block world input.
- Long-lived state stays in resources; widgets only display state and dispatch intent.

## Save/load

Save stable combat progress, not runtime entity ids:

- player stats
- unlocked weapons
- ammo if needed
- current wave/room/checkpoint
- defeated boss flags or quest flags

Do not save active projectile entity ids, transient hit flashes, DOM state, or generated asset URLs.
