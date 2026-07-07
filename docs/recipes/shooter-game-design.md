---
name: shooter-game-design
description: Planning checklist for shooters, twin-stick, arena survival, and projectile-heavy games. Use when designing aim/fire/reload combat loops and action combat conventions.
---

# Recipe: Shooter / Action Game Design Conventions

Use this as a planning checklist for shooters, action RPG combat, twin-stick games, arena survival, tower-defense hybrids, and projectile-heavy games. Keep plans grounded in these conventions, then implement only what the requested game needs.

## Core combat loop

A shooter plan should make the loop explicit:

- aim / choose target
- fire or use ability
- read projectile path / hit result
- manage cooldown, ammo, reload, heat, or stamina
- reposition / dodge / use cover
- collect reward, survive wave, or advance objective

Avoid silent combat. Every shot, hit, miss, reload, damage event, and pickup should produce readable feedback.

## Aiming and targeting conventions

- Make the aim direction visible: cursor, reticle, muzzle line, facing, or weapon angle.
- Pointer/touch shooters should read world pointer coordinates, not screen coordinates, for projectile direction.
- Keyboard/controller shooters need clear facing or target-lock behavior.
- Add aim forgiveness when appropriate: larger hit radii, soft lock, cone checks, or target priority.
- Do not spawn bullets from the character center if that looks wrong; use a muzzle/hand offset when possible.

## Weapons, ammo, and reload

- Show ammo, cooldown, charge, overheat, or reload state in the HUD when it affects decisions.
- Give reload/empty feedback: sound, toast, click, animation, or disabled fire state.
- Keep weapon data centralized: damage, speed, range/lifetime, cooldown, spread, projectile art, and impact effect.
- Distinguish weapons by behavior, not only damage: spread, burst, pierce, arc, slow, knockback, charge, area effect.

## Projectile readability

- Projectiles should be visible at gameplay speed and contrast with the map.
- Use consistent ownership cues: player bullets vs enemy bullets should differ in color/shape/sound.
- Add short impact effects or hit flashes so players can tell what connected.
- Destroy projectiles on expiry, hit, or leaving bounds; avoid invisible lingering damage.
- For fast bullets, use larger collision radii or swept/segment checks if simple per-frame overlap misses hits.

## Hit and damage feedback

- On damage: flash, shake, recoil, sound, number, health change, or brief invulnerability cue.
- On blocked/armored hits: different feedback than normal damage.
- On player damage: make source/direction understandable.
- On enemy defeat: death animation/effect, drop, score, wave progress, or objective update.
- Avoid instant unavoidable damage without telegraphing.

## Enemy and encounter conventions

- Enemies need readable intent: chase, wind-up, fire, reload, flee, guard, explode, summon.
- Telegraph dangerous attacks before they happen.
- Mix enemy roles sparingly: grunt, shooter, charger, tank, sniper, support, boss.
- Spawn enemies off-screen or at marked portals with warning; avoid unfair pop-in on top of the player.
- Pace waves with rest moments, pickups, or objective beats.
- Scale difficulty with count, speed, accuracy, cooldown, health, and arena pressure — not all at once.

## Movement, cover, and arena feel

- Player movement must support dodging; avoid sluggish acceleration unless intentional.
- If cover exists, bullets and enemy pathing should respect it consistently.
- Keep collision forgiving around corners and props.
- Arena layouts need readable lanes, obstacles, safe zones, and risk/reward pickups.
- Camera and HUD should not hide incoming threats.

## UI and audio conventions

- HUD should expose only combat-relevant state: HP, ammo/reload, selected weapon, wave/objective, ability cooldowns.
- Use crosshair/target hover feedback if aiming matters.
- Audio should distinguish fire, hit, miss/impact, reload, empty, pickup, damage, and enemy telegraphs.
- Screen shake and flashes should be brief and optional-feeling; do not obscure gameplay.

## Implementation notes for this engine

- Use `docs/recipes/combat-projectiles.md` for public `GameAPI` projectile patterns.
- Use `docs/recipes/world-pointer-input.md` for pointer/touch aiming.
- Store combat state in resources; widgets display state and emit intent.
- Use entity components for projectile velocity, owner, damage, radius, and expiry.
- Use simple circle/box overlap unless the request requires true physics.

## Planning instruction for agents

When asked to plan or implement a shooter/action-combat game, include a short `Shooter conventions used` section in the plan. Mention only relevant conventions from this document, then map them to concrete resources, systems, widgets, input actions, generated assets, and feedback effects.
