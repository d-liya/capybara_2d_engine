---
name: rpg-game-design
description: Planning checklist for RPG, adventure, mystery, life-sim, and quest-driven games. Use when designing feedback loops, progression, and player-facing systems for non-shooter RPGs.
---

# Recipe: RPG Game Design Conventions

Use this as a planning checklist for RPG, adventure, mystery, life-sim, and quest-driven games. This is design guidance for coding agents: keep plans grounded in these conventions, then implement only the parts the requested game actually needs.

## Plan from player feedback loops

A good RPG should make the world acknowledge player actions. In plans, include feedback for:

- entering interaction range
- talking, inspecting, using, taking, buying, equipping
- blocked/locked actions
- quest/objective progress
- item/clue collection
- combat hits, misses, defeat, rewards
- entering/leaving areas

Prefer small, clear feedback over silent state changes.

## NPC conventions

NPCs should usually have more than a static sprite and a dialogue panel.

Common patterns:

- **Proximity greeting bark** when the player first comes near; use scripted text for RPG/adventure NPCs.
- **Ambient/thinking-out-loud barks** on a timer while idle or patrolling; keep most ambient chatter text-only or heavily cooldowned so the scene does not become noisy.
- **Contextual barks** that change with quest flags, danger, time, or reputation.
- **Interaction prompt** such as `Press E to Talk: Guard`.
- **Face the player** when dialogue starts.
- **Pause patrol/schedule during dialogue**, then resume afterward.
- **Arrival/reaction barks** when summoned, alerted, helped, attacked, or given an item.
- **Simple routines** when useful: idle, patrol, work, sleep, shop, return-to-post.

Do not overbuild full schedules unless the game benefits from them. A small patrol plus barks is often enough.

## Dialogue conventions

Dialogue should be readable, stateful, and interruptible.

- Give NPCs a short first line before choices or chat opens.
- Include obvious exit/close behavior, usually Escape and a visible button.
- Track one-time vs repeatable lines with stable flags.
- Mark important choices when appropriate: `[Quest]`, `[New]`, `[Trade]`, `[Goodbye]`.
- Let dialogue read quest/inventory/world state instead of duplicating state inside widgets.
- Modal dialogue should block world input and text fields must capture keyboard events.

## Quest and objective conventions

RPG progress should be visible and rememberable.

- Maintain a quest log/journal/evidence list when objectives matter.
- Show concise toasts: `Quest updated`, `Item added`, `Evidence found`.
- Use stable IDs for quests, objectives, items, doors, NPCs, and regions.
- Gate major actions with explicit reasons: `The door is locked. Find the brass key.`
- Prefer events like `quest:progress`, `item:collected`, `npc:talked` to tightly coupled systems.

## World interaction conventions

Interactive things should advertise themselves.

- Hover/focus label and tooltip for interactables.
- Nearby prompt for keyboard/controller play.
- Sensible target priority when multiple objects are close: faced/quest target first, then nearest.
- Inspect text for important props, even if they are not collectible.
- Clear transitions for doors, stairs, exits, fast travel, and room changes.
- Never let a failed interaction do nothing; give a short reason or fallback line.

## Movement, camera, and feel

RPG movement should feel grounded.

- Player movement is usually faster than ambient NPC patrols.
- NPC patrols should be slow enough to read visually; chasers can be faster.
- Avoid diagonal speed boosts, foot sliding, and anchor jumps.
- Use feet/ground coordinates for walking characters and pathfinding.
- Make interaction radii forgiving, not pixel-perfect.
- Camera follow should support gameplay visibility; account for persistent HUD chrome.

## Audio and atmosphere conventions

Audio sells RPG presence even when visuals are simple.

- Short NPC voice/text barks for greetings, idle thoughts, reactions, and arrivals.
- Gate bark speech with one-time flags and per-NPC cooldowns. Do not speak the same line every time the player crosses a radius.
- Area ambience: market crowd, wind, archive paper, kitchen fire, cave drip, forest insects.
- Footstep variations when useful; avoid one repeated loud sample.
- UI sounds for open/close/select/error/collect/objective update.
- Music can layer or switch by state: exploration, danger, combat, resolution.

Use generated audio handles from `src/data/` generated JSON; do not invent asset names. Use procedural WebAudio for non-verbal UI/gameplay SFX.

## UI conventions

Keep exploration readable and menus deliberate.

- Persistent HUD should be minimal: current objective, health/stamina if relevant, selected tool/item.
- Gameplay-related text feedback should have a visible HUD surface so players do not miss it while moving: dialogue panels, bark subtitles/speech bubbles, toasts, prompts, objective updates, and result messages.
- Reveal newly shown or changed player-facing text with a typewriter effect by default. Use readable pacing for dialogue, fast reveal for short toasts, and instant/nearly instant reveal for urgent warnings or combat feedback.
- Modal panels such as inventory, shop, map, dialogue, and pause should block movement.
- Toasts, bark subtitles, prompts, and passive trackers should not block movement.
- Escape should close the topmost modal.
- Widgets display resources and emit intent; gameplay state lives in resources/systems.

## Polish conventions

Small polish is often better than more systems.

- Floating text/toasts for important state changes, routed through HUD widgets with fast typewriter reveal when appropriate.
- Small pickup/quest update animations.
- Highlight/outline/sparkle for important interactables.
- Fade or short transition when changing rooms/scenes.
- Save/autosave feedback if persistence exists.
- Consistent verbs: Talk, Inspect, Use, Take, Trade, Equip, Leave.

## Planning instruction for agents

When asked to plan or implement an RPG-like game, include a short `RPG conventions used` section in the plan. Mention only relevant conventions from this document, then map them to concrete resources, systems, widgets, input actions, and generated assets.
