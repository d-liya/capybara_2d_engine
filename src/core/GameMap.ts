import MapObject from "./MapObject";
import MapEffectObject from "./MapEffectObject";
import MapOverlayObject, { type MapOverlayEntry } from "./MapOverlayObject";
import {
  loadImage,
  parseBox2d,
  rectContainedBy,
  rectsOverlap,
  snapCanvasValue,
  toPixel,
  offsetRect,
  NORM,
  type Rect,
} from "../utils/common";
import type {
  HoverTarget,
  MapOverlayTarget,
  MapPlacementTarget,
} from "./HoverTypes";
import type { RenderSortable } from "./renderSort";

interface WalkableBox {
  box_2d: Box2D;
  label?: string;
}

interface SpriteSheetEntry {
  placementMode?: string; // "replace" | "overlay"
  linkedColliderLabel?: string | undefined;
  label: string;
  mask_prompt: string;
  type: string;
  spriteSheetUrl: string;
  frame_count: number;
  box_2d: number[];
}

export type Box2D = [number, number, number, number] | number[];

interface MapMaskCollider {
  box_2d: Box2D;
  label: string;
}

interface MapMaskEntry {
  label: string;
  name?: string;
  box_2d: Box2D;
  backgroundImageBox2d?: Box2D;
  collider: MapMaskCollider[];
  backgroundImage?: string;
  obstacleImage?: string;
  spriteSheetUrl?: string;
  frame_count?: number;
  /** background (loop) or gameplay (triggered). Defaults to background. */
  spriteSheetType?: string;
  type?: string;
}

interface PlacementEntry {
  id: string;
  element_name?: string;
  placement_type?: string;
  contents?: string;
  reasoning?: string;
  grid_dimensions?: number[];
  bounding_box?: number[];
  box_2d: Box2D;
}

export type CardinalDirection = "north" | "south" | "east" | "west";

/** Grid-cell delta for each direction. Each panel is one 1000-unit cell. */
const DIRECTION_GRID: Record<CardinalDirection, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east: { dx: 1, dy: 0 },
  west: { dx: -1, dy: 0 },
};

/** One directional extension — can itself carry further extensions. */
export interface MapExtension {
  direction: CardinalDirection;
  panel: MapPanelData;
}

/** Grouped payload for one panel's map content. */
export interface MapPanelContent {
  url: string;
  masks?: MapMaskEntry[];
  spriteSheets?: SpriteSheetEntry[];
  walkableBoxes?: WalkableBox[];
  placement?: PlacementEntry[];
  mapOverlays?: MapOverlayEntry[];
}

/**
 * Per-panel data. Extensions are recursive: a panel can itself have
 * extensions, allowing chains of any depth (e.g. east → east-east → east-east-east).
 */
export interface MapPanelData {
  /** Grouped shape for panel-specific fields. */
  panel: MapPanelContent;
  /** Panels stitched to this panel in the given direction. */
  extensions?: MapExtension[];
}

export interface MapData extends MapPanelData {
  name?: string;
  panel: MapPanelContent & { masks: MapMaskEntry[] };
  /**
   * Pixel dimensions of a single panel. Determines the total canvas size when
   * panels are stitched together. Defaults to 2508 × 1672.
   */
  panelPixelWidth?: number;
  panelPixelHeight?: number;
}

// Default panel pixel size — matches the existing Game.ts MAP_WIDTH / MAP_HEIGHT.
const DEFAULT_PANEL_PIXEL_WIDTH = 2508;
const DEFAULT_PANEL_PIXEL_HEIGHT = 1672;
const EDGE_EPS = 0.01;
const OVERLAY_MASK_REPLACE_EDGE_TOLERANCE = 18;
const OVERLAY_MASK_REPLACE_IOU_THRESHOLD = 0.82;

function rectArea(rect: Rect): number {
  return Math.max(0, rect.x2 - rect.x1) * Math.max(0, rect.y2 - rect.y1);
}

