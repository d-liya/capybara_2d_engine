import type { MovementInput } from "./types";
import {
  loadImage,
  parseBox2d,
  rectsOverlap,
  snapCanvasValue,
  toPixel,
  NORM,
} from "../utils/common";
import GameMap from "./GameMap";
import CameraViewportController from "./CameraViewportController";
import type { Camera, Viewport } from "./CameraViewportController";
import InputController from "./InputController";
import EntityActor from "./EntityActor";
import WidgetManager from "./WidgetManager";
import {
  createDefaultUiState,
  patchUiState,
  UI_RESOURCE,
  type UiState,
  type UiStatePatch,
} from "../types/UiState";
import type {
  EntityAnimationOptions,
  EntitySpriteTransitionOptions,
  HoverTarget,
  MapOverlayTarget,
  MapPlacementTarget,
  PropPlacementInput,
  TooltipContent,
} from "./HoverTypes";
import { compareRenderSort, type RenderLayer } from "./renderSort";
import PathfindingGrid from "./PathfindingGrid";
import type {
  EntityDestinationOptions,
  EntityNavigationState,
  FindPathOptions,
  FindPathResult,
  NavigationEventPayload,
  PathPoint,
} from "../types/Navigation";
import type { WidgetPluginFactory } from "../Game.types";

export type { WidgetPluginFactory };

export type EntityId = string;
export type ComponentBag = Record<string, unknown>;
export type SystemFn = (dt: number, game: GameRuntime) => void;
export type EventHandler = (payload: unknown) => void;
export type InputActionPhase = "down" | "up";
export type {
  EntityAnimationOptions,
  EntitySpriteTransitionOptions,
  HoverTarget,
  MapOverlayTarget,
  MapPlacementTarget,
  PropPlacementInput,
  TooltipContent,
};

export interface PlayerSpawnConfig {
  x: number;
  y: number;
  anchor?: "top-left" | "feet" | "center";
  width?: number;
  height?: number;
  sprite: {
    spriteSheets?: Array<{
      name: string;
      url: string;
      frame_count?: number | string;
      width?: number;
      height?: number;
    }>;
  };
}

export interface LoadMapOptions {
  spawn?: {
    x: number;
    y: number;
    anchor?: "top-left" | "feet" | "center";
  };
}

interface EntityImageRenderable {
  image: HTMLImageElement | null;
  sourceUrl: string;
  width: number;
  height: number;
}

interface QueueRenderable {
  renderY: number;
  renderLayer: RenderLayer;
  draw(
    ctx: CanvasRenderingContext2D,
    now?: number,
    worldNormW?: number,
    worldNormH?: number,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void;
  drawDebug?(
    ctx: CanvasRenderingContext2D,
    worldNormW?: number,
    worldNormH?: number,
    worldPixelW?: number,
    worldPixelH?: number,
  ): void;
}

interface SpriteFootAnchor {
  left: number;
  right: number;
  bottom: number;
}

interface PendingFeetAnchorPlacement {
  cacheKey: string;
  feetX: number;
  feetY: number;
  usedCenterRatio: number;
  usedBottomRatio: number;
}

const KEY_MAP: Record<string, keyof MovementInput> = {
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down",
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
};

const CAMERA_FOLLOW_ZOOM = 1.45;
const SPAWN_REVEAL_MS = 320;
const DEFAULT_ENTITY_WIDTH = 80;
const DEFAULT_ENTITY_HEIGHT = 80;
const DEFAULT_MAP_WIDTH_PX = 2508;
const DEFAULT_MAP_HEIGHT_PX = 1672;

const createEmptyMovementInput = (): MovementInput => ({
  up: false,
  down: false,
  left: false,
  right: false,
});

const NO_MOVEMENT_INPUT: MovementInput = createEmptyMovementInput();

export default class GameRuntime {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  cameraController: CameraViewportController;
  camera: Camera;
  viewport: Viewport;
  cameraFollowEnabled: boolean;
  debug: boolean;
  /** When true, skip map background panels so cut-out masks/sprites are easy to inspect. */
  hideMapBackground: boolean;
  keys: MovementInput;
  map: GameMap;
  widgets: WidgetManager<GameRuntime>;
  input: InputController;
  private _onResize: () => void;
  private _lastTime: number;
  private _destroyed: boolean;
  private _archetypes: Map<string, ComponentBag>;
  private _entities: Map<EntityId, ComponentBag>;
  private _systems: Map<string, SystemFn>;
  private _resources: Map<string, unknown>;
  private _events: Map<string, Set<EventHandler>>;
  private _nextEntityId: number;
  private _entityActors: Map<EntityId, EntityActor>;
  private _entityImages: Map<EntityId, EntityImageRenderable>;
  private _entitySpriteSignatures: Map<EntityId, string>;
  private _entityBoundAnimations: Map<EntityId, string>;
  private _spriteFootAnchorCache: Map<string, SpriteFootAnchor>;
  private _spriteFootAnchorPending: Set<string>;
  private _pendingFeetAnchorPlacement: Map<
    EntityId,
    PendingFeetAnchorPlacement
  >;
  private _controlledEntityId: EntityId | null;
  private _hoverTarget: HoverTarget | null;
  private _pathGridCache: Map<string, PathfindingGrid>;
  private _entityNavigation: Map<EntityId, EntityNavigationState>;
  private _entitySpawnTimes: Map<EntityId, number>;

  constructor(
    canvasId: string,
    map: GameMap,
    player?: PlayerSpawnConfig,
    cameraEdgePadding = 0,
  ) {
    this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
    this.ctx = this.canvas.getContext("2d");
    this.cameraController = new CameraViewportController(this.canvas, {
      panelPixelWidth: map.panelPixelWidth,
      panelPixelHeight: map.panelPixelHeight,
      worldPixelWidth: map.worldPixelWidth,
      worldPixelHeight: map.worldPixelHeight,
      followZoom: CAMERA_FOLLOW_ZOOM,
      edgePadding: cameraEdgePadding,
    });
    this.camera = this.cameraController.camera;
    this.viewport = this.cameraController.viewport;
    this.cameraFollowEnabled = this.cameraController.cameraFollowEnabled;

    this.debug = false;
    this.hideMapBackground = false;
    this.keys = createEmptyMovementInput();
    this.map = map;
    // When the map background loads, pixel size may update from naturalWidth/Height.
    map.onMetricsChanged(() => {
      this.cameraController.panelPixelWidth = map.panelPixelWidth;
      this.cameraController.panelPixelHeight = map.panelPixelHeight;
      this.cameraController.worldPixelWidth = map.worldPixelWidth;
      this.cameraController.worldPixelHeight = map.worldPixelHeight;
      this._resizeCanvas();
    });
    this.widgets = new WidgetManager<GameRuntime>(this.canvas, "hud-root", {
      plugins: [],
      state: {},
    });
    this.widgets.setGame(this);
    this._destroyed = false;
    this._archetypes = new Map();
    this._entities = new Map();
    this._systems = new Map();
    this._resources = new Map();
    this._events = new Map();
    this._nextEntityId = 1;
    this._entityActors = new Map();
    this._entityImages = new Map();
    this._entitySpriteSignatures = new Map();
    this._entityBoundAnimations = new Map();
    this._spriteFootAnchorCache = new Map();
    this._spriteFootAnchorPending = new Set();
    this._pendingFeetAnchorPlacement = new Map();
    this._controlledEntityId = null;
    this._hoverTarget = null;
    this._pathGridCache = new Map();
    this._entityNavigation = new Map();
    this._entitySpawnTimes = new Map();

    this.registerResource(UI_RESOURCE, createDefaultUiState());
    this.input = new InputController(this, KEY_MAP);

    if (player) {
      const playerSpawn = this._resolvePlayerSpawnPosition(player);
      this.defineArchetype("player", {
        kind: "player",
        spriteSheets: player.sprite.spriteSheets ?? [],
      });
      const playerId = this.spawn("player", {
        x: playerSpawn.x,
        y: playerSpawn.y,
      });
      this.setControlledEntity(playerId);
      this.registerResource("playerId", playerId);
    }

    this._onResize = this._resizeCanvas.bind(this);
    window.addEventListener("resize", this._onResize);
    window.visualViewport?.addEventListener("resize", this._onResize);
    window.visualViewport?.addEventListener("scroll", this._onResize);
    this._resizeCanvas();
    this._setupInput();
    this._lastTime = performance.now();
    requestAnimationFrame((now) => this._loop(now));
  }

