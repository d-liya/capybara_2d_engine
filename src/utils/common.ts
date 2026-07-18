// All game logic runs in a 0-1000 normalised coordinate space.
// The canvas can be any pixel size — conversion happens only at draw time.
export const NORM = 1000;

/** Default pixel size of one map panel (matches GameMap / camera). */
export const DEFAULT_PANEL_PIXEL_WIDTH = 2508;
export const DEFAULT_PANEL_PIXEL_HEIGHT = 1672;

export interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * Map normalised coords → world pixel coords (full stitched map extent).
 * The canvas is a viewport; camera transform pans world pixels on screen.
 */
export function toPixel(
  nx: number,
  ny: number,
  worldNormWidth = NORM,
  worldNormHeight = NORM,
  worldPixelWidth?: number,
  worldPixelHeight?: number,
): { x: number; y: number } {
  const pw =
    worldPixelWidth ?? (worldNormWidth / NORM) * DEFAULT_PANEL_PIXEL_WIDTH;
  const ph =
    worldPixelHeight ?? (worldNormHeight / NORM) * DEFAULT_PANEL_PIXEL_HEIGHT;
  return {
    x: (nx / worldNormWidth) * pw,
    y: (ny / worldNormHeight) * ph,
  };
}

/** Snap visual canvas coordinates without changing gameplay/world positions. */
export function snapCanvasValue(value: number): number {
  return Math.round(value);
}

export function offsetRect(rect: Rect, dx: number, dy: number): Rect {
  return {
    x1: rect.x1 + dx,
    y1: rect.y1 + dy,
    x2: rect.x2 + dx,
    y2: rect.y2 + dy,
  };
}

export function parseBox2d(box2d: number[]): Rect {
  if (box2d.length !== 4 || box2d.some((n) => !Number.isFinite(n))) {
    throw new Error(
      "Invalid box_2d: expected [y_min, x_min, y_max, x_max] with 4 numbers",
    );
  }

  const [y1, x1, y2, x2] = box2d;
  return { x1, y1, x2, y2 };
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

export function rectContainedBy(inner: Rect, outer: Rect): boolean {
  return (
    inner.x1 >= outer.x1 &&
    inner.y1 >= outer.y1 &&
    inner.x2 <= outer.x2 &&
    inner.y2 <= outer.y2
  );
}

/** 2D point in normalized map space. */
export interface Point {
  x: number;
  y: number;
}

/** Axis-aligned bounds of a polygon (empty poly → zero rect at origin). */
export function polygonBounds(polygon: Point[]): Rect {
  if (polygon.length === 0) {
    return { x1: 0, y1: 0, x2: 0, y2: 0 };
  }
  let x1 = polygon[0].x;
  let y1 = polygon[0].y;
  let x2 = polygon[0].x;
  let y2 = polygon[0].y;
  for (let i = 1; i < polygon.length; i += 1) {
    const p = polygon[i];
    if (p.x < x1) x1 = p.x;
    if (p.y < y1) y1 = p.y;
    if (p.x > x2) x2 = p.x;
    if (p.y > y2) y2 = p.y;
  }
  return { x1, y1, x2, y2 };
}

export function offsetPoint(point: Point, dx: number, dy: number): Point {
  return { x: point.x + dx, y: point.y + dy };
}

export function offsetPolygon(polygon: Point[], dx: number, dy: number): Point[] {
  return polygon.map((p) => offsetPoint(p, dx, dy));
}

/** Ray-cast point-in-polygon (even-odd fill rule). */
export function pointInPolygon(point: Point, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x;
    const yi = polygon[i].y;
    const xj = polygon[j].x;
    const yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function orientation(a: Point, b: Point, c: Point): number {
  return (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
}

function onSegment(a: Point, b: Point, c: Point): boolean {
  return (
    Math.min(a.x, b.x) <= c.x &&
    c.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= c.y &&
    c.y <= Math.max(a.y, b.y)
  );
}

/** True when segments ab and cd properly intersect or touch. */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 === 0 && onSegment(a, b, c)) return true;
  if (o2 === 0 && onSegment(a, b, d)) return true;
  if (o3 === 0 && onSegment(c, d, a)) return true;
  if (o4 === 0 && onSegment(c, d, b)) return true;

  return (
    (o1 > 0) !== (o2 > 0) &&
    (o3 > 0) !== (o4 > 0) &&
    o1 !== 0 &&
    o2 !== 0 &&
    o3 !== 0 &&
    o4 !== 0
  );
}

/**
 * True when an axis-aligned rect overlaps a polygon (vertex-in, edge cross, or containment).
 */
export function rectOverlapsPolygon(rect: Rect, polygon: Point[]): boolean {
  if (polygon.length < 3) return false;

  const bounds = polygonBounds(polygon);
  if (!rectsOverlap(rect, bounds)) return false;

  const corners: Point[] = [
    { x: rect.x1, y: rect.y1 },
    { x: rect.x2, y: rect.y1 },
    { x: rect.x2, y: rect.y2 },
    { x: rect.x1, y: rect.y2 },
  ];

  // Any rect corner inside the polygon.
  for (const corner of corners) {
    if (pointInPolygon(corner, polygon)) return true;
  }

  // Any polygon vertex inside the rect.
  for (const vertex of polygon) {
    if (
      vertex.x >= rect.x1 &&
      vertex.x <= rect.x2 &&
      vertex.y >= rect.y1 &&
      vertex.y <= rect.y2
    ) {
      return true;
    }
  }

  // Edge intersections (handles partial overlaps with no contained vertices).
  const rectEdges: Array<[Point, Point]> = [
    [corners[0], corners[1]],
    [corners[1], corners[2]],
    [corners[2], corners[3]],
    [corners[3], corners[0]],
  ];
  for (let i = 0; i < polygon.length; i += 1) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    for (const [c, d] of rectEdges) {
      if (segmentsIntersect(a, b, c, d)) return true;
    }
  }

  // Polygon fully contains the rect (already covered by corners) or rect fully
  // contains the polygon (covered by vertex-in-rect). Done.
  return false;
}