function rectIntersectionArea(a: Rect, b: Rect): number {
  const x1 = Math.max(a.x1, b.x1);
  const y1 = Math.max(a.y1, b.y1);
  const x2 = Math.min(a.x2, b.x2);
  const y2 = Math.min(a.y2, b.y2);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

/**
 * Map overlays are authored as stateful replacements for map-baked props. When
 * an overlay state's box nearly matches a mask box, treat the overlay as the
 * prop/object visual owner. The caller suppresses only the mask obstacle image
 * for this case, keeping the generated background/shadow image intact.
 */
function boxesCloseEnoughForOverlayReplacement(
  maskBox: Box2D,
  overlayBox: Box2D,
): boolean {
  const mask = parseBox2d(maskBox);
  const overlay = parseBox2d(overlayBox);

  const edgesClose =
    Math.abs(mask.x1 - overlay.x1) <= OVERLAY_MASK_REPLACE_EDGE_TOLERANCE &&
    Math.abs(mask.y1 - overlay.y1) <= OVERLAY_MASK_REPLACE_EDGE_TOLERANCE &&
    Math.abs(mask.x2 - overlay.x2) <= OVERLAY_MASK_REPLACE_EDGE_TOLERANCE &&
    Math.abs(mask.y2 - overlay.y2) <= OVERLAY_MASK_REPLACE_EDGE_TOLERANCE;
  if (edgesClose) return true;

  const intersection = rectIntersectionArea(mask, overlay);
  if (intersection <= 0) return false;

  const union = rectArea(mask) + rectArea(overlay) - intersection;
  return (
    union > 0 && intersection / union >= OVERLAY_MASK_REPLACE_IOU_THRESHOLD
  );
}

function maskKeysForOverlayLink(mask: MapMaskEntry): string[] {
  return [mask.label, mask.name]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());
}

function overlayLinksToMask(
  overlay: MapOverlayEntry,
  mask: MapMaskEntry,
): boolean {
  const linkedLabel = overlay.linkedObstacleLabel?.trim();
  if (
    linkedLabel &&
    maskKeysForOverlayLink(mask).some((key) => key === linkedLabel)
  ) {
    return true;
  }

  return overlay.states.some((state) =>
    boxesCloseEnoughForOverlayReplacement(mask.box_2d, state.box_2d),
  );
}

function maskHasCloseMapOverlay(
  mask: MapMaskEntry,
  overlays: MapOverlayEntry[],
): boolean {
  if (mask.type?.toLowerCase() === "boundary") return false;

  return overlays.some((overlay) => overlayLinksToMask(overlay, mask));
}

interface BackgroundPanel {
  image: HTMLImageElement | null;
  /** Top-left corner of this panel in world-norm space. */
  normX: number;
  normY: number;
}

/**
 * GameMap owns the background image(s), all MapObjects, and the walkable areas
 * for one level. A level may consist of multiple image panels stitched together
 * in any cardinal direction via the `extensions` field on MapData.
 *
 * Coordinate contract
 * -------------------
 * All stored values (object bounds, colliders, walkable boxes) are in the
 * world-norm space: 0 – worldNormWidth × 0 – worldNormHeight.
 * Each panel occupies exactly 1000 × 1000 norm units.
 * The canvas is sized to worldPixelWidth × worldPixelHeight.
 *
 * Public surface
 * --------------
 * .worldPixelWidth / .worldPixelHeight  – total canvas size for camera init
 * .worldNormWidth  / .worldNormHeight   – total norm extent (for toPixel calls)
 * .checkCollision(rect)  – true if rect should be blocked
 * .drawBackground(ctx)   – renders map url and mask backgroundImages
 * .getRenderables()      – returns MapObject[] + map spritesheets for Y-sort queue
 * .drawDebug(ctx)        – renders obstacle colliders + walkable area outlines
 */
export default class GameMap {
  private _backgroundPanels: BackgroundPanel[];
  private _objects: MapObject[];
  private _mapSprites: MapEffectObject[];
  private _placements: MapPlacementTarget[];
  private _overlays: MapOverlayObject[];
  private _walkable: Rect[];

  readonly panelPixelWidth: number;
  readonly panelPixelHeight: number;
  readonly worldPixelWidth: number;
  readonly worldPixelHeight: number;
  readonly worldNormWidth: number;
  readonly worldNormHeight: number;

