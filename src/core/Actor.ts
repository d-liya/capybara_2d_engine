import {
  loadImage,
  snapCanvasValue,
  toPixel,
  NORM,
  type Rect,
} from "../utils/common";
import type { RenderLayer } from "./renderSort";

export interface SpriteSheet {
  name: string;
  url: string;
  frame_count?: number | string;
  width?: number;
  height?: number;
}

interface SpriteTrim {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface Animation {
  image: HTMLImageElement | null;
  frameCount: number;
  trim: SpriteTrim | null;
}

export interface SpriteConfig {
  label?: string;
  spriteSheets?: SpriteSheet[];
  mapWidth?: number;
  mapHeight?: number;
}

interface ActorOptions {
  speed?: number;
  frameDurationMs?: number;
  animationTransitionMs?: number;
  activeAnimation?: string;
}

export interface GameMap {
  checkCollision(rect: Rect): boolean;
}

// ── Default actor dimensions (normalised 0-1000 space) ───────────────────
const DEFAULT_W = 26; // sprite width
const DEFAULT_H = 72; // sprite height
const FOOT_INSET_RATIO = 6 / 26; // feet are narrower than shoulders
const FOOT_H_RATIO = 1 / 9; // only the bottom slice triggers collisions
const DEFAULT_SPEED = 180; // normalized map units per second
const DEFAULT_FRAME_DURATION_MS = 100;
const DEFAULT_TRANSITION_MS = 0;
const DEFAULT_MAP_WIDTH_PX = 2508;
const DEFAULT_MAP_HEIGHT_PX = 1672;

/**
 * Reusable world actor base class.
 *
 * Shared behavior:
 * - sprite-sheet animation setup and playback
 * - collision-aware movement via foot collider
 * - render sorting anchor (renderY)
 * - sprite/shadow/debug rendering
 */
export default class Actor {
  x: number;
  y: number;
  public _w: number;
  public _h: number;
  protected _speed: number;
  protected _frameDurationMs: number;
  protected _animations: Record<string, Animation>;
  protected _idleAnimKey: string;
  protected _moveAnimKey: string;
  protected _activeAnimation: string;
  protected _animStartedAt: number;
  protected _animationTransitionMs: number;
  protected _isMoving: boolean;
  protected _facingX: number;

  constructor(
    x: number,
    y: number,
    sprite: SpriteConfig = {},
    options: ActorOptions = {},
  ) {
    this._speed =
      Number.isFinite(options.speed) && options.speed > 0
        ? options.speed
        : DEFAULT_SPEED;
    this._frameDurationMs =
      Number.isFinite(options.frameDurationMs) && options.frameDurationMs > 0
        ? options.frameDurationMs
        : DEFAULT_FRAME_DURATION_MS;
    this._animationTransitionMs =
      Number.isFinite(options.animationTransitionMs) &&
      options.animationTransitionMs > 0
        ? options.animationTransitionMs
        : DEFAULT_TRANSITION_MS;

    this.x = x;
    this.y = y;

    this._animations = {};
    this._idleAnimKey = "idle";
    this._moveAnimKey = "idle";
    this._activeAnimation = "idle";
    this._animStartedAt = performance.now();
    this._isMoving = false;
    this._facingX = 1;
    this._configureSpriteSheets(sprite, options.activeAnimation);
  }

  private _configureSpriteSheets(
    sprite: SpriteConfig = {},
    activeAnimation?: string,
  ): void {
    const sheets = Array.isArray(sprite.spriteSheets)
      ? sprite.spriteSheets
      : [];

    this._animations = {};
    for (const sheet of sheets) {
      const key = this._normalizeAnimationKey(sheet.name);
      this._animations[key] = this._buildAnimation(sheet);
    }

    const allKeys = Object.keys(this._animations);
    this._idleAnimKey =
      allKeys.find((k) => k.includes("default_animation")) ??
      allKeys[0] ??
      "idle";
    this._moveAnimKey =
      allKeys.find((k) => k.includes("walk") || k.includes("run")) ??
      this._idleAnimKey;

    const mapWidth = Number(sprite.mapWidth);
    const mapHeight = Number(sprite.mapHeight);
    const firstSheet = sheets[0];
    const widthPx = Number(firstSheet?.width);
    const heightPx = Number(firstSheet?.height);
    const baseMapWidth =
      Number.isFinite(mapWidth) && mapWidth > 0
        ? mapWidth
        : DEFAULT_MAP_WIDTH_PX;
    const baseMapHeight =
      Number.isFinite(mapHeight) && mapHeight > 0
        ? mapHeight
        : DEFAULT_MAP_HEIGHT_PX;

    this._w =
      Number.isFinite(widthPx) && widthPx > 0
        ? (widthPx / baseMapWidth) * 1000
        : DEFAULT_W;
    this._h =
      Number.isFinite(heightPx) && heightPx > 0
        ? (heightPx / baseMapHeight) * 1000
        : DEFAULT_H;

    this._activeAnimation =
      this._resolveAnimationKey(activeAnimation) ?? this._idleAnimKey;
    this._animStartedAt = performance.now();
  }