type ImageCrossOrigin = "" | "anonymous" | "use-credentials" | null;

interface LoadImageOptions {
  crossOrigin?: ImageCrossOrigin;
  useCache?: boolean;
}

const imagePromiseCache = new Map<string, Promise<HTMLImageElement>>();

export async function loadImage(
  url: string,
  options: LoadImageOptions = {},
): Promise<HTMLImageElement> {
  const { crossOrigin = null, useCache = true } = options;
  const cacheKey = `${url}::${crossOrigin ?? "none"}`;

  if (useCache) {
    const cached = imagePromiseCache.get(cacheKey);
    if (cached) return cached;
  }

  const promise = new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (crossOrigin !== null) img.crossOrigin = crossOrigin;

    img.onload = () => resolve(img);
    img.onerror = () => {
      imagePromiseCache.delete(cacheKey);
      reject(new Error(`Failed to load image: ${url}`));
    };

    img.src = url;
    if (img.complete && img.naturalWidth > 0) resolve(img);
  });

  if (useCache) imagePromiseCache.set(cacheKey, promise);
  return promise;
}

/**
 * Recursively walks any JSON-parsed value and collects every string assigned
 * to a key named "url", then fires off background image loads so they land in
 * the image promise cache before they're needed.
 */
const PRELOAD_URL_KEYS = new Set([
  "url",
  "backgroundImage",
  "obstacleImage",
  "croppedImageUrl",
  "spriteSheetUrl",
  "spriteUrl",
  "sprite_overlay",
]);

function collectUrls(value: unknown, out: string[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (PRELOAD_URL_KEYS.has(k) && typeof v === "string" && v.length > 0) {
        out.push(v);
      } else {
        collectUrls(v, out);
      }
    }
  }
}

/**
 * Accepts pre-parsed JSON data objects, extracts every "url" value found
 * anywhere in their structure, and starts loading the images in the background
 * so they land in the image cache before they're needed.
 * Errors are silently swallowed — this is purely a warming operation.
 */
export function preloadDataAssets(dataFiles: unknown[]): void {
  const urls: string[] = [];
  for (const data of dataFiles) collectUrls(data, urls);
  const imageUrls = urls.filter((url) =>
    /\.(png|jpe?g|gif|bmp|webp|svg)$/.test(url),
  );
  Promise.allSettled(imageUrls.map((url) => loadImage(url)));
}

export function setupOrientationReload() {
  const isTouchDevice =
    window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0;
  if (!isTouchDevice) return;

  let hasReloaded = false;
  const reloadForOrientation = () => {
    if (hasReloaded) return;
    hasReloaded = true;
    window.setTimeout(() => {
      window.location.reload();
    }, 120);
  };

  window.addEventListener("orientationchange", reloadForOrientation);
}

import {
  createCoreLoadingGate,
  LOADING_GATE_CONTINUE_EVENT,
  type LoadingGate,
  type LoadingGateContinueDetail,
  type LoadingGateContinueListener,
} from "../core/LoadingGate";

export { LOADING_GATE_CONTINUE_EVENT };
export type {
  LoadingGate,
  LoadingGateContinueDetail,
  LoadingGateContinueListener,
};

export function createLoadingGate(
  canvas: HTMLCanvasElement | null,
  options: Record<string, unknown> = {},
): LoadingGate {
  return createCoreLoadingGate(canvas, options);
}
