import {
  loadImage,
  offsetPolygon,
  offsetRect,
  parseBox2d,
  rectOverlapsPolygon,
  rectsOverlap,
  snapCanvasValue,
  toPixel,
  NORM,
  type Point,
  type Rect,
} from "../utils/common";
import type { HoverTarget, TooltipContent } from "./HoverTypes";
import type { RenderLayer } from "./renderSort";

export type MapOverlayRenderLayer =
  | "background"
  | "ground"
  | "occluder"
  | "prop";

export type MapOverlayKind = "erase" | "state" | "vfx" | "grid";

export type MapOverlayLayout = "single" | "multi_inplace" | "detached_stages";

export interface MapOverlayColliderEntry {
  box_2d: number[];
  label?: string;
}

export interface MapOverlayStateEntry {
  name: string;
  label?: string;
  description?: string;
  /**
   * Visual patch URL. When `spriteUrl` is also set (obstacle-edit local
   * collision), this draws as a flat map-layer patch like `kind: "erase"`.
   * Otherwise it is the Y-sorted / background state image (legacy).
   */
  url: string;
  /** Per-state placement `[ymin, xmin, ymax, xmax]` — size may differ per stage. */
  box_2d: number[];
  frameCount?: number;
  frame_count?: number;
  mode?: "background" | "gameplay";
  clearsCollision?: boolean;
  collider?: MapOverlayColliderEntry[];
  colliders?: MapOverlayColliderEntry[];
  blocksMovement?: boolean;
  renderLayer?: MapOverlayRenderLayer;
  /**
   * Isolated silhouette sprite for Y-sorting (obstacle-edit local collision).
   * When present, `url` is the flat erase-style patch and this image participates
   * in the Y-sort queue at `sprite_bbox` (or `box_2d`).
   */
  spriteUrl?: string;
  /** Full visual silhouette bbox `[ymin,xmin,ymax,xmax]` for Y-sort draw. */
  sprite_bbox?: number[];
  collision_type?: "solid_volume" | "passable_gap";
  footprint_height_pct?: number;
  /**
   * Silhouette collision polygons in full-map 0–1000 coords.
   * Prefer these over AABB `collider` for walkability.
   */
  collision_polygons?: Array<Array<{ x: number; y: number }>>;
}

export interface MapOverlayEntry {
  id: string;
  anchorLabel?: string;
  gamePlay?: string;
  /** Unified kind — omit / "state" for legacy structural overlays. */
  kind?: MapOverlayKind;
  layout?: MapOverlayLayout;
  /** Mask label/name whose obstacle visual this overlay replaces. */
  linkedObstacleLabel?: string;
  /**
   * replace: suppress linked mask obstacle cut-out (keep collider) so the
   * overlay owns the visual — default for `kind: "state" | "grid"`.
   * overlay: draw patch/sheet on top; base sprite stays — default for `kind: "vfx"`.
   */
  placementMode?: "replace" | "overlay" | string;
  currentMapStateLabel?: string;
  currentState?: string;
  states: MapOverlayStateEntry[];
  /** `[cols, rows]` — detached grid only. */
  gridDimensions?: [number, number];
  /**
   * Gap between cells in 0–1000 map space `[gapX, gapY]`.
   * Engine tiles from the active state's `box_2d` as cell 0 (playground style).
   */
  gridSpacing?: [number, number];
  /**
   * @deprecated Prefer `gridDimensions` + `gridSpacing`. Kept as a load fallback
   * for older synced maps that still embed precomputed cells.
   */
  cellBboxes?: number[][];
  /** Default for states that omit renderLayer. */
  renderLayer?: MapOverlayRenderLayer;
  /** Default for states that omit blocksMovement. */
  blocksMovement?: boolean;
}

export interface MapOverlayTarget {
  id: string;
  anchorLabel?: string;
  gamePlay?: string;
  /**
   * Active state name, or `"initial"` / `"none"` when the overlay is off
   * (base map only — nothing drawn).
   */
  currentState: string;
  states: string[];
  box_2d: number[];
  bounds: { x1: number; y1: number; x2: number; y2: number };
  renderY: number;
  blocksMovement: boolean;
  renderLayer: MapOverlayRenderLayer;
  gridDimensions?: [number, number];
  gridSpacing?: [number, number];
  /** Computed cell boxes for the active state (derived, not authored). */
  cellBboxes?: number[][];
}

function toSortableLayer(layer: MapOverlayRenderLayer): RenderLayer {
  return layer === "ground" ? "ground" : layer === "prop" ? "prop" : "occluder";
}

