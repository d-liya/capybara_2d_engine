import type { ComponentBag, EntitySpriteSheet, GameMapData } from "../Game";
import { GENERATED_ASSET_CONTRACT_VERSION } from "../Game.types";
import { NORM } from "../utils/common";

/**
 * Adapters that turn generator-shaped JSON handles (from `src/data`) into the
 * shapes the engine facade consumes.
 *
 * Why these exist:
 * - Generated map JSON is **flat** (`{ name, url, masks, spriteSheets, ... }`
 *   or the v2 shape `{ url, walkableBoxes, sprites }`), but `createGame({ map })`
 *   expects the nested `{ panel: { ... } }` shape.
 * - Map v2 `sprites[]` (cut-outs + collision polygons) live in
 *   `map_*.sprites.json`; placement / character / HUD placements live in
 *   `map_*.placements.json`. Merge with `mergeMapSidecars` before `toMapData`.
 * - Generated character JSON exposes `spriteSheets`, but archetypes/player
 *   config want those sheets nested under a component/sprite key.
 *
 * These helpers key off data **shape**, not off generated names, so they stay
 * stable across regenerations and across games.
 */

/** One generated spritesheet entry (character or prop animation). */
export interface GeneratedSpriteSheet {
  name: string;
  url: string;
  frame_count?: number;
  width?: number;
  height?: number;
}

/**
 * Legacy flat character: already has engine-ready `spriteSheets`.
 * e.g. older `char_*.json` exports.
 */
export interface GeneratedCharacter {
  label?: string;
  spriteSheets: GeneratedSpriteSheet[];
}

/**
 * Cardinal facing for directional character packs.
 * - `front` — toward camera (+Y / down the map)
 * - `back`  — away from camera
 * - `right` — side; engine flips with facingX=-1 for left when no `left` strip
 * - `left`  — optional dedicated left art (no flip)
 */
export type CharacterFacing = "front" | "back" | "right" | "left";

export interface GeneratedDirectionalSheet {
  animation?: string;
  facing?: string;
  url: string;
  metadata?: {
    width?: number;
    height?: number;
    frame_w?: number;
    frame_h?: number;
    frame_count?: number;
    output_format?: string;
  };
}

/**
 * Preferred multi-clip directional character JSON.
 *
 * ```json
 * {
 *   "label": "pip",
 *   "defaultAnimation": "idle",
 *   "defaultFacing": "front",
 *   "animations": {
 *     "idle": {
 *       "front": { "url": "...", "metadata": { "frame_count": 4, "frame_w": 64, "frame_h": 64 } },
 *       "back":  { "url": "...", "metadata": { ... } },
 *       "right": { "url": "...", "metadata": { ... } }
 *     },
 *     "walk": {
 *       "front": { "url": "...", "metadata": { "frame_count": 8, ... } },
 *       "back":  { ... },
 *       "right": { ... }
 *     }
 *   }
 * }
 * ```
 *
 * Adapter emits sheet names `{clip}_{facing}` (`walk_front`, `idle_right`, …).
 * Actor picks clip + facing natively on move. Missing `idle` → hold frame 0 of walk.
 */
export interface GeneratedDirectionalCharacter {
  label?: string;
  defaultAnimation?: string;
  defaultFacing?: CharacterFacing | string;
  /** Multi-clip map: clip name → facing → strip. */
  animations?: Record<
    string,
    Partial<Record<CharacterFacing | string, GeneratedDirectionalSheet>>
  >;
  /**
   * Legacy single-clip pack (still supported):
   * top-level `front`/`back`/`right` + optional `animation` name.
   */
  animation?: string;
  baseUrl?: string;
  directions?: string[];
  front?: GeneratedDirectionalSheet;
  back?: GeneratedDirectionalSheet;
  right?: GeneratedDirectionalSheet;
  left?: GeneratedDirectionalSheet;
}

export type AnyGeneratedCharacter =
  | GeneratedCharacter
  | GeneratedDirectionalCharacter;

const FACING_KEYS: CharacterFacing[] = ["front", "back", "right", "left"];

function isSheetEntry(value: unknown): value is GeneratedDirectionalSheet {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as GeneratedDirectionalSheet).url === "string" &&
    Boolean((value as GeneratedDirectionalSheet).url.trim())
  );
}

