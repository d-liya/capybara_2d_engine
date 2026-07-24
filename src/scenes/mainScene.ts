import { createGame, type GameAPI, type GameMapData } from "../Game";
import { toMapData } from "../data";
import { createGeneratedWorld } from "./generatedWorld";

export {
  bootstrapWorldFromAssets,
  type BootstrapCharacterEntry,
  type BootstrapMapEntry,
  type BootstrapWorldOptions,
} from "./bootstrapWorldFromAssets";

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
 * Main scene entry. Prefers auto-generated world wiring when
 * `./generatedWorld` exports maps; otherwise boots the blank SVG floor.
 *
 * Sync from capybara_game regenerates `generatedWorld.ts` — do not hand-edit it.
 */
export function createMainScene(options?: {
  onAudioReady?: (start: () => void) => void;
}): GameAPI {
  const fromAssets = createGeneratedWorld({
    onAudioReady: options?.onAudioReady,
  });
  if (fromAssets) return fromAssets;

  return createGame({
    canvasId: "game",
    map: STARTER_MAP,
    cameraEdgePadding: 120,
  });
}
