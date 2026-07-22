/**
 * Public Game facade TypeScript contract.
 *
 * Pair with docs/CAPYBARA_ENGINE.md for behavior and src/Game.ts for the
 * runtime entrypoint. Bundle this file with Game.ts for one-pass agent tasks.
 *
 * PathPoint is the reference example. Sibling types below follow the same
 * public-contract pattern. Update shapes here when the facade API changes.
 */

export type EntityId = string;
export type ComponentBag = Record<string, unknown>;

/** Current generated-data contract understood by this engine. */
export const GENERATED_ASSET_CONTRACT_VERSION = 1 as const;
export type GeneratedAssetContractVersion =
  typeof GENERATED_ASSET_CONTRACT_VERSION;

export type AudioAssetKind = "bgm" | "sfx" | "voice";

/** One generated audio asset. Unknown extra generator metadata is preserved. */
export interface GeneratedAudioAsset {
  id: string;
  name?: string;
  label?: string;
  url: string;
  kind?: AudioAssetKind;
  /** Legacy generator alias for `kind`; `tts`/`dialogue` normalize to `voice`. */
  role?: AudioAssetKind | "tts" | "dialogue";
  loop?: boolean;
  volume?: number;
  channel?: string;
  durationMs?: number;
  transcript?: string;
  characterId?: string;
  [key: string]: unknown;
}

export interface GeneratedDialogueEntry {
  id: string;
  text: string;
  audioId?: string;
  characterId?: string;
  speaker?: string;
  [key: string]: unknown;
}

/** Versioned catalog shape written by generated asset tooling. */
export interface GeneratedAssetCatalog {
  version: GeneratedAssetContractVersion;
  audio?: GeneratedAudioAsset[];
  dialogue?: GeneratedDialogueEntry[];
}

export interface AudioPlayOptions {
  loop?: boolean;
  volume?: number;
  channel?: string;
  /** Stop existing playback in the selected channel before starting. */
  exclusive?: boolean;
  /** Restart a reused looping clip from the beginning. Default `true`. */
  restart?: boolean;
}

export interface AudioPlaybackHandle {
  readonly name: string;
  readonly channel: string;
  readonly element: HTMLAudioElement;
  stop(): void;
}

/** Character position authored by the map editor; loading a map never spawns it. */
export interface GeneratedCharacterPlacement {
  assetId: string;
  layerId: string;
  label: string;
  box_2d: Box2D;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}

/** Spawn-ready feet anchor derived from a generated character placement. */
export interface CharacterPlacementSpawnPlan
  extends GeneratedCharacterPlacement {
  feetX: number;
  feetY: number;
}

export interface CharacterPlacementSpawnSpec {
  archetype: string;
  props?: ComponentBag;
}

export type CharacterPlacementResolver = (
  placement: CharacterPlacementSpawnPlan,
) => string | CharacterPlacementSpawnSpec | null | undefined;

export interface PathPoint {
  /** Feet/ground world X in normalized map space. */
  x: number;
  /** Feet/ground world Y in normalized map space. */
  y: number;
}

/** Public Game facade type. Same pattern as PathPoint. */
export type FindPathStatus = "found" | "blocked" | "unreachable";

