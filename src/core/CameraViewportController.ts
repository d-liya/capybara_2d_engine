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
   * Extra zoom applied on touch devices so the player isn't dwarfed by a
   * large panel. Has no effect on desktop.
   */
  followZoom?: number;
}

interface PlayerLike {
  x: number;
  y: number;
  _w: number;
  _h: number;
}

// Normalised coordinate space per panel.
const NORM = 1000;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isTouchPrimaryDevice(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0
  );
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
  cameraFollowEnabled: boolean;
  camera: Camera;
  viewport: Viewport;

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
    this.followZoom = followZoom;

    this.cameraFollowEnabled = false;
    this.camera = { x: 0, y: 0, zoom: 1 };
    this.viewport = {
      width: panelPixelWidth,
      height: panelPixelHeight,
      offsetX: 0,
      offsetY: 0,
      cssScale: 1,
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

    // Camera follow is needed when the world is wider/taller than one panel
    // (multi-panel map) OR when on a touch device (zoom + pan UX).
    const worldOverflows =
      this.worldPixelWidth > pw || this.worldPixelHeight > ph;
    const shouldFollow = isTouch || worldOverflows || this.edgePadding > 0;
    this.cameraFollowEnabled = shouldFollow;

    // In follow mode we use cover so the viewport window remains bounded and
    // camera travel reaches the real world edges on any aspect ratio.
    const rawScale = shouldFollow
      ? Math.max(vw / pw, vh / ph)
      : Math.min(vw / pw, vh / ph);
    const scale = Math.min(rawScale, this.maxViewportScale);

    // Touch gets an extra zoom-in; desktop multi-panel scrolls at zoom=1.
    const zoom = isTouch ? this.followZoom : 1;
    this.camera.zoom = zoom;

    // How many canvas pixels fit in the viewport at this scale.
    const visibleW = Math.min(pw, vw / scale);
    const visibleH = Math.min(ph, vh / scale);

    // In follow mode the visible window can be smaller than a panel due to
    // cover scaling and zoom; keep it centered in canvas space.
    const offsetX = shouldFollow ? (pw - visibleW) * 0.5 : 0;
    const offsetY = shouldFollow ? (ph - visibleH) * 0.5 : 0;

    this.viewport.width = visibleW;
    this.viewport.height = visibleH;
    this.viewport.offsetX = offsetX;
    this.viewport.offsetY = offsetY;
    this.viewport.cssScale = scale;

    this.canvas.width = pw;
    this.canvas.height = ph;
    this.canvas.style.width = `${Math.floor(pw * scale)}px`;
    this.canvas.style.height = `${Math.floor(ph * scale)}px`;

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

  updateForPlayer(player: PlayerLike): void {
    if (!this.cameraFollowEnabled) {
      this.camera.x = 0;
      this.camera.y = 0;
      this.camera.zoom = 1;
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
    this.camera.x = clamp(targetX, minX, maxX);
    this.camera.y = clamp(targetY, minY, maxY);
  }
}