  constructor(mapData: MapData) {
    const panelPixelWidth =
      mapData.panelPixelWidth ?? DEFAULT_PANEL_PIXEL_WIDTH;
    const panelPixelHeight =
      mapData.panelPixelHeight ?? DEFAULT_PANEL_PIXEL_HEIGHT;
    this.panelPixelWidth = panelPixelWidth;
    this.panelPixelHeight = panelPixelHeight;

    // ── Resolve all panels into grid cells (BFS, supports recursive chaining) ─
    type Cell = { data: MapPanelData; gridX: number; gridY: number };
    const cells: Cell[] = [];
    const queue: Cell[] = [{ data: mapData, gridX: 0, gridY: 0 }];
    while (queue.length > 0) {
      const cell = queue.shift()!;
      cells.push(cell);
      for (const ext of cell.data.extensions ?? []) {
        const { dx, dy } = DIRECTION_GRID[ext.direction];
        queue.push({
          data: ext.panel,
          gridX: cell.gridX + dx,
          gridY: cell.gridY + dy,
        });
      }
    }

    // Normalise so the minimum grid coords become (0, 0).
    const minGridX = Math.min(...cells.map((c) => c.gridX));
    const minGridY = Math.min(...cells.map((c) => c.gridY));
    const maxGridX = Math.max(...cells.map((c) => c.gridX));
    const maxGridY = Math.max(...cells.map((c) => c.gridY));

    const numCols = maxGridX - minGridX + 1;
    const numRows = maxGridY - minGridY + 1;

    this.worldNormWidth = numCols * NORM;
    this.worldNormHeight = numRows * NORM;
    this.worldPixelWidth = numCols * panelPixelWidth;
    this.worldPixelHeight = numRows * panelPixelHeight;

    // ── Build per-panel objects ──────────────────────────────────────────────
    this._backgroundPanels = [];
    this._objects = [];
    this._mapSprites = [];
    this._placements = [];
    this._overlays = [];
    this._walkable = [];

    const wnw = this.worldNormWidth;
    const wnh = this.worldNormHeight;

    for (const cell of cells) {
      const panel = cell.data.panel;
      const normX = (cell.gridX - minGridX) * NORM;
      const normY = (cell.gridY - minGridY) * NORM;
      const normOffset =
        normX !== 0 || normY !== 0 ? { x: normX, y: normY } : undefined;

      // Background image panel
      const bgPanel: BackgroundPanel = { image: null, normX, normY };
      loadImage(panel.url)
        .then((img) => {
          bgPanel.image = img;
        })
        .catch(() => {
          bgPanel.image = null;
        });
      this._backgroundPanels.push(bgPanel);

      const spriteSheetData = panel.spriteSheets ?? [];
      const mapOverlayData = panel.mapOverlays ?? [];
      /** Masks whose static art is replaced by a linked spritesheet (placementMode: replace). */
      const replaceLinkedMaskKeys = new Set<string>();
      for (const sheet of spriteSheetData) {
        const key = sheet.linkedColliderLabel?.trim();
        if (!key) continue;
        const mode = sheet.placementMode ?? "replace";
        if (mode === "replace") replaceLinkedMaskKeys.add(key);
      }

      const panelObjects = (panel.masks ?? []).map((mask) => {
        const keys = [mask.label, mask.name]
          .filter((v): v is string => Boolean(v?.trim()))
          .map((v) => v.trim());
        const replacedByCloseMapOverlay = maskHasCloseMapOverlay(
          mask,
          mapOverlayData,
        );
        const suppressStaticVisuals =
          Boolean(mask.spriteSheetUrl?.trim()) ||
          keys.some((key) => replaceLinkedMaskKeys.has(key));
        const suppressObstacleVisual = replacedByCloseMapOverlay;
        return new MapObject(mask, normOffset, {
          suppressStaticVisuals,
          suppressObstacleVisual,
        });
      });
      this._objects.push(...panelObjects);

      const objectRenderYByKey = new Map<string, number>();
      for (const obj of panelObjects) {
        objectRenderYByKey.set(obj.label, obj.renderY);
        if (obj.name !== obj.label) {
          objectRenderYByKey.set(obj.name, obj.renderY);
        }
      }

      const resolveLinkedRenderY = (linkedKey?: string): number | undefined => {
        const key = linkedKey?.trim();
        if (!key) return undefined;
        return objectRenderYByKey.get(key);
      };

      const maskSortAnchors = (panel.masks ?? []).map((mask, index) => {
        const rawBounds = parseBox2d(mask.box_2d);
        const bounds = normOffset
          ? offsetRect(rawBounds, normOffset.x, normOffset.y)
          : rawBounds;
        return {
          bounds,
          renderY: panelObjects[index]?.renderY ?? bounds.y2,
          area:
            Math.max(0, bounds.x2 - bounds.x1) *
            Math.max(0, bounds.y2 - bounds.y1),
        };
      });

      const inferRenderYFromOverlappingMask = (
        box: Box2D,
      ): number | undefined => {
        const rawBounds = parseBox2d(box);
        const bounds = normOffset
          ? offsetRect(rawBounds, normOffset.x, normOffset.y)
          : rawBounds;
        const centerX = (bounds.x1 + bounds.x2) * 0.5;
        const centerY = (bounds.y1 + bounds.y2) * 0.5;
        const containing = maskSortAnchors
          .filter(
            (anchor) =>
              centerX >= anchor.bounds.x1 &&
              centerX <= anchor.bounds.x2 &&
              centerY >= anchor.bounds.y1 &&
              centerY <= anchor.bounds.y2,
          )
          .sort((a, b) => a.area - b.area)[0];
        if (containing) return containing.renderY;

        const overlapping = maskSortAnchors
          .filter((anchor) => rectsOverlap(anchor.bounds, bounds))
          .sort((a, b) => a.area - b.area)[0];
        return overlapping?.renderY;
      };

      const panelMapEffects: MapEffectObject[] = [];

      for (const mask of panel.masks ?? []) {
        const spriteSheetUrl = mask.spriteSheetUrl?.trim();
        if (!spriteSheetUrl) continue;

        const linkedRenderY =
          resolveLinkedRenderY(mask.label) ??
          resolveLinkedRenderY(mask.name) ??
          undefined;

        panelMapEffects.push(
          new MapEffectObject(
            {
              label: mask.label,
              mask_prompt: mask.name,
              type: mask.spriteSheetType,
              box_2d: mask.box_2d,
              frame_count: mask.frame_count,
              spriteSheetUrl,
              linkedColliderLabel: mask.label,
            },
            linkedRenderY,
            normOffset,
            { defaultType: "background" },
          ),
        );
      }

      for (const sheet of spriteSheetData) {
        panelMapEffects.push(
          new MapEffectObject(
            sheet,
            resolveLinkedRenderY(sheet.linkedColliderLabel) ??
              inferRenderYFromOverlappingMask(sheet.box_2d),
            normOffset,
            { defaultType: "background" },
          ),
        );
      }

      this._mapSprites.push(...panelMapEffects);

      // Walkable boxes — offset into world-norm space
      for (const wb of panel.walkableBoxes ?? []) {
        const r = parseBox2d(wb.box_2d);
        this._walkable.push(
          normOffset ? offsetRect(r, normOffset.x, normOffset.y) : r,
        );
      }

      for (const [index, placement] of (panel.placement ?? []).entries()) {
        const rawBounds = parseBox2d(placement.box_2d);
        const bounds = normOffset
          ? offsetRect(rawBounds, normOffset.x, normOffset.y)
          : rawBounds;
        const box_2d = [bounds.y1, bounds.x1, bounds.y2, bounds.x2];
        const elementName =
          placement.element_name ?? placement.contents ?? `placement_${index}`;

        this._placements.push({
          id: placement.id,
          elementName,
          placementType: placement.placement_type,
          contents: placement.contents,
          reasoning: placement.reasoning,
          gridDimensions: placement.grid_dimensions,
          box_2d,
          bounds,
          renderY: bounds.y2,
        });
      }

      for (const overlay of mapOverlayData) {
        this._overlays.push(new MapOverlayObject(overlay, normOffset));
      }
    }
  }

