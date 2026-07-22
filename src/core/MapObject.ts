import {
  loadImage,
  offsetPolygon,
  offsetRect,
  parseBox2d,
  polygonBounds,
  rectOverlapsPolygon,
  snapCanvasValue,
  toPixel,
  rectsOverlap,
  NORM,
  type Point,
  type Rect,
} from "../utils/common";
import type { HoverTarget } from "./HoverTypes";
import type { RenderLayer } from "./renderSort";

const BACKGROUND_IMAGE_PADDING_FACTOR = 15 / 110;

function padBox2D(
  box2d: number[],
  paddingFactor = BACKGROUND_IMAGE_PADDING_FACTOR,
): number[] {
  const [y1, x1, y2, x2] = box2d;
  const padX = (x2 - x1) * paddingFactor;
  const padY = (y2 - y1) * paddingFactor;

  return [
    Math.max(0, Math.round(y1 - padY)),
    Math.max(0, Math.round(x1 - padX)),
    Math.min(NORM, Math.round(y2 + padY)),
    Math.min(NORM, Math.round(x2 + padX)),
  ];
}

function normalizePolygons(
  raw: Array<Array<{ x: number; y: number }>> | undefined,
): Point[][] {
  if (!raw?.length) return [];
  return raw
    .map((poly) =>
      (poly ?? [])
        .map((p) => ({ x: Number(p.x), y: Number(p.y) }))
        .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y)),
    )
    .filter((poly) => poly.length >= 3);
}

function pixelBBoxToBox2d(
  pixel: { x: number; y: number; w: number; h: number },
  mapWidth: number,
  mapHeight: number,
): number[] {
  const w = mapWidth > 0 ? mapWidth : 1;
  const h = mapHeight > 0 ? mapHeight : 1;
  const x1 = (pixel.x / w) * NORM;
  const y1 = (pixel.y / h) * NORM;
  const x2 = ((pixel.x + pixel.w) / w) * NORM;
  const y2 = ((pixel.y + pixel.h) / h) * NORM;
  return [y1, x1, y2, x2];
}

export interface MapObjectPixelBBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface MapObjectData {
  label: string;
  name?: string;
  /** Normalized visual footprint. Optional when `pixel_bbox` is used. */
  box_2d?: number[];
  /**
   * Pixel crop on the map background. Resolved to bounds once the map image
   * loads (naturalWidth/Height) — no per-sprite map_size needed.
   */
  pixel_bbox?: MapObjectPixelBBox;
  /** Optional visual footprint for backgroundImage. Defaults to box_2d padded by 50%. */
  backgroundImageBox2d?: number[];
  collider: Array<{ box_2d: number[] }>;
  /**
   * Solid collision polygons in normalized space. When present, movement uses
   * polygon overlap instead of AABB colliders.
   */
  collisionPolygons?: Array<Array<{ x: number; y: number }>>;
  /** Walkable-area shadow/decoration layer — drawn with the map background. */
  backgroundImage?: string;
  /** Obstacle-only sprite — drawn in the Y-sorted render queue. */
  obstacleImage?: string;
  /** @deprecated Use obstacleImage instead. */
  croppedImageUrl?: string;
  /** When set, a map spritesheet VFX replaces static mask images. */
  spriteSheetUrl?: string;
  type?: string;
}

export interface MapObjectOptions {
  /** Skip background/obstacle images — a linked spritesheet renders instead. */
  suppressStaticVisuals?: boolean;
  /** Skip only the obstacle image while keeping background/shadow art. */
  suppressObstacleVisual?: boolean;
  /**
   * Known map background pixel size. When set with `pixel_bbox`, bounds are
   * resolved immediately; otherwise call `resolveFromMapPixels` after load.
   */
  mapPixelWidth?: number;
  mapPixelHeight?: number;
}

/**
 * A single map obstacle.
 *
 * Coordinate contract
 * -------------------
 * All stored values (bounds, collider, polygons) are in the 0-1000 normalised space.
 * Pixel conversion happens only inside draw() / drawDebug().
 *
 * Public surface
 * --------------
 * .renderY          – Y-sort anchor; collider base for split-layer masks, else bounds bottom
 * .participatesInYSort – false for ground_patch (drawn in drawBackground only)
 * .overlaps(rect)   – collision test against a normalised {x1,y1,x2,y2} rect
 * .drawBackground(ctx) – render the mask backgroundImage layer (behind Y-sort)
 * .draw(ctx)           – render the obstacleImage / cut-out overlay sprite
 * .drawDebug(ctx)      – render visual bbox (cyan) + collision (red) + label
 */
