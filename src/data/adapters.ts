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

/** Generated character handle, e.g. the default export of `char_*.json`. */
export interface GeneratedCharacter {
  label: string;
  spriteSheets: GeneratedSpriteSheet[];
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
   * Map v2 cut-out sprites (boundary + walkable_area). Converted into masks
   * with pixel_bbox + polygon colliders by `toMapData`.
   */
  sprites?: GeneratedMapSprite[];
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

/**
 * Wrap a flat generated map JSON handle into the engine's `{ panel }` `MapData`.
 *
 * Supports:
 * - **Legacy** maps: `masks`, `spriteSheets`, `walkableBoxes[{box_2d}]`, …
 * - **Map v2**: `url` background + `walkableBoxes[{bbox}]` + `sprites[]` with
 *   `pixel_bbox` placement (map size from loaded background), cut-outs,
 *   `collision_polygons`, and `overwrites` (spritesheet / remove).
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
 * Use the result with `game.defineArchetype`. Merge extra defaults (speed,
 * label, tooltip, etc.) via the second argument.
 *
 * @example
 * import { charFarmer, toArchetype } from "../data";
 * game.defineArchetype("player", toArchetype(charFarmer, { speed: 190 }));
 * const playerId = game.spawnAtFeet("player", 500, 820);
 */
export function toArchetype(
  character: GeneratedCharacter,
  extra: ComponentBag = {},
): ComponentBag {
  return {
    spriteSheets: character.spriteSheets,
    ...extra,
  };
}

/**
 * Build the `sprite` payload for a bootstrap `player` config from a generated
 * character handle.
 *
 * @example
 * import { charFarmer, toPlayerSprite } from "../data";
 * const game = createGame({
 *   canvasId: "game",
 *   map: toMapData(mapFarm),
 *   player: { x: 500, y: 820, anchor: "feet", sprite: toPlayerSprite(charFarmer) },
 * });
 */
export function toPlayerSprite(character: GeneratedCharacter): {
  spriteSheets: EntitySpriteSheet[];
} {
  return { spriteSheets: character.spriteSheets };
}
