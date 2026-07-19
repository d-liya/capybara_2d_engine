import { createGame, type GameAPI, type GameMapData } from "../Game";
import { toMapData } from "../data";

/**
 * Minimal blank panel so `createGame` can boot without a generated map.
 * Full-walkable floor for character animation tests.
 */
const STARTER_MAP: GameMapData = toMapData({
  name: "starter",
  url:
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720">
  <defs>
    <pattern id="g" width="40" height="40" patternUnits="userSpaceOnUse">
      <rect width="40" height="40" fill="#1a1a24"/>
      <path d="M40 0H0V40" fill="none" stroke="#2a2a38" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
</svg>`,
    ),
  walkableBoxes: [{ bbox: [0, 0, 1000, 1000], label: "floor" }],
  sprites: [],
});

/**
 * Demo scene: directional character (`char.json` multi-clip pack).
 * 4-way facing is native on Actor — no extra systems.
 * WASD / arrows to move. Side uses `walk_right` flipped for left.
 */
export function createMainScene(_options?: {
  onAudioReady?: (start: () => void) => void;
}): GameAPI {
  const game = createGame({
    canvasId: "game",
    map: STARTER_MAP,
    cameraEdgePadding: 120,
  });

  return game;
}
