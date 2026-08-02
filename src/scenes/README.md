# Scenes

Prefer the synced path:

`main.ts` → `createMainScene(opts)` → `createGeneratedWorld(opts)` → `bootstrapWorldFromAssets(...)` → `configureGameplay(game)`.

- **Do not hand-edit** `generatedWorld.ts` (rewritten by asset sync).
- Put custom systems, widgets, inputs, and patches in `configureGameplay` inside `mainScene.ts` (or modules it calls).
- Pass camera / touch / interact / audio opts through `createMainScene` / `BootstrapGameplayOptions`.
- When sync has no maps, `createGeneratedWorld` returns `null` and `mainScene` boots a blank SVG starter with a placeholder player.

## What bootstrap already owns

Do not re-implement these in `configureGameplay`:

- Start map selection and `createGame` / `toMapData`
- Character archetypes + `characterPlacements` spawn (player vs NPC)
- Map-scoped BGM / ambience / autoplay SFX + dual-path audio unlock
- Atmosphere from `atmospherePlacements`
- Default `interact` (enterables / synthetic return exits / state overlays / gameplay VFX)

Bootstrap does **not** auto-spawn props from `placement[]` or mount `hudPlacements` — those belong in gameplay.

## If you orchestrate a scene by hand

Only for tools / tests / no synced maps. Keep the scene orchestration-only:

1. Preload generated assets/audio if needed (do not start browser-gated playback yet).
2. Call `createGame(...)` or rely on bootstrap.
3. Register resources.
4. Register archetypes / systems / inputs.
5. Spawn entities bootstrap does not own.
6. Mount widgets.
7. Register browser-gated audio via `onAudioReady` (and a one-shot gesture unlock if you start BGM yourself).
8. Start async SDK/save bootstrap without blocking return.
9. Return `GameAPI`.

Do not call `sdk.init()` from scenes unless custom SDK client options are required.

Update `src/scenes/SCENES.md` when adding or changing active scene composition.