  loadMap(newMap: GameMap, options: LoadMapOptions = {}): void {
    this.map = newMap;
    this.cameraController.panelPixelWidth = newMap.panelPixelWidth;
    this.cameraController.panelPixelHeight = newMap.panelPixelHeight;
    this.cameraController.worldPixelWidth = newMap.worldPixelWidth;
    this.cameraController.worldPixelHeight = newMap.worldPixelHeight;
    newMap.onMetricsChanged(() => {
      this.cameraController.panelPixelWidth = newMap.panelPixelWidth;
      this.cameraController.panelPixelHeight = newMap.panelPixelHeight;
      this.cameraController.worldPixelWidth = newMap.worldPixelWidth;
      this.cameraController.worldPixelHeight = newMap.worldPixelHeight;
      this._resizeCanvas();
    });

    this._pathGridCache.clear();
    this._entityNavigation.clear();
    this._hoverTarget = null;
    this.keys = createEmptyMovementInput();

    const spawn = options.spawn;
    if (this._controlledEntityId && spawn) {
      const entity = this._entities.get(this._controlledEntityId);
      if (entity) {
        const width = this._inferEntityWidth(entity);
        const height = this._inferEntityHeight(entity);
        let x = spawn.x;
        let y = spawn.y;
        const anchor = spawn.anchor ?? "top-left";
        const measuredAnchor =
          anchor === "feet" ? this._getSpriteFootAnchorFromCache(entity) : null;
        const centerRatio = measuredAnchor
          ? (measuredAnchor.left + measuredAnchor.right) * 0.5
          : 0.5;
        const bottomRatio = measuredAnchor?.bottom ?? 1;

        if (anchor === "center") {
          x = spawn.x - width * 0.5;
          y = spawn.y - height * 0.5;
        } else if (anchor === "feet") {
          x = spawn.x - width * centerRatio;
          y = spawn.y - height * bottomRatio;
        }

        this.patchEntity(this._controlledEntityId, { x, y });
        this._ensureEntityOnWalkable(this._controlledEntityId);

        if (anchor === "feet") {
          const spriteMeta = this._getPrimarySpriteSheetMeta(entity);
          if (spriteMeta) {
            const cacheKey = this._getSpriteFootAnchorCacheKey(
              spriteMeta.url,
              spriteMeta.frameCount,
            );
            if (!measuredAnchor) {
              this._pendingFeetAnchorPlacement.set(this._controlledEntityId, {
                cacheKey,
                feetX: spawn.x,
                feetY: spawn.y,
                usedCenterRatio: centerRatio,
                usedBottomRatio: bottomRatio,
              });
            }
            this._ensureSpriteFootAnchorMeasured(
              cacheKey,
              spriteMeta.url,
              spriteMeta.frameCount,
            );
          }
        }
      }
    }

    this._resizeCanvas();
    this._updateCamera();
    this.emit("map:changed", options);
  }

  setControlledEntity(id: EntityId | null): void {
    if (id === null) {
      this._controlledEntityId = null;
      return;
    }

    if (!this._entities.has(id)) {
      throw new Error(`Cannot control missing entity: ${id}`);
    }

    this._controlledEntityId = id;
    this.registerResource("playerId", id);
  }

  getControlledEntity(): EntityId | null {
    return this._controlledEntityId;
  }

  defineArchetype(name: string, defaults: ComponentBag): void {
    this._archetypes.set(name, { ...defaults });
  }

  applyEntityArchetype(
    id: EntityId,
    archetypeName: string,
    props: ComponentBag = {},
  ): void {
    const base = this._archetypes.get(archetypeName);
    if (!base) {
      throw new Error(`Unknown archetype: ${archetypeName}`);
    }

    const entity = this._entities.get(id);
    if (!entity) {
      return;
    }

    const merged = { ...base, ...props };
    const changes: ComponentBag = {
      archetype: archetypeName,
      ...props,
    };

    const variantKeys = [
      "speed",
      "radius",
      "width",
      "height",
      "label",
      "kind",
      "tooltip",
      "frameDurationMs",
      "animationTransitionMs",
      "shadow",
    ] as const;

    for (const key of variantKeys) {
      if (key in merged) {
        changes[key] = merged[key];
      }
    }

    if (Array.isArray(merged.spriteSheets) && merged.spriteSheets.length > 0) {
      changes.spriteSheets = merged.spriteSheets;
      changes.activeAnimation = this._resolveVariantActiveAnimation(entity);
    }

    this.patchEntity(id, changes);
  }

  spawn(archetype: string, props: ComponentBag = {}): EntityId {
    const base = this._archetypes.get(archetype);
    if (!base) {
      throw new Error(`Unknown archetype: ${archetype}`);
    }

    const id = `e_${this._nextEntityId}`;
    this._nextEntityId += 1;
    const entity = { ...base, ...props };
    this._entities.set(id, entity);
    this._entitySpawnTimes.set(id, performance.now());
    this._bindEntityRenderState(id, entity);
    if (this._entityActors.has(id)) {
      this._ensureEntityOnWalkable(id);
    }
    return id;
  }

  spawnAtFeet(
    archetype: string,
    feetX: number,
    feetY: number,
    props: ComponentBag = {},
  ): EntityId {
    const base = this._archetypes.get(archetype);
    if (!base) {
      throw new Error(`Unknown archetype: ${archetype}`);
    }

    const merged = { ...base, ...props };
    const measuredAnchor = this._getSpriteFootAnchorFromCache(merged);
    const centerRatio = measuredAnchor
      ? (measuredAnchor.left + measuredAnchor.right) * 0.5
      : 0.5;
    const bottomRatio = measuredAnchor?.bottom ?? 1;
    const inferredWidth = this._inferEntityWidth(merged);
    const inferredHeight = this._inferEntityHeight(merged);
    const x = feetX - inferredWidth * centerRatio;
    const y = feetY - inferredHeight * bottomRatio;
    const id = this.spawn(archetype, {
      ...props,
      x,
      y,
    });

    const spriteMeta = this._getPrimarySpriteSheetMeta(merged);
    if (spriteMeta) {
      const cacheKey = this._getSpriteFootAnchorCacheKey(
        spriteMeta.url,
        spriteMeta.frameCount,
      );
      if (!measuredAnchor) {
        this._pendingFeetAnchorPlacement.set(id, {
          cacheKey,
          feetX,
          feetY,
          usedCenterRatio: centerRatio,
          usedBottomRatio: bottomRatio,
        });
      }
      this._ensureSpriteFootAnchorMeasured(
        cacheKey,
        spriteMeta.url,
        spriteMeta.frameCount,
      );
    }

    return id;
  }

  spawnCentered(
    archetype: string,
    centerX: number,
    centerY: number,
    props: ComponentBag = {},
  ): EntityId {
    const base = this._archetypes.get(archetype);
    if (!base) {
      throw new Error(`Unknown archetype: ${archetype}`);
    }

    const merged = { ...base, ...props };
    const inferredWidth = this._inferEntityWidth(merged);
    const inferredHeight = this._inferEntityHeight(merged);
    return this.spawn(archetype, {
      ...props,
      x: centerX - inferredWidth * 0.5,
      y: centerY - inferredHeight * 0.5,
    });
  }

  placeProp(
    archetype: string,
    placement: PropPlacementInput,
    props: ComponentBag = {},
  ): EntityId {
    const resolved = this._resolvePropPlacement(archetype, placement, props);
    return this.spawn(archetype, {
      ...props,
      ...resolved,
    });
  }

  patchEntity(id: EntityId, changes: ComponentBag): void {
    const entity = this._entities.get(id);
    if (!entity) {
      return;
    }
    const nextEntity = { ...entity, ...changes };
    this._entities.set(id, nextEntity);
    this._bindEntityRenderState(id, nextEntity);
  }

  setEntityAnimation(
    id: EntityId,
    animationName: string,
    options: EntityAnimationOptions = {},
  ): void {
    const entity = this._entities.get(id);
    if (entity?.activeAnimation === animationName) {
      const actor = this._entityActors.get(id);
      if (actor) {
        actor.setActiveAnimation(animationName, options.transitionMs);
      }
      return;
    }

    const actor = this._entityActors.get(id);
    if (actor) {
      actor.setActiveAnimation(animationName, options.transitionMs);
    }
    this.patchEntity(id, { activeAnimation: animationName });
  }

  setEntitySpriteSheets(
    id: EntityId,
    spriteSheets: Array<{
      name: string;
      url: string;
      frame_count?: number | string;
      width?: number;
      height?: number;
    }>,
    options: EntitySpriteTransitionOptions = {},
  ): void {
    this.patchEntity(id, {
      spriteSheets,
      activeAnimation: options.activeAnimation,
      animationTransitionMs: options.transitionMs,
    });
  }