/** Multi-clip `animations` map present. */
export function isMultiClipDirectionalCharacter(
  character: unknown,
): character is GeneratedDirectionalCharacter {
  if (!character || typeof character !== "object") return false;
  const c = character as GeneratedDirectionalCharacter;
  if (Array.isArray((c as GeneratedCharacter).spriteSheets)) return false;
  const anims = c.animations;
  if (!anims || typeof anims !== "object") return false;
  return Object.values(anims).some(
    (byFacing) =>
      byFacing &&
      typeof byFacing === "object" &&
      FACING_KEYS.some((f) => isSheetEntry(byFacing[f])),
  );
}

/** Legacy top-level front/back/right pack (single clip). */
export function isLegacyDirectionalCharacter(
  character: unknown,
): character is GeneratedDirectionalCharacter {
  if (!character || typeof character !== "object") return false;
  const c = character as Record<string, unknown>;
  if (Array.isArray(c.spriteSheets)) return false;
  if (c.animations && typeof c.animations === "object") return false;
  return FACING_KEYS.some((key) => isSheetEntry(c[key]));
}

/** True for either multi-clip or legacy directional packs. */
export function isDirectionalCharacter(
  character: unknown,
): character is GeneratedDirectionalCharacter {
  return (
    isMultiClipDirectionalCharacter(character) ||
    isLegacyDirectionalCharacter(character)
  );
}

function frameSizeFromDirectional(
  sheet: GeneratedDirectionalSheet,
): { frameCount: number; width: number; height: number } {
  const meta = sheet.metadata ?? {};
  const frameCount = Math.max(1, Number(meta.frame_count) || 1);
  const frameW =
    Number(meta.frame_w) ||
    (Number(meta.width) > 0 ? Number(meta.width) / frameCount : 0) ||
    64;
  const frameH = Number(meta.frame_h) || Number(meta.height) || 64;
  return {
    frameCount,
    width: frameW,
    height: frameH,
  };
}

function pushDirectionalSheet(
  sheets: EntitySpriteSheet[],
  clip: string,
  facing: string,
  entry: GeneratedDirectionalSheet,
): void {
  const clipName = String(clip)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  const facingName = String(facing)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (!clipName || !facingName || !entry.url?.trim()) return;
  const { frameCount, width, height } = frameSizeFromDirectional(entry);
  sheets.push({
    name: `${clipName}_${facingName}`,
    url: entry.url.trim(),
    frame_count: frameCount,
    width,
    height,
  });
}

/**
 * Expand multi-clip `animations` into horizontal-strip `spriteSheets`
 * named `{clip}_{facing}` (e.g. `walk_front`, `idle_right`).
 */
export function multiClipDirectionalToSpriteSheets(
  character: GeneratedDirectionalCharacter,
): EntitySpriteSheet[] {
  const sheets: EntitySpriteSheet[] = [];
  const anims = character.animations ?? {};
  for (const [clip, byFacing] of Object.entries(anims)) {
    if (!byFacing || typeof byFacing !== "object") continue;
    for (const facing of FACING_KEYS) {
      const entry = byFacing[facing];
      if (isSheetEntry(entry)) pushDirectionalSheet(sheets, clip, facing, entry);
    }
  }
  return sheets;
}

/**
 * Expand legacy single-clip pack (top-level front/back/right) into strips
 * named `{animation}_{facing}` (default clip `walk`).
 */
export function legacyDirectionalToSpriteSheets(
  character: GeneratedDirectionalCharacter,
): EntitySpriteSheet[] {
  const moveName = String(character.animation ?? "walk")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_") || "walk";
  // Normalize "walking" stays "walking" so names match generator output;
  // Actor accepts both walk_* and walking_*.
  const sheets: EntitySpriteSheet[] = [];
  for (const facing of FACING_KEYS) {
    const entry = character[facing];
    if (isSheetEntry(entry)) {
      pushDirectionalSheet(sheets, moveName, facing, entry);
    }
  }
  return sheets;
}

