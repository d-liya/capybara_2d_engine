import MapObject from "./MapObject";
import MapEffectObject from "./MapEffectObject";
import MapOverlayObject, {
  isMapOverlayOffState,
  stateHasLocalCollision,
  type MapOverlayEntry,
} from "./MapOverlayObject";
import AtmosphereObject, { type AtmosphereEntry } from "./AtmosphereObject";
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
  /** Normalized visual footprint. Optional when pixel_bbox is used. */
  box_2d?: Box2D;
  /**
   * Pixel crop on the map background. Resolved with the loaded image's
   * naturalWidth/Height — no per-sprite map_size required.
   */
  pixel_bbox?: { x: number; y: number; w: number; h: number };
  backgroundImageBox2d?: Box2D;
  collider: MapMaskCollider[];
  /** Solid collision polygons in normalized map space (map v2 sprites). */
  collisionPolygons?: Array<Array<{ x: number; y: number }>>;
  backgroundImage?: string;
  obstacleImage?: string;
  /** 0–1 source crop within obstacleImage for enclosure side strips. */
  obstacleImageCrop?: { x: number; y: number; w: number; h: number };
  spriteSheetUrl?: string;
  frame_count?: number;
  /** background (loop) or gameplay (triggered). Defaults to background. */
  spriteSheetType?: string;
  type?: string;
  /** Collision without Y-sorted obstacle draw (full fence → side strips). */
  collisionOnly?: boolean;
  /** Y-sort draw strip only — no movement collision. */
  ySortOnly?: boolean;
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
  enterable?: boolean;
  destinationMapId?: string;
  destinationMapAssetId?: string;
  /** Spawn footprint on the destination map `[ymin,xmin,ymax,xmax]` 0–1000. */
  destinationSpawnBox2d?: number[];
  interactionType?: string;
  functionalRole?: string;
  templateId?: string;
  stages?: string[];
  gamePlay?: string;
}

export interface CharacterPlacementEntry {
  assetId: string;
  layerId: string;
  label: string;
  box_2d: Box2D;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
  role?: "player" | "npc";
}

/** Static visual patch from a `kind: "erase"` mapOverlay. */
interface ErasePatch {
  id: string;
  label: string;
  bounds: Rect;
  image: HTMLImageElement | null;
}

/** Grouped payload for one map's content. */
export interface MapPanelContent {
  url: string;
  masks?: MapMaskEntry[];
  spriteSheets?: SpriteSheetEntry[];
  walkableBoxes?: WalkableBox[];
  placement?: PlacementEntry[];
  mapOverlays?: MapOverlayEntry[];
}

/** Nested map payload — one isolated map (no panel stitching). */
export interface MapPanelData {
  panel: MapPanelContent;
}