export default class MapObject {
  label: string;
  name: string;
  type: string;
  renderY: number;
  /** Draw layer for Y-sort: crop beds and similar map decals sort behind spawned props. */
  readonly renderLayer: RenderLayer;
  private _participatesInYSortBase: boolean;
  private _bounds: Rect;
  private _backgroundBounds: Rect;
  private _colliders: Rect[];
  private _polygons: Point[][];
  private _polygonsLocal: Point[][];
  private _explicitCollidersLocal: Rect[];
  private _usesImplicitBoundsCollider: boolean;
  private _usesSplitColliderAnchor: boolean;
  private _backgroundImageBox2d?: number[];
  private _pixelBBox: MapObjectPixelBBox | null;
  private _normOffset: { x: number; y: number } | undefined;
  private _obstacleInBackground: boolean;
  private _suppressStaticVisuals: boolean;
  private _suppressObstacleVisual: boolean;
  /** Cleared by `kind: "erase"` mapOverlays that cover this sprite. */
  private _collisionDisabled: boolean;
  private _visualSuppressed: boolean;
  private _backgroundImage: HTMLImageElement | null;
  private _obstacleImage: HTMLImageElement | null;

  /** When false, obstacle art is drawn only in drawBackground (not the Y-sort queue). */
  get participatesInYSort(): boolean {
    return this._participatesInYSortBase && !this._visualSuppressed;
  }

  constructor(
    data: MapObjectData,
    normOffset?: { x: number; y: number },
    options: MapObjectOptions = {},
  ) {
    this.label = data.label;
    this.name = data.name ?? data.label;
    this.type = data.type ?? "obstacle";
    this.renderLayer = this.type === "ground_patch" ? "ground" : "occluder";
    this._normOffset = normOffset;
    this._backgroundImageBox2d = data.backgroundImageBox2d;
    this._pixelBBox =
      data.pixel_bbox &&
      Number.isFinite(data.pixel_bbox.x) &&
      Number.isFinite(data.pixel_bbox.y) &&
      Number.isFinite(data.pixel_bbox.w) &&
      Number.isFinite(data.pixel_bbox.h)
        ? {
            x: Number(data.pixel_bbox.x),
            y: Number(data.pixel_bbox.y),
            w: Number(data.pixel_bbox.w),
            h: Number(data.pixel_bbox.h),
          }
        : null;

    // Collision polygons (map v2) take precedence over AABB colliders.
    // Stored in local panel space; offset applied with visual bounds.
    this._polygonsLocal = normalizePolygons(data.collisionPolygons);
    this._polygons = this._polygonsLocal.map((poly) =>
      normOffset ? offsetPolygon(poly, normOffset.x, normOffset.y) : [...poly],
    );

    const explicitColliders = (data.collider ?? [])
      .map((entry) => parseBox2d(entry.box_2d))
      .filter((rect) => Number.isFinite(rect.x1));
    this._explicitCollidersLocal = explicitColliders;
    const hasExplicitCollider = explicitColliders.length > 0;
    const isGroundPatch = this.type === "ground_patch";
    const isBoundary = this.type.toLowerCase() === "boundary";
    this._usesImplicitBoundsCollider =
      !isGroundPatch && !isBoundary && this._polygonsLocal.length === 0;

    // Bed/soil decals paint behind the Y-sort queue so spawned crop tiles and
    // actors depth-sort with each other without fighting the combined bed sprite.
    this._obstacleInBackground = isGroundPatch;
    this._participatesInYSortBase = !isGroundPatch;
    this._suppressStaticVisuals =
      options.suppressStaticVisuals === true ||
      Boolean(data.spriteSheetUrl?.trim());
    this._suppressObstacleVisual = options.suppressObstacleVisual === true;
    this._collisionDisabled = false;
    this._visualSuppressed = false;

    const obstacleUrl = data.obstacleImage ?? data.croppedImageUrl ?? "";
    const backgroundUrl = data.backgroundImage?.trim() ?? "";
    const hasSplitLayers = Boolean(backgroundUrl && obstacleUrl);
    this._usesSplitColliderAnchor =
      hasSplitLayers && hasExplicitCollider && this._polygonsLocal.length === 0;

    // Initial bounds: from box_2d, or from pixel_bbox if map size already known.
    const mapW = options.mapPixelWidth;
    const mapH = options.mapPixelHeight;
    if (
      this._pixelBBox &&
      mapW != null &&
      mapH != null &&
      mapW > 0 &&
      mapH > 0
    ) {
      this._applyVisualBox2d(pixelBBoxToBox2d(this._pixelBBox, mapW, mapH));
    } else if (
      Array.isArray(data.box_2d) &&
      data.box_2d.length >= 4 &&
      data.box_2d.every((n) => Number.isFinite(Number(n)))
    ) {
      this._applyVisualBox2d(data.box_2d.map(Number));
    } else {
      // Pending pixel placement — invisible until resolveFromMapPixels.
      this._bounds = { x1: 0, y1: 0, x2: 0, y2: 0 };
      this._backgroundBounds = { x1: 0, y1: 0, x2: 0, y2: 0 };
      this._colliders = [];
      this.renderY = 0;
    }

    this._backgroundImage = null;
    this._obstacleImage = null;
    if (!this._suppressStaticVisuals) {
      if (backgroundUrl) {
        loadImage(backgroundUrl)
          .then((image) => {
            this._backgroundImage = image;
          })
          .catch(() => {
            this._backgroundImage = null;
          });
      }

      if (obstacleUrl && !this._suppressObstacleVisual) {
        loadImage(obstacleUrl)
          .then((image) => {
            this._obstacleImage = image;
          })
          .catch(() => {
            this._obstacleImage = null;
          });
      }
    }
  }