/** @deprecated Use multiClipDirectionalToSpriteSheets / toSpriteSheets. */
export function directionalToSpriteSheets(
  character: GeneratedDirectionalCharacter,
): EntitySpriteSheet[] {
  if (isMultiClipDirectionalCharacter(character)) {
    return multiClipDirectionalToSpriteSheets(character);
  }
  return legacyDirectionalToSpriteSheets(character);
}

/** Normalize any supported character JSON into engine spriteSheets. */
export function toSpriteSheets(
  character: AnyGeneratedCharacter,
): EntitySpriteSheet[] {
  if (isMultiClipDirectionalCharacter(character)) {
    return multiClipDirectionalToSpriteSheets(character);
  }
  if (isLegacyDirectionalCharacter(character)) {
    return legacyDirectionalToSpriteSheets(character);
  }
  return Array.isArray((character as GeneratedCharacter).spriteSheets)
    ? (character as GeneratedCharacter).spriteSheets
    : [];
}

type PanelContent = GameMapData["panel"];
type Box2D = number[];

/** Pixel placement box for a map sprite cutout (image-space coords). */
export interface GeneratedPixelBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GeneratedCollisionPoint {
  x: number;
  y: number;
}

/**
 * Map v2 sprite entry: cut-out overlay for Y-sorting + polygon collision.
 * Categories: `boundary` | `walkable_area`.
 *
 * Placement uses `pixel_bbox` only. Map pixel size comes from loading the
 * background `url` (naturalWidth/Height).
 */
export interface GeneratedMapSprite {
  label: string;
  category?: string;
  /** Placement crop on the map background image (pixel coords). */
  pixel_bbox?: GeneratedPixelBBox;
  /** Cut-out overlay URL drawn in the Y-sorted queue. */
  spriteUrl?: string;
  /** Solid footprint polygons in normalized space ({x,y} points). */
  collision_polygons?: GeneratedCollisionPoint[][];
  /** Optional AABB collider in normalized space. */
  collision_bbox?: Box2D;
}

/** Walkable region — supports legacy `box_2d` and v2 `bbox`. */
export interface GeneratedWalkableBox {
  box_2d?: Box2D;
  bbox?: Box2D;
  label?: string;
  description?: string;
  floor_id?: number | string;
  id?: string;
}

/**
 * Map v2 overwrite — visual (and sometimes collision) patch on the base map.
 *
 * Migrated into unified `mapOverlays` (`kind`: erase / vfx) by `toMapData`.
 */
export interface GeneratedMapOverwrite {
  id?: string;
  label?: string;
  type: "spritesheet" | "remove";
  mode?: "background" | "gameplay";
  url: string;
  frame_count?: number;
  pixel_bbox: GeneratedPixelBBox;
}

/**
 * Slim sprite summary kept for backwards-compat type imports.
 * Prefer opening `map_*.sprites.json` (or the merged handle) instead.
 * @deprecated Not written into lean map JSON anymore.
 */
export interface GeneratedMapSpriteIndexEntry {
  label: string;
  category?: string;
  pixel_bbox?: GeneratedPixelBBox;
  spriteUrl?: string;
}

/** Sidecar file shape: `map_<id>.sprites.json`. */
export interface GeneratedMapSpritesFile {
  sprites?: GeneratedMapSprite[];
}

/** Character placement authored in the Capybara map editor. */
export interface GeneratedCharacterPlacement {
  assetId: string;
  layerId: string;
  label: string;
  box_2d: [number, number, number, number] | number[];
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  /** Controlled player vs standing NPC (from Maps UI). */
  role?: "player" | "npc";
}

/** Screen-space HUD placement on a map (viewport-normalized 0–1000). */
export interface GeneratedHudPlacement {
  placementId: string;
  assetId: string;
  label: string;
  box_2d: [number, number, number, number] | number[];
  width?: number;
  height?: number;
  zIndex?: number;
  url?: string;
}

/** Sidecar file shape: `map_<id>.placements.json`. */
export interface GeneratedMapPlacementsFile {
  placement?: PanelContent["placement"];
  characterPlacements?: GeneratedCharacterPlacement[];
  hudPlacements?: GeneratedHudPlacement[];
}

