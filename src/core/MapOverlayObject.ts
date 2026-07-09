import {
  loadImage,
  offsetRect,
  parseBox2d,
  rectsOverlap,
  snapCanvasValue,
  toPixel,
  NORM,
  type Rect,
} from "../utils/common";
import type { HoverTarget, TooltipContent } from "./HoverTypes";
import type { RenderLayer } from "./renderSort";

export type MapOverlayRenderLayer =
  | "background"
  | "ground"
  | "occluder"
  | "prop";

export interface MapOverlayColliderEntry {
  box_2d: number[];
  label?: string;
}

export interface MapOverlayStateEntry {
  name: string;
  label?: string;
  description?: string;
  url: string;
  box_2d: number[];
  collider?: MapOverlayColliderEntry[];
  colliders?: MapOverlayColliderEntry[];
  blocksMovement?: boolean;
  renderLayer?: MapOverlayRenderLayer;
}

export interface MapOverlayEntry {
  id: string;
  anchorLabel?: string;
  gamePlay?: string;
  currentMapStateLabel?: string;
  states: MapOverlayStateEntry[];
  /** Default for states that omit renderLayer. */
  renderLayer?: MapOverlayRenderLayer;
  /** Default for states that omit blocksMovement. */
  blocksMovement?: boolean;
}

export interface MapOverlayTarget {
  id: string;
  anchorLabel?: string;
  gamePlay?: string;
  currentState: string;
  states: string[];
  box_2d: number[];
  bounds: { x1: number; y1: number; x2: number; y2: number };
  renderY: number;
  blocksMovement: boolean;
  renderLayer: MapOverlayRenderLayer;
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

export default class MapOverlayObject {
  readonly id: string;
  readonly anchorLabel?: string;
  readonly gamePlay?: string;
  readonly states: MapOverlayStateEntry[];

  currentStateName: string;
  renderY: number;
  renderLayer: RenderLayer;
  participatesInYSort: boolean;

  private readonly _defaultRenderLayer: MapOverlayRenderLayer;
  private readonly _defaultBlocksMovement?: boolean;
  private readonly _normOffset?: { x: number; y: number };
  private _bounds: Rect;
  private _box2d: number[];
  private _colliders: Rect[];
  private _blocksMovement: boolean;
  private _stateRenderLayer: MapOverlayRenderLayer;
  private _image: HTMLImageElement | null;
  private _imageUrl: string;

  constructor(data: MapOverlayEntry, normOffset?: { x: number; y: number }) {
    this.id = data.id;
    this.anchorLabel = data.anchorLabel;
    this.gamePlay = data.gamePlay;
    this.states = data.states ?? [];
    this._defaultRenderLayer = isValidLayer(data.renderLayer)
      ? data.renderLayer
      : "occluder";
    this._defaultBlocksMovement = data.blocksMovement;
    this._normOffset = normOffset;

    const initialName = data.currentMapStateLabel ?? this.states[0]?.name ?? "";
    const initialState =
      this.states.find((state) => state.name === initialName) ?? this.states[0];

    if (!initialState) {
      throw new Error(`Map overlay ${data.id} has no states`);
    }

    this.currentStateName = initialState.name;
    this.renderY = 0;
    this.renderLayer = toSortableLayer(this._defaultRenderLayer);
    this.participatesInYSort = this._defaultRenderLayer !== "background";
    this._bounds = parseBox2d(initialState.box_2d);
    this._box2d = [...initialState.box_2d];
    this._colliders = [];
    this._blocksMovement = false;
    this._stateRenderLayer = this._defaultRenderLayer;
    this._image = null;
    this._imageUrl = "";

    this._applyState(initialState);
  }

  get blocksMovement(): boolean {
    return this._blocksMovement;
  }

  get currentState(): MapOverlayStateEntry | null {
    return (
      this.states.find((state) => state.name === this.currentStateName) ?? null
    );
  }

  setState(stateName: string): boolean {
    const nextState = this.states.find((state) => state.name === stateName);
    if (!nextState) return false;

    const previousState = this.currentStateName;
    this._applyState(nextState);
    return previousState !== this.currentStateName;
  }

  overlaps(rect: Rect): boolean {
    if (!this._blocksMovement) return false;
    return this._colliders.some((collider) => rectsOverlap(collider, rect));
  }

  getTarget(): MapOverlayTarget {
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
    };
  }

  getHoverTargetAt(x: number, y: number): HoverTarget | null {
    const point = {
      x1: x - 0.001,
      y1: y - 0.001,
      x2: x + 0.001,
      y2: y + 0.001,
    };
    if (!rectsOverlap(this._bounds, point)) return null;

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
    if (this._stateRenderLayer !== "background") return;
    this._draw(ctx, worldNormW, worldNormH, worldPixelW, worldPixelH);
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
    this._draw(ctx, worldNormW, worldNormH, worldPixelW, worldPixelH);
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
    ctx.font = "11px monospace";

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

  private _applyState(state: MapOverlayStateEntry): void {
    this.currentStateName = state.name;
    this._box2d = [...state.box_2d];
    this._bounds = parseBox2d(state.box_2d);
    if (this._normOffset) {
      this._bounds = offsetRect(
        this._bounds,
        this._normOffset.x,
        this._normOffset.y,
      );
      this._box2d = [
        this._bounds.y1,
        this._bounds.x1,
        this._bounds.y2,
        this._bounds.x2,
      ];
    }

    const colliders = state.collider ?? state.colliders ?? [];
    this._colliders = colliders
      .map((entry) => parseBox2d(entry.box_2d))
      .map((rect) =>
        this._normOffset
          ? offsetRect(rect, this._normOffset.x, this._normOffset.y)
          : rect,
      );

    this._blocksMovement =
      state.blocksMovement ?? this._defaultBlocksMovement ?? false;
    if (this._blocksMovement && this._colliders.length === 0) {
      this._colliders = [this._bounds];
    }

    this.renderY =
      this._colliders.length > 0
        ? this._colliders[this._colliders.length - 1].y2
        : this._bounds.y2;
    this._stateRenderLayer = isValidLayer(state.renderLayer)
      ? state.renderLayer
      : this._defaultRenderLayer;
    this.renderLayer = toSortableLayer(this._stateRenderLayer);
    this.participatesInYSort = this._stateRenderLayer !== "background";

    this._setImage(state.url);
  }

  private _setImage(url: string): void {
    this._imageUrl = url;
    this._image = null;
    loadImage(url)
      .then((image) => {
        if (this._imageUrl === url) {
          this._image = image;
        }
      })
      .catch(() => {
        if (this._imageUrl === url) {
          this._image = null;
        }
      });
  }

  private _draw(
    ctx: CanvasRenderingContext2D,
    worldNormW: number,
    worldNormH: number,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void {
    if (!this._image?.complete || !this._image.naturalWidth) return;

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

    ctx.drawImage(this._image, drawX, drawY, drawX2 - drawX, drawY2 - drawY);
  }
}