  setEntityFacingX(id: EntityId, facingX: number): void {
    const nextFacingX = facingX < 0 ? -1 : facingX > 0 ? 1 : 0;
    if (nextFacingX === 0) return;

    const entity = this._entities.get(id);
    const actor = this._entityActors.get(id);
    if (actor) {
      actor.setFacingX(nextFacingX);
    }
    if (!entity) return;

    const currentFacing = Number(entity.facingX);
    if (currentFacing === nextFacingX) {
      return;
    }

    this.patchEntity(id, { facingX: nextFacingX });
  }

  getEntity(id: EntityId): ComponentBag | null {
    const entity = this._entities.get(id);
    if (!entity) {
      return null;
    }
    return { ...entity };
  }

  /** Alias for {@link getEntity} — matches the public `GameAPI.get` surface used by HUD widgets. */
  get(id: EntityId): ComponentBag | null {
    return this.getEntity(id);
  }

  getEntityFeet(id: EntityId): PathPoint | null {
    const entity = this._entities.get(id);
    if (!entity) return null;
    return this._getEntityFeetPoint(id, entity);
  }

  destroyEntity(id: EntityId): void {
    this._entities.delete(id);
    this._entityActors.delete(id);
    this._entityImages.delete(id);
    this._entitySpriteSignatures.delete(id);
    this._entityBoundAnimations.delete(id);
    this._pendingFeetAnchorPlacement.delete(id);
    this._entitySpawnTimes.delete(id);
  }

  normalizedToCanvasPoint(
    normalizedX: number,
    normalizedY: number,
  ): {
    x: number;
    y: number;
  } {
    const worldX = (normalizedX / NORM) * this.cameraController.panelPixelWidth;
    const worldY =
      (normalizedY / NORM) * this.cameraController.panelPixelHeight;
    const canvasX = worldX * this.camera.zoom + this.camera.x;
    const canvasY = worldY * this.camera.zoom + this.camera.y;
    const scale = this.viewport.cssScale ?? 1;

    return {
      x: canvasX * scale,
      y: canvasY * scale,
    };
  }

  canvasClientToNormalizedPoint(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return null;
    }

    const scale = this.viewport.cssScale || rect.width / this.canvas.width || 1;
    const canvasX = (clientX - rect.left) / scale;
    const canvasY = (clientY - rect.top) / scale;
    const worldPixelX = (canvasX - this.camera.x) / this.camera.zoom;
    const worldPixelY = (canvasY - this.camera.y) / this.camera.zoom;
    const x = (worldPixelX / this.map.panelPixelWidth) * NORM;
    const y = (worldPixelY / this.map.panelPixelHeight) * NORM;

    if (
      x < 0 ||
      y < 0 ||
      x > this.map.worldNormWidth ||
      y > this.map.worldNormHeight
    ) {
      return null;
    }

    return { x, y };
  }

  getHoverTargetAt(clientX: number, clientY: number): HoverTarget | null {
    const point = this.canvasClientToNormalizedPoint(clientX, clientY);
    if (!point) {
      return null;
    }

    const candidates = [
      ...this._getEntityHoverTargetsAt(point.x, point.y),
      ...this.map.getHoverTargetsAt(point.x, point.y),
    ].sort((a, b) => b.renderY - a.renderY);

    const target = candidates[0] ?? null;
    if (!target) {
      return null;
    }

    return {
      ...target,
      clientX,
      clientY,
    };
  }

  getCurrentHoverTarget(): HoverTarget | null {
    return this._hoverTarget ? { ...this._hoverTarget } : null;
  }

  getPlacementTargets(): MapPlacementTarget[] {
    return this.map.getPlacementTargets();
  }

  getMapOverlays(): MapOverlayTarget[] {
    return this.map.getMapOverlays();
  }

  getMapOverlayState(id: string): string | null {
    return this.map.getMapOverlayState(id);
  }

  setMapOverlayState(id: string, state: string): boolean {
    const changed = this.map.setMapOverlayState(id, state);
    if (!changed) return false;

    this._pathGridCache.clear();
    this.emit("mapOverlay:changed", { id, state });
    return true;
  }

  queryEntities(filter: (c: ComponentBag) => boolean): EntityId[] {
    const result: EntityId[] = [];
    for (const [id, componentBag] of this._entities.entries()) {
      if (filter(componentBag)) {
        result.push(id);
      }
    }
    return result;
  }

  registerSystem(name: string, system: SystemFn): void {
    this._systems.set(name, system);
  }

  on(event: string, handler: EventHandler): () => void {
    let listeners = this._events.get(event);
    if (!listeners) {
      listeners = new Set();
      this._events.set(event, listeners);
    }
    listeners.add(handler);

    return () => {
      const activeListeners = this._events.get(event);
      if (!activeListeners) {
        return;
      }
      activeListeners.delete(handler);
      if (activeListeners.size === 0) {
        this._events.delete(event);
      }
    };
  }

  emit(event: string, payload?: unknown): void {
    const listeners = this._events.get(event);
    if (!listeners || listeners.size === 0) {
      return;
    }

    for (const handler of [...listeners]) {
      try {
        handler(payload);
      } catch (error) {
        console.error(`[GameRuntime] event handler failed for ${event}`, error);
      }
    }
  }

  registerResource(name: string, value: unknown): void {
    this._resources.set(name, value);
  }

  getResource<T = unknown>(name: string): T {
    return this._resources.get(name) as T;
  }

  patchUi(patch: UiStatePatch): void {
    const current =
      this.getResource<UiState>(UI_RESOURCE) ?? createDefaultUiState();
    this.registerResource(UI_RESOURCE, patchUiState(current, patch));
  }

  registerWidget(
    pluginFactory: WidgetPluginFactory,
    options: Record<string, unknown> = {},
  ): void {
    this.widgets.registerPlugin(pluginFactory, options);
  }

  bindInputAction(action: string, keyCodes: string[]): void {
    this.input.bindAction(action, keyCodes);
  }

  onInputAction(
    action: string,
    handler: (payload: { action: string; phase: InputActionPhase }) => void,
  ): () => void {
    return this.on(`input:${action}`, (payload) => {
      handler(
        payload as {
          action: string;
          phase: InputActionPhase;
        },
      );
    });
  }

  dispatchInputAction(
    action: string,
    payload: Record<string, unknown> = {},
  ): void {
    const merged = { action, ...payload };
    this.emit(`input:${action}`, merged);
    this.emit("input:action", merged);
  }

  handleInputAction(action: string, phase: InputActionPhase): void {
    this.dispatchInputAction(action, { phase, source: "keyboard" });
  }

  handlePointerMove(clientX: number, clientY: number): void {
    const nextTarget = this.getHoverTargetAt(clientX, clientY);
    const previousId = this._hoverTarget?.id ?? null;
    const nextId = nextTarget?.id ?? null;
    this._hoverTarget = nextTarget;

    this.emit("hover:update", nextTarget);
    if (previousId !== nextId) {
      this.emit("hover:changed", nextTarget);
    }
  }

  handlePointerLeave(): void {
    if (!this._hoverTarget) {
      return;
    }

    this._hoverTarget = null;
    this.emit("hover:update", null);
    this.emit("hover:changed", null);
  }

  triggerMapEffect(tag: string): boolean {
    return this.map.playGameplayEffectByTag(tag);
  }

  triggerNearestMapEffect(tag: string, atX: number, atY: number): boolean {
    return this.map.playNearestGameplayEffectByTag(tag, atX, atY);
  }

  findPath(
    from: PathPoint,
    to: PathPoint,
    options: FindPathOptions = {},
  ): FindPathResult {
    const resolved = this._resolvePathOptions(options);
    return this._getPathGrid(resolved).findPath(from, to);
  }

  isFeetPositionBlocked(
    feetX: number,
    feetY: number,
    options: FindPathOptions = {},
  ): boolean {
    const resolved = this._resolvePathOptions(options);
    const point = { x: feetX, y: feetY };
    const actor = options.entityId
      ? this._entityActors.get(options.entityId)
      : null;
    if (actor) {
      const foot = actor._footAt(actor.x, actor.y);
      const centerX = (foot.x1 + foot.x2) * 0.5;
      const feetYAtActor = foot.y2;
      const dx = feetX - centerX;
      const dy = feetY - feetYAtActor;
      return this.map.checkCollision(actor._footAt(actor.x + dx, actor.y + dy));
    }
    return !this._getPathGrid(resolved).isPointWalkable(point);
  }