  /**
   * Resolve placement from `pixel_bbox` using the loaded map background size.
   * No-op for objects that already have explicit normalized `box_2d` only.
   */
  resolveFromMapPixels(mapWidth: number, mapHeight: number): void {
    if (!this._pixelBBox) return;
    if (!(mapWidth > 0) || !(mapHeight > 0)) return;
    this._applyVisualBox2d(
      pixelBBoxToBox2d(this._pixelBBox, mapWidth, mapHeight),
    );
  }

  /** Visual placement bounds in world-norm space. */
  getBounds(): Rect {
    return { ...this._bounds };
  }

  /**
   * Applied by `kind: "erase"` mapOverlays: hide the cut-out and stop blocking
   * movement because the obstacle was patched out of the map.
   */
  applyEraseOverwrite(): void {
    this._collisionDisabled = true;
    this._visualSuppressed = true;
    this._colliders = [];
  }

  /** @deprecated Use `applyEraseOverwrite`. */
  applyRemoveOverwrite(): void {
    this.applyEraseOverwrite();
  }

  private _applyVisualBox2d(box2d: number[]): void {
    let bounds = parseBox2d(box2d);
    let backgroundBounds = parseBox2d(
      this._backgroundImageBox2d ?? padBox2D(box2d),
    );

    if (this._normOffset) {
      const { x: dx, y: dy } = this._normOffset;
      bounds = offsetRect(bounds, dx, dy);
      backgroundBounds = offsetRect(backgroundBounds, dx, dy);
    }

    this._bounds = bounds;
    this._backgroundBounds = backgroundBounds;

    if (this._collisionDisabled) {
      this._colliders = [];
      this._polygons = this._polygonsLocal.map((poly) =>
        this._normOffset
          ? offsetPolygon(poly, this._normOffset.x, this._normOffset.y)
          : poly.map((p) => ({ ...p })),
      );
      this.renderY = this._bounds.y2;
      return;
    }

    // Re-apply colliders relative to resolved visual bounds.
    if (this._explicitCollidersLocal.length > 0) {
      this._colliders = this._normOffset
        ? this._explicitCollidersLocal.map((c) =>
            offsetRect(c, this._normOffset!.x, this._normOffset!.y),
          )
        : this._explicitCollidersLocal.map((c) => ({ ...c }));
    } else if (this._usesImplicitBoundsCollider) {
      this._colliders = [{ ...this._bounds }];
    } else {
      this._colliders = [];
    }

    // Polygons stay in normalized space (already offset at construct).
    this._polygons = this._polygonsLocal.map((poly) =>
      this._normOffset
        ? offsetPolygon(poly, this._normOffset.x, this._normOffset.y)
        : poly.map((p) => ({ ...p })),
    );

    if (this._usesSplitColliderAnchor && this._colliders.length > 0) {
      this.renderY =
        this._colliders.length > 1
          ? Math.min(...this._colliders.map((collider) => collider.y1))
          : this._colliders[0].y2;
    } else {
      this.renderY = this._bounds.y2;
    }
  }

  // ── Collision ────────────────────────────────────────────────────────────

  overlaps(rect: Rect): boolean {
    if (this._collisionDisabled) return false;
    if (this._polygons.length > 0) {
      return this._polygons.some((poly) => rectOverlapsPolygon(rect, poly));
    }
    return this._colliders.some((collider) => rectsOverlap(collider, rect));
  }