  // ── Collision ────────────────────────────────────────────────────────────

  private _isInsideWalkable(rect: Rect): boolean {
    if (this._walkable.some((wb) => rectContainedBy(rect, wb))) return true;
    return this._isInsideConnectedSeamBridge(rect);
  }

  private _isInsideConnectedSeamBridge(rect: Rect): boolean {
    for (let i = 0; i < this._walkable.length; i += 1) {
      const a = this._walkable[i];
      for (let j = i + 1; j < this._walkable.length; j += 1) {
        const b = this._walkable[j];

        // Vertical seam bridge: a|b or b|a
        if (Math.abs(a.x2 - b.x1) <= EDGE_EPS) {
          if (this._fitsVerticalBridge(rect, a, b, b.x1)) return true;
        } else if (Math.abs(b.x2 - a.x1) <= EDGE_EPS) {
          if (this._fitsVerticalBridge(rect, b, a, a.x1)) return true;
        }

        // Horizontal seam bridge: a above b or b above a
        if (Math.abs(a.y2 - b.y1) <= EDGE_EPS) {
          if (this._fitsHorizontalBridge(rect, a, b, b.y1)) return true;
        } else if (Math.abs(b.y2 - a.y1) <= EDGE_EPS) {
          if (this._fitsHorizontalBridge(rect, b, a, a.y1)) return true;
        }
      }
    }

    return false;
  }