/** Flat generated map handle, e.g. the default export of `map_*.json`. */
export interface GeneratedMap {
  schemaVersion?: number;
  name?: string;
  url: string;
  assetId?: string;
  /** Player character asset id from Maps UI / initial pack. */
  playerCharacterId?: string;
  /** Legacy mask-based obstacles. */
  masks?: PanelContent["masks"];
  spriteSheets?: PanelContent["spriteSheets"];
  walkableBoxes?: GeneratedWalkableBox[];
  placement?: PanelContent["placement"];
  mapOverlays?: PanelContent["mapOverlays"];
  characterPlacements?: GeneratedCharacterPlacement[];
  hudPlacements?: GeneratedHudPlacement[];
  /**
   * Map v2 cut-out sprites (boundary + walkable_area). Prefer loading these
   * from `map_*.sprites.json` via `mergeMapSidecars` so `map_*.json` stays lean.
   * Converted into masks with pixel_bbox + polygon colliders by `toMapData`.
   */
  sprites?: GeneratedMapSprite[];
  /**
   * @deprecated Not emitted on lean maps. Open `map_*.sprites.json` instead.
   */
  spriteIndex?: GeneratedMapSpriteIndexEntry[];
  /** Legacy v2 visual patches — converted to `mapOverlays` in `toMapData`. */
  overwrites?: GeneratedMapOverwrite[];
}

/** Options for stitching multi-panel maps or overriding panel pixel size. */
export interface ToMapDataOptions {
  extensions?: GameMapData["extensions"];
  /**
   * Optional override for panel pixel size. When omitted, GameMap uses the
   * loaded background image's natural dimensions.
   */
  panelPixelWidth?: number;
  panelPixelHeight?: number;
}

/**
 * Convert a pixel crop on the source map image into a normalized box_2d
 * `[y1, x1, y2, x2]` (0–1000 per panel).
 */
export function pixelBBoxToBox2d(
  pixel: GeneratedPixelBBox,
  mapWidth: number,
  mapHeight: number,
): Box2D {
  const w = mapWidth > 0 ? mapWidth : 1;
  const h = mapHeight > 0 ? mapHeight : 1;
  return [
    (pixel.y / h) * NORM,
    (pixel.x / w) * NORM,
    ((pixel.y + pixel.h) / h) * NORM,
    ((pixel.x + pixel.w) / w) * NORM,
  ];
}

function isFiniteBox(box: unknown): box is Box2D {
  return (
    Array.isArray(box) &&
    box.length >= 4 &&
    box.slice(0, 4).every((n) => Number.isFinite(Number(n)))
  );
}

function normalizeWalkableBoxes(
  boxes: GeneratedWalkableBox[] | undefined,
): NonNullable<PanelContent["walkableBoxes"]> {
  if (!boxes?.length) return [];
  const out: NonNullable<PanelContent["walkableBoxes"]> = [];
  for (const wb of boxes) {
    const box = wb.box_2d ?? wb.bbox;
    if (!isFiniteBox(box)) continue;
    out.push({
      box_2d: [Number(box[0]), Number(box[1]), Number(box[2]), Number(box[3])],
      label: wb.label ?? wb.description,
    });
  }
  return out;
}

function spriteOverlayUrl(sprite: GeneratedMapSprite): string | undefined {
  const url = sprite.spriteUrl;
  return typeof url === "string" && url.trim() ? url.trim() : undefined;
}

/**
 * Convert map v2 `sprites[]` into engine mask entries:
 * - placement: `pixel_bbox` only (resolved when the map background loads)
 * - cut-out overlay → `obstacleImage` (Y-sorted)
 * - `collision_polygons` for solid collision
 */
