import {
  loadImage,
  offsetRect,
  parseBox2d,
  snapCanvasValue,
  toPixel,
  NORM,
  type Rect,
} from "../utils/common";
import type { HoverTarget } from "./HoverTypes";
import type { RenderLayer } from "./renderSort";

interface MapEffectData {
  label?: string;
  mask_prompt?: string;
  type?: string;
  box_2d: number[];
  frame_count?: number | string;
  spriteSheetUrl: string;
  linkedColliderLabel?: string;
}

const FRAME_DURATION_MS = 100;

/**
 * Animated map effect sourced from a horizontal sprite sheet.
 * Supports looping background effects and one-shot gameplay effects.
 */
export default class MapEffectObject {
  label: string;
  type: string;
  renderY: number;
  readonly renderLayer: RenderLayer = "occluder";
  /** Mask label/name from linkedColliderLabel — used for Y-sort draw order. */
  linkedMaskKey?: string;
  private _bounds: Rect;
  private _frameCount: number;
  private _startedAt: number;
  private _image: HTMLImageElement | null;
  private _isPlaying: boolean;
  private _tags: Set<string>;

  constructor(
    data: MapEffectData,
    linkedRenderY?: number,
    normOffset?: { x: number; y: number },
    options: { defaultType?: string } = {},
  ) {
    this.label = data.label ?? data.mask_prompt ?? "map-effect";
    this.type = (data.type ?? options.defaultType ?? "gameplay").toLowerCase();
    const linkedKey = data.linkedColliderLabel?.trim();
    this.linkedMaskKey = linkedKey || undefined;
    this._bounds = parseBox2d(data.box_2d);

    if (normOffset) {
      this._bounds = offsetRect(this._bounds, normOffset.x, normOffset.y);
    }

    // Allow map-linked effects to share a mask's Y-sort anchor.
    this.renderY = linkedRenderY ?? this._bounds.y2;

    this._frameCount = Math.max(1, Number(data.frame_count) || 1);
    this._startedAt = performance.now();
    this._isPlaying = this.type === "background";
    this._tags = new Set(
      [this.label, data.mask_prompt]
        .filter((v): v is string => Boolean(v))
        .map((v) => v.toLowerCase()),
    );

    this._image = null;
    loadImage(data.spriteSheetUrl)
      .then((image) => {
        this._image = image;
      })
      .catch(() => {
        this._image = null;
      });
  }

  _getFrameIndex(now = performance.now()): number {
    if (!this._isPlaying) return 0;
    const elapsed = Math.max(0, now - this._startedAt);
    const rawIndex = Math.floor(elapsed / FRAME_DURATION_MS);

    if (this.type === "background") {
      return rawIndex % this._frameCount;
    }

    return Math.min(rawIndex, this._frameCount - 1);
  }

  play(now = performance.now(), restart = true): void {
    if (restart) this._startedAt = now;
    this._isPlaying = true;
  }

  matchesTag(tag: string): boolean {
    return this._tags.has(tag.trim().toLowerCase());
  }

  distanceSqTo(x: number, y: number): number {
    const cx = (this._bounds.x1 + this._bounds.x2) * 0.5;
    const cy = (this._bounds.y1 + this._bounds.y2) * 0.5;
    const dx = cx - x;
    const dy = cy - y;
    return dx * dx + dy * dy;
  }

  getHoverTargetAt(x: number, y: number): HoverTarget | null {
    const point = {
      x1: x - 0.001,
      y1: y - 0.001,
      x2: x + 0.001,
      y2: y + 0.001,
    };
    const inside =
      this._bounds.x1 < point.x2 &&
      this._bounds.x2 > point.x1 &&
      this._bounds.y1 < point.y2 &&
      this._bounds.y2 > point.y1;
    if (!inside) {
      return null;
    }

    return {
      id: `map-effect:${this.label}`,
      source: "map-effect",
      label: this.label,
      tooltip: { title: this.label, body: this.type },
      type: this.type,
      bounds: { ...this._bounds },
      renderY: this.renderY,
      x,
      y,
    };
  }

  draw(
    ctx: CanvasRenderingContext2D,
    now = performance.now(),
    worldNormW = NORM,
    worldNormH = NORM,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    if (!this._image?.complete || !this._image.naturalWidth) return;

    const frameWidth = this._image.naturalWidth / this._frameCount;
    const frameHeight = this._image.naturalHeight;
    const frameIndex = this._getFrameIndex(now);

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

    const drawX = snapCanvasValue(x);
    const drawY = snapCanvasValue(y);
    const drawX2 = snapCanvasValue(x2);
    const drawY2 = snapCanvasValue(y2);

    ctx.drawImage(
      this._image,
      frameIndex * frameWidth,
      0,
      frameWidth,
      frameHeight,
      drawX,
      drawY,
      drawX2 - drawX,
      drawY2 - drawY,
    );
  }

  drawDebug(
    ctx: CanvasRenderingContext2D,
    worldNormW = NORM,
    worldNormH = NORM,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
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

    ctx.save();
    ctx.strokeStyle = "rgba(80, 160, 255, 0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, x2 - x, y2 - y);

    ctx.fillStyle = "rgba(80, 160, 255, 0.12)";
    ctx.fillRect(x, y, x2 - x, y2 - y);

    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = "11px 'Geist Pixel', sans-serif";
    ctx.fillText(`${this.label} (${this.type})`, x + 4, y + 14);
    ctx.restore();
  }
}