function isValidLayer(value: unknown): value is MapOverlayRenderLayer {
  return (
    value === "background" ||
    value === "ground" ||
    value === "occluder" ||
    value === "prop"
  );
}

/**
 * Lay out grid cells from cell-0 `box_2d` + cols/rows + spacing.
 * Same math as Maps playground `computeDetachedGridCellsFromAnchor`.
 */
export function computeDetachedGridCellsFromAnchor(
  anchor: number[],
  cols: number,
  rows: number,
  spacing: [number, number] = [0, 0],
): number[][] {
  if (!Array.isArray(anchor) || anchor.length < 4) return [];
  const c = Math.max(1, Math.floor(cols));
  const r = Math.max(1, Math.floor(rows));
  const gapX = Math.floor(spacing[0] ?? 0);
  const gapY = Math.floor(spacing[1] ?? 0);
  const ymin = Number(anchor[0]);
  const xmin = Number(anchor[1]);
  const ymax = Number(anchor[2]);
  const xmax = Number(anchor[3]);
  if (![ymin, xmin, ymax, xmax].every(Number.isFinite)) return [];
  const cellW = xmax - xmin;
  const cellH = ymax - ymin;
  const stepX = cellW + gapX;
  const stepY = cellH + gapY;
  const cells: number[][] = [];
  for (let row = 0; row < r; row++) {
    for (let col = 0; col < c; col++) {
      const cellXmin = xmin + col * stepX;
      const cellYmin = ymin + row * stepY;
      cells.push([
        cellYmin,
        cellXmin,
        cellYmin + cellH,
        cellXmin + cellW,
      ]);
    }
  }
  return cells;
}

function unionRects(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x1);
    y1 = Math.min(y1, r.y1);
    x2 = Math.max(x2, r.x2);
    y2 = Math.max(y2, r.y2);
  }
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return { x1, y1, x2, y2 };
}

/** Map default / editor "Initial" — overlay is off; draw nothing. */
export function isMapOverlayOffState(name: string | null | undefined): boolean {
  const n = (name ?? "").trim().toLowerCase();
  return n === "" || n === "initial" || n === "none";
}

/** True when this state carries obstacle-edit local collision / silhouette data. */
export function stateHasLocalCollision(
  state: MapOverlayStateEntry | null | undefined,
): boolean {
  if (!state) return false;
  if (typeof state.spriteUrl === "string" && state.spriteUrl.trim()) return true;
  if (Array.isArray(state.collision_polygons) && state.collision_polygons.length > 0)
    return true;
  if (state.collision_type === "solid_volume" || state.collision_type === "passable_gap")
    return true;
  if (Array.isArray(state.sprite_bbox) && state.sprite_bbox.length >= 4) return true;
  return false;
}