function spritesToMasks(
  sprites: GeneratedMapSprite[] | undefined,
): NonNullable<PanelContent["masks"]> {
  if (!sprites?.length) return [];
  const masks: NonNullable<PanelContent["masks"]> = [];

  for (const sprite of sprites) {
    const pixel = sprite.pixel_bbox;
    if (
      !pixel ||
      !Number.isFinite(pixel.x) ||
      !Number.isFinite(pixel.y) ||
      !Number.isFinite(pixel.w) ||
      !Number.isFinite(pixel.h)
    ) {
      continue;
    }

    const colliders: Array<{ box_2d: Box2D; label: string }> = [];
    if (isFiniteBox(sprite.collision_bbox)) {
      colliders.push({
        box_2d: [
          Number(sprite.collision_bbox[0]),
          Number(sprite.collision_bbox[1]),
          Number(sprite.collision_bbox[2]),
          Number(sprite.collision_bbox[3]),
        ],
        label: sprite.label,
      });
    }

    const collisionPolygons = (sprite.collision_polygons ?? [])
      .map((poly) =>
        (poly ?? [])
          .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
          .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
      )
      .filter((poly) => poly.length >= 3);

    const overlay = spriteOverlayUrl(sprite);
    const category = sprite.category?.trim() || "walkable_area";

    masks.push({
      label: sprite.label,
      name: sprite.label,
      // Bounds filled in by GameMap once the background image loads.
      pixel_bbox: {
        x: Number(pixel.x),
        y: Number(pixel.y),
        w: Number(pixel.w),
        h: Number(pixel.h),
      },
      type: category,
      collider: colliders,
      obstacleImage: overlay,
      collisionPolygons,
    });
  }

  return masks;
}

function normalizeMapOverlayKind(
  raw: unknown,
): "erase" | "state" | "vfx" | "grid" | undefined {
  if (typeof raw !== "string") return undefined;
  const kind = raw.trim().toLowerCase();
  if (
    kind === "erase" ||
    kind === "state" ||
    kind === "vfx" ||
    kind === "grid"
  ) {
    return kind;
  }
  return undefined;
}

function normalizeCellBboxes(raw: unknown): number[][] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: number[][] = [];
  for (const cell of raw) {
    if (!isFiniteBox(cell)) continue;
    out.push([
      Number(cell[0]),
      Number(cell[1]),
      Number(cell[2]),
      Number(cell[3]),
    ]);
  }
  return out.length ? out : undefined;
}

function mergeOverlaySources(
  ...lists: Array<PanelContent["mapOverlays"] | undefined>
): PanelContent["mapOverlays"] {
  const byId = new Map<
    string,
    NonNullable<PanelContent["mapOverlays"]>[number]
  >();
  for (const list of lists) {
    if (!list?.length) continue;
    for (const overlay of list) {
      if (!overlay?.id) continue;
      byId.set(overlay.id, overlay);
    }
  }
  return [...byId.values()];
}

/**
 * Convert legacy `overwrites[]` (pixel_bbox) into unified mapOverlays.
 * Uses panel pixel dimensions when provided (defaults 1000×1000).
 */
function legacyOverwritesToMapOverlays(
  overwrites: GeneratedMapOverwrite[] | undefined,
  mapWidth: number,
  mapHeight: number,
): NonNullable<PanelContent["mapOverlays"]> {
  if (!overwrites?.length) return [];
  const out: NonNullable<PanelContent["mapOverlays"]> = [];

  for (const [index, raw] of overwrites.entries()) {
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    const pixel = raw.pixel_bbox;
    if (
      !url ||
      !pixel ||
      !Number.isFinite(pixel.x) ||
      !Number.isFinite(pixel.y) ||
      !Number.isFinite(pixel.w) ||
      !Number.isFinite(pixel.h)
    ) {
      continue;
    }

    const label =
      (typeof raw.label === "string" && raw.label.trim()) ||
      (typeof raw.id === "string" && raw.id.trim()) ||
      `overwrite_${index}`;
    const id =
      typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : label;
    const box_2d = pixelBBoxToBox2d(
      {
        x: Number(pixel.x),
        y: Number(pixel.y),
        w: Number(pixel.w),
        h: Number(pixel.h),
      },
      mapWidth,
      mapHeight,
    );

    if (raw.type === "remove") {
      out.push({
        id,
        anchorLabel: label,
        kind: "erase",
        currentMapStateLabel: "default",
        currentState: "default",
        states: [{ name: "default", url, box_2d }],
      });
      continue;
    }

    const mode =
      raw.mode === "gameplay" || raw.mode === "background"
        ? raw.mode
        : "background";
    const frameCount = Math.max(1, Number(raw.frame_count) || 1);
    out.push({
      id,
      anchorLabel: label,
      kind: "vfx",
      currentMapStateLabel: "default",
      currentState: "default",
      states: [
        {
          name: "default",
          url,
          box_2d,
          frameCount,
          mode,
        },
      ],
    });
  }

  return out;
}