  private _normalizeAnimationKey(name: string | undefined): string {
    return String(name ?? "")
      .trim()
      .toLowerCase();
  }

  private _resolveAnimationKey(name: string | undefined): string | null {
    const normalized = this._normalizeAnimationKey(name);
    if (!normalized) return null;
    if (this._animations[normalized]) return normalized;
    return (
      Object.keys(this._animations).find((key) => key.includes(normalized)) ??
      null
    );
  }

  private _transitionToAnimation(
    animationName: string,
    _transitionMs = this._animationTransitionMs,
  ): void {
    const nextAnimation = this._resolveAnimationKey(animationName);
    if (!nextAnimation || nextAnimation === this._activeAnimation) {
      return;
    }

    this._activeAnimation = nextAnimation;
    this._animStartedAt = performance.now();
  }

  /** Spawned actors sort in the prop layer (above map ground_patch decals). */
  get renderLayer(): RenderLayer {
    return "prop";
  }

  /** Y-sort anchor — uses trimmed sprite feet when available. */
  get renderY(): number {
    const anim = this._animations?.[this._activeAnimation];
    const bottom = anim?.trim?.bottom ?? 1;
    return this.y + bottom * this._h;
  }

  setAnimationTransitionMs(durationMs: number): void {
    this._animationTransitionMs =
      Number.isFinite(durationMs) && durationMs > 0 ? durationMs : 0;
  }

  setSpeed(speed: number): void {
    if (Number.isFinite(speed) && speed > 0) {
      this._speed = speed;
    }
  }

  setSize(width?: number, height?: number): void {
    if (Number.isFinite(width) && width > 0) {
      this._w = width;
    }
    if (Number.isFinite(height) && height > 0) {
      this._h = height;
    }
  }

  setActiveAnimation(animationName: string, transitionMs?: number): void {
    this._transitionToAnimation(animationName, transitionMs);
  }

  setSpriteSheets(
    sprite: SpriteConfig,
    options: { activeAnimation?: string; transitionMs?: number } = {},
  ): void {
    this._configureSpriteSheets(sprite, options.activeAnimation);
  }

  _buildAnimation(sheet: SpriteSheet | undefined): Animation {
    if (!sheet || !sheet.url) {
      return { image: null, frameCount: 1, trim: null };
    }

    const frameCount = Math.max(1, Number(sheet.frame_count) || 1);
    const anim: Animation = { image: null, frameCount, trim: null };

    loadImage(sheet.url, { crossOrigin: "anonymous" })
      .then((image) => {
        anim.image = image;
        anim.trim = this._measureTrimmedFrame(image, frameCount);
      })
      .catch(() => {
        anim.image = null;
        anim.trim = null;
      });

    return anim;
  }

  _measureTrimmedFrame(
    image: HTMLImageElement,
    frameCount: number,
  ): SpriteTrim | null {
    const fw = Math.floor(image.naturalWidth / frameCount);
    const fh = image.naturalHeight;
    if (fw <= 0 || fh <= 0) return null;

    try {
      const oc = document.createElement("canvas");
      oc.width = fw;
      oc.height = fh;
      const octx = oc.getContext("2d", { willReadFrequently: true });
      octx.drawImage(image, 0, 0, fw, fh, 0, 0, fw, fh);

      const data = octx.getImageData(0, 0, fw, fh).data;
      let minX = fw;
      let maxX = 0;
      let minY = fh;
      let maxY = 0;
      for (let py = 0; py < fh; py++) {
        for (let px = 0; px < fw; px++) {
          const alpha = data[(py * fw + px) * 4 + 3];
          if (alpha > 8) {
            if (px < minX) minX = px;
            if (px > maxX) maxX = px;
            if (py < minY) minY = py;
            if (py > maxY) maxY = py;
          }
        }
      }

      if (maxX < minX) return null;
      return {
        left: minX / fw,
        right: (maxX + 1) / fw,
        top: minY / fh,
        bottom: (maxY + 1) / fh,
      };
    } catch {
      return null;
    }
  }