function normalizeOverlayPolygons(
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


export default class MapOverlayObject {
  readonly id: string;
  readonly anchorLabel?: string;
  readonly gamePlay?: string;
  readonly states: MapOverlayStateEntry[];
  /** Authoring placement mode — `overlay` keeps base cut-out underneath. */
  readonly placementMode: "replace" | "overlay" | string;
  readonly kind: MapOverlayKind;
  /**
   * Mask label/name this overlay sorts with. Set after mask bounds resolve so
   * `placementMode: "overlay"` patches draw immediately after the base cut-out.
   */
  linkedMaskKey?: string;

  currentStateName: string;
  renderY: number;
  renderLayer: RenderLayer;
  participatesInYSort: boolean;

  private readonly _defaultRenderLayer: MapOverlayRenderLayer;
  private readonly _defaultBlocksMovement?: boolean;
  private readonly _gridDimensions?: [number, number];
  private readonly _gridSpacing: [number, number];
  /** Legacy fallback only — preferred path recomputes from state box + spacing. */
  private readonly _legacyCellBboxes?: number[][];
  private readonly _normOffset?: { x: number; y: number };
  /** When set, linked parent inheritance locks Y-sort to the parent. */
  private _linkedRenderY?: number;
  private _bounds: Rect;
  private _box2d: number[];
  /** World-norm cell boxes for the active draw (cell 0 = active state box). */
  private _cellRects: Rect[];
  private _colliders: Rect[];
  private _polygons: Point[][];
  private _blocksMovement: boolean;
  private _stateRenderLayer: MapOverlayRenderLayer;
  /** Flat map-layer patch (`url`) — drawn like erase when silhouette exists. */
  private _patchImage: HTMLImageElement | null;
  private _patchImageUrl: string;
  /** Y-sorted silhouette (`spriteUrl`), or legacy state image when no silhouette. */
  private _sortImage: HTMLImageElement | null;
  private _sortImageUrl: string;
  private _spriteRects: Rect[];
  private _usesFlatPatch: boolean;

  constructor(
    data: MapOverlayEntry,
    normOffset?: { x: number; y: number },
    options: { linkedRenderY?: number; linkedMaskKey?: string } = {},
  ) {
    this.id = data.id;
    this.anchorLabel = data.anchorLabel;
    this.gamePlay = data.gamePlay;
    this.kind = data.kind ?? "state";
    this.placementMode =
      data.placementMode ?? (this.kind === "vfx" ? "overlay" : "replace");
    // Keep each state's authored box_2d — do not remap via cellBboxes[index].
    this.states = (data.states ?? []).map((state) => ({ ...state }));
    this._defaultRenderLayer = isValidLayer(data.renderLayer)
      ? data.renderLayer
      : "occluder";
    this._defaultBlocksMovement = data.blocksMovement;
    if (
      Array.isArray(data.gridDimensions) &&
      data.gridDimensions.length === 2
    ) {
      this._gridDimensions = [
        Math.max(1, Math.floor(Number(data.gridDimensions[0]))),
        Math.max(1, Math.floor(Number(data.gridDimensions[1]))),
      ];
    }
    this._gridSpacing =
      Array.isArray(data.gridSpacing) && data.gridSpacing.length === 2
        ? [
            Math.floor(Number(data.gridSpacing[0]) || 0),
            Math.floor(Number(data.gridSpacing[1]) || 0),
          ]
        : [0, 0];
    if (Array.isArray(data.cellBboxes)) {
      const cells: number[][] = [];
      for (const cell of data.cellBboxes) {
        if (!Array.isArray(cell) || cell.length < 4) continue;
        cells.push([
          Number(cell[0]),
          Number(cell[1]),
          Number(cell[2]),
          Number(cell[3]),
        ]);
      }
      if (cells.length) this._legacyCellBboxes = cells;
    }
    this._normOffset = normOffset;
    this._linkedRenderY =
      typeof options.linkedRenderY === "number" &&
      Number.isFinite(options.linkedRenderY)
        ? options.linkedRenderY
        : undefined;
    const initialLinkKey =
      options.linkedMaskKey?.trim() ||
      data.linkedObstacleLabel?.trim() ||
      data.anchorLabel?.trim();
    if (initialLinkKey) this.linkedMaskKey = initialLinkKey;

    if (!this.states.length) {
      throw new Error(`Map overlay ${data.id} has no states`);
    }

    const requestedName =
      data.currentMapStateLabel ?? data.currentState ?? this.states[0]!.name;
    const fallbackBox = this.states[0]!.box_2d;

    this.currentStateName = "";
    this.renderY = 0;
    this.renderLayer = toSortableLayer(this._defaultRenderLayer);
    this.participatesInYSort = this._defaultRenderLayer !== "background";
    this._bounds = parseBox2d(fallbackBox);
    this._box2d = [...fallbackBox];
    this._cellRects = [];
    this._colliders = [];
    this._polygons = [];
    this._blocksMovement = false;
    this._stateRenderLayer = this._defaultRenderLayer;
    this._patchImage = null;
    this._patchImageUrl = "";
    this._sortImage = null;
    this._sortImageUrl = "";
    this._spriteRects = [];
    this._usesFlatPatch = false;

    // Honor map default: "initial" / "none" → draw nothing. Otherwise show
    // that state (tiled across the full grid when kind is grid).
    if (isMapOverlayOffState(requestedName)) {
      this._clearVisualState(
        (typeof requestedName === "string" && requestedName.trim()) ||
          "initial",
      );
    } else {
      const initialState =
        this.states.find((state) => state.name === requestedName) ??
        this.states[0]!;
      this._applyState(initialState);
    }
  }

  /** Visual placement bounds in world-norm space (union of visible grid cells). */
  getBounds(): Rect {
    return { ...this._bounds };
  }

  /**
   * Lock Y-sort to a resolved map cut-out (call after pixel_bbox resolve).
   * Also sets `linkedMaskKey` to the real mask label so getRenderables can
   * draw this patch immediately after the base sprite.
   */
  bindLinkedMask(maskKey: string, renderY: number): void {
    const key = maskKey.trim();
    if (key) this.linkedMaskKey = key;
    if (Number.isFinite(renderY)) {
      this._linkedRenderY = renderY;
      this.renderY = renderY;
    }
  }

  get blocksMovement(): boolean {
    return this._blocksMovement;
  }

  /** Active state carries silhouette / local collision override data. */
  get hasLocalCollision(): boolean {
    return stateHasLocalCollision(this.currentState);
  }

  get currentState(): MapOverlayStateEntry | null {
    return (
      this.states.find((state) => state.name === this.currentStateName) ?? null
    );
  }

  setState(stateName: string): boolean {
    const previousState = this.currentStateName;
    if (isMapOverlayOffState(stateName)) {
      this._clearVisualState(stateName.trim() || "initial");
      return previousState !== this.currentStateName;
    }
    const nextState = this.states.find((state) => state.name === stateName);
    if (!nextState) return false;
    this._applyState(nextState);
    return previousState !== this.currentStateName;
  }

  overlaps(rect: Rect): boolean {
    if (!this._blocksMovement) return false;
    if (this._polygons.length > 0) {
      return this._polygons.some((poly) => rectOverlapsPolygon(rect, poly));
    }
    return this._colliders.some((collider) => rectsOverlap(collider, rect));
  }

  getTarget(): MapOverlayTarget {
    const cells = this._cellRects.map((rect) => [
      rect.y1,
      rect.x1,
      rect.y2,
      rect.x2,
    ]);
    return {
      id: this.id,
      anchorLabel: this.anchorLabel,
      gamePlay: this.gamePlay,
      currentState: this.currentStateName,
      states: this.states.map((state) => state.name),
      box_2d: [...this._box2d],
      bounds: { ...this._bounds },
      renderY: this.renderY,
      blocksMovement: this._blocksMovement,
      renderLayer: this._stateRenderLayer,
      ...(this._gridDimensions ? { gridDimensions: this._gridDimensions } : {}),
      ...(this.kind === "grid" || this._gridDimensions
        ? { gridSpacing: [...this._gridSpacing] as [number, number] }
        : {}),
      ...(cells.length ? { cellBboxes: cells } : {}),
    };
  }

  getHoverTargetAt(x: number, y: number): HoverTarget | null {
    if (isMapOverlayOffState(this.currentStateName) || !this._cellRects.length) {
      return null;
    }
    const point = {
      x1: x - 0.001,
      y1: y - 0.001,
      x2: x + 0.001,
      y2: y + 0.001,
    };
    const hit = this._cellRects.some((cell) => rectsOverlap(cell, point));
    if (!hit && !rectsOverlap(this._bounds, point)) return null;

    const state = this.currentState;
    const title = this.anchorLabel ?? this.id;
    const body = state?.description ?? this.gamePlay;
    const tooltip: TooltipContent = body ? { title, body } : { title };

    return {
      id: `map-overlay:${this.id}`,
      source: "map-overlay",
      label: title,
      tooltip,
      type: "map-overlay",
      bounds: { ...this._bounds },
      renderY: this.renderY,
      x,
      y,
    };
  }

  drawBackground(
    ctx: CanvasRenderingContext2D,
    _now?: number,
    worldNormW = NORM,
    worldNormH = NORM,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    if (isMapOverlayOffState(this.currentStateName)) return;
    // Flat erase-style patch when silhouette owns Y-sort; otherwise legacy
    // background-layer states still draw here.
    if (this._usesFlatPatch) {
      this._drawImageIntoRects(
        ctx,
        this._patchImage,
        this._cellRects,
        worldNormW,
        worldNormH,
        worldPixelW,
        worldPixelH,
      );
      return;
    }
    if (this._stateRenderLayer !== "background") return;
    this._drawImageIntoRects(
      ctx,
      this._sortImage,
      this._cellRects,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
  }

  draw(
    ctx: CanvasRenderingContext2D,
    _now?: number,
    worldNormW = NORM,
    worldNormH = NORM,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    if (!this.participatesInYSort) return;
    if (this._usesFlatPatch) {
      // Silhouette cut-out for depth sorting (characters walk in front/behind).
      this._drawImageIntoRects(
        ctx,
        this._sortImage,
        this._spriteRects.length ? this._spriteRects : this._cellRects,
        worldNormW,
        worldNormH,
        worldPixelW,
        worldPixelH,
      );
      return;
    }
    this._drawImageIntoRects(
      ctx,
      this._sortImage,
      this._cellRects,
      worldNormW,
      worldNormH,
      worldPixelW,
      worldPixelH,
    );
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
    ctx.strokeStyle = this._blocksMovement
      ? "rgba(255, 170, 30, 0.9)"
      : "rgba(255, 210, 80, 0.45)";
    ctx.lineWidth = 2;
    ctx.fillStyle = this._blocksMovement
      ? "rgba(255, 170, 30, 0.16)"
      : "rgba(255, 210, 80, 0.06)";
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
        index === 0 ? this.id : `${this.id} (${index + 1})`,
        x + 4,
        y + 14,
      );
      ctx.fillStyle = this._blocksMovement
        ? "rgba(255, 170, 30, 0.16)"
        : "rgba(255, 210, 80, 0.06)";
    }

    ctx.restore();
  }

  private _resolveCellBoxes(stateBox: number[]): number[][] {
    if (this._gridDimensions) {
      return computeDetachedGridCellsFromAnchor(
        stateBox,
        this._gridDimensions[0],
        this._gridDimensions[1],
        this._gridSpacing,
      );
    }
    if (this._legacyCellBboxes?.length) {
      // Legacy: keep cell 0 size/pos from the active state; offset siblings.
      const primary = this._legacyCellBboxes[0]!;
      const dy = Number(stateBox[0]) - Number(primary[0]);
      const dx = Number(stateBox[1]) - Number(primary[1]);
      const h = Number(stateBox[2]) - Number(stateBox[0]);
      const w = Number(stateBox[3]) - Number(stateBox[1]);
      return this._legacyCellBboxes.map((cell, index) => {
        if (index === 0) return [...stateBox];
        const y = Number(cell[0]) + dy;
        const x = Number(cell[1]) + dx;
        return [y, x, y + h, x + w];
      });
    }
    return [stateBox];
  }

  /** Hide overlay art — map default "initial" / "none". */
  private _clearVisualState(offName: string): void {
    this.currentStateName = offName;
    this._cellRects = [];
    this._spriteRects = [];
    this._colliders = [];
    this._polygons = [];
    this._blocksMovement = false;
    this._usesFlatPatch = false;
    this._patchImage = null;
    this._patchImageUrl = "";
    this._sortImage = null;
    this._sortImageUrl = "";
    this._stateRenderLayer = this._defaultRenderLayer;
    this.renderLayer = toSortableLayer(this._defaultRenderLayer);
    this.participatesInYSort = this._defaultRenderLayer !== "background";

    const anchor = this.states[0]?.box_2d;
    if (anchor) {
      let cell0 = parseBox2d(anchor);
      if (this._normOffset) {
        cell0 = offsetRect(cell0, this._normOffset.x, this._normOffset.y);
      }
      this._bounds = cell0;
      this._box2d = [cell0.y1, cell0.x1, cell0.y2, cell0.x2];
      this.renderY = this._linkedRenderY ?? cell0.y2;
    }
  }

  private _applyState(state: MapOverlayStateEntry): void {
    this.currentStateName = state.name;

    const authoredBox = [...state.box_2d];
    // When on, draw the active state across the full grid (ghostCellDisplay is
    // Maps-editor only — not used at runtime).
    const cellBoxes = this._resolveCellBoxes(authoredBox);

    this._cellRects = cellBoxes.map((box) => {
      let rect = parseBox2d(box);
      if (this._normOffset) {
        rect = offsetRect(rect, this._normOffset.x, this._normOffset.y);
      }
      return rect;
    });

    // Public box_2d stays the active state's authored cell-0 placement.
    let cell0 = parseBox2d(authoredBox);
    if (this._normOffset) {
      cell0 = offsetRect(cell0, this._normOffset.x, this._normOffset.y);
    }
    this._bounds = unionRects(this._cellRects) ?? cell0;
    this._box2d = [cell0.y1, cell0.x1, cell0.y2, cell0.x2];

    const silhouetteUrl =
      typeof state.spriteUrl === "string" ? state.spriteUrl.trim() : "";
    this._usesFlatPatch = Boolean(silhouetteUrl);

    if (this._usesFlatPatch) {
      const spriteBox = Array.isArray(state.sprite_bbox) && state.sprite_bbox.length >= 4
        ? [...state.sprite_bbox]
        : authoredBox;
      const spriteCells = this._resolveCellBoxes(spriteBox);
      this._spriteRects = spriteCells.map((box) => {
        let rect = parseBox2d(box);
        if (this._normOffset) {
          rect = offsetRect(rect, this._normOffset.x, this._normOffset.y);
        }
        return rect;
      });
    } else {
      this._spriteRects = [];
    }

    const colliders = state.collider ?? state.colliders ?? [];
    if (colliders.length > 0 && this._cellRects.length > 0) {
      // Authoring colliders are in full-map 0–1000 space — tile across cells.
      const cell0World = this._cellRects[0]!;
      this._colliders = [];
      for (const cellRect of this._cellRects) {
        const dx = cellRect.x1 - cell0World.x1;
        const dy = cellRect.y1 - cell0World.y1;
        for (const entry of colliders) {
          let rect = parseBox2d(entry.box_2d);
          if (this._normOffset) {
            rect = offsetRect(rect, this._normOffset.x, this._normOffset.y);
          }
          this._colliders.push(offsetRect(rect, dx, dy));
        }
      }
    } else {
      this._colliders = [];
    }

    const localPolys = normalizeOverlayPolygons(state.collision_polygons);
    if (localPolys.length > 0 && this._cellRects.length > 0) {
      const cell0World = this._cellRects[0]!;
      this._polygons = [];
      for (const cellRect of this._cellRects) {
        const dx = cellRect.x1 - cell0World.x1;
        const dy = cellRect.y1 - cell0World.y1;
        for (const poly of localPolys) {
          let points = poly.map((p) => ({ ...p }));
          if (this._normOffset) {
            points = offsetPolygon(points, this._normOffset.x, this._normOffset.y);
          }
          if (dx !== 0 || dy !== 0) {
            points = offsetPolygon(points, dx, dy);
          }
          this._polygons.push(points);
        }
      }
    } else {
      this._polygons = [];
    }

    this._blocksMovement =
      state.blocksMovement ?? this._defaultBlocksMovement ?? false;
    if (
      this._blocksMovement &&
      this._colliders.length === 0 &&
      this._polygons.length === 0
    ) {
      this._colliders = [...this._cellRects];
    }

    const silhouetteBottom =
      this._spriteRects.length > 0
        ? this._spriteRects[this._spriteRects.length - 1]!.y2
        : undefined;
    this.renderY =
      this._linkedRenderY ??
      silhouetteBottom ??
      (this._colliders.length > 0
        ? this._colliders[this._colliders.length - 1]!.y2
        : this._bounds.y2);
    this._stateRenderLayer = isValidLayer(state.renderLayer)
      ? state.renderLayer
      : this._defaultRenderLayer;
    this.renderLayer = toSortableLayer(this._stateRenderLayer);
    // Silhouette always Y-sorts; otherwise honor authored renderLayer.
    this.participatesInYSort =
      this._usesFlatPatch || this._stateRenderLayer !== "background";

    if (this._usesFlatPatch) {
      this._setPatchImage(state.url);
      this._setSortImage(silhouetteUrl);
    } else {
      this._patchImage = null;
      this._patchImageUrl = "";
      this._setSortImage(state.url);
    }
  }

  private _setPatchImage(url: string): void {
    const trimmed = url.trim();
    this._patchImageUrl = trimmed;
    this._patchImage = null;
    if (!trimmed) return;
    loadImage(trimmed)
      .then((image) => {
        if (this._patchImageUrl === trimmed) this._patchImage = image;
      })
      .catch(() => {
        if (this._patchImageUrl === trimmed) this._patchImage = null;
      });
  }

  private _setSortImage(url: string): void {
    const trimmed = url.trim();
    this._sortImageUrl = trimmed;
    this._sortImage = null;
    if (!trimmed) return;
    loadImage(trimmed)
      .then((image) => {
        if (this._sortImageUrl === trimmed) this._sortImage = image;
      })
      .catch(() => {
        if (this._sortImageUrl === trimmed) this._sortImage = null;
      });
  }

  private _drawImageIntoRects(
    ctx: CanvasRenderingContext2D,
    image: HTMLImageElement | null,
    rects: Rect[],
    worldNormW: number,
    worldNormH: number,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    if (isMapOverlayOffState(this.currentStateName)) return;
    if (!image?.complete || !image.naturalWidth) return;
    if (!rects.length) return;

    for (const cell of rects) {
      const { x, y } = toPixel(
        cell.x1,
        cell.y1,
        worldNormW,
        worldNormH,
        worldPixelW,
        worldPixelH,
      );
      const { x: x2, y: y2 } = toPixel(
        cell.x2,
        cell.y2,
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
  }
}