  private _fitsVerticalBridge(
    rect: Rect,
    left: Rect,
    right: Rect,
    seamX: number,
  ): boolean {
    const crossesSeam =
      rect.x1 < seamX - EDGE_EPS && rect.x2 > seamX + EDGE_EPS;
    if (!crossesSeam) return false;

    const overlapY1 = Math.max(left.y1, right.y1);
    const overlapY2 = Math.min(left.y2, right.y2);
    if (overlapY2 - overlapY1 <= EDGE_EPS) return false;

    return (
      rect.x1 >= left.x1 - EDGE_EPS &&
      rect.x2 <= right.x2 + EDGE_EPS &&
      rect.y1 >= overlapY1 - EDGE_EPS &&
      rect.y2 <= overlapY2 + EDGE_EPS
    );
  }

  private _fitsHorizontalBridge(
    rect: Rect,
    top: Rect,
    bottom: Rect,
    seamY: number,
  ): boolean {
    const crossesSeam =
      rect.y1 < seamY - EDGE_EPS && rect.y2 > seamY + EDGE_EPS;
    if (!crossesSeam) return false;

    const overlapX1 = Math.max(top.x1, bottom.x1);
    const overlapX2 = Math.min(top.x2, bottom.x2);
    if (overlapX2 - overlapX1 <= EDGE_EPS) return false;

    return (
      rect.y1 >= top.y1 - EDGE_EPS &&
      rect.y2 <= bottom.y2 + EDGE_EPS &&
      rect.x1 >= overlapX1 - EDGE_EPS &&
      rect.x2 <= overlapX2 + EDGE_EPS
    );
  }