  resolveNearestWalkableFeet(
    feetX: number,
    feetY: number,
    options: FindPathOptions = {},
  ): PathPoint | null {
    const resolved = this._resolvePathOptions(options);
    const point = { x: feetX, y: feetY };
    const grid = this._getPathGrid(resolved);

    if (options.entityId) {
      if (!this._areEntityFeetBlocked(options.entityId, point, resolved)) {
        return point;
      }
    } else if (grid.isPointWalkable(point)) {
      return point;
    }

    return grid.findNearestWalkablePoint(point);
  }

  setEntityDestination(
    id: EntityId,
    destination: PathPoint,
    options: EntityDestinationOptions = {},
  ): FindPathResult {
    const entity = this._entities.get(id);
    if (!entity) {
      return { status: "blocked", points: [] };
    }

    const pathOptions = this._resolvePathOptions({ ...options, entityId: id });
    const from = this._getEntityFeetPoint(id, entity);
    const result = this.findPath(from, destination, pathOptions);
    const speedOption = Number(options.speed);
    const entitySpeed = Number(entity.speed);
    const speed =
      Number.isFinite(speedOption) && speedOption > 0
        ? speedOption
        : Number.isFinite(entitySpeed) && entitySpeed > 0
          ? entitySpeed
          : 90;
    const stopDistance = Number(pathOptions.stopDistance) || 8;

    if (result.status !== "found" || result.points.length === 0) {
      const status =
        result.status === "unreachable" ? "unreachable" : "blocked";
      this._entityNavigation.set(id, {
        destination: { ...destination },
        path: [],
        waypointIndex: 0,
        speed,
        stopDistance,
        status,
        lastPathAtMs: performance.now(),
        repathIntervalMs: options.repathIntervalMs,
        options: pathOptions,
      });
      this.emit("navigation:failed", {
        entityId: id,
        destination,
        status,
      } satisfies NavigationEventPayload);
      return result;
    }

    this._entityNavigation.set(id, {
      destination: { ...destination },
      path: result.points,
      waypointIndex: result.points.length > 1 ? 1 : 0,
      speed,
      stopDistance,
      status: "moving",
      lastPathAtMs: performance.now(),
      repathIntervalMs: options.repathIntervalMs,
      options: pathOptions,
    });
    this.emit("navigation:started", {
      entityId: id,
      destination,
      status: "moving",
    } satisfies NavigationEventPayload);
    return result;
  }

  clearEntityDestination(id: EntityId): void {
    const nav = this._entityNavigation.get(id);
    this._entityNavigation.delete(id);
    if (nav) {
      this._setEntityIdleAnimation(id);
    }
  }

  getEntityNavigation(id: EntityId): EntityNavigationState | null {
    const nav = this._entityNavigation.get(id);
    if (!nav) return null;
    return {
      ...nav,
      destination: { ...nav.destination },
      path: nav.path.map((point) => ({ ...point })),
      options: { ...nav.options },
    };
  }

  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;

