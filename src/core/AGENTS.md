# Core Runtime Internals

Do not read or edit files in this directory by default.

Gameplay features should be implemented through:

- `src/Game.ts` / `GameAPI`
- `.agents/skills/capybara-game-developer/SKILL.md`
- `src/scenes/`
- `src/archetypes/`
- `src/systems/`
- `src/inputs/`
- `src/widgets/`
- `src/data/` (generated JSON + `index.ts` exports)

Only inspect or modify core if the public `GameAPI` cannot express the feature or there is a confirmed runtime bug.

If core work seems necessary, first explain the missing primitive or bug.

Visual style is not a core concern. Do not add bloom, blur, gradient, vignette, or post-process passes here to change how the game looks — the Painted Pixel art direction is enforced in generated art plus the HUD kit in `styles.css`. See `src/widgets/AGENTS.md`.

Render draw order lives in `renderSort.ts`: map `ground_patch` → `ground`, other masks → `occluder`, spawned entities → `prop`. Document spawn coordinates in `docs/recipes/spawning.md` and `Game.ts` JSDoc, not only in core comments.
