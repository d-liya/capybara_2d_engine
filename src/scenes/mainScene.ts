import { createGame, type GameAPI, type GameMapData } from "../Game";
import { toMapData } from "../data";

/**
 * Minimal blank panel so `createGame` can boot before any assets are generated.
 * Replace with `toMapData(yourGeneratedMap)` after generation — see assets.md.
 */
const STARTER_MAP: GameMapData = toMapData({
  name: "starter",
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <rect width="100%" height="100%" fill="#12121a"/>
</svg>`,
    ),
  walkableBoxes: [{ bbox: [0, 0, 1000, 1000], label: "floor" }],
  sprites: [],
});

/**
 * Starter scene scaffold.
 *
 * Wire generated content here after using the Capybara asset pipeline:
 * 1. Generate a `base_map` (+ characters/props as needed)
 * 2. Register handles in `src/data/index.ts` and `src/data/assets.md`
 * 3. Swap `STARTER_MAP` for `toMapData(mapYourHandle)`
 * 4. `defineArchetype` / `spawnAtFeet` / `setControlledEntity` for the player
 * 5. Register systems, inputs, and widgets as needed
 *
 * Scene creation stays synchronous. Use `onAudioReady` for browser-gated music.
 */
export function createMainScene(_options?: {
  onAudioReady?: (start: () => void) => void;
}): GameAPI {
  const game = createGame({
    canvasId: "game",
    map: STARTER_MAP,
    cameraEdgePadding: 120,
  });

  // Example (uncomment after assets exist):
  //
  // import { mapMain, charPlayer, toMapData, toArchetype } from "../data";
  // const game = createGame({ canvasId: "game", map: toMapData(mapMain) });
  // game.defineArchetype("player", toArchetype(charPlayer, { speed: 190 }));
  // const playerId = game.spawnAtFeet("player", 500, 820);
  // game.setControlledEntity(playerId);
  //
  // let musicStarted = false;
  // const startMusic = () => { /* getAudio + play */ };
  // onAudioReady?.(startMusic);

  return game;
}
