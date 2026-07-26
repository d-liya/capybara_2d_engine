export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export interface Viewport {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  cssScale: number;
  /** Backing-store scale (`min(devicePixelRatio, 2)`). Gameplay math stays in logical panel pixels. */
  devicePixelRatio: number;
}

interface CameraControllerOptions {
  /**
   * Pixel size of ONE panel — used as the canvas drawing buffer size and the
   * CSS scale basis. Stays constant regardless of how many panels exist.
   */
  panelPixelWidth: number;
  panelPixelHeight: number;
  /**
   * Full world pixel extent (all panels combined). Used for camera clamping.
   * Defaults to panel size (single-panel map).
   */
  worldPixelWidth?: number;
  worldPixelHeight?: number;
  /**
   * Extra screen-space padding in pixels to keep visible around the world.
   * When non-zero, camera follow is enabled even for maps smaller than one
   * panel so the player can drift past the real edge and see the backdrop.
   */
  edgePadding?: number;
  /**
   * Upper bound for CSS canvas scaling. Keeping this near 1 prevents generated
   * ~1k map/art assets from being magnified on very large screens.
   */
  maxViewportScale?: number;
  /**
   * Camera zoom while following so the player is not dwarfed by a full panel.
   * Applied on both desktop and touch when follow is active. Default `1.45`.
   */
  followZoom?: number;
  /**
   * Soft-follow stiffness (higher = snappier). Frame-rate independent via
   * `1 - exp(-followLerp * dt)`. Default `10`. Pass a very large value (e.g.
   * `1000`) for near-instant lock.
   */
  followLerp?: number;
}

interface PlayerLike {
  x: number;
  y: number;
  _w: number;
  _h: number;
}

// Normalised coordinate space per panel.
const NORM = 1000;
const DEFAULT_FOLLOW_LERP = 10;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * True touch / phone UX only. Do not use `maxTouchPoints` alone — macOS
 * trackpads report touch points and were incorrectly getting cover layout.
 */
function isTouchPrimaryDevice(): boolean {
  return window.matchMedia("(pointer: coarse)").matches;
}

export default class CameraViewportController {
  canvas: HTMLCanvasElement;
  panelPixelWidth: number;
  panelPixelHeight: number;
  worldPixelWidth: number;
  worldPixelHeight: number;
  edgePadding: number;
  maxViewportScale: number;
  followZoom: number;
  /** Soft-follow stiffness; see constructor options. */
  followLerp: number;
  cameraFollowEnabled: boolean;
  camera: Camera;
  viewport: Viewport;
  /** Snap on the first follow frame so the camera does not ease in from origin. */
  private _followInitialized: boolean;

  constructor(
    canvas: HTMLCanvasElement,
    {
      panelPixelWidth,
      panelPixelHeight,
      worldPixelWidth,
      worldPixelHeight,
      edgePadding = 0,
      maxViewportScale = 1,
      followZoom = 1.45,
      followLerp = DEFAULT_FOLLOW_LERP,
    }: CameraControllerOptions,
  ) {
    this.canvas = canvas;
    this.panelPixelWidth = panelPixelWidth;
    this.panelPixelHeight = panelPixelHeight;
    this.worldPixelWidth = worldPixelWidth ?? panelPixelWidth;
    this.worldPixelHeight = worldPixelHeight ?? panelPixelHeight;
    this.edgePadding = Math.max(0, edgePadding);
    this.maxViewportScale =
      Number.isFinite(maxViewportScale) && maxViewportScale > 0
        ? maxViewportScale
        : Number.POSITIVE_INFINITY;
    this.followZoom =
      Number.isFinite(followZoom) && followZoom > 0 ? followZoom : 1.45;
    this.followLerp =
      Number.isFinite(followLerp) && followLerp > 0
        ? followLerp
        : DEFAULT_FOLLOW_LERP;

    this.cameraFollowEnabled = false;
    this._followInitialized = false;
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.viewport = {
      width: panelPixelWidth,
      height: panelPixelHeight,
      offsetX: 0,
      offsetY: 0,
      cssScale: 1,
      devicePixelRatio: 1,
    };

    this.canvas.width = panelPixelWidth;
    this.canvas.height = panelPixelHeight;
  }

