import { createGame, type GameAPI, type GameMapData } from "../Game";
import { toMapData } from "../data";
import { createGeneratedWorld } from "./generatedWorld";
import type { BootstrapGameplayOptions } from "./bootstrapWorldFromAssets";

export {
  bootstrapWorldFromAssets,
  type BootstrapArchetypeDefaults,
  type BootstrapCharacterEntry,
  type BootstrapGameplayOptions,
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
 * Hand-written gameplay layered on asset bootstrap.
 * Survives regeneration of `generatedWorld.ts` — put systems, widgets,
 * input, and entity patches here (or modules this calls).
 */
function configureGameplay(_game: GameAPI): void {
  // Register systems / widgets / patches here.
}

/**
 * Main scene entry. Prefers auto-generated world wiring when
 * `./generatedWorld` exports maps; otherwise boots the blank SVG floor.
 *
 * Sync from capybara_game regenerates `generatedWorld.ts` — do not hand-edit it.
 * Customize via `configureGameplay` above or `BootstrapGameplayOptions`.
 */
export function createMainScene(
  options?: BootstrapGameplayOptions
): GameAPI {
  // Keep onBootstrapped in mainScene so it always runs once after return,
  // even when a generated world only forwards onAudioReady.
  const { onBootstrapped, ...generatedOpts } = options ?? {};

  const fromAssets = createGeneratedWorld(generatedOpts);
  if (fromAssets) {
    configureGameplay(fromAssets);
    onBootstrapped?.(fromAssets);
    return fromAssets;
  }

  const game = createGame({
    canvasId: generatedOpts.canvasId ?? "game",
    map: STARTER_MAP,
    cameraEdgePadding: generatedOpts.cameraEdgePadding ?? 120,
    followZoom: generatedOpts.followZoom ?? 1.45,
    maxViewportScale: generatedOpts.maxViewportScale ?? 1,
    touchControls:
      generatedOpts.touchControls === false
        ? false
        : generatedOpts.touchControls,
  });

  if (generatedOpts.onAudioReady) {
    generatedOpts.onAudioReady(() => {
      /* starter map has no generated BGM */
    });
  }

  if (generatedOpts.enableDefaultInteract !== false && generatedOpts.onInteract) {
    game.bindInputAction("interact", ["KeyE"]);
    game.onInputAction("interact", ({ phase }) => {
      if (phase !== "down") return;
      generatedOpts.onInteract?.(game);
    });
  }

  configureGameplay(game);
  onBootstrapped?.(game);
  return game;
}