/** Public Game facade type. Same pattern as PathPoint. */
export interface FindPathOptions {
  entityId?: EntityId;
  cellSize?: number;
  allowDiagonal?: boolean;
  stopDistance?: number;
  collisionWidth?: number;
  collisionHeight?: number;
  snapToNearestWalkable?: boolean;
  snapRadiusCells?: number;
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface FindPathResult {
  status: FindPathStatus;
  points: PathPoint[];
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface EntityDestinationOptions extends FindPathOptions {
  speed?: number;
  repathIntervalMs?: number;
}

/** Public Game facade type. Same pattern as PathPoint. */
export type NavigationStatus =
  | "idle"
  | "moving"
  | "arrived"
  | "blocked"
  | "unreachable";

/** Public Game facade type. Same pattern as PathPoint. */
export interface EntityNavigationState {
  destination: PathPoint;
  path: PathPoint[];
  waypointIndex: number;
  speed: number;
  stopDistance: number;
  status: NavigationStatus;
  lastPathAtMs: number;
  repathIntervalMs?: number;
  options: FindPathOptions;
}

/** Public Game facade type. Same pattern as PathPoint. */
export type TooltipContent =
  | string
  | {
      title?: string;
      body?: string;
    };

/** Public Game facade type. Same pattern as PathPoint. */
export interface HoverBounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** Public Game facade type. Same pattern as PathPoint. */
export type HoverSource =
  | "entity"
  | "map-object"
  | "map-effect"
  | "map-overlay"
  | "placement";

/** Public Game facade type. Same pattern as PathPoint. */
export interface HoverTarget {
  id: string;
  source: HoverSource;
  label: string;
  tooltip?: TooltipContent;
  type?: string;
  bounds: HoverBounds;
  renderY: number;
  x: number;
  y: number;
  clientX?: number;
  clientY?: number;
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface MapPlacementTarget {
  id: string;
  elementName: string;
  placementType?: string;
  contents?: string;
  reasoning?: string;
  gridDimensions?: number[];
  box_2d: number[];
  bounds: HoverBounds;
  renderY: number;
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface MapOverlayTarget {
  id: string;
  anchorLabel?: string;
  gamePlay?: string;
  currentState: string;
  states: string[];
  box_2d: number[];
  bounds: HoverBounds;
  renderY: number;
  blocksMovement: boolean;
  renderLayer: "background" | "ground" | "occluder" | "prop";
  gridDimensions?: [number, number];
  cellBboxes?: number[][];
}

/** Public Game facade type. Same pattern as PathPoint. */
export type PropPlacementInput =
  | number[]
  | { box_2d: number[] }
  | { x: number; y: number; width?: number; height?: number }
  | { centerX: number; centerY: number; width?: number; height?: number };

/** Public Game facade type. Same pattern as PathPoint. */
export interface EntityAnimationOptions {
  transitionMs?: number;
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface EntitySpriteTransitionOptions extends EntityAnimationOptions {
  activeAnimation?: string;
}

/**
 * Sprite sheet descriptor for animated actor-style entities.
 *
 * Runtime conventions:
 * - `name` is used to pick idle/move animations (`default_animation`, `walk`, `run`).
 * - `frame_count` is the number of horizontal frames in the sheet.
 * - `width`/`height` are source-art pixel size (used for size inference).
 */
export interface EntitySpriteSheet {
  name: string;
  url: string;
  frame_count?: number | string;
  width?: number;
  height?: number;
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface PlayerSpawnConfig {
  x: number;
  y: number;
  anchor?: "top-left" | "feet" | "center";
  width?: number;
  height?: number;
  sprite: {
    spriteSheets?: EntitySpriteSheet[];
  };
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface LoadMapOptions {
  spawn?: {
    x: number;
    y: number;
    anchor?: "top-left" | "feet" | "center";
  };
}

/** Public Game facade type. Same pattern as PathPoint. */
export type InputActionPhase = "down" | "up";

/**
 * Context passed to HUD widget lifecycle hooks (`mount`, `update`, etc.).
 * `api.game` is the public `GameAPI`; other fields are widget-local DOM/runtime helpers.
 */
export interface WidgetAPI<TGame = GameAPI> {
  canvas: HTMLCanvasElement;
  hudRoot: HTMLElement;
  game: TGame;
  state: Record<string, unknown>;
  now: number;
  setState(patch: Record<string, unknown>): void;
}

/** Public Game facade type. Same pattern as PathPoint. */
export type WidgetPluginFactory = (options?: Record<string, unknown>) => {
  id?: string;
  zIndex?: number;
  ui?: { type: "panel"; id: string } | { type: "overlay"; id: string };
  mount?: (api: WidgetAPI<GameAPI>) => HTMLElement | void;
  update?: (api: WidgetAPI<GameAPI>) => void;
  onKeyDown?: (event: KeyboardEvent, api: WidgetAPI<GameAPI>) => boolean | void;
  onKeyUp?: (event: KeyboardEvent, api: WidgetAPI<GameAPI>) => boolean | void;
  isVisible?: (api: WidgetAPI<GameAPI>) => boolean;
  isInteractive?: (api: WidgetAPI<GameAPI>) => boolean;
  /** @deprecated Prefer `isInteractive`. */
  isPointerActive?: (api: WidgetAPI<GameAPI>) => boolean;
  blocksWorldInput?: (api: WidgetAPI<GameAPI>) => boolean;
  destroy?: (api: WidgetAPI<GameAPI>) => void;
} | null;

/** Public Game facade type. Same pattern as PathPoint. */
export type UiStatePatch<
  TPanels extends Record<string, boolean> = Record<string, boolean>,
  TOverlays extends Record<string, boolean> = Record<string, boolean>,
> = {
  panels?: Partial<TPanels>;
  overlays?: Partial<TOverlays>;
};

/** Public Game facade type. Same pattern as PathPoint. */
export type Box2D = [number, number, number, number] | number[];

/** Public Game facade type. Same pattern as PathPoint. */
export type CardinalDirection = "north" | "south" | "east" | "west";

/** Normalized polygon vertex for map collision (0–1000 space). */
export interface GameMapCollisionPoint {
  x: number;
  y: number;
}

/** Pixel crop of a cut-out on the map background image. */
export interface GameMapPixelBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface GameMapMaskEntry {
  label: string;
  name?: string;
  /**
   * Normalized visual footprint `[y1,x1,y2,x2]`. Optional when `pixel_bbox` is
   * set — then bounds are resolved from the loaded map image size.
   */
  box_2d?: Box2D;
  /**
   * Pixel placement on the map background. Converted using the background
   * image's natural width/height when it loads (no per-sprite map_size needed).
   */
  pixel_bbox?: GameMapPixelBBox;
  backgroundImageBox2d?: Box2D;
  collider: Array<{ box_2d: Box2D; label: string }>;
  /**
   * Optional solid polygons in normalized map space. When present, movement
   * collision uses these instead of (or in addition to) AABB colliders.
   */
  collisionPolygons?: GameMapCollisionPoint[][];
  backgroundImage?: string;
  obstacleImage?: string;
  spriteSheetUrl?: string;
  frame_count?: number;
  spriteSheetType?: string;
  type?: string;
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface GameMapPanelContent {
  url: string;
  masks?: GameMapMaskEntry[];
  spriteSheets?: Array<{
    label: string;
    mask_prompt: string;
    type: string;
    spriteSheetUrl: string;
    frame_count: number;
    box_2d: number[];
    placementMode?: string; // "replace" | "overlay"
    linkedColliderLabel?: string;
  }>;
  walkableBoxes?: Array<{ box_2d: Box2D; label?: string }>;
  placement?: Array<{
    id: string;
    element_name?: string;
    placement_type?: string;
    contents?: string;
    reasoning?: string;
    grid_dimensions?: number[];
    bounding_box?: number[];
    box_2d: Box2D;
  }>;
  mapOverlays?: Array<{
    id: string;
    anchorLabel?: string;
    gamePlay?: string;
    /** Unified kind from edit-UI compiler. Omit for legacy state overlays. */
    kind?: "erase" | "state" | "vfx" | "grid";
    layout?: "single" | "multi_inplace" | "detached_stages";
    linkedObstacleLabel?: string;
    currentMapStateLabel?: string;
    currentState?: string;
    states: Array<{
      name: string;
      label?: string;
      description?: string;
      url: string;
      box_2d: number[];
      frameCount?: number;
      frame_count?: number;
      mode?: "background" | "gameplay";
      clearsCollision?: boolean;
      collider?: Array<{ box_2d: number[]; label?: string }>;
      colliders?: Array<{ box_2d: number[]; label?: string }>;
      blocksMovement?: boolean;
      renderLayer?: "background" | "ground" | "occluder" | "prop";
    }>;
    gridDimensions?: [number, number];
    cellBboxes?: number[][];
    renderLayer?: "background" | "ground" | "occluder" | "prop";
    blocksMovement?: boolean;
  }>;
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface GameMapExtension {
  direction: CardinalDirection;
  panel: GameMapPanelData;
}

/** Public Game facade type. Same pattern as PathPoint. */
export interface GameMapPanelData {
  panel: GameMapPanelContent;
  extensions?: GameMapExtension[];
}

/**
 * Map data consumed by `createGame(...)` and `game.loadMap(...)`.
 *
 * Generated map JSON is flat — wrap it with `toMapData(generatedMap)` from
 * `src/data` instead of hand-building `panel`.
 */
export interface GameMapData extends GameMapPanelData {
  name?: string;
  generatedAssetContractVersion?: GeneratedAssetContractVersion;
  /** Authored placements are data only; game code explicitly decides what to spawn. */
  characterPlacements?: GeneratedCharacterPlacement[];
  panel: GameMapPanelContent & {
    masks: GameMapMaskEntry[];
  };
  panelPixelWidth?: number;
  panelPixelHeight?: number;
}

/**
 * Documented render-related keys you can place in archetypes/spawn props.
 *
 * Use either animated `spriteSheets` OR static `sprite`/`imageUrl`.
 */
export interface EntityRenderComponents {
  /**
   * Top-left world position in normalized map space (0–1000 per panel).
   * Not the visual center — use `spawnCentered` / `placeProp` to convert from center/box.
   */
  x?: number;
  /** Top-left world position (see `x`). */
  y?: number;
  /**
   * Y-sort anchor (feet/bottom of sprite). Defaults to `y + height` for static images.
   * Characters still depth-sort with map obstacles; ground_patch beds sort behind props.
   */
  renderY?: number;
  /** Normalized draw width. If only one dimension is set for static images, aspect ratio is preserved. */
  width?: number;
  /** Normalized draw height. */
  height?: number;
  /**
   * Animated actor render path.
   * If present, entity is rendered as an animated actor with movement-ready setup.
   */
  spriteSheets?: EntitySpriteSheet[];
  /** Static image URL render path. */
  sprite?: string;
  /** Alias for static image URL render path. */
  imageUrl?: string;
  /** Movement speed in normalized map units per second. */
  speed?: number;
  /** Optional named animation to show immediately or after a transition. */
  activeAnimation?: string;
  /** Reserved animation switch timing metadata for game code. Runtime switches without opacity blending. */
  animationTransitionMs?: number;
  /** Horizontal facing for actor-style sprites. Generated characters face right by default: 1 = right, -1 = left. */
  facingX?: 1 | -1 | number;
  /** Short label shown by hover/debug UI. */
  label?: string;
  /** Richer hover tooltip content. */
  tooltip?: TooltipContent;
  /** Optional explicit hover bounds in [y_min, x_min, y_max, x_max] normalized coordinates. */
  hoverBounds?: [number, number, number, number] | number[];
  /**
   * Feet ellipse shadow for animated `spriteSheets` actors.
   * Omitted fields use {@link DEFAULT_ENTITY_SHADOW}.
   */
  shadow?: EntityShadowConfig;
}

/** Default feet shadow used by animated characters when `shadow` is omitted. */
export const DEFAULT_ENTITY_SHADOW = {
  enabled: true,
  opacity: 0.3,
  scaleX: 1,
  scaleY: 0.18,
  offsetX: 0,
  offsetY: 0,
  useEntityWidth: false,
} as const satisfies Required<EntityShadowConfig>;

/** Per-entity feet shadow tuning for animated characters. */
export interface EntityShadowConfig {
  /** Draw the feet ellipse shadow. Default `true`. */
  enabled?: boolean;
  /** Center opacity of the radial gradient. Default `0.3`. */
  opacity?: number;
  /** Horizontal radius multiplier. Default `1`. */
  scaleX?: number;
  /** Vertical radius as a fraction of the horizontal radius. Default `0.18`. */
  scaleY?: number;
  /**
   * Horizontal offset in normalized map units. Positive shifts right when facing
   * right; mirrors automatically when the actor faces left.
   */
  offsetX?: number;
  /** Vertical offset in normalized map units. Positive moves the shadow down. Default `0`. */
  offsetY?: number;
  /**
   * Span the shadow across the full entity width instead of trimmed sprite pixels.
   * Useful for wide tool-holding variants.
   */
  useEntityWidth?: boolean;
}

/** Directional movement flags shared by keyboard WASD and touch D-pad. */
export interface MovementInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

/** Partial patch for `setMovementInput` — omitted keys are left unchanged. */
export type MovementInputPatch = Partial<MovementInput>;

export interface TouchControlAction {
  /** Same action name used with `bindInputAction` / `onInputAction`. */
  action: string;
  /** Short label shown on the on-screen button. */
  label: string;
}

export interface TouchControlsConfig {
  /**
   * Right-side action buttons. Prefer the same names you bind for keyboard
   * (e.g. `interact`, `attack`) so one `onInputAction` handler serves both.
   */
  actions?: TouchControlAction[];
}

export interface GameConfig {
  canvasId: string;
  /**
   * Extra screen-space padding in pixels around the world edges.
   *
   * When set, the camera is allowed to travel beyond the real map bounds by
   * this amount on each side, revealing the black backdrop instead of hard
   * stopping at the edge, this helps when we have hud elements at the edges.
   */
  cameraEdgePadding?: number;
  /**
   * Upper bound for CSS canvas scaling. Default `1` avoids magnifying
   * generated ~1k–2.5k map art on large screens. Pass a higher value to allow
   * upscaling, or `Infinity` to uncapped contain/cover fit.
   */
  maxViewportScale?: number;
  /**
   * Extra camera zoom on touch-primary devices so the player is not dwarfed by
   * a full panel. Desktop stays at zoom `1`. Default `1.45`.
   */
  followZoom?: number;
  /**
   * Default touch D-pad + action buttons. Mounted automatically on
   * touch-primary devices. Pass `false` to disable, or `{ actions: [...] }` to
   * configure right-side buttons that call `dispatchInputAction`.
   */
  touchControls?: false | TouchControlsConfig;
  /**
   * Map data consumed by the facade.
   *
   * Pass `GameMapData` (the nested `{ panel }` shape below); the facade builds
   * the runtime map instance. Generated map JSON is flat — wrap it with
   * `toMapData(generatedMap)` from `src/data` instead of hand-building `panel`.
   *
   * @example
   * map: {
   *   panel: {
   *     url: "/maps/study/base.png",
   *     masks: [],
   *     walkableBoxes: [{ box_2d: [120, 620, 880, 940] }],
   *     spriteSheets: [
   *       {
   *         label: "door_01",
   *         mask_prompt: "door",
   *         type: "gameplay",
   *         box_2d: [520, 640, 610, 780],
   *         frame_count: 8,
   *         spriteSheetUrl: "/fx/door_open.png",
   *       },
   *     ],
   *   },
   * // Optional map panel extensions for multi-panel maps.
   *   extensions: [
   *     { direction: "east", panel: mapStudyEast },
   *     { direction: "west", panel: mapStudyWest },
   *   ],
   * }
   */
  map: GameMapData;
  /**
   * Optional bootstrap player. For full entity-only scenes,
   * omit this and spawn a player archetype in scene code.
   */
  player?: PlayerSpawnConfig;
}

/**
 * Public game primitives for gameplay code and coding agents.
 *
 * Use archetypes for shared defaults and spawn/patch for per-entity data.
 *
 * @example
 * Basic scene bootstrap with one controlled entity
 * const game = createGame({ canvasId: "game", map: { panel: mapJson } });
 * @example
 * Static prop archetype (single image)
 * game.defineArchetype("crate", {
 *   sprite: "/sprites/props/crate.png",
 *   width: 105,
 *   height: 90,
 * });
 * game.spawnCentered("crate", 560, 700);
 */
export interface GameAPI {
  /** Register/replace generated audio and dialogue entries. */
  registerAudioCatalog(catalog: GeneratedAssetCatalog): void;

  /** Play a generated/common audio name. Playback blocked by autoplay policy is queued. */
  playAudio(
    name: string,
    options?: AudioPlayOptions,
  ): AudioPlaybackHandle | null;

  /** Stop every active instance for a name. */
  stopAudio(name: string): void;

  /** Stop all active audio in a logical mixer channel. */
  stopAudioChannel(channel: string): void;

  /** Retry gesture-blocked playback. Safe to call from pointer/key handlers. */
  unlockAudio(): Promise<void>;

  /** Return dialogue metadata from the currently registered generated catalog. */
  getDialogue(id: string): GeneratedDialogueEntry | undefined;

  /**
   * Replace the current map with a separate non-stitched map.
   *
   * Use this for interior/exterior transitions, dungeon rooms, overworld swaps,
   * or any transition that should not be modeled as a stitched extension panel.
   * Existing resources, widgets, archetypes, and entities are preserved. Destroy
   * and respawn map-local entities in gameplay code if needed.
   *
   * The optional spawn moves the controlled entity after the map swap:
   * - `top-left` uses x/y directly.
   * - `center` treats x/y as the entity center.
   * - `feet` treats x/y as the character feet/bottom anchor.
   */
  loadMap(map: GameMapData, options?: LoadMapOptions): void;

  /**
   * Register reusable default components for a named entity type.
   *
   * Rendering-related keys accepted in `defaults`:
   * - Animated actor: `spriteSheets`
   * - Static image: `sprite` or `imageUrl`
   * - Common placement/sizing: `x`, `y`, `width`, `height`, `renderY`
   *
   * @example
   * game.defineArchetype("npc", {
   *   spriteSheets: [{
   *     name: "default_animation",
   *     url: "/sprites/npc_vendor.png",
   *     frame_count: 6,
   *     width: 252,
   *     height: 336,
   *   }],
   *   speed: 90,
   * });
   *
   * @example
   * game.defineArchetype("sign", {
   *   imageUrl: "/sprites/signpost.png",
   *   width: 105,
   *   height: 90,
   * });
   */
  defineArchetype(name: string, defaults: ComponentBag): void;

  /**
   * Apply a registered archetype's visual/stats to an existing entity.
   *
   * Use for player outfit swaps, tool-holding variants, or seasonal costumes.
   * Position, facing, and gameplay fields you pass in `props` are preserved unless
   * explicitly overridden. Swaps `spriteSheets` when present and keeps the current
   * motion state (walk vs idle).
   *
   * @example
   * game.defineArchetype("player_with_plow", toArchetype(charFarmerHoldingPlow, { speed: 190 }));
   * game.applyEntityArchetype(playerId, "player_with_plow", { heldTool: "plow" });
   */
  applyEntityArchetype(
    id: EntityId,
    archetypeName: string,
    props?: ComponentBag,
  ): void;

  /**
   * Create one entity from an archetype, with optional overrides.
   *
   * **Position contract:** `x` and `y` are the entity's **top-left** corner in normalized
   * map space (0–1000 per panel). They are what the renderer and `game.patch({ x, y })` use.
   * Do not pass cell centers unless you convert them to top-left yourself.
   *
   * @example
   * const npcId = game.spawn("npc", { x: 420, y: 650, name: "Merchant" });
   */
  spawn(archetype: string, props?: ComponentBag): EntityId;

  /**
   * Spawn using **feet** position: `feetX` = feet center, `feetY` = bottom edge (sort anchor).
   *
   * Use for characters and anything that should stand on the ground. The runtime converts
   * feet anchor → top-left using inferred entity width/height.
   *
   * @example
   * const guardId = game.spawnAtFeet("npc", 300, 780);
   */
  spawnAtFeet(
    archetype: string,
    feetX: number,
    feetY: number,
    props?: ComponentBag,
  ): EntityId;

  /**
   * Spawn using **center** position: places the entity so `(centerX, centerY)` is the middle
   * of its width/height box.
   *
   * Use for static image props (crop tiles, pickups, markers). After spawn, entity `x`/`y`
   * in `game.get(id)` are **top-left** — store those if you animate position with `patch`.
   * Never `patch({ x: centerX, y: centerY })` unless you intend top-left at the center point.
   *
   * @example
   * const markerId = game.spawnCentered("pickup", 500, 500, { width: 46, height: 46 });
   */
  spawnCentered(
    archetype: string,
    centerX: number,
    centerY: number,
    props?: ComponentBag,
  ): EntityId;

  /**
   * Place a prop from a map placement target or `box_2d` rectangle.
   *
   * **Boxes:** sets `x`/`y` to the box top-left and `width`/`height` to the box size.
   * **Points:** centers the prop on the point (same math as `spawnCentered`).
   *
   * Spawned props draw in the **prop** render layer (above map `ground_patch` masks, Y-sorted
   * with buildings and characters). Set `renderY` (usually `bounds.y2`) for per-tile depth.
   *
   * @example
   * const plot = game.getPlacementTargets().find((p) => p.contents === "<prop_group>");
   * if (plot) game.placeProp("cropTile", plot.box_2d, { tooltip: "Plant seeds here" });
   */
  placeProp(
    archetype: string,
    placement: PropPlacementInput,
    props?: ComponentBag,
  ): EntityId;

  /**
   * Convert normalized world coordinates (0-1000 per panel) to canvas CSS pixel coordinates.
   *
   * This is useful when you need to align DOM/UI elements or debug world positions
   * without inspecting internal camera math.
   */
  normalizedToCanvasPoint(
    normalizedX: number,
    normalizedY: number,
  ): { x: number; y: number };

  /**
   * Convert browser pointer coordinates to normalized world coordinates.
   *
   * @example
   * const point = game.canvasClientToNormalizedPoint(event.clientX, event.clientY);
   */
  canvasClientToNormalizedPoint(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null;

  /**
   * Return the top-most labelled thing under a browser pointer coordinate.
   */
  getHoverTargetAt(clientX: number, clientY: number): HoverTarget | null;

  /** Return the current pointer hover target tracked by the runtime. */
  getCurrentHoverTarget(): HoverTarget | null;

  /**
   * Return map-authored placement regions such as crop beds or interact points.
   */
  getPlacementTargets(): MapPlacementTarget[];

  /**
   * Return character placements authored on the map (data only — not spawned).
   */
  getCharacterPlacements(): GeneratedCharacterPlacement[];

  /**
   * Return stateful map overlays such as doors, safes, gates, or baked props.
   */
  getMapOverlays(): MapOverlayTarget[];

  /**
   * Read the current state name for one map overlay.
   */
  getMapOverlayState(id: string): string | null;

  /**
   * Swap a map overlay to another authored state.
   *
   * If the new state has `blocksMovement: true`, its authored `collider` boxes
   * block movement/pathfinding. If false or omitted, it is visual-only unless
   * the overlay-level default says otherwise. Pathfinding cache is cleared on
   * successful state changes.
   *
   * @example
   * game.setMapOverlayState("north_door", "open");
   */
  setMapOverlayState(id: string, state: string): boolean;

  /**
   * Shallow-merge updates into an existing entity.
   *
   * @example
   * game.patch(playerId, { speed: 260, activeAnimation: "hero_run" });
   *
   * @example
   * game.patch(playerId, { shadow: { scaleX: 1.2, opacity: 0.25 } });
   */
  patch(id: EntityId, changes: ComponentBag): void;

  /**
   * Switch an animated entity to a named spritesheet animation.
   *
   * @example
   * game.setEntityAnimation(playerId, "char_farmer_walk");
   */
  setEntityAnimation(
    id: EntityId,
    animationName: string,
    options?: EntityAnimationOptions,
  ): void;

  /**
   * Replace an entity's spritesheet set without opacity blending.
   *
   * @example
   * game.setEntitySpriteSheets(playerId, winterOutfit.spriteSheets, { activeAnimation: "default_animation" });
   */
  setEntitySpriteSheets(
    id: EntityId,
    spriteSheets: EntitySpriteSheet[],
    options?: EntitySpriteTransitionOptions,
  ): void;

  /**
   * Set actor horizontal facing without moving the entity.
   * Generated characters face viewer's right by default: use 1 for right and -1 for left.
   */
  setEntityFacingX(id: EntityId, facingX: 1 | -1 | number): void;

  /**
   * Get a copy of one entity's component bag, or null if missing.
   *
   * @example
   * const player = game.get(playerId);
   * if (player) console.log(player.x, player.y);
   */
  get(id: EntityId): ComponentBag | null;

  /**
   * Get the entity feet anchor used by actor movement/proximity.
   * Falls back to component x/y/width/height when no actor exists.
   */
  getEntityFeet(id: EntityId): { x: number; y: number } | null;

  /**
   * Remove an entity from the world.
   *
   * @example
   * game.destroy(enemyId);
   */
  destroy(id: EntityId): void;

  /**
   * Return all entity ids matching the filter function.
   *
   * @example
   * const enemies = game.query((c) => c.team === "enemy" && c.hp > 0);
   */
  query(filter: (c: ComponentBag) => boolean): EntityId[];

  /**
   * Register or replace a named per-frame system.
   *
   * @example
   * game.registerSystem("regen", (dt, api) => {
   *   const ids = api.query((c) => typeof c.hp === "number" && typeof c.maxHp === "number");
   *   for (const id of ids) {
   *     const c = api.get(id);
   *     if (!c) continue;
   *     const hp = Math.min(Number(c.maxHp), Number(c.hp) + dt * 0.5);
   *     api.patch(id, { hp });
   *   }
   * });
   */
  registerSystem(
    name: string,
    system: (dt: number, api: GameAPI) => void,
  ): void;

  /**
   * Subscribe to a named event. Returns an unsubscribe function.
   *
   * @example
   * const off = game.on("quest:completed", (payload) => {
   *   console.log("Quest done", payload);
   * });
   * // later: off();
   */
  on(event: string, handler: (payload: unknown) => void): () => void;

  /**
   * Emit an event to all listeners.
   *
   * @example
   * game.emit("quest:completed", { id: "q_intro" });
   */
  emit(event: string, payload?: unknown): void;

  /**
   * Store shared runtime data (scene state, timers, etc).
   *
   * @example
   * game.registerResource("wave", { current: 1, timer: 0 });
   */
  registerResource(name: string, value: unknown): void;

  /**
   * Read shared runtime data by key.
   *
   * @example
   * const wave = game.getResource<{ current: number; timer: number }>("wave");
   */
  getResource<T = unknown>(name: string): T;

  /**
   * Register a HUD widget plugin from app code.
   *
   * @example
   * game.useWidget(createTooltipWidget);
   */
  useWidget(
    pluginFactory: WidgetPluginFactory,
    options?: Record<string, unknown>,
  ): void;

  /**
   * Merge visibility flags on the typed `ui` resource (`panels` / `overlays`).
   *
   * @example
   * game.patchUi({ panels: { seasonBar: true }, overlays: { title: false } });
   */
  patchUi(patch: UiStatePatch): void;

  /**
   * Bind a gameplay action to one or more keyboard event codes (e.g. KeyE).
   *
   * @example
   * game.bindInputAction("interact", ["KeyE", "Space"]);
   */
  bindInputAction(action: string, keyCodes: string[]): void;

  /**
   * Subscribe to one named action (keyboard, mobile, or custom dispatch).
   *
   * @example
   * game.onInputAction("interact", ({ phase }) => {
   *   if (phase !== "down") return;
   *   game.emit("player:interact");
   * });
   */
  onInputAction(
    action: string,
    handler: (payload: { action: string; phase: InputActionPhase }) => void,
  ): () => void;

  /**
   * Dispatch an action manually (useful for mobile widgets/buttons).
   *
   * @example
   * game.dispatchInputAction("interact", { phase: "down" });
   */
  dispatchInputAction(action: string, payload?: Record<string, unknown>): void;

  /**
   * Patch directional movement for the controlled entity (same path as WASD).
   * Used by the touch D-pad. Activating any direction clears navigation on the
   * controlled entity so pathfinding does not fight manual control.
   *
   * @example
   * game.setMovementInput({ up: true });
   * game.setMovementInput({ up: false, left: true });
   */
  setMovementInput(patch: MovementInputPatch): void;

  /**
   * Clear all directional movement flags (pointerup / blur / leave).
   */
  clearMovementInput(): void;

  /**
   * Trigger map gameplay spritesheet effects by label/mask tag.
   *
   * Triggers all effects with this tag.
   *
   * @example
   * game.triggerMapEffect("campfire");
   */
  triggerMapEffect(tag: string): boolean;

  /**
   * Trigger the nearest matching map gameplay effect to a world position.
   *
   * Prefer this for interaction prompts near the player.
   *
   * @example
   * game.triggerNearestMapEffect("door", 540, 820);
   */
  triggerNearestMapEffect(tag: string, atX: number, atY: number): boolean;

  /**
   * Find an obstacle-aware feet-position path in normalized world coordinates.
   * Uses the map's authored colliders and walkable boxes.
   */
  findPath(
    from: PathPoint,
    to: PathPoint,
    options?: FindPathOptions,
  ): FindPathResult;

  /**
   * Return true when a feet/ground point overlaps map colliders or leaves walkable space.
   * Uses the same foot-collider dimensions as pathfinding and player movement.
   */
  isFeetPositionBlocked(
    feetX: number,
    feetY: number,
    options?: FindPathOptions,
  ): boolean;

  /**
   * Snap a blocked feet/ground point to the nearest walkable location.
   * Returns the original point when already walkable, or null when no nearby cell is free.
   */
  resolveNearestWalkableFeet(
    feetX: number,
    feetY: number,
    options?: FindPathOptions,
  ): PathPoint | null;

  /**
   * Give an entity a destination. The runtime follows the path, updates facing,
   * and emits navigation:started/navigation:arrived/navigation:failed events.
   *
   * While moving, the runtime switches to a walk/run spritesheet (first sheet
   * whose `name` contains `walk` or `run`). When the entity arrives, hits a
   * blocker, or you call `clearEntityDestination`, it switches back to idle
   * (first sheet whose `name` contains `default_animation` or `idle`). Ensure
   * the entity archetype includes those sheets — check exact names in the
   * character JSON under `src/data/`. You do not need to call
   * `setEntityAnimation` yourself for basic destination movement.
   */
  setEntityDestination(
    id: EntityId,
    destination: PathPoint,
    options?: EntityDestinationOptions,
  ): FindPathResult;

  /** Stop runtime navigation for an entity. */
  clearEntityDestination(id: EntityId): void;

  /** Read a copy of an entity's runtime navigation state. */
  getEntityNavigation(id: EntityId): EntityNavigationState | null;

  /**
   * Set or clear which entity receives movement input and camera follow.
   *
   * @example
   * game.setControlledEntity(playerId);
   * // Tower defense style: game.setControlledEntity(null);
   */
  setControlledEntity(id: EntityId | null): void;

  /**
   * Read the current controlled entity id (or null).
   *
   * @example
   * const controlled = game.getControlledEntity();
   */
  getControlledEntity(): EntityId | null;
}