    window.removeEventListener("resize", this._onResize);
    window.visualViewport?.removeEventListener("resize", this._onResize);
    window.visualViewport?.removeEventListener("scroll", this._onResize);
    this.input.destroy();
    this.widgets.destroy();
    this._events.clear();
    this._systems.clear();
    this._entities.clear();
    this._archetypes.clear();
    this._resources.clear();
    this._entityActors.clear();
    this._entityImages.clear();
    this._entitySpriteSignatures.clear();
    this._pathGridCache.clear();
    this._entityNavigation.clear();
    this._entitySpawnTimes.clear();
    this._hoverTarget = null;
  }

  _resizeCanvas(): void {
    this.cameraController.resize();
    this.cameraFollowEnabled = this.cameraController.cameraFollowEnabled;
  }

  _updateCamera(): void {
    if (!this._controlledEntityId) {
      return;
    }

    const player = this._entityActors.get(this._controlledEntityId);
    if (!player) {
      return;
    }
    this.cameraController.updateForPlayer(player);
    this.cameraFollowEnabled = this.cameraController.cameraFollowEnabled;
  }

  _loop(now: number): void {
    if (this._destroyed) {
      return;
    }

    let dt = (now - this._lastTime) / 1000;
    this._lastTime = now;
    if (dt > 0.1) dt = 0.1;

    const { ctx, map, widgets } = this;
    widgets.update(now, this);
    const controlsBlocked = widgets.blocksWorldInput(this);

    this._updatePlayer(controlsBlocked ? NO_MOVEMENT_INPUT : this.keys, dt);
    this._updateNavigation(dt);
    for (const system of this._systems.values()) {
      system(dt, this);
    }
    this._updateCamera();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    ctx.save();
    // Keep gameplay/camera math as floats, but snap the final render transform
    // to canvas pixels so connected panels and props don't shimmer or expose
    // subpixel seams while the camera follows the player.
    ctx.translate(
      snapCanvasValue(this.camera.x),
      snapCanvasValue(this.camera.y),
    );
    ctx.scale(this.camera.zoom, this.camera.zoom);

    if (!this.hideMapBackground) {
      map.drawBackground(ctx, now);
    }

    const queue: QueueRenderable[] = [
      ...map.getRenderables(),
      ...this._getEntityRenderables(),
    ];
    queue.sort(compareRenderSort);
    const worldNormW = map.worldNormWidth;
    const worldNormH = map.worldNormHeight;
    const worldPixelW = map.worldPixelWidth;
    const worldPixelH = map.worldPixelHeight;
    for (const item of queue) {
      item.draw(ctx, now, worldNormW, worldNormH, worldPixelW, worldPixelH);
    }
    map.drawOverlay(ctx, now);

    if (this.debug) {
      map.drawDebug(ctx);
      const player = this._controlledEntityId
        ? this._entityActors.get(this._controlledEntityId)
        : null;
      player?.drawDebug(
        ctx,
        map.worldNormWidth,
        map.worldNormHeight,
        map.worldPixelWidth,
        map.worldPixelHeight,
      );
    }

    ctx.restore();

    if (this.debug || this.hideMapBackground) this._drawDebugHUD(ctx);

    requestAnimationFrame((nextNow) => this._loop(nextNow));
  }

  _drawDebugHUD(ctx: CanvasRenderingContext2D): void {
    const player = this._controlledEntityId
      ? this._entityActors.get(this._controlledEntityId)
      : null;

    const flags = [
      this.debug ? "debug" : null,
      this.hideMapBackground ? "bg off" : null,
    ]
      .filter(Boolean)
      .join(" · ");

    const pos = player
      ? `pos (${Math.round(player.x)}, ${Math.round(player.y)})`
      : "pos —";
    const line = flags ? `${pos}  ${flags}` : pos;

    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(8, 8, Math.max(210, 12 + line.length * 7.2), 36);
    ctx.fillStyle = "#fff";
    ctx.font = "13px monospace";
    ctx.fillText(line, 14, 30);
    ctx.restore();
  }

  _setupInput(): void {
    this.input.setup();
  }

  private _updatePlayer(input: MovementInput, dt: number): void {
    if (!this._controlledEntityId) {
      return;
    }

    const player = this._entityActors.get(this._controlledEntityId);
    if (!player) {
      return;
    }

    player.update(input, this.map, dt);
    this._setEntityPosition(
      this._controlledEntityId,
      player.x,
      player.y,
      player.renderY,
    );
    this._setEntityFacing(this._controlledEntityId, player.facingX);
  }

  private _updateNavigation(dt: number): void {
    const now = performance.now();
    for (const [id, nav] of [...this._entityNavigation.entries()]) {
      if (nav.status !== "moving") continue;

      const entity = this._entities.get(id);
      if (!entity) {
        this._entityNavigation.delete(id);
        continue;
      }

      const repathIntervalMs = Number(nav.repathIntervalMs);
      if (
        Number.isFinite(repathIntervalMs) &&
        repathIntervalMs > 0 &&
        now - nav.lastPathAtMs >= repathIntervalMs
      ) {
        const from = this._getEntityFeetPoint(id, entity);
        const result = this.findPath(from, nav.destination, nav.options);
        nav.lastPathAtMs = now;
        if (result.status === "found" && result.points.length > 0) {
          nav.path = result.points;
          nav.waypointIndex = result.points.length > 1 ? 1 : 0;
        }
      }

      const feet = this._getEntityFeetPoint(id, entity);
      const distanceToDestination = Math.hypot(
        nav.destination.x - feet.x,
        nav.destination.y - feet.y,
      );
      if (distanceToDestination <= nav.stopDistance) {
        nav.status = "arrived";
        this._setEntityIdleAnimation(id);
        this.emit("navigation:arrived", {
          entityId: id,
          destination: nav.destination,
          status: "arrived",
        } satisfies NavigationEventPayload);
        continue;
      }

      const target = nav.path[nav.waypointIndex] ?? nav.destination;
      const dx = target.x - feet.x;
      const dy = target.y - feet.y;
      const distance = Math.hypot(dx, dy);
      if (distance <= Math.max(1, nav.stopDistance * 0.5)) {
        nav.waypointIndex += 1;
        continue;
      }

      const step = Math.min(distance, nav.speed * dt);
      const nxFeet = feet.x + (dx / distance) * step;
      const nyFeet = feet.y + (dy / distance) * step;
      const actor = this._entityActors.get(id);
      const nextPosition = actor
        ? {
            x: actor.x + (nxFeet - feet.x),
            y: actor.y + (nyFeet - feet.y),
          }
        : this._entityTopLeftFromFeet(entity, nxFeet, nyFeet);
      const collisionWidth = Number(nav.options.collisionWidth);
      const collisionHeight = Number(nav.options.collisionHeight);
      const resolvedCollisionWidth =
        Number.isFinite(collisionWidth) && collisionWidth > 0
          ? collisionWidth
          : 28;
      const resolvedCollisionHeight =
        Number.isFinite(collisionHeight) && collisionHeight > 0
          ? collisionHeight
          : 10;
      const footRect = {
        x1: nxFeet - resolvedCollisionWidth * 0.5,
        y1: nyFeet - resolvedCollisionHeight,
        x2: nxFeet + resolvedCollisionWidth * 0.5,
        y2: nyFeet,
      };
      if (this.map.checkCollision(footRect)) {
        nav.status = "blocked";
        this._setEntityIdleAnimation(id);
        this.emit("navigation:failed", {
          entityId: id,
          destination: nav.destination,
          status: "blocked",
        } satisfies NavigationEventPayload);
        continue;
      }
      this._setEntityPosition(id, nextPosition.x, nextPosition.y);
      this._setEntityFacing(id, dx);
      this._setEntityMoveAnimation(id);
    }
  }

  private _setEntityFacing(id: EntityId, facingX: number): void {
    const entity = this._entities.get(id);
    if (!entity) {
      return;
    }
    const nextFacingX = facingX < 0 ? -1 : facingX > 0 ? 1 : 0;
    if (nextFacingX === 0) {
      return;
    }
    const currentFacing = Number(entity.facingX);
    if (currentFacing === nextFacingX) {
      return;
    }
    this._entities.set(id, { ...entity, facingX: nextFacingX });
  }

  private _setEntityPosition(
    id: EntityId,
    x: number,
    y: number,
    renderY?: number,
  ): void {
    const entity = this._entities.get(id);
    if (!entity) {
      return;
    }
    const next = {
      ...entity,
      x,
      y,
      renderY: renderY ?? this._resolveRenderY(entity, y),
    };
    this._entities.set(id, next);
  }

  private _getPathGrid(options: FindPathOptions): PathfindingGrid {
    const key = this._pathGridCacheKey(options);
    let grid = this._pathGridCache.get(key);
    if (!grid) {
      grid = new PathfindingGrid(this.map, options);
      this._pathGridCache.set(key, grid);
    }
    return grid;
  }

  private _pathGridCacheKey(options: FindPathOptions): string {
    return JSON.stringify({
      cellSize: options.cellSize,
      allowDiagonal: options.allowDiagonal,
      collisionWidth: options.collisionWidth,
      collisionHeight: options.collisionHeight,
      snapToNearestWalkable: options.snapToNearestWalkable,
      snapRadiusCells: options.snapRadiusCells,
      mapWidth: this.map.worldNormWidth,
      mapHeight: this.map.worldNormHeight,
    });
  }

  private _resolvePathOptions(options: FindPathOptions): FindPathOptions {
    const entity = options.entityId
      ? this._entities.get(options.entityId)
      : null;
    const width = entity
      ? this._inferEntityCollisionWidth(entity)
      : DEFAULT_ENTITY_WIDTH;
    const collisionWidth = Number(options.collisionWidth);
    const collisionHeight = Number(options.collisionHeight);
    const stopDistance = Number(options.stopDistance);
    return {
      ...options,
      collisionWidth:
        Number.isFinite(collisionWidth) && collisionWidth > 0
          ? collisionWidth
          : Math.max(8, width * 0.45),
      collisionHeight:
        Number.isFinite(collisionHeight) && collisionHeight > 0
          ? collisionHeight
          : 10,
      stopDistance:
        Number.isFinite(stopDistance) && stopDistance >= 0 ? stopDistance : 8,
    };
  }

  private _getEntityFeetPoint(id: EntityId, entity: ComponentBag): PathPoint {
    const actor = this._entityActors.get(id);
    if (actor) {
      return { x: actor.x + actor._w * 0.5, y: actor.renderY };
    }

    const x = Number(entity.x) || 0;
    const y = Number(entity.y) || 0;
    const width = this._inferEntityWidth(entity);
    const height = this._inferEntityHeight(entity);
    return { x: x + width * 0.5, y: y + height };
  }

  private _entityTopLeftFromFeet(
    entity: ComponentBag,
    feetX: number,
    feetY: number,
  ): { x: number; y: number } {
    const width = this._inferEntityWidth(entity);
    const height = this._inferEntityHeight(entity);
    return { x: feetX - width * 0.5, y: feetY - height };
  }

  private _areEntityFeetBlocked(
    id: EntityId,
    feet: PathPoint,
    pathOptions: FindPathOptions,
  ): boolean {
    const actor = this._entityActors.get(id);
    if (actor) {
      const foot = actor._footAt(actor.x, actor.y);
      const centerX = (foot.x1 + foot.x2) * 0.5;
      const currentFeetY = foot.y2;
      const dx = feet.x - centerX;
      const dy = feet.y - currentFeetY;
      return this.map.checkCollision(actor._footAt(actor.x + dx, actor.y + dy));
    }
    return !this._getPathGrid(pathOptions).isPointWalkable(feet);
  }

  private _placeEntityAtFeet(id: EntityId, feetX: number, feetY: number): void {
    const actor = this._entityActors.get(id);
    if (actor) {
      const foot = actor._footAt(actor.x, actor.y);
      const centerX = (foot.x1 + foot.x2) * 0.5;
      const currentFeetY = foot.y2;
      this.patchEntity(id, {
        x: actor.x + (feetX - centerX),
        y: actor.y + (feetY - currentFeetY),
      });
      return;
    }

    const entity = this._entities.get(id);
    if (!entity) return;
    const topLeft = this._entityTopLeftFromFeet(entity, feetX, feetY);
    this.patchEntity(id, { x: topLeft.x, y: topLeft.y });
  }

  private _ensureEntityOnWalkable(
    id: EntityId,
    options: FindPathOptions = {},
  ): boolean {
    const entity = this._entities.get(id);
    if (!entity) return false;

    const pathOptions = this._resolvePathOptions({ ...options, entityId: id });
    const feet = this._getEntityFeetPoint(id, entity);
    if (!this._areEntityFeetBlocked(id, feet, pathOptions)) {
      return false;
    }

    const nearest =
      this._getPathGrid(pathOptions).findNearestWalkablePoint(feet);
    if (!nearest) return false;

    this._placeEntityAtFeet(id, nearest.x, nearest.y);

    const updatedEntity = this._entities.get(id);
    if (!updatedEntity) return true;
    const updatedFeet = this._getEntityFeetPoint(id, updatedEntity);
    if (this._areEntityFeetBlocked(id, updatedFeet, pathOptions)) {
      return this._nudgeActorToWalkable(id);
    }
    return true;
  }

  private _nudgeActorToWalkable(id: EntityId): boolean {
    const actor = this._entityActors.get(id);
    if (!actor) return false;

    const step = 4;
    for (let radius = 1; radius <= 12; radius += 1) {
      for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
        for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
          if (Math.abs(offsetX) !== radius && Math.abs(offsetY) !== radius) {
            continue;
          }
          const nextX = actor.x + offsetX * step;
          const nextY = actor.y + offsetY * step;
          if (!this.map.checkCollision(actor._footAt(nextX, nextY))) {
            this.patchEntity(id, { x: nextX, y: nextY });
            return true;
          }
        }
      }
    }

    return false;
  }

  private _setEntityMoveAnimation(id: EntityId): void {
    const entity = this._entities.get(id);
    if (!entity) return;
    const animation = this._findAnimationName(entity, ["walk", "run"]);
    if (animation) this.patchEntity(id, { activeAnimation: animation });
  }

  private _setEntityIdleAnimation(id: EntityId): void {
    const entity = this._entities.get(id);
    if (!entity) return;
    const animation = this._findAnimationName(entity, [
      "default_animation",
      "idle",
    ]);
    if (animation) this.patchEntity(id, { activeAnimation: animation });
  }

  private _resolveVariantActiveAnimation(entity: ComponentBag): string {
    const current = String(entity.activeAnimation ?? "").toLowerCase();
    if (current.includes("walk") || current.includes("run")) {
      return "walk";
    }
    return "default_animation";
  }

  private _findAnimationName(
    entity: ComponentBag,
    needles: string[],
  ): string | null {
    const spriteSheets = entity.spriteSheets;
    if (!Array.isArray(spriteSheets)) return null;
    for (const needle of needles) {
      const sheet = spriteSheets.find((entry) => {
        const name = String(
          (entry as { name?: unknown }).name ?? "",
        ).toLowerCase();
        return name.includes(needle);
      }) as { name?: unknown } | undefined;
      if (typeof sheet?.name === "string") return sheet.name;
    }
    return null;
  }

  private _resolveRenderY(entity: ComponentBag, y: number): number {
    const explicitRenderY = Number(entity.renderY);
    if (Number.isFinite(explicitRenderY)) {
      return explicitRenderY;
    }
    const height = Number(entity.height);
    return y + (Number.isFinite(height) ? height : DEFAULT_ENTITY_HEIGHT);
  }

  private _resolveMapPixelWidth(entity: ComponentBag): number {
    const mapWidth = Number(entity.mapWidth);
    if (Number.isFinite(mapWidth) && mapWidth > 0) {
      return mapWidth;
    }
    return this.map?.panelPixelWidth ?? DEFAULT_MAP_WIDTH_PX;
  }

  private _resolveMapPixelHeight(entity: ComponentBag): number {
    const mapHeight = Number(entity.mapHeight);
    if (Number.isFinite(mapHeight) && mapHeight > 0) {
      return mapHeight;
    }
    return this.map?.panelPixelHeight ?? DEFAULT_MAP_HEIGHT_PX;
  }

  private _getPrimarySpriteSheetMeta(
    entity: ComponentBag,
  ): { url: string; frameCount: number } | null {
    const spriteSheets = entity.spriteSheets;
    if (!Array.isArray(spriteSheets) || spriteSheets.length === 0) {
      return null;
    }

    const firstSheet = spriteSheets[0] as {
      url?: unknown;
      frame_count?: unknown;
    };
    const url =
      typeof firstSheet?.url === "string" ? firstSheet.url.trim() : "";
    if (!url) {
      return null;
    }

    const rawFrameCount = Number(firstSheet?.frame_count);
    const frameCount =
      Number.isFinite(rawFrameCount) && rawFrameCount > 0
        ? Math.max(1, Math.floor(rawFrameCount))
        : 1;

    return { url, frameCount };
  }

  private _getSpriteFootAnchorCacheKey(
    url: string,
    frameCount: number,
  ): string {
    return `${url}::${frameCount}`;
  }

  private _getSpriteFootAnchorFromCache(
    entity: ComponentBag,
  ): SpriteFootAnchor | null {
    const spriteMeta = this._getPrimarySpriteSheetMeta(entity);
    if (!spriteMeta) {
      return null;
    }

    const cacheKey = this._getSpriteFootAnchorCacheKey(
      spriteMeta.url,
      spriteMeta.frameCount,
    );
    return this._spriteFootAnchorCache.get(cacheKey) ?? null;
  }

  private _ensureSpriteFootAnchorMeasured(
    cacheKey: string,
    url: string,
    frameCount: number,
  ): void {
    if (
      this._spriteFootAnchorCache.has(cacheKey) ||
      this._spriteFootAnchorPending.has(cacheKey)
    ) {
      return;
    }

    this._spriteFootAnchorPending.add(cacheKey);
    loadImage(url, { crossOrigin: "anonymous" })
      .then((image) => {
        const anchor = this._measureSpriteFootAnchor(image, frameCount);
        if (anchor) {
          this._spriteFootAnchorCache.set(cacheKey, anchor);
          this._applyPendingFeetAnchorPlacements(cacheKey, anchor);
        }
      })
      .catch(() => {
        // Leave default feet anchoring when sprite analysis is unavailable.
      })
      .finally(() => {
        this._spriteFootAnchorPending.delete(cacheKey);
      });
  }

  private _measureSpriteFootAnchor(
    image: HTMLImageElement,
    frameCount: number,
  ): SpriteFootAnchor | null {
    const fw = Math.floor(image.naturalWidth / frameCount);
    const fh = image.naturalHeight;
    if (fw <= 0 || fh <= 0) {
      return null;
    }

    try {
      const canvas = document.createElement("canvas");
      canvas.width = fw;
      canvas.height = fh;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        return null;
      }

      ctx.drawImage(image, 0, 0, fw, fh, 0, 0, fw, fh);
      const data = ctx.getImageData(0, 0, fw, fh).data;
      let minX = fw;
      let maxX = -1;
      let maxY = -1;

      for (let py = 0; py < fh; py += 1) {
        for (let px = 0; px < fw; px += 1) {
          const alpha = data[(py * fw + px) * 4 + 3];
          if (alpha <= 8) {
            continue;
          }
          if (px < minX) minX = px;
          if (px > maxX) maxX = px;
          if (py > maxY) maxY = py;
        }
      }

      if (maxX < minX || maxY < 0) {
        return null;
      }

      return {
        left: minX / fw,
        right: (maxX + 1) / fw,
        bottom: (maxY + 1) / fh,
      };
    } catch {
      return null;
    }
  }

  private _applyPendingFeetAnchorPlacements(
    cacheKey: string,
    anchor: SpriteFootAnchor,
  ): void {
    const newCenterRatio = (anchor.left + anchor.right) * 0.5;
    const newBottomRatio = anchor.bottom;

    for (const [
      entityId,
      pending,
    ] of this._pendingFeetAnchorPlacement.entries()) {
      if (pending.cacheKey !== cacheKey) {
        continue;
      }

      const entity = this._entities.get(entityId);
      if (!entity) {
        this._pendingFeetAnchorPlacement.delete(entityId);
        continue;
      }

      const width = this._inferEntityWidth(entity);
      const height = this._inferEntityHeight(entity);
      const expectedPreviousX = pending.feetX - width * pending.usedCenterRatio;
      const expectedPreviousY =
        pending.feetY - height * pending.usedBottomRatio;
      const currentX = Number(entity.x);
      const currentY = Number(entity.y);

      const movedSinceSpawn =
        Math.abs(currentX - expectedPreviousX) > 0.001 ||
        Math.abs(currentY - expectedPreviousY) > 0.001;

      if (!movedSinceSpawn) {
        this.patchEntity(entityId, {
          x: pending.feetX - width * newCenterRatio,
          y: pending.feetY - height * newBottomRatio,
        });
      }

      this._pendingFeetAnchorPlacement.delete(entityId);
    }
  }

  private _inferEntityWidth(entity: ComponentBag): number {
    const width = Number(entity.width);
    if (Number.isFinite(width)) {
      return width;
    }

    const spriteSheets = entity.spriteSheets;
    if (Array.isArray(spriteSheets) && spriteSheets.length > 0) {
      const firstSheet = spriteSheets[0] as { width?: number };
      const widthPx = Number(firstSheet?.width);
      if (Number.isFinite(widthPx) && widthPx > 0) {
        return (widthPx / this._resolveMapPixelWidth(entity)) * NORM;
      }
    }

    return DEFAULT_ENTITY_WIDTH;
  }

  private _inferEntityCollisionWidth(entity: ComponentBag): number {
    const width = Number(entity.width);
    if (Number.isFinite(width)) {
      return width;
    }

    const spriteSheets = entity.spriteSheets;
    if (Array.isArray(spriteSheets) && spriteSheets.length > 0) {
      const firstSheet = spriteSheets[0] as {
        width?: number;
        frame_count?: unknown;
      };
      const widthPx = Number(firstSheet?.width);
      const rawFrameCount = Number(firstSheet?.frame_count);
      const frameCount =
        Number.isFinite(rawFrameCount) && rawFrameCount > 0
          ? Math.max(1, Math.floor(rawFrameCount))
          : 1;
      if (Number.isFinite(widthPx) && widthPx > 0) {
        return (
          (widthPx / frameCount / this._resolveMapPixelWidth(entity)) * NORM
        );
      }
    }

    return DEFAULT_ENTITY_WIDTH;
  }

  private _inferEntityHeight(entity: ComponentBag): number {
    const height = Number(entity.height);
    if (Number.isFinite(height)) {
      return height;
    }

    const spriteSheets = entity.spriteSheets;
    if (Array.isArray(spriteSheets) && spriteSheets.length > 0) {
      const firstSheet = spriteSheets[0] as { height?: number };
      const heightPx = Number(firstSheet?.height);
      if (Number.isFinite(heightPx) && heightPx > 0) {
        return (heightPx / this._resolveMapPixelHeight(entity)) * NORM;
      }
    }

    return DEFAULT_ENTITY_HEIGHT;
  }

  private _resolvePlayerSpawnPosition(player: PlayerSpawnConfig): {
    x: number;
    y: number;
  } {
    const anchor = player.anchor ?? "top-left";
    const spriteSheets = player.sprite?.spriteSheets ?? [];

    const inferredHeight = Number.isFinite(player.height)
      ? Number(player.height)
      : this._inferEntityHeight({
          spriteSheets,
        });
    const inferredWidth = Number.isFinite(player.width)
      ? Number(player.width)
      : this._inferEntityWidth({
          spriteSheets,
          height: inferredHeight,
        });

    if (anchor === "feet") {
      return {
        x: player.x,
        y: player.y - inferredHeight,
      };
    }

    if (anchor === "center") {
      return {
        x: player.x - inferredWidth * 0.5,
        y: player.y - inferredHeight * 0.5,
      };
    }

    return {
      x: player.x,
      y: player.y,
    };
  }

  private _getSpriteSheetsSignature(spriteSheets: unknown): string {
    try {
      return JSON.stringify(spriteSheets);
    } catch {
      return String(spriteSheets);
    }
  }

  private _resolvePropPlacement(
    archetype: string,
    placement: PropPlacementInput,
    props: ComponentBag,
  ): ComponentBag {
    const base = this._archetypes.get(archetype);
    if (!base) {
      throw new Error(`Unknown archetype: ${archetype}`);
    }

    const merged = { ...base, ...props };
    const placementWithBox =
      !Array.isArray(placement) &&
      "box_2d" in placement &&
      Array.isArray(placement.box_2d)
        ? placement.box_2d
        : Array.isArray(placement)
          ? placement
          : null;

    if (placementWithBox) {
      const bounds = parseBox2d(placementWithBox);
      return {
        x: bounds.x1,
        y: bounds.y1,
        width: bounds.x2 - bounds.x1,
        height: bounds.y2 - bounds.y1,
        renderY: bounds.y2,
        hoverBounds: placementWithBox,
      };
    }

    const width = Number(merged.width);
    const height = Number(merged.height);
    const resolvedWidth = Number.isFinite(width)
      ? width
      : this._inferEntityWidth(merged);
    const resolvedHeight = Number.isFinite(height)
      ? height
      : this._inferEntityHeight(merged);

    if ("centerX" in placement && "centerY" in placement) {
      return {
        x: Number(placement.centerX) - resolvedWidth * 0.5,
        y: Number(placement.centerY) - resolvedHeight * 0.5,
        width: resolvedWidth,
        height: resolvedHeight,
      };
    }

    const pointPlacement = placement as { x: number; y: number };
    return {
      x: Number(pointPlacement.x) - resolvedWidth * 0.5,
      y: Number(pointPlacement.y) - resolvedHeight * 0.5,
      width: resolvedWidth,
      height: resolvedHeight,
    };
  }

  private _getEntityHoverTargetsAt(x: number, y: number): HoverTarget[] {
    const point = {
      x1: x - 0.001,
      y1: y - 0.001,
      x2: x + 0.001,
      y2: y + 0.001,
    };
    const targets: HoverTarget[] = [];

    for (const [id, entity] of this._entities.entries()) {
      const label = this._resolveEntityLabel(entity);
      const tooltip = entity.tooltip as TooltipContent | undefined;
      if (!label && !tooltip) {
        continue;
      }

      const bounds = this._resolveEntityHoverBounds(id, entity);
      if (!bounds || !rectsOverlap(bounds, point)) {
        continue;
      }

      targets.push({
        id,
        source: "entity",
        label: label || this._resolveTooltipTitle(tooltip) || id,
        tooltip,
        type: typeof entity.kind === "string" ? entity.kind : undefined,
        bounds,
        renderY: this._resolveRenderY(entity, bounds.y1),
        x,
        y,
      });
    }

    return targets;
  }

  private _resolveEntityLabel(entity: ComponentBag): string {
    const label = entity.label ?? entity.name ?? entity.displayName;
    return typeof label === "string" ? label : "";
  }

  private _resolveTooltipTitle(tooltip: TooltipContent | undefined): string {
    if (!tooltip) return "";
    if (typeof tooltip === "string") return tooltip;
    return tooltip.title ?? tooltip.body ?? "";
  }

  private _resolveEntityHoverBounds(
    id: EntityId,
    entity: ComponentBag,
  ): { x1: number; y1: number; x2: number; y2: number } | null {
    const hoverBounds = entity.hoverBounds;
    if (Array.isArray(hoverBounds) && hoverBounds.length === 4) {
      return parseBox2d(hoverBounds);
    }

    const x = Number(entity.x);
    const y = Number(entity.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return null;
    }

    const actor = this._entityActors.get(id);
    if (actor) {
      return {
        x1: actor.x,
        y1: actor.y,
        x2: actor.x + actor._w,
        y2: actor.y + actor._h,
      };
    }

    const imageState = this._entityImages.get(id);
    if (imageState) {
      const { width, height } = this._resolveImageDrawSize(entity, imageState);
      return { x1: x, y1: y, x2: x + width, y2: y + height };
    }

    const width = this._inferEntityWidth(entity);
    const height = this._inferEntityHeight(entity);
    return { x1: x, y1: y, x2: x + width, y2: y + height };
  }

  private _bindEntityRenderState(id: EntityId, entity: ComponentBag): void {
    const spriteSheets = entity.spriteSheets;
    if (Array.isArray(spriteSheets) && spriteSheets.length > 0) {
      const x = Number(entity.x) || 0;
      const y = Number(entity.y) || 0;
      const speed = Number(entity.speed);
      const frameDurationMs = Number(entity.frameDurationMs);
      const animationTransitionMs = Number(entity.animationTransitionMs);
      const activeAnimation =
        typeof entity.activeAnimation === "string"
          ? entity.activeAnimation
          : undefined;
      const spriteConfig = {
        spriteSheets: spriteSheets as any,
        mapWidth: this.map.panelPixelWidth,
        mapHeight: this.map.panelPixelHeight,
      };
      const nextSignature = this._getSpriteSheetsSignature(spriteSheets);
      const previousSignature = this._entitySpriteSignatures.get(id);
      let actor = this._entityActors.get(id);

      if (!actor) {
        actor = new EntityActor(x, y, spriteConfig, {
          speed: Number.isFinite(speed) ? speed : undefined,
          frameDurationMs: Number.isFinite(frameDurationMs)
            ? frameDurationMs
            : undefined,
          animationTransitionMs: Number.isFinite(animationTransitionMs)
            ? animationTransitionMs
            : undefined,
          activeAnimation,
          shadow: entity.shadow,
        });
        if (activeAnimation) {
          this._entityBoundAnimations.set(id, activeAnimation);
        }
      } else if (previousSignature !== nextSignature) {
        actor.setSpriteSheets(spriteConfig, {
          activeAnimation,
          transitionMs: Number.isFinite(animationTransitionMs)
            ? animationTransitionMs
            : undefined,
        });
        if (activeAnimation) {
          this._entityBoundAnimations.set(id, activeAnimation);
        }
      } else if (activeAnimation) {
        const boundAnimation = this._entityBoundAnimations.get(id);
        if (boundAnimation !== activeAnimation) {
          actor.setActiveAnimation(
            activeAnimation,
            Number.isFinite(animationTransitionMs)
              ? animationTransitionMs
              : undefined,
          );
          this._entityBoundAnimations.set(id, activeAnimation);
        }
      }

      if (Number.isFinite(speed)) actor.setSpeed(speed);
      actor.setSize(
        this._inferEntityWidth(entity),
        this._inferEntityHeight(entity),
      );
      const facingX = Number(entity.facingX);
      if (Number.isFinite(facingX)) actor.setFacingX(facingX);
      if (Number.isFinite(animationTransitionMs)) {
        actor.setAnimationTransitionMs(animationTransitionMs);
      }
      actor.setShadow(entity.shadow);
      actor.x = x;
      actor.y = y;
      this._entityActors.set(id, actor);
      this._entitySpriteSignatures.set(id, nextSignature);
      this._entityImages.delete(id);
      this._setEntityPosition(id, actor.x, actor.y, actor.renderY);
      return;
    }

    this._entityActors.delete(id);
    this._entitySpriteSignatures.delete(id);

    const spriteUrl =
      typeof entity.sprite === "string"
        ? entity.sprite
        : typeof entity.imageUrl === "string"
          ? entity.imageUrl
          : null;

    if (!spriteUrl) {
      this._entityImages.delete(id);
      return;
    }

    const width = Number(entity.width);
    const height = Number(entity.height);
    const nextImageState: EntityImageRenderable = {
      image: this._entityImages.get(id)?.image ?? null,
      sourceUrl: spriteUrl,
      width: Number.isFinite(width) ? width : DEFAULT_ENTITY_WIDTH,
      height: Number.isFinite(height) ? height : DEFAULT_ENTITY_HEIGHT,
    };
    this._entityImages.set(id, nextImageState);

    if (nextImageState.image?.src === spriteUrl) {
      return;
    }

    loadImage(spriteUrl)
      .then((img) => {
        const active = this._entityImages.get(id);
        if (!active) {
          return;
        }
        active.image = img;
      })
      .catch(() => {
        const active = this._entityImages.get(id);
        if (!active) {
          return;
        }
        active.image = null;
      });
  }

  private _resolveImageDrawSize(
    entity: ComponentBag,
    imageState: EntityImageRenderable,
  ): { width: number; height: number } {
    const explicitWidth = Number(entity.width);
    const explicitHeight = Number(entity.height);
    const hasWidth = Number.isFinite(explicitWidth);
    const hasHeight = Number.isFinite(explicitHeight);

    if (hasWidth && hasHeight) {
      return { width: explicitWidth, height: explicitHeight };
    }

    const image = imageState.image;
    const hasNaturalSize = Boolean(image?.naturalWidth && image?.naturalHeight);
    if (hasNaturalSize) {
      const ratio = image.naturalWidth / image.naturalHeight;
      if (hasWidth) {
        return { width: explicitWidth, height: explicitWidth / ratio };
      }
      if (hasHeight) {
        return { width: explicitHeight * ratio, height: explicitHeight };
      }

      const fallbackHeight = imageState.height;
      return { width: fallbackHeight * ratio, height: fallbackHeight };
    }

    if (hasWidth) {
      return { width: explicitWidth, height: imageState.height };
    }
    if (hasHeight) {
      return { width: imageState.width, height: explicitHeight };
    }

    return {
      width: imageState.width,
      height: imageState.height,
    };
  }

  private _getSpawnRevealAlpha(
    spawnAtMs: number | undefined,
    now: number,
  ): number {
    if (!Number.isFinite(spawnAtMs)) {
      return 1;
    }

    const elapsed = now - spawnAtMs;
    if (elapsed <= 0) {
      return 0;
    }
    if (elapsed >= SPAWN_REVEAL_MS) {
      return 1;
    }

    const t = elapsed / SPAWN_REVEAL_MS;
    return t * t * (3 - 2 * t);
  }

  private _drawWithEntityEffects(
    ctx: CanvasRenderingContext2D,
    entity: ComponentBag,
    drawBase: () => void,
    spawnAtMs?: number,
  ): void {
    const now = performance.now();
    const spawnAlpha = this._getSpawnRevealAlpha(spawnAtMs, now);
    if (spawnAlpha <= 0) {
      return;
    }

    const drawWithSpawnAlpha = () => {
      if (spawnAlpha >= 1) {
        drawBase();
        return;
      }

      ctx.save();
      ctx.globalAlpha *= spawnAlpha;
      drawBase();
      ctx.restore();
    };

    const flashUntil = Number(entity.hitFlashUntilMs);
    const shakeUntil = Number(entity.hitShakeUntilMs);
    const glitchUntil = Number(entity.hitGlitchUntilMs);
    const flashActive = Number.isFinite(flashUntil) && flashUntil > now;
    const shakeActive = Number.isFinite(shakeUntil) && shakeUntil > now;
    const glitchActive = Number.isFinite(glitchUntil) && glitchUntil > now;

    if (!flashActive && !shakeActive && !glitchActive) {
      drawWithSpawnAlpha();
      return;
    }

    const intensity = Math.max(
      0,
      Math.min(1, Number(entity.hitFlashIntensity ?? 1)),
    );
    const shakeMagnitude = Math.max(0, Number(entity.hitShakeMagnitude ?? 3));
    const shakePhase = now * 0.08 + Number(entity.renderY ?? entity.x ?? 0);
    const shakeX = shakeActive ? Math.sin(shakePhase) * shakeMagnitude : 0;
    const shakeY = shakeActive
      ? Math.cos(shakePhase * 1.37) * shakeMagnitude * 0.5
      : 0;

    ctx.save();
    if (shakeActive) ctx.translate(shakeX, shakeY);

    if (glitchActive) {
      ctx.save();
      ctx.globalAlpha = 0.32 * intensity;
      ctx.translate(-4, 0);
      ctx.filter = "hue-rotate(160deg) saturate(2.2) brightness(1.35)";
      drawWithSpawnAlpha();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = 0.26 * intensity;
      ctx.translate(4, 1);
      ctx.filter = "hue-rotate(-35deg) saturate(2.2) brightness(1.2)";
      drawWithSpawnAlpha();
      ctx.restore();
    }

    if (flashActive) {
      ctx.save();
      ctx.filter = `brightness(${1 + intensity * 1.7}) contrast(${1 + intensity * 0.45}) saturate(${1 - intensity * 0.65})`;
      drawWithSpawnAlpha();
      ctx.restore();
    } else {
      drawWithSpawnAlpha();
    }

    ctx.restore();
  }

  private _getEntityRenderables(): QueueRenderable[] {
    const renderables: QueueRenderable[] = [];

    for (const [id, actor] of this._entityActors.entries()) {
      const entity = this._entities.get(id);
      if (!entity) {
        continue;
      }

      if (id !== this._controlledEntityId) {
        const x = Number(entity.x);
        const y = Number(entity.y);
        if (Number.isFinite(x) && Number.isFinite(y)) {
          actor.x = x;
          actor.y = y;
        }
      }

      const facingX = Number(entity.facingX);
      if (Number.isFinite(facingX)) actor.setFacingX(facingX);
      this._setEntityPosition(id, actor.x, actor.y, actor.renderY);

      renderables.push({
        renderY: actor.renderY,
        renderLayer: actor.renderLayer,
        draw: (ctx, now, worldNormW, worldNormH, worldPixelW, worldPixelH) => {
          this._drawWithEntityEffects(
            ctx,
            entity,
            () => {
              actor.draw(
                ctx,
                now,
                worldNormW,
                worldNormH,
                worldPixelW,
                worldPixelH,
              );
            },
            this._entitySpawnTimes.get(id),
          );
        },
        drawDebug: (ctx, worldNormW, worldNormH, worldPixelW, worldPixelH) => {
          actor.drawDebug(
            ctx,
            worldNormW,
            worldNormH,
            worldPixelW,
            worldPixelH,
          );
        },
      });
    }

    for (const [id, imageState] of this._entityImages.entries()) {
      const entity = this._entities.get(id);
      if (!entity) {
        continue;
      }

      const x = Number(entity.x);
      const y = Number(entity.y);
      if (!Number.isFinite(x) || !Number.isFinite(y)) {
        continue;
      }

      const { width: drawWidth, height: drawHeight } =
        this._resolveImageDrawSize(entity, imageState);
      const renderY = this._resolveRenderY(
        { ...entity, height: drawHeight },
        y,
      );

      this._setEntityPosition(id, x, y, renderY);

      const sortRenderY = Number(entity.renderY);
      renderables.push({
        renderY: Number.isFinite(sortRenderY) ? sortRenderY : renderY,
        renderLayer: "prop",
        draw: (ctx) => {
          if (!imageState.image?.complete || !imageState.image.naturalWidth) {
            return;
          }
          const p1 = toPixel(
            x,
            y,
            this.map.worldNormWidth,
            this.map.worldNormHeight,
            this.map.worldPixelWidth,
            this.map.worldPixelHeight,
          );
          const p2 = toPixel(
            x + drawWidth,
            y + drawHeight,
            this.map.worldNormWidth,
            this.map.worldNormHeight,
            this.map.worldPixelWidth,
            this.map.worldPixelHeight,
          );
          const drawX = snapCanvasValue(p1.x);
          const drawY = snapCanvasValue(p1.y);
          const drawX2 = snapCanvasValue(p2.x);
          const drawY2 = snapCanvasValue(p2.y);
          this._drawWithEntityEffects(ctx, entity, () => {
            ctx.drawImage(
              imageState.image,
              drawX,
              drawY,
              drawX2 - drawX,
              drawY2 - drawY,
            );
          });
        },
      });
    }

    return renderables;
  }
}