function resolveGeneratedSchemaVersion(
  map: GeneratedMap,
): typeof GENERATED_ASSET_CONTRACT_VERSION | undefined {
  const version = map.schemaVersion;
  if (version == null) return undefined;
  if (version === GENERATED_ASSET_CONTRACT_VERSION) {
    return GENERATED_ASSET_CONTRACT_VERSION;
  }
  console.warn(
    `[adapters] Unsupported map schemaVersion ${String(version)}; expected ${GENERATED_ASSET_CONTRACT_VERSION}`,
  );
  return undefined;
}

/**
 * Normalize unified mapOverlays (edit-UI / generator). Accepts optional `kind`
 * and state fields (`frameCount`, `mode`, `clearsCollision`, `currentState`).
 */
function normalizeMapOverlays(
  overlays: PanelContent["mapOverlays"] | undefined,
): NonNullable<PanelContent["mapOverlays"]> {
  if (!overlays?.length) return [];
  const out: NonNullable<PanelContent["mapOverlays"]> = [];

  for (const [index, raw] of overlays.entries()) {
    if (!raw || typeof raw !== "object") continue;
    const id =
      typeof raw.id === "string" && raw.id.trim()
        ? raw.id.trim()
        : `overlay_${index}`;
    const statesRaw = Array.isArray(raw.states) ? raw.states : [];
    const states = statesRaw
      .map((state, stateIndex) => {
        if (!state || typeof state !== "object") return null;
        const url = typeof state.url === "string" ? state.url.trim() : "";
        if (!url || !isFiniteBox(state.box_2d)) return null;
        const name =
          typeof state.name === "string" && state.name.trim()
            ? state.name.trim()
            : `state_${stateIndex}`;
        const frameCount =
          typeof (state as { frameCount?: unknown }).frameCount === "number"
            ? Number((state as { frameCount: number }).frameCount)
            : typeof (state as { frame_count?: unknown }).frame_count ===
                "number"
              ? Number((state as { frame_count: number }).frame_count)
              : undefined;
        const mode = (state as { mode?: unknown }).mode;
        return {
          name,
          label:
            typeof state.label === "string" ? state.label : undefined,
          description:
            typeof state.description === "string"
              ? state.description
              : undefined,
          url,
          box_2d: [
            Number(state.box_2d[0]),
            Number(state.box_2d[1]),
            Number(state.box_2d[2]),
            Number(state.box_2d[3]),
          ] as number[],
          ...(frameCount != null
            ? { frameCount: Math.max(1, frameCount) }
            : {}),
          ...(mode === "gameplay" || mode === "background"
            ? { mode }
            : {}),
          ...((state as { clearsCollision?: unknown }).clearsCollision ===
          true
            ? { clearsCollision: true }
            : (state as { clearsCollision?: unknown }).clearsCollision ===
                false
              ? { clearsCollision: false }
              : {}),
          collider: state.collider,
          colliders: state.colliders,
          blocksMovement: state.blocksMovement,
          renderLayer: state.renderLayer,
        };
      })
      .filter((state): state is NonNullable<typeof state> => state != null);

    if (!states.length) continue;

    const kind = normalizeMapOverlayKind(
      (raw as { kind?: unknown }).kind,
    );
    const current =
      (typeof (raw as { currentState?: unknown }).currentState === "string" &&
        (raw as { currentState: string }).currentState.trim()) ||
      (typeof raw.currentMapStateLabel === "string" &&
        raw.currentMapStateLabel.trim()) ||
      states[0]!.name;

    const layoutRaw = (raw as { layout?: unknown }).layout;
    const layout =
      layoutRaw === "single" ||
      layoutRaw === "multi_inplace" ||
      layoutRaw === "detached_stages"
        ? layoutRaw
        : undefined;

    out.push({
      id,
      anchorLabel:
        typeof raw.anchorLabel === "string" ? raw.anchorLabel : undefined,
      gamePlay: typeof raw.gamePlay === "string" ? raw.gamePlay : undefined,
      linkedObstacleLabel:
        typeof raw.linkedObstacleLabel === "string"
          ? raw.linkedObstacleLabel
          : undefined,
      ...(((): Record<string, unknown> => {
        const mode = (raw as { placementMode?: unknown }).placementMode;
        if (mode === "replace" || mode === "overlay") {
          return { placementMode: mode };
        }
        return {};
      })()),
      ...(kind ? { kind } : {}),
      ...(layout ? { layout } : {}),
      currentMapStateLabel: current,
      currentState: current,
      states,
      renderLayer: raw.renderLayer,
      blocksMovement: raw.blocksMovement,
      ...((raw as { gridDimensions?: unknown }).gridDimensions &&
      Array.isArray((raw as { gridDimensions: unknown[] }).gridDimensions) &&
      (raw as { gridDimensions: unknown[] }).gridDimensions.length === 2
        ? {
            gridDimensions: [
              Number(
                (raw as { gridDimensions: number[] }).gridDimensions[0],
              ),
              Number(
                (raw as { gridDimensions: number[] }).gridDimensions[1],
              ),
            ] as [number, number],
          }
        : {}),
      ...((): Record<string, unknown> => {
        const cellBboxes = normalizeCellBboxes(
          (raw as { cellBboxes?: unknown }).cellBboxes,
        );
        return cellBboxes ? { cellBboxes } : {};
      })(),
    } as NonNullable<PanelContent["mapOverlays"]>[number]);
  }

  return out;
}