  resize(): void {
    const vp = window.visualViewport;
    const vw = Math.max(1, Math.floor(vp?.width ?? window.innerWidth));
    const vh = Math.max(1, Math.floor(vp?.height ?? window.innerHeight));

    const isTouch = isTouchPrimaryDevice();
    const pw = this.panelPixelWidth;
    const ph = this.panelPixelHeight;

    // Camera follow when the world is wider/taller than one panel, on a real
    // touch phone, OR when edge padding is requested (desktop Maps preview
    // keeps follow + cover so the camera can drift with cameraEdgePadding).
    const worldOverflows =
      this.worldPixelWidth > pw || this.worldPixelHeight > ph;
    const shouldFollow = isTouch || worldOverflows || this.edgePadding > 0;
    if (!shouldFollow) {
      this._followInitialized = false;
    }
    this.cameraFollowEnabled = shouldFollow;

    // Follow mode uses cover so the viewport stays filled while the camera moves.
    const rawScale = shouldFollow
      ? Math.max(vw / pw, vh / ph)
      : Math.min(vw / pw, vh / ph);
    let scale = Math.min(rawScale, this.maxViewportScale);

    // Prefer integer downscales (1/2, 1/3, …) when close — sharper CSS resample.
    if (scale > 0 && scale < 1) {
      const inv = 1 / scale;
      const nearest = Math.round(inv);
      if (nearest >= 2 && Math.abs(inv - nearest) / nearest <= 0.04) {
        scale = 1 / nearest;
      }
    }

    // Closer framing whenever the camera follows (desktop + touch).
    const zoom = shouldFollow ? this.followZoom : 1;
    this.camera.zoom = zoom;

    const visibleW = Math.min(pw, vw / scale);
    const visibleH = Math.min(ph, vh / scale);

    const offsetX = shouldFollow ? (pw - visibleW) * 0.5 : 0;
    const offsetY = shouldFollow ? (ph - visibleH) * 0.5 : 0;

    const dpr = Math.min(
      Math.max(1, window.devicePixelRatio || 1),
      2,
    );

    this.viewport.width = visibleW;
    this.viewport.height = visibleH;
    this.viewport.offsetX = offsetX;
    this.viewport.offsetY = offsetY;
    this.viewport.cssScale = scale;
    this.viewport.devicePixelRatio = dpr;

    this.canvas.width = Math.max(1, Math.floor(pw * dpr));
    this.canvas.height = Math.max(1, Math.floor(ph * dpr));

    // Preserve panel aspect exactly (independent floor on W/H skewed CSS size).
    const cssW = Math.max(1, Math.round(pw * scale));
    const cssH = Math.max(1, Math.round(cssW * (ph / pw)));
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.viewport.cssScale = cssW / pw;

    const shell = this.canvas.parentElement;
    if (shouldFollow) {
      this.canvas.style.position = "absolute";
      this.canvas.style.left = "50%";
      this.canvas.style.top = "50%";
      this.canvas.style.transform = "translate(-50%, -50%)";
      if (shell) {
        shell.style.width = `${vw}px`;
        shell.style.height = `${vh}px`;
        shell.style.overflow = "hidden";
      }
      return;
    }

    this.canvas.style.position = "";
    this.canvas.style.left = "";
    this.canvas.style.top = "";
    this.canvas.style.transform = "";
    if (shell) {
      shell.style.width = "";
      shell.style.height = "";
      shell.style.overflow = "";
    }
  }

  updateForPlayer(player: PlayerLike, dt = 1 / 60): void {
    if (!this.cameraFollowEnabled) {
      this.camera.x = 0;
      this.camera.y = 0;
      this.camera.zoom = 1;
      this._followInitialized = false;
      return;
    }

    const view = this.viewport;
    const zoom = this.camera.zoom;
    const edgePadding = this.edgePadding;

    // Convert world-norm position to world-pixel position.
    // 1000 norm units = one panel = panelPixelWidth pixels.
    const focusWorldX = player.x + player._w * 0.5;
    const focusWorldY = player.y + player._h * 0.6;
    const px = (focusWorldX / NORM) * this.panelPixelWidth;
    const py = (focusWorldY / NORM) * this.panelPixelHeight;

    const targetX = view.offsetX + view.width * 0.5 - px * zoom;
    const targetY = view.offsetY + view.height * 0.5 - py * zoom;

    // Clamp so the world can drift inside a padded frame instead of stopping
    // flush against the viewport edge.
    const minX =
      view.offsetX + view.width - this.worldPixelWidth * zoom - edgePadding;
    const minY =
      view.offsetY + view.height - this.worldPixelHeight * zoom - edgePadding;
    const maxX = view.offsetX + edgePadding;
    const maxY = view.offsetY + edgePadding;
    const clampedX = clamp(targetX, minX, maxX);
    const clampedY = clamp(targetY, minY, maxY);

    const safeDt = Number.isFinite(dt) && dt > 0 ? Math.min(dt, 0.1) : 1 / 60;
    const alpha = this._followInitialized
      ? 1 - Math.exp(-this.followLerp * safeDt)
      : 1;

    this.camera.x = this.camera.x + (clampedX - this.camera.x) * alpha;
    this.camera.y = this.camera.y + (clampedY - this.camera.y) * alpha;
    this._followInitialized = true;
  }
}