export interface MapData extends MapPanelData {
  name?: string;
  characterPlacements?: CharacterPlacementEntry[];
  /** One always-on-top overhead atmosphere plane (clouds / birds / distant aircraft). */
  atmospherePlacements?: AtmosphereEntry[];
  panel: MapPanelContent & { masks: MapMaskEntry[] };
  /**
   * Pixel dimensions of the map image. Defaults to 2508 × 1672 until the
   * background loads (then natural size is used unless these were set).
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
/** Tight change patches often sit fully inside the mask silhouette. */
const OVERLAY_MASK_REPLACE_CONTAINMENT_THRESHOLD = 0.72;
/**
 * Fraction of a sprite's bounds that must lie under an erase patch before we
 * clear that sprite's collision. Neighbors that only clip the erase edge
 * (e.g. a wheelbarrow against a crop plot) stay solid.
 */
const ERASE_COLLISION_COVERAGE_THRESHOLD = 0.65;

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

/** Pick one sprite when descriptive metadata labels are duplicated. */
function bestMapObjectForBounds(
  candidates: MapObject[],
  target: Rect,
): MapObject | null {
  let best: MapObject | null = null;
  let bestScore = Number.NEGATIVE_INFINITY;
  const targetArea = rectArea(target);
  const targetCenterX = (target.x1 + target.x2) * 0.5;
  const targetCenterY = (target.y1 + target.y2) * 0.5;

  for (const obj of candidates) {
    const bounds = obj.getBounds();
    const intersection = rectIntersectionArea(bounds, target);
    const union = rectArea(bounds) + targetArea - intersection;
    const iou = union > 0 ? intersection / union : 0;
    const centerX = (bounds.x1 + bounds.x2) * 0.5;
    const centerY = (bounds.y1 + bounds.y2) * 0.5;
    const distance = Math.hypot(centerX - targetCenterX, centerY - targetCenterY);
    const score = iou * 10 - distance / NORM;
    if (score > bestScore) {
      best = obj;
      bestScore = score;
    }
  }

  return best;
}

/**
 * Map overlays are authored as stateful patches for map-baked props. When a
 * state/grid overlay uses `placementMode: "replace"` (default) and its box
 * nearly matches a mask — or is a tight change patch mostly contained by it —
 * treat the overlay as the prop/object visual owner and suppress only the mask
 * obstacle image (background/shadow stays). `placementMode: "overlay"` keeps
 * the cut-out and draws the patch on top.
 */
function rectsCloseEnoughForOverlayReplacement(
  mask: Rect,
  overlay: Rect,
): boolean {
  const edgesClose =
    Math.abs(mask.x1 - overlay.x1) <= OVERLAY_MASK_REPLACE_EDGE_TOLERANCE &&
    Math.abs(mask.y1 - overlay.y1) <= OVERLAY_MASK_REPLACE_EDGE_TOLERANCE &&
    Math.abs(mask.x2 - overlay.x2) <= OVERLAY_MASK_REPLACE_EDGE_TOLERANCE &&
    Math.abs(mask.y2 - overlay.y2) <= OVERLAY_MASK_REPLACE_EDGE_TOLERANCE;
  if (edgesClose) return true;

  const intersection = rectIntersectionArea(mask, overlay);
  if (intersection <= 0) return false;

  const overlayArea = rectArea(overlay);
  if (
    overlayArea > 0 &&
    intersection / overlayArea >= OVERLAY_MASK_REPLACE_CONTAINMENT_THRESHOLD
  ) {
    return true;
  }

  const union = rectArea(mask) + overlayArea - intersection;
  return (
    union > 0 && intersection / union >= OVERLAY_MASK_REPLACE_IOU_THRESHOLD
  );
}

function boxesCloseEnoughForOverlayReplacement(
  maskBox: Box2D,
  overlayBox: Box2D,
): boolean {
  return rectsCloseEnoughForOverlayReplacement(
    parseBox2d(maskBox),
    parseBox2d(overlayBox),
  );
}

function maskKeysForOverlayLink(mask: MapMaskEntry): string[] {
  return [mask.label, mask.name]
    .filter((value): value is string => Boolean(value?.trim()))
    .map((value) => value.trim());
}

/** Visual box for linking — prefer explicit box_2d, else first collider AABB. */
function maskBoxForOverlayLink(mask: MapMaskEntry): Box2D | null {
  if (
    Array.isArray(mask.box_2d) &&
    mask.box_2d.length >= 4 &&
    mask.box_2d.every((n) => Number.isFinite(Number(n)))
  ) {
    return mask.box_2d;
  }
  const collider = mask.collider?.[0]?.box_2d;
  if (
    Array.isArray(collider) &&
    collider.length >= 4 &&
    collider.every((n) => Number.isFinite(Number(n)))
  ) {
    return [
      Number(collider[0]),
      Number(collider[1]),
      Number(collider[2]),
      Number(collider[3]),
    ];
  }
  return null;
}

function isStructuralMapOverlay(overlay: MapOverlayEntry): boolean {
  const kind = overlay.kind ?? "state";
  return kind === "state" || kind === "grid";
}

/**
 * State/grid overlays default to `replace` (hide linked cut-out so doors/chests
 * don't double-draw). Explicit `overlay` keeps the base sprite and draws the
 * patch on top — use for shelf stock, props, etc. that only patch part of a prop.
 */
function structuralOverlayReplacesObstacle(overlay: MapOverlayEntry): boolean {
  if (!isStructuralMapOverlay(overlay)) return false;
  return (overlay.placementMode ?? "replace") === "replace";
}

function overlayLinkLabels(overlay: MapOverlayEntry): string[] {
  const labels = [
    overlay.linkedObstacleLabel?.trim(),
    // Edit-UI state overlays store the obstacle name on anchorLabel.
    isStructuralMapOverlay(overlay) ? overlay.anchorLabel?.trim() : undefined,
  ];
  return labels.filter((value): value is string => Boolean(value));
}

/** Active/current state on a raw overlay entry (pre MapOverlayObject). */
function overlayEntryActiveState(overlay: MapOverlayEntry) {
  const requested =
    overlay.currentMapStateLabel ??
    overlay.currentState ??
    overlay.states?.[0]?.name;
  if (isMapOverlayOffState(requested)) return null;
  return (
    overlay.states?.find((state) => state.name === requested) ??
    overlay.states?.[0] ??
    null
  );
}

function overlayEntryOwnsLocalCollision(overlay: MapOverlayEntry): boolean {
  if (!structuralOverlayReplacesObstacle(overlay)) return false;
  return stateHasLocalCollision(overlayEntryActiveState(overlay));
}

function overlayLinksToMask(
  overlay: MapOverlayEntry,
  mask: MapMaskEntry,
): boolean {
  const maskKeys = maskKeysForOverlayLink(mask);
  if (
    overlayLinkLabels(overlay).some((label) =>
      maskKeys.some((key) => key === label),
    )
  ) {
    return true;
  }

  const maskBox = maskBoxForOverlayLink(mask);
  if (!maskBox) return false;
  return overlay.states.some((state) =>
    boxesCloseEnoughForOverlayReplacement(maskBox, state.box_2d),
  );
}

function maskHasCloseMapOverlay(
  mask: MapMaskEntry,
  overlays: MapOverlayEntry[],
): boolean {
  if (mask.type?.toLowerCase() === "boundary") return false;

  return overlays.some((overlay) => {
    if (!structuralOverlayReplacesObstacle(overlay)) return false;
    if (!overlayEntryActiveState(overlay)) return false;
    return overlayLinksToMask(overlay, mask);
  });
}

interface BackgroundPanel {
  image: HTMLImageElement | null;
  /** Top-left corner of this panel in world-norm space. */
  normX: number;
  normY: number;
}

/**
 * GameMap owns the background image, MapObjects, and walkable areas for one
 * isolated map. Travel between maps with `game.loadMap(...)` — maps are never
 * stitched into a multi-panel world.
 *
 * Coordinate contract
 * -------------------
 * All stored values (object bounds, colliders, walkable boxes) are in
 * world-norm space: 0–1000 × 0–1000.
 * The canvas is sized to worldPixelWidth × worldPixelHeight.
 *
 * Public surface
 * --------------
 * .worldPixelWidth / .worldPixelHeight  – canvas size for camera init
 * .worldNormWidth  / .worldNormHeight   – always 1000 × 1000
 * .checkCollision(rect)  – true if rect should be blocked
 * .drawBackground(ctx)   – renders map url and mask backgroundImages
 * .getRenderables()      – returns MapObject[] + map spritesheets for Y-sort queue
 * .drawAtmosphere(ctx)   – one overhead sprite plane after the Y-sort queue
 * .drawDebug(ctx)        – renders obstacle colliders + walkable area outlines
 */
export default class GameMap {
  private _backgroundPanels: BackgroundPanel[];
  private _objects: MapObject[];
  private _mapSprites: MapEffectObject[];
  private _placements: MapPlacementTarget[];
  private _characterPlacements: CharacterPlacementEntry[];
  private _atmosphere: AtmosphereObject[];
  private _overlays: MapOverlayObject[];
  private _erasePatches: ErasePatch[];
  private _walkable: Rect[];
  private _numCols: number;
  private _numRows: number;
  private _panelSizeLocked: boolean;
  private _metricsListeners: Array<() => void> = [];
  private _readyResolvers: Array<() => void> = [];
  private _backgroundLoadsPending: number;
  private _ready = false;