/**
 * Merge lean `map_*.json` with optional sprite and placement sidecars.
 *
 * Prefer this at registration time in `src/data/index.ts` so scenes keep using
 * a single handle with `toMapData(mapFarm)`. Sidecar fields replace any inline
 * values on the base when present.
 *
 * @example
 * import mapFarmBase from "./map_farm.json";
 * import mapFarmSprites from "./map_farm.sprites.json";
 * import mapFarmPlacements from "./map_farm.placements.json";
 * export const mapFarm = mergeMapSidecars(mapFarmBase, {
 *   sprites: mapFarmSprites,
 *   placements: mapFarmPlacements,
 * });
 */
export function mergeMapSidecars(
  map: GeneratedMap,
  sidecars?: {
    sprites?: GeneratedMapSpritesFile | GeneratedMapSprite[] | null;
    placements?: GeneratedMapPlacementsFile | null;
  } | null,
): GeneratedMap {
  let next: GeneratedMap = { ...map };

  const sprites = Array.isArray(sidecars?.sprites)
    ? sidecars.sprites
    : sidecars?.sprites?.sprites;
  if (sprites?.length) {
    next = { ...next, sprites };
  }

  const placements = sidecars?.placements;
  if (placements) {
    next = {
      ...next,
      ...(placements.placement?.length
        ? { placement: placements.placement }
        : {}),
      ...(placements.characterPlacements?.length
        ? { characterPlacements: placements.characterPlacements }
        : {}),
      ...(placements.hudPlacements?.length
        ? { hudPlacements: placements.hudPlacements }
        : {}),
    };
  }

  return next;
}

/**
 * Merge lean `map_*.json` with heavy `map_*.sprites.json`.
 *
 * Prefer `mergeMapSidecars` when a placements sidecar may also be present.
 *
 * @example
 * import mapFarmBase from "./map_farm.json";
 * import mapFarmSprites from "./map_farm.sprites.json";
 * export const mapFarm = mergeMapSprites(mapFarmBase, mapFarmSprites);
 */
export function mergeMapSprites(
  map: GeneratedMap,
  spritesFile?: GeneratedMapSpritesFile | GeneratedMapSprite[] | null,
): GeneratedMap {
  return mergeMapSidecars(map, { sprites: spritesFile });
}

/**
 * Wrap a flat generated map JSON handle into the engine's `{ panel }` `MapData`.
 *
 * Supports:
 * - **Legacy** maps: `masks`, `spriteSheets`, `walkableBoxes[{box_2d}]`, …
 * - **Map v2**: `url` background + `walkableBoxes[{bbox}]` + `sprites[]` with
 *   `pixel_bbox` placement (map size from loaded background), cut-outs,
 *   `collision_polygons`, and unified `mapOverlays` (`kind`: erase / state /
 *   vfx / grid). Prefer `sprites` from
 *   `mergeMapSidecars(map_*.json, { sprites, placements })`.
 *
 * @example
 * import { mapFarm, toMapData } from "../data";
 * const game = createGame({ canvasId: "game", map: toMapData(mapFarm) });
 */