  _footAt(x: number, y: number): Rect {
    const anim = this._animations?.[this._activeAnimation];
    const trim = anim?.trim;
    const footH = Math.max(6, this._h * FOOT_H_RATIO);

    if (trim) {
      const x1 = x + trim.left * this._w;
      const x2 = x + trim.right * this._w;
      const y2 = y + trim.bottom * this._h;
      return { x1, y1: y2 - footH, x2, y2 };
    }

    const footInset = Math.max(2, this._w * FOOT_INSET_RATIO);
    return {
      x1: x + footInset,
      y1: y + this._h - footH,
      x2: x + this._w - footInset,
      y2: y + this._h,
    };
  }

  get facingX(): number {
    return this._facingX;
  }

  setFacingX(facingX: number): void {
    if (facingX < 0) this._facingX = -1;
    if (facingX > 0) this._facingX = 1;
  }

  _setMovementState(dx: number, dy: number): void {
    this._isMoving = dx !== 0 || dy !== 0;
    const nextAnimation = this._isMoving
      ? this._moveAnimKey
      : this._idleAnimKey;
    if (nextAnimation !== this._activeAnimation) {
      this._transitionToAnimation(nextAnimation);
    }

    if (dx > 0) this._facingX = 1;
    if (dx < 0) this._facingX = -1;
  }

  moveByDirection(
    dx: number,
    dy: number,
    map: GameMap | null,
    dt: number,
  ): void {
    this._setMovementState(dx, dy);

    // _speed is normalized map units per second; multiply by dt once so
    // controlled actor movement matches custom gameplay systems. Normalize
    // diagonal input so moving diagonally is not ~41% faster than straight.
    const magnitude = Math.hypot(dx, dy) || 1;
    const nx = this.x + (dx / magnitude) * this._speed * dt;
    const ny = this.y + (dy / magnitude) * this._speed * dt;

    if (map && typeof map.checkCollision === "function") {
      // Test each axis independently so actors slide along walls.
      if (!map.checkCollision(this._footAt(nx, this.y))) this.x = nx;
      if (!map.checkCollision(this._footAt(this.x, ny))) this.y = ny;

      if (
        map.checkCollision(this._footAt(this.x, this.y)) &&
        (dx !== 0 || dy !== 0)
      ) {
        this._tryNudgeOutOfCollision(map, dx, dy, dt);
      }
    } else {
      this.x = nx;
      this.y = ny;
    }
  }

  private _tryNudgeOutOfCollision(
    map: GameMap,
    dx: number,
    dy: number,
    dt: number,
  ): void {
    const step = this._speed * dt;
    const directions: Array<{ x: number; y: number }> = [];

    if (dx !== 0 || dy !== 0) {
      const magnitude = Math.hypot(dx, dy) || 1;
      directions.push({
        x: (dx / magnitude) * step,
        y: (dy / magnitude) * step,
      });
    }

    for (const [offsetX, offsetY] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ]) {
      directions.push({ x: offsetX * step, y: offsetY * step });
    }

    for (const direction of directions) {
      const nextX = this.x + direction.x;
      const nextY = this.y + direction.y;
      if (!map.checkCollision(this._footAt(nextX, nextY))) {
        this.x = nextX;
        this.y = nextY;
        return;
      }
    }
  }

  _getFrameIndex(now = performance.now()): number {
    const animation = this._animations[this._activeAnimation];
    if (!animation) return 0;

    const elapsed = Math.max(0, now - this._animStartedAt);
    return Math.floor(elapsed / this._frameDurationMs) % animation.frameCount;
  }