  panelPixelWidth: number;
  panelPixelHeight: number;
  worldPixelWidth: number;
  worldPixelHeight: number;
  readonly worldNormWidth: number;
  readonly worldNormHeight: number;

  constructor(mapData: MapData) {
    const hasExplicitPanelSize =
      mapData.panelPixelWidth != null || mapData.panelPixelHeight != null;
    this._panelSizeLocked = hasExplicitPanelSize;
    const panelPixelWidth =
      mapData.panelPixelWidth ?? DEFAULT_PANEL_PIXEL_WIDTH;
    const panelPixelHeight =
      mapData.panelPixelHeight ?? DEFAULT_PANEL_PIXEL_HEIGHT;
    this.panelPixelWidth = panelPixelWidth;
    this.panelPixelHeight = panelPixelHeight;

    // One isolated map — travel between maps via loadMap, not panel stitching.
    this._numCols = 1;
    this._numRows = 1;
    this.worldNormWidth = NORM;
    this.worldNormHeight = NORM;
    this.worldPixelWidth = panelPixelWidth;
    this.worldPixelHeight = panelPixelHeight;

    const cells: Array<{ data: MapPanelData; gridX: number; gridY: number }> = [
      { data: mapData, gridX: 0, gridY: 0 },
    ];
    const minGridX = 0;
    const minGridY = 0;

    // ── Build per-panel objects ──────────────────────────────────────────────
    this._backgroundPanels = [];
    this._objects = [];
    this._mapSprites = [];
    this._placements = [];
    this._characterPlacements = (mapData.characterPlacements ?? []).map(
      (placement) => ({
        ...placement,
        box_2d: [...placement.box_2d],
      }),
    );
    this._atmosphere = (mapData.atmospherePlacements ?? [])
      .filter(
        (entry) =>
          entry.enabled !== false &&
          Array.isArray(entry.box_2d) &&
          entry.box_2d.length >= 4 &&
          Boolean(entry.spriteSheetUrl?.trim() || entry.url?.trim()),
      )
      .map((entry) => new AtmosphereObject(entry));
    this._overlays = [];
    this._erasePatches = [];
    this._walkable = [];
    this._backgroundLoadsPending = cells.length;

    for (const cell of cells) {
      const panel = cell.data.panel;
      const normX = (cell.gridX - minGridX) * NORM;
      const normY = (cell.gridY - minGridY) * NORM;
      const normOffset =
        normX !== 0 || normY !== 0 ? { x: normX, y: normY } : undefined;

      const spriteSheetData = panel.spriteSheets ?? [];
      const mapOverlayData = panel.mapOverlays ?? [];
      /** Masks whose static art is permanently replaced by a linked sheet. */
      const replaceLinkedMaskKeys = new Set<string>();
      for (const sheet of spriteSheetData) {
        const key = sheet.linkedColliderLabel?.trim();
        if (!key) continue;
        const mode = sheet.placementMode ?? "replace";
        if (mode === "replace") replaceLinkedMaskKeys.add(key);
      }

      // Background image panel — natural size drives pixel_bbox placement.
      const bgPanel: BackgroundPanel = { image: null, normX, normY };
      const panelObjects = (panel.masks ?? []).map((mask) => {
        const keys = [mask.label, mask.name]
          .filter((v): v is string => Boolean(v?.trim()))
          .map((v) => v.trim());
        const replacedByCloseMapOverlay = maskHasCloseMapOverlay(
          mask,
          mapOverlayData,
        );
        const replaceOwnsCollision =
          replacedByCloseMapOverlay &&
          mapOverlayData.some(
            (overlay) =>
              overlayLinksToMask(overlay, mask) &&
              overlayEntryOwnsLocalCollision(overlay),
          );
        const suppressStaticVisuals =
          Boolean(mask.spriteSheetUrl?.trim()) ||
          keys.some((key) => replaceLinkedMaskKeys.has(key));
        const suppressObstacleVisual = replacedByCloseMapOverlay;
        const obj = new MapObject(mask, normOffset, {
          suppressStaticVisuals,
          suppressObstacleVisual,
          // Only convert pixel_bbox immediately when panel size was caller-forced.
          // Otherwise wait for the background image natural size.
          mapPixelWidth: this._panelSizeLocked
            ? this.panelPixelWidth
            : undefined,
          mapPixelHeight: this._panelSizeLocked
            ? this.panelPixelHeight
            : undefined,
        });
        // Replace overlays with local collision must own walkability as soon as
        // they hide the cut-out — don't wait on background image decode.
        if (replaceOwnsCollision) {
          obj.claimCollisionForOverlay();
        }
        return obj;
      });
      this._objects.push(...panelObjects);

      loadImage(panel.url)
        .then((img) => {
          bgPanel.image = img;
          this._onBackgroundImageLoaded(
            img,
            panelObjects,
            mapOverlayData,
            normOffset,
          );
        })
        .catch(() => {
          bgPanel.image = null;
          this._onBackgroundImageLoaded(
            null,
            panelObjects,
            mapOverlayData,
            normOffset,
          );
        });
      this._backgroundPanels.push(bgPanel);

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

      const maskSortAnchors = (panel.masks ?? [])
        .map((mask, index) => {
          if (!mask.box_2d) return null;
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
        })
        .filter(
          (
            anchor,
          ): anchor is {
            bounds: Rect;
            renderY: number;
            area: number;
          } => anchor != null,
        );

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
        if (!spriteSheetUrl || !mask.box_2d) continue;

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
          ...(placement.enterable === true ? { enterable: true } : {}),
          ...(typeof placement.destinationMapId === "string" &&
          placement.destinationMapId.trim()
            ? { destinationMapId: placement.destinationMapId.trim() }
            : typeof placement.destinationMapAssetId === "string" &&
                placement.destinationMapAssetId.trim()
              ? { destinationMapId: placement.destinationMapAssetId.trim() }
              : {}),
          ...(Array.isArray(placement.destinationSpawnBox2d) &&
          placement.destinationSpawnBox2d.length >= 4
            ? {
                destinationSpawnBox2d: placement.destinationSpawnBox2d
                  .slice(0, 4)
                  .map(Number),
              }
            : {}),
          ...(typeof placement.interactionType === "string"
            ? { interactionType: placement.interactionType }
            : {}),
          ...(typeof placement.functionalRole === "string"
            ? { functionalRole: placement.functionalRole }
            : {}),
          ...(typeof placement.templateId === "string"
            ? { templateId: placement.templateId }
            : {}),
          ...(Array.isArray(placement.stages)
            ? { stages: placement.stages }
            : {}),
          ...(typeof placement.gamePlay === "string"
            ? { gamePlay: placement.gamePlay }
            : {}),
        });
      }

