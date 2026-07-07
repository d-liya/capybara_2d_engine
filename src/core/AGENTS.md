# Core Runtime Internals

Do not read or edit files in this directory by default.

Gameplay features should be implemented through:

- `src/Game.ts` / `GameAPI`
- `.pi/skills/capybara-primitives/SKILL.md`
- `src/scenes/`
- `src/archetypes/`
- `src/systems/`
- `src/inputs/`
- `src/widgets/`
- `src/data/assets.md`

Only inspect or modify core if the public `GameAPI` cannot express the feature or there is a confirmed runtime bug.

If core work seems necessary, first explain the missing primitive or bug.

Render draw order lives in `renderSort.ts`: map `ground_patch` → `ground`, other masks → `occluder`, spawned entities → `prop`. Document spawn coordinates in `docs/recipes/spawning.md` and `Game.ts` JSDoc, not only in core comments.