export function toMapData(
  map: GeneratedMap,
  options: ToMapDataOptions = {},
): GameMapData {
  const spriteMasks = spritesToMasks(map.sprites);
  // Prefer explicit masks; if only v2 sprites exist, use those as masks.
  const masks = (map.masks?.length ? map.masks : spriteMasks) ?? [];
  // When both exist, append sprites that are not already represented by label.
  if (map.masks?.length && spriteMasks.length) {
    const existing = new Set(
      map.masks.map((m) => m.label?.trim()).filter(Boolean),
    );
    for (const mask of spriteMasks) {
      if (!existing.has(mask.label?.trim())) masks.push(mask);
    }
  }

  const mapOverlays = normalizeMapOverlays(
    mergeOverlaySources(
      legacyOverwritesToMapOverlays(
        map.overwrites,
        options.panelPixelWidth ?? NORM,
        options.panelPixelHeight ?? NORM,
      ),
      map.mapOverlays,
    ),
  );
  const generatedAssetContractVersion = resolveGeneratedSchemaVersion(map);

  return {
    name: map.name,
    ...(generatedAssetContractVersion
      ? { generatedAssetContractVersion }
      : {}),
    characterPlacements: map.characterPlacements ?? [],
    panel: {
      url: map.url,
      masks,
      spriteSheets: map.spriteSheets ?? [],
      walkableBoxes: normalizeWalkableBoxes(map.walkableBoxes),
      placement: map.placement ?? [],
      mapOverlays,
    },
    extensions: options.extensions,
    // Only set when the caller overrides — otherwise GameMap uses the loaded
    // background image's naturalWidth/naturalHeight.
    panelPixelWidth: options.panelPixelWidth,
    panelPixelHeight: options.panelPixelHeight,
  };
}

/**
 * Build an archetype component bag from a generated character handle.
 *
 * Supports legacy `{ spriteSheets }` and directional packs
 * (`front` / `back` / `right` / `left`).
 *
 * @example
 * import { charPlayer, toArchetype } from "../data";
 * game.defineArchetype("player", toArchetype(charPlayer, { speed: 190 }));
 * const playerId = game.spawnAtFeet("player", 500, 820);
 */
export function toArchetype(
  character: AnyGeneratedCharacter,
  extra: ComponentBag = {},
): ComponentBag {
  const label =
    (typeof character.label === "string" && character.label.trim()) ||
    "character";
  const sheets = toSpriteSheets(character);
  let defaultFacing = "front";
  let defaultAnimation: string | undefined;
  if (isDirectionalCharacter(character)) {
    if (typeof character.defaultFacing === "string") {
      defaultFacing = character.defaultFacing.toLowerCase();
    }
    if (typeof character.defaultAnimation === "string") {
      defaultAnimation = `${character.defaultAnimation.toLowerCase()}_${defaultFacing}`;
    } else if (character.animation) {
      defaultAnimation = `${String(character.animation).toLowerCase()}_${defaultFacing}`;
    } else if (sheets.some((s) => s.name.startsWith("idle_"))) {
      defaultAnimation = `idle_${defaultFacing}`;
    } else if (sheets.some((s) => s.name.startsWith("walk_"))) {
      defaultAnimation = `walk_${defaultFacing}`;
    } else if (sheets[0]?.name) {
      defaultAnimation = sheets[0].name;
    }
  }
  return {
    label,
    spriteSheets: sheets,
    ...(defaultAnimation ? { activeAnimation: defaultAnimation } : {}),
    facingDir: defaultFacing,
    ...extra,
  };
}

/**
 * Build the `sprite` payload for a bootstrap `player` config from a generated
 * character handle.
 */
export function toPlayerSprite(character: AnyGeneratedCharacter): {
  spriteSheets: EntitySpriteSheet[];
} {
  return { spriteSheets: toSpriteSheets(character) };
}
