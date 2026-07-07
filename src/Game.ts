import GameMap from "./core/GameMap";
import GameRuntime from "./core/GameRuntime";
import { createTooltipWidget } from "./widgets/TooltipWidget";
import {
  createStaticWorldContextFromGameMapData,
  NPC_WORLD_CONTEXT_RESOURCE,
} from "./npc-primitives";
export {
  createDefaultUiState,
  createUiState,
  mergeUiPatch,
  patchUiState,
  setExclusiveOverlay,
  UI_RESOURCE,
  type UiBinding,
  type UiState,
  type WidgetMountOptions,
} from "./types/UiState";
export {
  getAudio,
  getAudioUrl,
  listAudioNames,
  playAudio,
  preloadAudio,
  stopAudio,
} from "./core/audio";
export {
  getCommonAssetUrl as getAssetUrl,
  type CommonAssetEntry,
} from "./data/common";
export {
  getPropData,
  getPropItemUrl,
  type PropData,
  type PropItem,
} from "./data/props";

export type * from "./Game.types";

import type { GameAPI, GameConfig } from "./Game.types";

/**
 * Create one game runtime and return the public primitive API.
 *
 * @example
 * const game = createGame({
 *   canvasId: "game",
 *   map: {
 *     panel: mapStudy,
 *     extensions: [
 *       { direction: "east", panel: mapStudyEast },
 *       { direction: "west", panel: mapStudyWest },
 *     ],
 *   },
 * });
 *
 * game.defineArchetype("player", {
 *   spriteSheets: [{
 *     name: "default_animation",
 *     url: "/sprites/hero_idle.png",
 *     frame_count: 8,
 *   }],
 *   speed: 190,
 *   radius: 34,
 *   width: 140,
 *   height: 168,
 * });
 * const playerId = game.spawnAtFeet("player", 500, 820);
 * game.setControlledEntity(playerId);
 */
export function createGame(config: GameConfig): GameAPI {
  const map = new GameMap(config.map);
  const staticWorldContext = createStaticWorldContextFromGameMapData(
    config.map,
  );
  const runtime = new GameRuntime(
    config.canvasId,
    map,
    config.player,
    config.cameraEdgePadding,
  );

  // Default widgets mounted here
  runtime.registerWidget(createTooltipWidget);

  const api: GameAPI = {
    loadMap: (mapData, options = {}) => {
      runtime.loadMap(new GameMap(mapData), options);
      const nextStaticWorldContext =
        createStaticWorldContextFromGameMapData(mapData);
      try {
        const existing = runtime.getResource<typeof nextStaticWorldContext>(
          NPC_WORLD_CONTEXT_RESOURCE,
        );
        if (existing && typeof existing === "object") {
          Object.assign(existing, nextStaticWorldContext);
        } else {
          runtime.registerResource(
            NPC_WORLD_CONTEXT_RESOURCE,
            nextStaticWorldContext,
          );
        }
      } catch {
        runtime.registerResource(
          NPC_WORLD_CONTEXT_RESOURCE,
          nextStaticWorldContext,
        );
      }
    },
    defineArchetype: (name, defaults) => {
      runtime.defineArchetype(name, defaults);
    },
    spawn: (archetype, props = {}) => runtime.spawn(archetype, props),
    spawnAtFeet: (archetype, feetX, feetY, props = {}) =>
      runtime.spawnAtFeet(archetype, feetX, feetY, props),
    spawnCentered: (archetype, centerX, centerY, props = {}) =>
      runtime.spawnCentered(archetype, centerX, centerY, props),
    placeProp: (archetype, placement, props = {}) =>
      runtime.placeProp(archetype, placement, props),
    normalizedToCanvasPoint: (normalizedX, normalizedY) =>
      runtime.normalizedToCanvasPoint(normalizedX, normalizedY),
    canvasClientToNormalizedPoint: (clientX, clientY) =>
      runtime.canvasClientToNormalizedPoint(clientX, clientY),
    getHoverTargetAt: (clientX, clientY) =>
      runtime.getHoverTargetAt(clientX, clientY),
    getCurrentHoverTarget: () => runtime.getCurrentHoverTarget(),
    getPlacementTargets: () => runtime.getPlacementTargets(),
    getMapOverlays: () => runtime.getMapOverlays(),
    getMapOverlayState: (id) => runtime.getMapOverlayState(id),
    setMapOverlayState: (id, state) => runtime.setMapOverlayState(id, state),
    patch: (id, changes) => {
      runtime.patchEntity(id, changes);
    },
    setEntityAnimation: (id, animationName, options = {}) => {
      runtime.setEntityAnimation(id, animationName, options);
    },
    setEntitySpriteSheets: (id, spriteSheets, options = {}) => {
      runtime.setEntitySpriteSheets(id, spriteSheets, options);
    },
    setEntityFacingX: (id, facingX) => {
      runtime.setEntityFacingX(id, facingX);
    },
    get: (id) => runtime.getEntity(id),
    getEntityFeet: (id) => runtime.getEntityFeet(id),
    destroy: (id) => {
      runtime.destroyEntity(id);
    },
    query: (filter) => runtime.queryEntities(filter),
    registerSystem: (name, system) => {
      runtime.registerSystem(name, (dt) => system(dt, api));
    },
    on: (event, handler) => runtime.on(event, handler),
    emit: (event, payload) => {
      runtime.emit(event, payload);
    },
    registerResource: (name, value) => {
      runtime.registerResource(name, value);
    },
    getResource: <T = unknown>(name: string): T => runtime.getResource<T>(name),
    useWidget: (pluginFactory, options = {}) => {
      runtime.registerWidget(pluginFactory, options);
    },
    patchUi: (patch) => {
      runtime.patchUi(patch);
    },
    bindInputAction: (action, keyCodes) => {
      runtime.bindInputAction(action, keyCodes);
    },
    onInputAction: (action, handler) => runtime.onInputAction(action, handler),
    dispatchInputAction: (action, payload = {}) => {
      runtime.dispatchInputAction(action, payload);
    },
    triggerMapEffect: (tag) => runtime.triggerMapEffect(tag),
    triggerNearestMapEffect: (tag, atX, atY) =>
      runtime.triggerNearestMapEffect(tag, atX, atY),
    findPath: (from, to, options = {}) => runtime.findPath(from, to, options),
    isFeetPositionBlocked: (feetX, feetY, options = {}) =>
      runtime.isFeetPositionBlocked(feetX, feetY, options),
    resolveNearestWalkableFeet: (feetX, feetY, options = {}) =>
      runtime.resolveNearestWalkableFeet(feetX, feetY, options),
    setEntityDestination: (id, destination, options = {}) =>
      runtime.setEntityDestination(id, destination, options),
    clearEntityDestination: (id) => {
      runtime.clearEntityDestination(id);
    },
    getEntityNavigation: (id) => runtime.getEntityNavigation(id),
    setControlledEntity: (id) => {
      runtime.setControlledEntity(id);
    },
    getControlledEntity: () => runtime.getControlledEntity(),
  };

  runtime.registerResource(NPC_WORLD_CONTEXT_RESOURCE, staticWorldContext);

  return api;
}