  checkCollision(rect: Rect): boolean {
    if (this._objects.some((obj) => obj.overlaps(rect))) return true;
    if (this._overlays.some((overlay) => overlay.overlaps(rect))) return true;

    if (this._walkable.length > 0) {
      const inWalkable = this._isInsideWalkable(rect);
      if (!inWalkable) return true;
    }

    return false;
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  drawBackground(ctx: CanvasRenderingContext2D, now = performance.now()): void {
    const wnw = this.worldNormWidth;
    const wnh = this.worldNormHeight;
    const wpw = this.worldPixelWidth;
    const wph = this.worldPixelHeight;

    for (const panel of this._backgroundPanels) {
      if (!panel.image?.complete || !panel.image.naturalWidth) continue;
      const px = snapCanvasValue((panel.normX / wnw) * wpw);
      const py = snapCanvasValue((panel.normY / wnh) * wph);
      ctx.drawImage(
        panel.image,
        px,
        py,
        snapCanvasValue(this.panelPixelWidth),
        snapCanvasValue(this.panelPixelHeight),
      );
    }

    for (const obj of this._objects) {
      obj.drawBackground(ctx, now, wnw, wnh, wpw, wph);
    }

    for (const overlay of this._overlays) {
      overlay.drawBackground(ctx, now, wnw, wnh, wpw, wph);
    }
  }

  getRenderables(): Array<
    (MapObject | MapEffectObject | MapOverlayObject) & RenderSortable
  > {
    const renderables: Array<
      (MapObject | MapEffectObject | MapOverlayObject) & RenderSortable
    > = [];
    const unlinkedSprites = [...this._mapSprites];

    for (const obj of this._objects) {
      if (!obj.participatesInYSort) {
        continue;
      }
      renderables.push(obj);
      const keys = new Set([obj.label, obj.name]);
      for (let i = unlinkedSprites.length - 1; i >= 0; i -= 1) {
        const sprite = unlinkedSprites[i];
        if (sprite.linkedMaskKey && keys.has(sprite.linkedMaskKey)) {
          renderables.push(sprite);
          unlinkedSprites.splice(i, 1);
        }
      }
    }

    renderables.push(...unlinkedSprites);
    renderables.push(
      ...this._overlays.filter((overlay) => overlay.participatesInYSort),
    );
    return renderables;
  }

  getPlacementTargets(): MapPlacementTarget[] {
    return this._placements.map((placement) => ({
      ...placement,
      box_2d: [...placement.box_2d],
      bounds: { ...placement.bounds },
      gridDimensions: placement.gridDimensions
        ? [...placement.gridDimensions]
        : undefined,
    }));
  }

  getMapOverlays(): MapOverlayTarget[] {
    return this._overlays.map((overlay) => overlay.getTarget());
  }

  getMapOverlayState(id: string): string | null {
    return (
      this._overlays.find((overlay) => overlay.id === id)?.currentStateName ??
      null
    );
  }

  setMapOverlayState(id: string, state: string): boolean {
    const overlay = this._overlays.find((candidate) => candidate.id === id);
    if (!overlay) return false;
    return overlay.setState(state);
  }

  getHoverTargetsAt(x: number, y: number): HoverTarget[] {
    const targets: HoverTarget[] = [];
    for (const obj of this._objects) {
      const target = obj.getHoverTargetAt(x, y);
      if (target) targets.push(target);
    }

    for (const effect of this._mapSprites) {
      const target = effect.getHoverTargetAt(x, y);
      if (target) targets.push(target);
    }

    for (const overlay of this._overlays) {
      const target = overlay.getHoverTargetAt(x, y);
      if (target) targets.push(target);
    }

    return targets;
  }

  drawOverlay(_ctx: CanvasRenderingContext2D, _now = performance.now()): void {
    // Map spritesheets participate in the Y-sorted render queue via getRenderables().
  }

  playGameplayEffectByTag(tag: string, now = performance.now()): boolean {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return false;

    let played = false;
    for (const sprite of this._mapSprites) {
      if (sprite.type === "background") continue;
      if (!sprite.matchesTag(normalized)) continue;
      sprite.play(now, true);
      played = true;
    }
    return played;
  }

  playNearestGameplayEffectByTag(
    tag: string,
    atX: number,
    atY: number,
    now = performance.now(),
  ): boolean {
    const normalized = tag.trim().toLowerCase();
    if (!normalized) return false;

    let nearest: MapEffectObject | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;

    for (const sprite of this._mapSprites) {
      if (sprite.type === "background") continue;
      if (!sprite.matchesTag(normalized)) continue;
      const distanceSq = sprite.distanceSqTo(atX, atY);
      if (distanceSq < nearestDistanceSq) {
        nearestDistanceSq = distanceSq;
        nearest = sprite;
      }
    }

    if (!nearest) return false;
    nearest.play(now, true);
    return true;
  }

  drawDebug(ctx: CanvasRenderingContext2D): void {
    const wnw = this.worldNormWidth;
    const wnh = this.worldNormHeight;
    const wpw = this.worldPixelWidth;
    const wph = this.worldPixelHeight;

    // Walkable areas — green outline
    for (const wb of this._walkable) {
      const { x, y } = toPixel(wb.x1, wb.y1, wnw, wnh, wpw, wph);
      const { x: x2, y: y2 } = toPixel(wb.x2, wb.y2, wnw, wnh, wpw, wph);
      ctx.save();
      ctx.strokeStyle = "rgba(50, 255, 100, 0.7)";
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(x, y, x2 - x, y2 - y);
      ctx.fillStyle = "rgba(50, 255, 100, 0.06)";
      ctx.fillRect(x, y, x2 - x, y2 - y);
      ctx.restore();
    }

    // Obstacle colliders — red fill + label
    for (const obj of this._objects) {
      obj.drawDebug(ctx, wnw, wnh, wpw, wph);
    }

    for (const sprite of this._mapSprites) {
      sprite.drawDebug(ctx, wnw, wnh, wpw, wph);
    }

    for (const overlay of this._overlays) {
      overlay.drawDebug(ctx, wnw, wnh, wpw, wph);
    }
  }
}