      for (const overlay of mapOverlayData) {
        const kind = overlay.kind ?? "state";
        const primary = overlay.states?.[0];

        if (kind === "erase") {
          // Visual patch + collision clear happen after background load
          // (sprite bounds may still be unresolved here for pixel_bbox masks).
          if (!primary?.box_2d || !primary.url?.trim()) continue;
          const rawBounds = parseBox2d(primary.box_2d);
          const bounds = normOffset
            ? offsetRect(rawBounds, normOffset.x, normOffset.y)
            : rawBounds;
          const patch: ErasePatch = {
            id: overlay.id,
            label: overlay.anchorLabel ?? overlay.id,
            bounds,
            image: null,
          };
          loadImage(primary.url.trim())
            .then((image) => {
              patch.image = image;
            })
            .catch(() => {
              patch.image = null;
            });
          this._erasePatches.push(patch);
          continue;
        }

        if (kind === "vfx") {
          const validStates = (overlay.states ?? []).filter(
            (state) => state.box_2d && state.url?.trim(),
          );
          for (const state of validStates) {
            // A multi-state VFX exports independently triggerable effects using
            // `<overlayId>:<stateName>`. Only the selected state may auto-loop.
            const isSelected =
              state.name ===
              (overlay.currentState ??
                overlay.currentMapStateLabel ??
                validStates[0]?.name);
            const requestedMode =
              state.mode === "gameplay" ? "gameplay" : "background";
            const mode =
              validStates.length > 1 && !isSelected
                ? "gameplay"
                : requestedMode;
            const frameCount = Math.max(
              1,
              Number(state.frameCount ?? state.frame_count) || 1,
            );
            this._mapSprites.push(
              new MapEffectObject(
                {
                  label:
                    validStates.length > 1
                      ? `${overlay.anchorLabel ?? overlay.id}:${state.name}`
                      : (overlay.anchorLabel ?? overlay.id),
                  mask_prompt:
                    validStates.length > 1
                      ? `${overlay.id}:${state.name}`
                      : overlay.id,
                  type: mode,
                  box_2d: state.box_2d,
                  frame_count: frameCount,
                  spriteSheetUrl: state.url.trim(),
                  linkedColliderLabel: overlay.linkedObstacleLabel,
                },
                resolveLinkedRenderY(overlay.linkedObstacleLabel) ??
                  inferRenderYFromOverlappingMask(state.box_2d as Box2D),
                normOffset,
                { defaultType: mode },
              ),
            );
          }
          continue;
        }

        // state / grid / legacy structural overlays
        if (overlay.states?.length) {
          const primary = overlay.states[0];
          const linkedRenderY =
            resolveLinkedRenderY(overlay.linkedObstacleLabel) ??
            resolveLinkedRenderY(overlay.anchorLabel) ??
            (primary?.box_2d
              ? inferRenderYFromOverlappingMask(primary.box_2d as Box2D)
              : undefined);
          this._overlays.push(
            new MapOverlayObject(overlay, normOffset, { linkedRenderY }),
          );
        }
      }
    }

    if (this._backgroundLoadsPending === 0) {
      this._markReady();
    }
  }

  /**
   * Fired when background panel size / pixel placement is resolved so the
   * runtime can resync camera canvas metrics.
   */
  onMetricsChanged(listener: () => void): () => void {
    this._metricsListeners.push(listener);
    return () => {
      this._metricsListeners = this._metricsListeners.filter(
        (entry) => entry !== listener,
      );
    };
  }

  /** Resolves once all background panels have finished loading (or failed). */
  whenReady(): Promise<void> {
    if (this._ready) return Promise.resolve();
    return new Promise((resolve) => {
      this._readyResolvers.push(resolve);
    });
  }

  private _onBackgroundImageLoaded(
    img: HTMLImageElement | null,
    panelObjects: MapObject[],
    mapOverlays: MapOverlayEntry[],
    normOffset?: { x: number; y: number },
  ): void {
    const eraseOverlays = mapOverlays.filter(
      (overlay) => (overlay.kind ?? "state") === "erase",
    );

    if (img?.naturalWidth && img.naturalHeight) {
      // Prefer the real loaded map size unless the caller locked panel pixels.
      if (!this._panelSizeLocked) {
        const nextW = img.naturalWidth;
        const nextH = img.naturalHeight;
        if (nextW !== this.panelPixelWidth || nextH !== this.panelPixelHeight) {
          this.panelPixelWidth = nextW;
          this.panelPixelHeight = nextH;
          this.worldPixelWidth = this._numCols * nextW;
          this.worldPixelHeight = this._numRows * nextH;
          for (const listener of this._metricsListeners) listener();
        }
      }

      // Place cut-outs from pixel_bbox using the loaded map image size.
      // (When size is locked, still use locked panel metrics for consistency.)
      const placeW = this._panelSizeLocked
        ? this.panelPixelWidth
        : img.naturalWidth;
      const placeH = this._panelSizeLocked
        ? this.panelPixelHeight
        : img.naturalHeight;
      for (const obj of panelObjects) {
        obj.resolveFromMapPixels(placeW, placeH);
      }

      // v2 sprites only get normalized bounds after pixel_bbox resolve — re-check
      // state/grid overlay ownership so cut-outs don't double-draw over patches.
      this._applyStateOverlayObstacleSuppression(
        mapOverlays,
        panelObjects,
        normOffset,
      );

      // Anchor state/grid overlays to the resolved cut-out Y + real mask label
      // (authoring labels like "market stall" often differ from sprite labels).
      this._syncOverlayMaskLinks(mapOverlays, panelObjects, normOffset);

      // Obstacle-edit local collision: overlay owns walkability; clear base sprite.
      this._syncOverlayReplacementOwnership(panelObjects);

      this._applyEraseOverlayCollisions(
        eraseOverlays,
        panelObjects,
        normOffset,
      );
    } else {
      // Image missing/failed — still transfer collision to replace overlays by label.
      this._applyStateOverlayObstacleSuppression(
        mapOverlays,
        panelObjects,
        normOffset,
      );
      this._syncOverlayMaskLinks(mapOverlays, panelObjects, normOffset);
      this._syncOverlayReplacementOwnership(panelObjects);
      this._applyEraseOverlayCollisions(
        eraseOverlays,
        panelObjects,
        normOffset,
      );
    }

    this._backgroundLoadsPending = Math.max(
      0,
      this._backgroundLoadsPending - 1,
    );
    if (this._backgroundLoadsPending === 0) {
      this._markReady();
    }
  }

  /**
   * After mask bounds resolve, suppress Y-sorted obstacle cut-outs that a
   * state/grid overlay with `placementMode: "replace"` (default) owns
   * (label match or bbox containment/IoU). `placementMode: "overlay"` leaves
   * the base cut-out and draws the patch on top.
   */
  private _applyStateOverlayObstacleSuppression(
    overlays: MapOverlayEntry[],
    panelObjects: MapObject[],
    normOffset?: { x: number; y: number },
  ): void {
    const structural = overlays.filter(
      (overlay) =>
        structuralOverlayReplacesObstacle(overlay) &&
        Boolean(overlayEntryActiveState(overlay)),
    );
    if (!structural.length) return;

    for (const obj of panelObjects) {
      if (obj.type.toLowerCase() === "boundary") continue;
      const maskRect = obj.getBounds();
      const hasBounds = maskRect.x2 > maskRect.x1 && maskRect.y2 > maskRect.y1;

      const owner = structural.find((overlay) => {
        const labels = overlayLinkLabels(overlay);
        if (
          labels.some(
            (label) => label === obj.label.trim() || label === obj.name.trim(),
          )
        ) {
          return true;
        }
        if (!hasBounds) return false;
        return (overlay.states ?? []).some((state) => {
          if (!Array.isArray(state.box_2d) || state.box_2d.length < 4) {
            return false;
          }
          let overlayRect = parseBox2d(state.box_2d);
          if (normOffset) {
            overlayRect = offsetRect(overlayRect, normOffset.x, normOffset.y);
          }
          return rectsCloseEnoughForOverlayReplacement(maskRect, overlayRect);
        });
      });

      if (!owner) continue;
      obj.suppressObstacleVisual();
      // Keep collision ownership in lockstep with visual replace. Otherwise the
      // closed-gate collider still blocks after the open patch is showing.
      if (overlayEntryOwnsLocalCollision(owner)) {
        obj.claimCollisionForOverlay();
      }
    }
  }

  /**
   * Bind structural overlays to the cut-out they patch so they share renderY
   * and draw immediately after that mask (needed for placementMode: overlay —
   * otherwise the shelf patch sorts by its own smaller box and paints under the
   * stall canopy cut-out).
   */
  private _syncOverlayMaskLinks(
    overlays: MapOverlayEntry[],
    panelObjects: MapObject[],
    normOffset?: { x: number; y: number },
  ): void {
    const candidates = panelObjects.filter((obj) => {
      if (obj.type.toLowerCase() === "boundary") return false;
      const bounds = obj.getBounds();
      return bounds.x2 > bounds.x1 && bounds.y2 > bounds.y1;
    });
    if (!candidates.length) return;

    for (const overlayObj of this._overlays) {
      const entry = overlays.find((overlay) => overlay.id === overlayObj.id);
      if (!entry || !isStructuralMapOverlay(entry)) continue;

      const labels = overlayLinkLabels(entry);
      const overlayRect = overlayObj.getBounds();
      const labelCandidates = candidates.filter((obj) =>
        labels.some(
          (label) => label === obj.label.trim() || label === obj.name.trim(),
        ),
      );
      let matched =
        labelCandidates.length === 1
          ? labelCandidates[0]!
          : bestMapObjectForBounds(labelCandidates, overlayRect);

      if (!matched) {
        const centerX = (overlayRect.x1 + overlayRect.x2) * 0.5;
        const centerY = (overlayRect.y1 + overlayRect.y2) * 0.5;
        const containing = candidates
          .map((obj) => {
            const bounds = obj.getBounds();
            return {
              obj,
              bounds,
              area: rectArea(bounds),
              contains:
                centerX >= bounds.x1 &&
                centerX <= bounds.x2 &&
                centerY >= bounds.y1 &&
                centerY <= bounds.y2,
            };
          })
          .filter((entry) => entry.contains)
          .sort((a, b) => a.area - b.area)[0];
        if (containing) {
          matched = containing.obj;
        } else {
          const overlapping = candidates
            .map((obj) => {
              const bounds = obj.getBounds();
              return {
                obj,
                area: rectArea(bounds),
                hit: rectsOverlap(bounds, overlayRect),
              };
            })
            .filter((entry) => entry.hit)
            .sort((a, b) => a.area - b.area)[0];
          matched = overlapping?.obj ?? null;
        }
      }

      // Also accept close bbox match against authored state boxes (replace patches).
      if (!matched) {
        for (const obj of candidates) {
          const maskRect = obj.getBounds();
          const close = (entry.states ?? []).some((state) => {
            if (!Array.isArray(state.box_2d) || state.box_2d.length < 4) {
              return false;
            }
            let overlayRect = parseBox2d(state.box_2d);
            if (normOffset) {
              overlayRect = offsetRect(overlayRect, normOffset.x, normOffset.y);
            }
            return rectsCloseEnoughForOverlayReplacement(maskRect, overlayRect);
          });
          if (close) {
            matched = obj;
            break;
          }
        }
      }

      if (matched) {
        overlayObj.bindLinkedMask(matched.label, matched.renderY);
      }
    }
  }

  /**
   * Clear sprite collision under unified `kind: "erase"` mapOverlays.
   * Prefer an exact metadata link when present. Legacy/authored erases fall
   * back to coverage (intersection / sprite area), because broad AABB overlap
   * alone would wipe neighbors that only clip the erase edge.
   */
  private _applyEraseOverlayCollisions(
    eraseOverlays: MapOverlayEntry[],
    panelObjects: MapObject[],
    normOffset?: { x: number; y: number },
  ): void {
    for (const overlay of eraseOverlays) {
      const primary = overlay.states?.[0];
      if (!primary?.box_2d) continue;
      if (primary.clearsCollision === false) continue;
      const rawBounds = parseBox2d(primary.box_2d);
      const bounds = normOffset
        ? offsetRect(rawBounds, normOffset.x, normOffset.y)
        : rawBounds;
      if (rectArea(bounds) <= 0) continue;

      const linkKey = overlay.linkedObstacleLabel?.trim();
      if (linkKey) {
        const linked = panelObjects.filter(
          (obj) =>
            obj.type.toLowerCase() !== "boundary" &&
            (obj.label.trim() === linkKey || obj.name.trim() === linkKey),
        );
        if (linked.length > 0) {
          const owner =
            linked.length === 1
              ? linked[0]!
              : bestMapObjectForBounds(linked, bounds);
          owner?.applyEraseOverwrite();
          continue;
        }
      }

      for (const obj of panelObjects) {
        if (obj.type.toLowerCase() === "boundary") continue;
        const objBounds = obj.getBounds();
        const objArea = rectArea(objBounds);
        if (objArea <= 0) continue;
        const intersection = rectIntersectionArea(objBounds, bounds);
        if (intersection <= 0) continue;
        if (intersection / objArea >= ERASE_COLLISION_COVERAGE_THRESHOLD) {
          obj.applyEraseOverwrite();
        }
      }
    }
  }

  /**
   * Keep replacement visual and local-collision ownership aligned with the
   * active state. Turning the overlay off (`initial`) restores the base
   * Y-sorted cut-out and releases any collision claim.
   *
   * Prefer the resolved link (`linkedMaskKey` / `linkedObstacleLabel`) — that is
   * the behind-obstacle the overlay replaces. Only fall back to bbox overlap
   * when no link resolved, so neighboring generated sprites keep their collision.
   */
  private _syncOverlayReplacementOwnership(panelObjects: MapObject[]): void {
    for (const obj of panelObjects) {
      obj.releaseCollisionForOverlay();
      obj.restoreObstacleVisual();
    }

    for (const overlay of this._overlays) {
      if (isMapOverlayOffState(overlay.currentStateName)) continue;
      if (overlay.kind !== "state" && overlay.kind !== "grid") continue;
      if (overlay.placementMode !== "replace") continue;

      const overlayBounds = overlay.getBounds();
      const linkKey = overlay.linkedMaskKey?.trim();
      const linkedCandidates = linkKey
        ? panelObjects.filter(
            (obj) =>
              obj.type.toLowerCase() !== "boundary" &&
              (obj.label.trim() === linkKey || obj.name.trim() === linkKey),
          )
        : [];
      const linkedOwner =
        linkedCandidates.length === 1
          ? linkedCandidates[0]!
          : bestMapObjectForBounds(linkedCandidates, overlayBounds);

      for (const obj of panelObjects) {
        if (obj.type.toLowerCase() === "boundary") continue;
        const shouldOverride = linkKey
          ? obj === linkedOwner
          : rectsOverlap(obj.getBounds(), overlayBounds);
        if (shouldOverride) {
          // Replacement visual ownership follows the active state. This keeps
          // the original cut-out/Y-sort intact while the overlay is "initial"
          // and restores it when gameplay turns the overlay off again.
          obj.suppressObstacleVisual();
          if (overlay.hasLocalCollision) {
            obj.claimCollisionForOverlay();
          }
        }
      }
    }
  }

  private _markReady(): void {
    if (this._ready) return;
    this._ready = true;
    const resolvers = this._readyResolvers.splice(0);
    for (const resolve of resolvers) resolve();
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

    // `kind: "erase"` mapOverlays: static patches on top of the map layer so the
    // cleared area sits in front of other map-layer art.
    for (const patch of this._erasePatches) {
      const image = patch.image;
      if (!image?.complete || !image.naturalWidth) continue;
      const { x, y } = toPixel(
        patch.bounds.x1,
        patch.bounds.y1,
        wnw,
        wnh,
        wpw,
        wph,
      );
      const { x: x2, y: y2 } = toPixel(
        patch.bounds.x2,
        patch.bounds.y2,
        wnw,
        wnh,
        wpw,
        wph,
      );
      ctx.drawImage(
        image,
        snapCanvasValue(x),
        snapCanvasValue(y),
        snapCanvasValue(x2 - x),
        snapCanvasValue(y2 - y),
      );
    }
  }

  getRenderables(): Array<
    (MapObject | MapEffectObject | MapOverlayObject) & RenderSortable
  > {
    const renderables: Array<
      (MapObject | MapEffectObject | MapOverlayObject) & RenderSortable
    > = [];
    const unlinkedSprites = [...this._mapSprites];
    const unlinkedOverlays = this._overlays.filter(
      (overlay) => overlay.participatesInYSort,
    );

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
      // State/grid patches (esp. placementMode: overlay) must draw right after
      // their base cut-out when Y ties — otherwise a smaller shelf box sorts
      // behind the full stall canopy.
      for (let i = unlinkedOverlays.length - 1; i >= 0; i -= 1) {
        const overlay = unlinkedOverlays[i];
        if (overlay.linkedMaskKey && keys.has(overlay.linkedMaskKey)) {
          renderables.push(overlay);
          unlinkedOverlays.splice(i, 1);
        }
      }
    }

    renderables.push(...unlinkedSprites);
    renderables.push(...unlinkedOverlays);
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

  getCharacterPlacements(): CharacterPlacementEntry[] {
    return this._characterPlacements.map((placement) => ({
      ...placement,
      box_2d: [...placement.box_2d],
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
    const changed = overlay.setState(state);
    if (changed) {
      this._syncOverlayReplacementOwnership(this._objects);
    }
    return changed;
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

  /** Floating sky-layer sprites — drawn after the world Y-sort queue. */
  drawAtmosphere(ctx: CanvasRenderingContext2D, now = performance.now()): void {
    const worldNormW = this.worldNormWidth;
    const worldNormH = this.worldNormHeight;
    const worldPixelW = this.worldPixelWidth;
    const worldPixelH = this.worldPixelHeight;
    for (const item of this._atmosphere) {
      item.draw(ctx, now, worldNormW, worldNormH, worldPixelW, worldPixelH);
    }
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

  /**
   * Play the nearest gameplay (non-background) map VFX, regardless of tag.
   * When `maxDistance` is set, only effects within that world-norm radius play.
   */
  playNearestGameplayEffect(
    atX: number,
    atY: number,
    now = performance.now(),
    maxDistance?: number,
  ): boolean {
    let nearest: MapEffectObject | null = null;
    let nearestDistanceSq = Number.POSITIVE_INFINITY;
    const maxDistanceSq =
      typeof maxDistance === "number" && Number.isFinite(maxDistance)
        ? maxDistance * maxDistance
        : Number.POSITIVE_INFINITY;

    for (const sprite of this._mapSprites) {
      if (sprite.type === "background") continue;
      const distanceSq = sprite.distanceSqTo(atX, atY);
      if (distanceSq > maxDistanceSq) continue;
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

    // Erase mapOverlay patches — magenta outline
    for (const patch of this._erasePatches) {
      const { x, y } = toPixel(
        patch.bounds.x1,
        patch.bounds.y1,
        wnw,
        wnh,
        wpw,
        wph,
      );
      const { x: x2, y: y2 } = toPixel(
        patch.bounds.x2,
        patch.bounds.y2,
        wnw,
        wnh,
        wpw,
        wph,
      );
      ctx.save();
      ctx.strokeStyle = "rgba(255, 80, 220, 0.9)";
      ctx.fillStyle = "rgba(255, 80, 220, 0.1)";
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x, y, x2 - x, y2 - y);
      ctx.fillRect(x, y, x2 - x, y2 - y);
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,200,255,0.95)";
      ctx.font = "11px 'Geist Pixel', sans-serif";
      ctx.fillText(`erase:${patch.label}`, x + 4, y + 14);
      ctx.restore();
    }

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
