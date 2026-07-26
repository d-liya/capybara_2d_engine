import {
  loadImage,
  parseBox2d,
  snapCanvasValue,
  toPixel,
  NORM,
  type Rect,
} from "../utils/common";

export type AtmosphereKind = "flyer" | "drift";

export interface AtmosphereEntry {
  placementId?: string;
  assetId?: string;
  label?: string;
  box_2d: number[];
  url?: string;
  spriteSheetUrl?: string;
  kind?: AtmosphereKind | string;
  supportsFlipX?: boolean;
  frameCount?: number;
  frame_count?: number;
  frameWidth?: number;
  frame_w?: number;
  frameHeight?: number;
  frame_h?: number;
}

const FRAME_DURATION_MS = 100;
const DRIFT_SPEED_NORM = 8;
const FLYER_SPEED_NORM = 28;
const BOB_AMPLITUDE_NORM = 4;

/** Scaled silhouette under the sprite (visual only — no collision). */
const SHADOW = {
  flyer: {
    scaleX: 1.55,
    scaleY: 0.58,
    offsetYFactor: 0.42,
    opacity: 0.22,
  },
  drift: {
    scaleX: 1.4,
    scaleY: 0.5,
    offsetYFactor: 0.28,
    opacity: 0.14,
  },
} as const;

/**
 * Floating sky-layer sprite (cloud / bird / balloon).
 * Drawn in a dedicated pass after the world Y-sort queue.
 */
export default class AtmosphereObject {
  label: string;
  kind: AtmosphereKind;
  readonly supportsFlipX: boolean;
  private _home: Rect;
  private _frameCount: number;
  private _startedAt: number;
  private _image: HTMLImageElement | null;
  private _flipX = false;
  private _phase: number;

  constructor(data: AtmosphereEntry) {
    this.label =
      data.label?.trim() ||
      data.placementId?.trim() ||
      data.assetId?.trim() ||
      "atmosphere";
    const rawKind = String(data.kind ?? "drift").toLowerCase();
    this.kind = rawKind === "flyer" ? "flyer" : "drift";
    this.supportsFlipX = data.supportsFlipX !== false;
    this._home = parseBox2d(data.box_2d);
    this._frameCount = Math.max(
      1,
      Number(data.frameCount ?? data.frame_count) || 1,
    );
    this._startedAt = performance.now();
    this._phase = Math.random() * Math.PI * 2;
    this._image = null;

    const sheetUrl = data.spriteSheetUrl?.trim() || data.url?.trim();
    if (sheetUrl) {
      loadImage(sheetUrl)
        .then((image) => {
          this._image = image;
        })
        .catch(() => {
          this._image = null;
        });
    }
  }

  private _getFrameIndex(now: number): number {
    if (this._frameCount <= 1) return 0;
    const elapsed = Math.max(0, now - this._startedAt);
    return Math.floor(elapsed / FRAME_DURATION_MS) % this._frameCount;
  }

  private _motionOffset(now: number): { x: number; y: number } {
    const elapsed = Math.max(0, (now - this._startedAt) / 1000);
    const width = Math.max(1, this._home.x2 - this._home.x1);

    if (this.kind === "flyer") {
      const travel = elapsed * FLYER_SPEED_NORM;
      const span = Math.max(width, NORM * 0.35);
      const cycle = ((travel % (span * 2)) + span * 2) % (span * 2);
      let xOff: number;
      if (cycle <= span) {
        xOff = cycle - span * 0.5;
        this._flipX = false;
      } else {
        xOff = span * 1.5 - cycle;
        this._flipX = this.supportsFlipX;
      }
      const yOff =
        Math.sin(elapsed * 1.1 + this._phase) * BOB_AMPLITUDE_NORM * 0.6;
      return { x: xOff, y: yOff };
    }

    // drift: slow scroll + gentle bob within / around the placement box
    const xOff =
      Math.sin(elapsed * (DRIFT_SPEED_NORM / Math.max(40, width)) + this._phase) *
      (width * 0.35);
    const yOff =
      Math.sin(elapsed * 0.7 + this._phase * 1.3) * BOB_AMPLITUDE_NORM;
    return { x: xOff, y: yOff };
  }

  private _drawFrame(
    ctx: CanvasRenderingContext2D,
    frameIndex: number,
    frameWidth: number,
    frameHeight: number,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
  ): void {
    if (!this._image) return;
    ctx.save();
    if (this._flipX) {
      ctx.translate(drawX + drawW, drawY);
      ctx.scale(-1, 1);
      ctx.drawImage(
        this._image,
        frameIndex * frameWidth,
        0,
        frameWidth,
        frameHeight,
        0,
        0,
        drawW,
        drawH,
      );
    } else {
      ctx.drawImage(
        this._image,
        frameIndex * frameWidth,
        0,
        frameWidth,
        frameHeight,
        drawX,
        drawY,
        drawW,
        drawH,
      );
    }
    ctx.restore();
  }

  /**
   * Soft scaled silhouette of the current frame, drawn under the sprite.
   * Uses brightness(0) so opaque pixels become black while alpha is kept.
   */
  private _drawSilhouetteShadow(
    ctx: CanvasRenderingContext2D,
    frameIndex: number,
    frameWidth: number,
    frameHeight: number,
    drawX: number,
    drawY: number,
    drawW: number,
    drawH: number,
  ): void {
    const cfg = SHADOW[this.kind];
    const cx = drawX + drawW / 2;
    const cy = drawY + drawH / 2;
    const offsetY = drawH * cfg.offsetYFactor;

    ctx.save();
    ctx.globalAlpha = cfg.opacity;
    ctx.filter = "brightness(0)";
    ctx.translate(cx, cy + offsetY);
    ctx.scale(cfg.scaleX, cfg.scaleY);
    ctx.translate(-cx, -cy);
    this._drawFrame(
      ctx,
      frameIndex,
      frameWidth,
      frameHeight,
      drawX,
      drawY,
      drawW,
      drawH,
    );
    ctx.restore();
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
    const offset = this._motionOffset(now);

    const x1 = this._home.x1 + offset.x;
    const y1 = this._home.y1 + offset.y;
    const x2 = this._home.x2 + offset.x;
    const y2 = this._home.y2 + offset.y;

    const { x, y } = toPixel(
      x1,
      y1,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
    const { x: px2, y: py2 } = toPixel(
      x2,
      y2,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );

    const drawX = snapCanvasValue(x);
    const drawY = snapCanvasValue(y);
    const drawW = snapCanvasValue(px2) - drawX;
    const drawH = snapCanvasValue(py2) - drawY;

    this._drawSilhouetteShadow(
      ctx,
      frameIndex,
      frameWidth,
      frameHeight,
      drawX,
      drawY,
      drawW,
      drawH,
    );

    this._drawFrame(
      ctx,
      frameIndex,
      frameWidth,
      frameHeight,
      drawX,
      drawY,
      drawW,
      drawH,
    );
  }
}