  _drawShadow(
    ctx: CanvasRenderingContext2D,
    worldNormW = NORM,
    worldNormH = NORM,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    const anim = this._animations[this._activeAnimation];
    const trim = anim?.trim;

    let worldX1;
    let worldX2;
    let worldBottom;
    if (trim) {
      worldX1 = this.x + trim.left * this._w;
      worldX2 = this.x + trim.right * this._w;
      worldBottom = this.y + trim.bottom * this._h;
    } else {
      const foot = this._footAt(this.x, this.y);
      worldX1 = foot.x1;
      worldX2 = foot.x2;
      worldBottom = foot.y2;
    }

    const { x: px1 } = toPixel(
      worldX1,
      worldBottom,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
    const { x: px2 } = toPixel(
      worldX2,
      worldBottom,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
    const { y: py } = toPixel(
      worldX1,
      worldBottom,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );

    const cx = (px1 + px2) / 2;
    const cy = py;
    const rx = (px2 - px1) / 2;
    const ry = Math.max(2, rx * 0.18);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
    grad.addColorStop(0, "rgba(0,0,0,0.30)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.restore();
  }

  private _drawAnimationFrame(
    ctx: CanvasRenderingContext2D,
    animation: Animation,
    frameIndex: number,
    x: number,
    y: number,
    dw: number,
    dh: number,
    facingX = this._facingX,
  ): boolean {
    const image = animation?.image;
    if (!image?.complete || !image.naturalWidth) {
      return false;
    }

    const frameWidth = image.naturalWidth / animation.frameCount;
    const frameHeight = image.naturalHeight;

    ctx.save();
    if (facingX < 0) {
      ctx.translate(x + dw, y);
      ctx.scale(-1, 1);
      ctx.drawImage(
        image,
        frameIndex * frameWidth,
        0,
        frameWidth,
        frameHeight,
        0,
        0,
        dw,
        dh,
      );
    } else {
      ctx.drawImage(
        image,
        frameIndex * frameWidth,
        0,
        frameWidth,
        frameHeight,
        x,
        y,
        dw,
        dh,
      );
    }
    ctx.restore();
    return true;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    now = performance.now(),
    worldNormW = NORM,
    worldNormH = NORM,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    const { x, y } = toPixel(
      this.x,
      this.y,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
    const { x: x2, y: y2 } = toPixel(
      this.x + this._w,
      this.y + this._h,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
    const drawX = snapCanvasValue(x);
    const drawY = snapCanvasValue(y);
    const drawX2 = snapCanvasValue(x2);
    const drawY2 = snapCanvasValue(y2);
    const dw = drawX2 - drawX;
    const dh = drawY2 - drawY;

    const animation = this._animations[this._activeAnimation];
    const image = animation?.image;
    if (!image?.complete || !image.naturalWidth) {
      return;
    }

    this._drawShadow(ctx, worldNormW, worldNormH, worldPixelW, worldPixelH);

    const currentFrame = this._getFrameIndex(now);
    this._drawAnimationFrame(
      ctx,
      animation,
      currentFrame,
      drawX,
      drawY,
      dw,
      dh,
      this._facingX,
    );
  }

  drawDebug(
    ctx: CanvasRenderingContext2D,
    worldNormW = NORM,
    worldNormH = NORM,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    const f = this._footAt(this.x, this.y);
    const { x, y } = toPixel(
      f.x1,
      f.y1,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
    const { x: x2, y: y2 } = toPixel(
      f.x2,
      f.y2,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );

    ctx.save();
    ctx.strokeStyle = "rgba(255, 255, 0, 0.9)";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, x2 - x, y2 - y);
    ctx.fillStyle = "rgba(255, 255, 0, 0.15)";
    ctx.fillRect(x, y, x2 - x, y2 - y);
    ctx.restore();

    const anim = this._animations[this._activeAnimation];
    const trim = anim?.trim;
    if (trim) {
      const tx1 = this.x + trim.left * this._w;
      const ty1 = this.y + trim.top * this._h;
      const tx2 = this.x + trim.right * this._w;
      const ty2 = this.y + trim.bottom * this._h;
      const { x: tpx1, y: tpy1 } = toPixel(
        tx1,
        ty1,
        worldNormW,
        worldNormH,
        worldPixelW,
        worldPixelH,
      );
      const { x: tpx2, y: tpy2 } = toPixel(
        tx2,
        ty2,
        worldNormW,
        worldNormH,
        worldPixelW,
        worldPixelH,
      );

      ctx.save();
      ctx.strokeStyle = "rgba(0, 220, 255, 0.9)";
      ctx.lineWidth = 2;
      ctx.strokeRect(tpx1, tpy1, tpx2 - tpx1, tpy2 - tpy1);
      ctx.fillStyle = "rgba(0, 220, 255, 0.06)";
      ctx.fillRect(tpx1, tpy1, tpx2 - tpx1, tpy2 - tpy1);
      ctx.restore();
    }
  }
}
