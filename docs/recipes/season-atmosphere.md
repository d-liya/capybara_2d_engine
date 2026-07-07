---
name: season-atmosphere
description: Runtime visual atmosphere changes by season via HUD overlays or tint layers. Use when adding seasonal color grading or ambient visual effects.
---

# Recipe: Seasonal Atmosphere

Use this for runtime visual atmosphere changes by season.

## Preferred approaches

Use public primitives and widgets first. Do not edit renderer/core just to tint the map.

Options:

1. HUD overlay widget: mount a full-screen `pointer-events-none` tint layer above the canvas but below HUD controls.
2. Scene prop overlay: spawn a transparent/tinted image or effect if the public API supports the needed visual.
3. Core renderer change: only if the task explicitly requires true map-layer tint and no public/widget approach is acceptable.

## Overlay widget state

Read `farm.season` from the resource and choose a CSS background:

```ts
const tintBySeason = {
  spring: "rgba(104, 180, 109, 0.10)",
  summer: "rgba(245, 178, 80, 0.12)",
  autumn: "rgba(210, 110, 45, 0.14)",
  winter: "rgba(150, 180, 210, 0.16)",
};
```

Make the overlay non-interactive:

```ts
el.className = "absolute inset-0 pointer-events-none mix-blend-soft-light";
```

Set a lower `zIndex` than modal HUDs. Use `isVisible` / `isInteractive: () => false` (not `ui` panels) so the tint follows gameplay without blocking clicks:

```ts
isVisible(api) {
  const farm = api.game.getResource<FarmState>("farm");
  return farm.gameStarted && !farm.loadingSave;
},
isInteractive: () => false,
```

Keep `ui.overlays.start` / `ui.overlays.dialogue` false while the tint is shown unless the scene intentionally stacks them.

## When to edit core

Only edit `src/core` if the user explicitly rejects an overlay or needs tint applied between map/mask/entity layers. Explain why public primitives are insufficient first.
