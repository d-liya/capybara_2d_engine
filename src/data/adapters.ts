import type { ComponentBag, EntitySpriteSheet, GameMapData } from "../Game";
import { NORM } from "../utils/common";

/**
 * Adapters that turn generator-shaped JSON handles (from `src/data`) into the
 * shapes the engine facade consumes.
 *
 * Why these exist:
 * - Generated map JSON is **flat** (`{ name, url, masks, spriteSheets, ... }`
 *   or the v2 shape `{ url, walkableBoxes, sprites }`), but `createGame({ map })`
 *   expects the nested `{ panel: { ... } }` shape.
 * - Map v2 `sprites[]` (cut-outs + collision polygons) live in a sidecar
 *   `map_*.sprites.json` so agents can read lean `map_*.json`. Merge with
 *   `mergeMapSprites` before `toMapData`.
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
 * - `spritesheet`: animated overlay; `mode` is `background` (loops) or
 *   `gameplay` (triggered via `game.triggerMapEffect`).
 * - `remove`: static image patch; overlapping map sprites lose collision
 *   (and their cut-out visual) because the obstacle is gone.
 */
export interface GeneratedMapOverwrite {
  id?: string;
  label?: string;
  type: "spritesheet" | "remove";
  /** spritesheet only: `background` | `gameplay`. Defaults to `background`. */
  mode?: "background" | "gameplay";
  /** Image or spritesheet URL. */
  url: string;
  /** spritesheet frame count. Defaults to 1. */
  frame_count?: number;
  /** Placement crop on the map background (pixel coords). */
  pixel_bbox: GeneratedPixelBBox;
}

/**
 * Slim sprite summary for agent-readable `map_*.json` (no polygons).
 * Full geometry stays in `map_*.sprites.json`.
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

/** Flat generated map handle, e.g. the default export of `map_*.json`. */
export interface GeneratedMap {
  name?: string;
  url: string;
  /** Legacy mask-based obstacles. */
  masks?: PanelContent["masks"];
  spriteSheets?: PanelContent["spriteSheets"];
  walkableBoxes?: GeneratedWalkableBox[];
  placement?: PanelContent["placement"];
  mapOverlays?: PanelContent["mapOverlays"];
  /**
   * Map v2 cut-out sprites (boundary + walkable_area). Prefer loading these
   * from `map_*.sprites.json` via `mergeMapSprites` so `map_*.json` stays lean.
   * Converted into masks with pixel_bbox + polygon colliders by `toMapData`.
   */
  sprites?: GeneratedMapSprite[];
  /**
   * Optional slim sprite list for agents reading `map_*.json` without opening
   * the sidecar. Runtime still needs full `sprites` (via merge).
   */
  spriteIndex?: GeneratedMapSpriteIndexEntry[];
  /** Visual/collision overwrites (spritesheet VFX or remove patches). */
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

function normalizeOverwrites(
  overwrites: GeneratedMapOverwrite[] | undefined,
): NonNullable<PanelContent["overwrites"]> {
  if (!overwrites?.length) return [];
  const out: NonNullable<PanelContent["overwrites"]> = [];

  for (const [index, raw] of overwrites.entries()) {
    const type = raw.type === "remove" ? "remove" : "spritesheet";
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

    const mode =
      raw.mode === "gameplay" || raw.mode === "background"
        ? raw.mode
        : "background";
    const label =
      (typeof raw.label === "string" && raw.label.trim()) ||
      (typeof raw.id === "string" && raw.id.trim()) ||
      `overwrite_${index}`;

    out.push({
      id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : label,
      label,
      type,
      mode,
      url,
      frame_count: Math.max(1, Number(raw.frame_count) || 1),
      pixel_bbox: {
        x: Number(pixel.x),
        y: Number(pixel.y),
        w: Number(pixel.w),
        h: Number(pixel.h),
      },
    });
  }

  return out;
}

function spritesToIndex(
  sprites: GeneratedMapSprite[],
): GeneratedMapSpriteIndexEntry[] {
  return sprites.map((sprite) => ({
    label: sprite.label,
    ...(sprite.category ? { category: sprite.category } : {}),
    ...(sprite.pixel_bbox ? { pixel_bbox: sprite.pixel_bbox } : {}),
    ...(sprite.spriteUrl ? { spriteUrl: sprite.spriteUrl } : {}),
  }));
}

/**
 * Merge lean `map_*.json` with heavy `map_*.sprites.json`.
 *
 * Prefer this at registration time in `src/data/index.ts` so scenes keep using
 * a single handle with `toMapData(mapFarm)`. Sidecar `sprites` replace any
 * inline `sprites` on the base. If the base has no `spriteIndex`, one is
 * derived from the merged sprites (runtime convenience only — write
 * `spriteIndex` into `map_*.json` if agents should see it on disk).
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
  const sprites = Array.isArray(spritesFile)
    ? spritesFile
    : spritesFile?.sprites;
  if (!sprites?.length) return map;

  return {
    ...map,
    sprites,
    spriteIndex: map.spriteIndex?.length
      ? map.spriteIndex
      : spritesToIndex(sprites),
  };
}

/**
 * Wrap a flat generated map JSON handle into the engine's `{ panel }` `MapData`.
 *
 * Supports:
 * - **Legacy** maps: `masks`, `spriteSheets`, `walkableBoxes[{box_2d}]`, …
 * - **Map v2**: `url` background + `walkableBoxes[{bbox}]` + `sprites[]` with
 *   `pixel_bbox` placement (map size from loaded background), cut-outs,
 *   `collision_polygons`, and `overwrites` (spritesheet / remove).
 *   Prefer `sprites` from `mergeMapSprites(map_*.json, map_*.sprites.json)`.
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

  return {
    name: map.name,
    panel: {
      url: map.url,
      masks,
      spriteSheets: map.spriteSheets ?? [],
      walkableBoxes: normalizeWalkableBoxes(map.walkableBoxes),
      placement: map.placement ?? [],
      mapOverlays: map.mapOverlays ?? [],
      overwrites: normalizeOverwrites(map.overwrites),
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
