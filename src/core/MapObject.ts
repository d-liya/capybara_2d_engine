import {
  loadImage,
  offsetRect,
  parseBox2d,
  snapCanvasValue,
  toPixel,
  rectsOverlap,
  NORM,
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

interface MapObjectData {
  label: string;
  name?: string;
  box_2d: number[];
  /** Optional visual footprint for backgroundImage. Defaults to box_2d padded by 50%. */
  backgroundImageBox2d?: number[];
  collider: Array<{ box_2d: number[] }>;
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
}

/**
 * A single map obstacle.
 *
 * Coordinate contract
 * -------------------
 * All stored values (bounds, collider) are in the 0-1000 normalised space.
 * Pixel conversion happens only inside draw() / drawDebug().
 *
 * Public surface
 * --------------
 * .renderY          – Y-sort anchor; collider base for split-layer masks, else bounds bottom
 * .participatesInYSort – false for ground_patch (drawn in drawBackground only)
 * .overlaps(rect)   – AABB test against a normalised {x1,y1,x2,y2} rect
 * .drawBackground(ctx) – render the mask backgroundImage layer (behind Y-sort)
 * .draw(ctx)           – render the obstacleImage sprite
 * .drawDebug(ctx)      – render collider outline (red) + label
 */
export default class MapObject {
  label: string;
  name: string;
  type: string;
  renderY: number;
  /** Draw layer for Y-sort: crop beds and similar map decals sort behind spawned props. */
  readonly renderLayer: RenderLayer;
  /** When false, obstacle art is drawn only in drawBackground (not the Y-sort queue). */
  readonly participatesInYSort: boolean;
  private _bounds: Rect;
  private _backgroundBounds: Rect;
  private _colliders: Rect[];
  private _obstacleInBackground: boolean;
  private _suppressStaticVisuals: boolean;
  private _suppressObstacleVisual: boolean;
  private _backgroundImage: HTMLImageElement | null;
  private _obstacleImage: HTMLImageElement | null;

  constructor(
    data: MapObjectData,
    normOffset?: { x: number; y: number },
    options: MapObjectOptions = {},
  ) {
    this.label = data.label;
    this.name = data.name ?? data.label;
    this.type = data.type ?? "obstacle";
    this.renderLayer = this.type === "ground_patch" ? "ground" : "occluder";

    // Obstacle visual footprint — derived from the top-level mask's box_2d.
    this._bounds = parseBox2d(data.box_2d);
    // Background/shadow crops are generated from a padded obstacle box. Prefer
    // explicit generator bounds when present; otherwise mirror that 50% padding
    // at render time so backgroundImage occupies the space it was cropped from.
    this._backgroundBounds = parseBox2d(
      data.backgroundImageBox2d ?? padBox2D(data.box_2d),
    );

    // Collision footprint — honor every explicit collider segment.
    const explicitColliders = data.collider
      .map((entry) => parseBox2d(entry.box_2d))
      .filter((rect) => Number.isFinite(rect.x1));
    const hasExplicitCollider = explicitColliders.length > 0;
    const isGroundPatch = this.type === "ground_patch";
    const isBoundary = this.type.toLowerCase() === "boundary";
    const usesImplicitBoundsCollider = !isGroundPatch && !isBoundary;
    this._colliders = hasExplicitCollider
      ? explicitColliders
      : usesImplicitBoundsCollider
        ? [this._bounds]
        : [];
    // Bed/soil decals paint behind the Y-sort queue so spawned crop tiles and
    // actors depth-sort with each other without fighting the combined bed sprite.
    this._obstacleInBackground = isGroundPatch;
    this.participatesInYSort = !isGroundPatch;
    this._suppressStaticVisuals =
      options.suppressStaticVisuals === true ||
      Boolean(data.spriteSheetUrl?.trim());
    this._suppressObstacleVisual = options.suppressObstacleVisual === true;

    // Y-sort anchor: split-layer masks sort at the collider base because the
    // obstacle sprite excludes the shadow that lives in backgroundImage.
    const obstacleUrl = data.obstacleImage ?? data.croppedImageUrl ?? "";
    const backgroundUrl = data.backgroundImage?.trim() ?? "";
    const hasSplitLayers = Boolean(backgroundUrl && obstacleUrl);
    const usesSplitColliderAnchor = hasSplitLayers && hasExplicitCollider;
    const splitColliderAnchor = usesSplitColliderAnchor
      ? this._colliders.length > 1
        ? Math.min(...this._colliders.map((collider) => collider.y1))
        : this._colliders[0].y2
      : null;
    this.renderY =
      splitColliderAnchor !== null ? splitColliderAnchor : this._bounds.y2;

    // Shift coords into world-norm space when this object belongs to an
    // extension panel placed at a non-zero offset relative to the base panel.
    if (normOffset) {
      const { x: dx, y: dy } = normOffset;
      this._bounds = offsetRect(this._bounds, dx, dy);
      this._backgroundBounds = offsetRect(this._backgroundBounds, dx, dy);
      this._colliders = hasExplicitCollider
        ? this._colliders.map((collider) => offsetRect(collider, dx, dy))
        : usesImplicitBoundsCollider
          ? [this._bounds]
          : [];
      this.renderY = usesSplitColliderAnchor
        ? this._colliders.length > 1
          ? Math.min(...this._colliders.map((collider) => collider.y1))
          : this._colliders[0].y2
        : this._bounds.y2;
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

  // ── Collision ────────────────────────────────────────────────────────────

  overlaps(rect: Rect): boolean {
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
    if (this._suppressStaticVisuals) return;
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
    if (this._colliders.length === 0) return;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 50, 50, 0.85)";
    ctx.lineWidth = 2;
    ctx.fillStyle = "rgba(255, 50, 50, 0.15)";
    ctx.font = "11px 'Geist Pixel', sans-serif";

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
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillText(
        index === 0 ? this.label : `${this.label} (${index + 1})`,
        x + 4,
        y + 14,
      );
      ctx.fillStyle = "rgba(255, 50, 50, 0.15)";
    }

    ctx.restore();
  }
}
