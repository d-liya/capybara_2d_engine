# Scenes

Put scene setup modules here.

A scene module should be orchestration-only:

1. Preload generated assets/audio if needed. Preloading may happen on startup, but do not start browser-gated playback yet.
2. Create the game with `createGame(...)`.
3. Register resources with `game.registerResource(...)`.
4. Call archetype setup functions.
5. Call system setup functions.
6. Call input setup functions.
7. Spawn initial entities from archetypes.
8. Mount widgets with `game.useWidget(...)`.
9. Register browser-gated audio work with the loading gate continue hook passed from `src/main.ts` (for example `createMainScene({ onAudioReady: loadingGate.onContinue })`). Start looping music, `AudioContext.resume()`, intro `sdk.audio.speak(...)`, and similar autoplay-sensitive calls there or from later gameplay inputs.
10. Start any async SDK/save bootstrap without blocking scene return.
11. Return `GameAPI`.

Do not call `sdk.init()` from scenes unless custom SDK client options are explicitly required; SDK calls lazy-initialize from `window.gameId`.

Do not put heavy gameplay logic, crop transitions, save logic, NPC dialogue logic, or long-lived state directly in scenes.

Update `src/scenes/SCENES.md` when adding or changing active scene composition.
