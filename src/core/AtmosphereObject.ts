import {
  loadImage,
  parseBox2d,
  snapCanvasValue,
  toPixel,
  NORM,
  type Rect,
} from "../utils/common";

export type AtmosphereKind = "flyer" | "drift";
export type AtmosphereMotion = "drift" | "orbit" | "rise_loop";
export type AtmosphereParallaxLayer = "far" | "near";

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
  layer?: AtmosphereParallaxLayer | string;
  motion?: AtmosphereMotion | string;
  speedX?: number;
  speedY?: number;
  wrap?: boolean;
  amplitude?: number;
  lifetimeSec?: number;
  enabled?: boolean;
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

function resolveMotion(
  entry: AtmosphereEntry,
): AtmosphereMotion | "flyer_legacy" {
  const raw =
    typeof entry.motion === "string" ? entry.motion.trim().toLowerCase() : "";
  if (raw === "drift" || raw === "orbit" || raw === "rise_loop") return raw;
  const kind = String(entry.kind ?? "drift").toLowerCase();
  // Legacy flyer ≈ cross-map drift with flip; legacy drift ≈ soft orbit bob.
  if (kind === "flyer") return "flyer_legacy";
  return "orbit";
}

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
  private _motion: AtmosphereMotion | "flyer_legacy";
  private _speedX: number;
  private _speedY: number;
  private _wrap: boolean;
  private _amplitude: number;
  private _lifetimeSec: number;
  private _layer: AtmosphereParallaxLayer;
  private _alpha = 1;

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
    this._motion = resolveMotion(data);
    this._speedX =
      typeof data.speedX === "number" && Number.isFinite(data.speedX)
        ? data.speedX
        : 0;
    this._speedY =
      typeof data.speedY === "number" && Number.isFinite(data.speedY)
        ? data.speedY
        : 0;
    this._wrap = data.wrap !== false;
    this._amplitude =
      typeof data.amplitude === "number" && Number.isFinite(data.amplitude)
        ? Math.max(0, data.amplitude)
        : 0.08;
    this._lifetimeSec =
      typeof data.lifetimeSec === "number" &&
      Number.isFinite(data.lifetimeSec) &&
      data.lifetimeSec > 0
        ? data.lifetimeSec
        : 4;
    this._layer = data.layer === "near" ? "near" : "far";

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
    const height = Math.max(1, this._home.y2 - this._home.y1);
    this._alpha = 1;
    this._flipX = false;

    if (this._motion === "flyer_legacy") {
      const travel = elapsed * FLYER_SPEED_NORM;
      const span = Math.max(width, NORM * 0.35);
      const cycle = ((travel % (span * 2)) + span * 2) % (span * 2);
      let xOff: number;
      if (cycle <= span) {
        xOff = cycle - span * 0.5;
      } else {
        xOff = span * 1.5 - cycle;
        this._flipX = this.supportsFlipX;
      }
      const yOff =
        Math.sin(elapsed * 1.1 + this._phase) * BOB_AMPLITUDE_NORM * 0.6;
      return { x: xOff, y: yOff };
    }

    if (this._motion === "orbit") {
      const ampX = width * this._amplitude;
      const ampY = height * this._amplitude;
      const speedScale = this._layer === "far" ? 0.7 : 1;
      const sx =
        (Math.abs(this._speedX) > 1e-6 ? Math.abs(this._speedX) * NORM : 0.6) *
        speedScale;
      const sy =
        (Math.abs(this._speedY) > 1e-6 ? Math.abs(this._speedY) * NORM : 0.45) *
        speedScale;
      return {
        x: Math.sin(elapsed * sx + this._phase) * ampX,
        y: Math.sin(elapsed * sy + this._phase * 1.3) * ampY,
      };
    }

    if (this._motion === "rise_loop") {
      const life = this._lifetimeSec;
      const t = (elapsed % life) / life;
      const rise =
        typeof this._speedY === "number" && Math.abs(this._speedY) > 1e-6
          ? -Math.abs(this._speedY) * NORM * t * life
          : -height * (0.8 + this._amplitude) * t;
      const driftX =
        (typeof this._speedX === "number" ? this._speedX : 0) *
        NORM *
        t *
        life;
      // Fade in, hold, fade out.
      if (t < 0.15) this._alpha = t / 0.15;
      else if (t > 0.75) this._alpha = Math.max(0, (1 - t) / 0.25);
      else this._alpha = 1;
      return { x: driftX, y: rise };
    }

    // drift: cross the map; honor wrap + speedX/speedY (map-width fraction / sec)
    const sx =
      Math.abs(this._speedX) > 1e-6
        ? this._speedX * NORM
        : this.kind === "flyer"
          ? FLYER_SPEED_NORM
          : DRIFT_SPEED_NORM;
    const sy =
      Math.abs(this._speedY) > 1e-6 ? this._speedY * NORM : 0;
    let xOff = elapsed * sx;
    let yOff =
      elapsed * sy +
      Math.sin(elapsed * 0.7 + this._phase) * BOB_AMPLITUDE_NORM * 0.5;

    if (this._wrap) {
      const spanX = NORM + width;
      xOff = ((xOff % spanX) + spanX) % spanX;
      if (xOff > NORM) xOff -= spanX;
      // Start from left of home so travel crosses the map.
      xOff = xOff - this._home.x1;
      if (sx < 0) this._flipX = this.supportsFlipX;
    } else {
      // Soft ping-pong inside a wide band when wrap is off.
      const span = Math.max(width, NORM * 0.45);
      const travel = Math.abs(xOff);
      const cycle = ((travel % (span * 2)) + span * 2) % (span * 2);
      if (cycle <= span) {
        xOff = (sx >= 0 ? 1 : -1) * (cycle - span * 0.5);
      } else {
        xOff = (sx >= 0 ? 1 : -1) * (span * 1.5 - cycle);
        this._flipX = this.supportsFlipX;
      }
      yOff =
        Math.sin(elapsed * 0.7 + this._phase * 1.3) * BOB_AMPLITUDE_NORM;
    }

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
    ctx.globalAlpha = cfg.opacity * this._alpha;
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
    if (this._alpha <= 0.01) return;

    const layerScale = this._layer === "far" ? 0.92 : 1;
    const x1 = this._home.x1 + offset.x;
    const y1 = this._home.y1 + offset.y;
    const x2 = this._home.x2 + offset.x;
    const y2 = this._home.y2 + offset.y;
    const cx = (x1 + x2) / 2;
    const cy = (y1 + y2) / 2;
    const halfW = ((x2 - x1) / 2) * layerScale;
    const halfH = ((y2 - y1) / 2) * layerScale;

    const { x, y } = toPixel(
      cx - halfW,
      cy - halfH,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
    const { x: px2, y: py2 } = toPixel(
      cx + halfW,
      cy + halfH,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );

    const drawX = snapCanvasValue(x);
    const drawY = snapCanvasValue(y);
    const drawW = snapCanvasValue(px2) - drawX;
    const drawH = snapCanvasValue(py2) - drawY;

    ctx.save();
    ctx.globalAlpha = this._alpha;

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
    ctx.restore();
  }
}