  getHoverTargetAt(x: number, y: number): HoverTarget | null {
    const point = {
      x1: x - 0.001,
      y1: y - 0.001,
      x2: x + 0.001,
      y2: y + 0.001,
    };
    if (!rectsOverlap(this._bounds, point)) {
      return null;
    }

    return {
      id: `map-object:${this.name}`,
      source: "map-object",
      label: this.name,
      tooltip: { title: this.name },
      type: this.type,
      bounds: { ...this._bounds },
      renderY: this.renderY,
      x,
      y,
    };
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  drawBackground(
    ctx: CanvasRenderingContext2D,
    _now?: number,
    worldNormW = NORM,
    worldNormH = NORM,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    if (this._visualSuppressed || this._suppressStaticVisuals) return;
    this._drawImageLayer(
      ctx,
      this._backgroundImage,
      this._backgroundBounds,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
    if (this._obstacleInBackground) {
      this._drawImageLayer(
        ctx,
        this._obstacleImage,
        this._bounds,
        worldNormW,
        worldNormH,
        worldPixelW,
        worldPixelH,
      );
    }
  }

  draw(
    ctx: CanvasRenderingContext2D,
    _now?: number,
    worldNormW = NORM,
    worldNormH = NORM,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    if (
      this._visualSuppressed ||
      this._suppressStaticVisuals ||
      this._suppressObstacleVisual ||
      this._obstacleInBackground
    )
      return;
    this._drawImageLayer(
      ctx,
      this._obstacleImage,
      this._bounds,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
  }

  private _drawImageLayer(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | null,
    bounds: Rect,
    worldNormW: number,
    worldNormH: number,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    if (!image?.complete || !image.naturalWidth) return;
    if (bounds.x2 <= bounds.x1 || bounds.y2 <= bounds.y1) return;

    const { x, y } = toPixel(
      bounds.x1,
      bounds.y1,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
    const { x: x2, y: y2 } = toPixel(
      bounds.x2,
      bounds.y2,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );

    const drawX = snapCanvasValue(x);
    const drawY = snapCanvasValue(y);
    const drawX2 = snapCanvasValue(x2);
    const drawY2 = snapCanvasValue(y2);

    ctx.drawImage(image, drawX, drawY, drawX2 - drawX, drawY2 - drawY);
  }

  drawDebug(
    ctx: CanvasRenderingContext2D,
    worldNormW = NORM,
    worldNormH = NORM,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    if (this._visualSuppressed || this._collisionDisabled) return;
    if (this._bounds.x2 <= this._bounds.x1 && this._bounds.y2 <= this._bounds.y1) {
      return;
    }

    ctx.save();
    ctx.font = "11px 'Geist Pixel', sans-serif";
    ctx.lineWidth = 2;

    // Visual placement bbox (pixel_bbox) — cyan outline.
    {
      const { x, y } = toPixel(
        this._bounds.x1,
        this._bounds.y1,
        worldNormW,
        worldNormH,
        worldPixelW,
        worldPixelH,
      );
      const { x: x2, y: y2 } = toPixel(
        this._bounds.x2,
        this._bounds.y2,
        worldNormW,
        worldNormH,
        worldPixelW,
        worldPixelH,
      );
      ctx.strokeStyle = "rgba(80, 200, 255, 0.9)";
      ctx.fillStyle = "rgba(80, 200, 255, 0.08)";
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x, y, x2 - x, y2 - y);
      ctx.fillRect(x, y, x2 - x, y2 - y);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(180, 230, 255, 0.95)";
      ctx.fillText(this.label, x + 4, y + 14);
    }

    // Collision — red polygons or AABB colliders.
    ctx.strokeStyle = "rgba(255, 50, 50, 0.85)";
    ctx.fillStyle = "rgba(255, 50, 50, 0.15)";

    if (this._polygons.length > 0) {
      for (const [index, poly] of this._polygons.entries()) {
        if (poly.length < 2) continue;
        ctx.beginPath();
        for (let i = 0; i < poly.length; i += 1) {
          const { x, y } = toPixel(
            poly[i].x,
            poly[i].y,
            worldNormW,
            worldNormH,
            worldPixelW,
            worldPixelH,
          );
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        if (index > 0) {
          const bounds = polygonBounds(poly);
          const { x: labelX, y: labelY } = toPixel(
            bounds.x1,
            bounds.y1,
            worldNormW,
            worldNormH,
            worldPixelW,
            worldPixelH,
          );
          ctx.fillStyle = "rgba(255,255,255,0.9)";
          ctx.fillText(`${this.label} (${index + 1})`, labelX + 4, labelY + 14);
          ctx.fillStyle = "rgba(255, 50, 50, 0.15)";
        }
      }
      ctx.restore();
      return;
    }

    for (const [index, collider] of this._colliders.entries()) {
      const { x, y } = toPixel(
        collider.x1,
        collider.y1,
        worldNormW,
        worldNormH,
        worldPixelW,
        worldPixelH,
      );
      const { x: x2, y: y2 } = toPixel(
        collider.x2,
        collider.y2,
        worldNormW,
        worldNormH,
        worldPixelW,
        worldPixelH,
      );

      ctx.strokeRect(x, y, x2 - x, y2 - y);
      ctx.fillRect(x, y, x2 - x, y2 - y);
      if (index > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.9)";
        ctx.fillText(`${this.label} (${index + 1})`, x + 4, y + 14);
        ctx.fillStyle = "rgba(255, 50, 50, 0.15)";
      }
    }

    ctx.restore();
  }
}
