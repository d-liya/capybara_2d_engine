import GameMap from "./core/GameMap";
import GameRuntime from "./core/GameRuntime";
import {
  COMBAT_FEEDBACK_RESOURCE,
  createCombatFeedbackState,
  createCombatFeedbackWidget,
  type CombatFeedbackState,
} from "./widgets/CombatFeedbackWidget";
import { createNpcBubbleWidget } from "./widgets/NpcBubbleWidget";
import { createTouchControlsWidget } from "./widgets/TouchControlsWidget";
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
  getAudioEntry,
  getAudioUrl,
  duckAudioChannel,
  listAudioNames,
  playAudio,
  playDialogue,
  preloadAudio,
  registerAudioAssets,
  stopAudio,
  stopAudioChannel,
  unlockAudio,
  type AudioChannel,
  type AudioPlayOptions,
} from "./core/audio";
export {
  getCommonAsset,
  getCommonAssetUrl as getAssetUrl,
  type CommonAssetEntry,
  type CommonAssetRole,
} from "./data/common";
export {
  getPropData,
  getPropItemUrl,
  type PropData,
  type PropItem,
} from "./data/props";
export {
  installTypewriterAudioUnlock,
  isTypewriterSoundCharacter,
  playTypewriterBlip,
  playTypewriterStartClip,
  typewriterCharacterCount,
  unlockTypewriterAudio,
} from "./utils/typewriter";

export type * from "./Game.types";
export { DEFAULT_COMBAT_IMPACTS } from "./Game.types";

import {
  getAudioEntry,
  duckAudioChannel,
  playAudio as corePlayAudio,
  registerAudioAssets,
  stopAudio as coreStopAudio,
  stopAudioChannel as coreStopAudioChannel,
  unlockAudio as coreUnlockAudio,
  type AudioChannel,
} from "./core/audio";
import type { CommonAssetEntry, CommonAssetRole } from "./data/common";
import type {
  AudioPlaybackHandle,
  AudioPlayOptions,
  CombatImpactOptions,
  GameAPI,
  GameConfig,
  GeneratedAssetCatalog,
  GeneratedAudioAsset,
  GeneratedDialogueEntry,
  LoadMapOptions,
  TransitionMapOptions,
} from "./Game.types";
import { DEFAULT_COMBAT_IMPACTS } from "./Game.types";
import { runScreenFade, type ScreenTransitionOrigin } from "./utils/screenFade";

const dialogueById = new Map<string, GeneratedDialogueEntry>();

function normalizeCommonRole(
  entry: GeneratedAudioAsset,
): CommonAssetRole | undefined {
  const raw = entry.kind ?? entry.role;
  if (raw === "bgm" || raw === "sfx" || raw === "ambience" || raw === "voice")
    return raw;
  if (raw === "dialogue" || raw === "tts") return "dialogue";
  return undefined;
}

function generatedAudioToCommon(entry: GeneratedAudioAsset): CommonAssetEntry {
  const merged = entry as GeneratedAudioAsset & CommonAssetEntry;
  const name =
    (typeof merged.name === "string" && merged.name.trim()) ||
    (typeof merged.id === "string" && merged.id.trim()) ||
    "audio";
  return {
    name,
    label:
      typeof merged.label === "string"
        ? merged.label
        : typeof merged.name === "string"
          ? merged.name
          : undefined,
    url: merged.url,
    assetId: merged.id ?? merged.assetId,
    kind: merged.kind,
    role: normalizeCommonRole(entry) ?? merged.role,
    transcript:
      typeof merged.transcript === "string" ? merged.transcript : undefined,
    durationMs:
      typeof merged.durationMs === "number" ? merged.durationMs : undefined,
    volume: typeof merged.volume === "number" ? merged.volume : undefined,
    autoplay:
      typeof merged.autoplay === "boolean" ? merged.autoplay : undefined,
    looping:
      typeof merged.looping === "boolean" ? merged.looping : undefined,
  };
}

function toFacadeChannel(channel?: string): AudioChannel | undefined {
  if (
    channel === "bgm" ||
    channel === "sfx" ||
    channel === "voice" ||
    channel === "audio"
  ) {
    return channel;
  }
  return undefined;
}

function registerGeneratedAudioCatalog(catalog: GeneratedAssetCatalog): void {
  const entries = (catalog.audio ?? []).map(generatedAudioToCommon);
  registerAudioAssets(entries);
  dialogueById.clear();
  for (const line of catalog.dialogue ?? []) {
    if (line?.id) dialogueById.set(line.id, line);
  }
  for (const entry of entries) {
    if (entry.role !== "dialogue" || !entry.transcript) continue;
    const id = entry.assetId ?? entry.name;
    if (!dialogueById.has(id)) {
      dialogueById.set(id, {
        id,
        text: entry.transcript,
        audioId: entry.name,
      });
    }
  }
}

/**
 * Create one game runtime and return the public primitive API.
 *
 * @example
 * const game = createGame({
 *   canvasId: "game",
 *   map: toMapData(mapStudy),
 * });
 *
 * // Travel to another map (door / room transition):
 * await game.transitionMap(toMapData(mapInterior), {
 *   spawn: { x: 500, y: 820, anchor: "feet" },
 * });
 *
 * game.defineArchetype("player", {
 *   spriteSheets: [{
 *     name: "default_animation",
 *     url: "/sprites/hero_idle.png",
 *     frame_count: 8,
 *   }],
 *   speed: 55,
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
  const runtime = new GameRuntime(config.canvasId, map, config.player, {
    cameraEdgePadding: config.cameraEdgePadding,
    maxViewportScale: config.maxViewportScale,
    followZoom: config.followZoom,
    cameraFollowLerp: config.cameraFollowLerp,
  });

  // Default widgets mounted here
  runtime.registerResource(
    COMBAT_FEEDBACK_RESOURCE,
    createCombatFeedbackState(),
  );
  runtime.registerWidget(createCombatFeedbackWidget);
  // NPC barks and thoughts are world feedback, so their renderer belongs to
  // the base HUD rather than requiring every scene to remember to mount it.
  runtime.registerWidget(createNpcBubbleWidget);
  if (config.touchControls !== false) {
    const touchOptions =
      config.touchControls && typeof config.touchControls === "object"
        ? config.touchControls
        : {};
    runtime.registerWidget(createTouchControlsWidget, {
      ...touchOptions,
    });
  }

  const applyLoadMap = (
    mapData: GameConfig["map"],
    options: LoadMapOptions = {},
  ) => {
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
  };

  const transitionOriginFor = (
    spawn?: LoadMapOptions["spawn"],
  ): ScreenTransitionOrigin => {
    const canvas = document.getElementById(config.canvasId) as HTMLCanvasElement | null;
    const canvasRect = canvas?.getBoundingClientRect();
    let x = spawn?.x;
    let y = spawn?.y;

    if (x === undefined || y === undefined) {
      const controlled = runtime.getControlledEntity();
      const entity = controlled ? runtime.get(controlled) : null;
      if (entity) {
        x = Number(entity.x ?? 500) + Number(entity.width ?? 0) / 2;
        y = Number(entity.y ?? 500) + Number(entity.height ?? 0);
      }
    }

    if (x === undefined || y === undefined || !canvasRect) {
      return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    }
    const point = runtime.normalizedToCanvasPoint(x, y);
    return { x: canvasRect.left + point.x, y: canvasRect.top + point.y };
  };

  const api: GameAPI = {
    registerAudioCatalog: (catalog) => {
      registerGeneratedAudioCatalog(catalog);
    },
    playAudio: (name, options = {}) => {
      const element = corePlayAudio(name, {
        loop: options.loop,
        volume: options.volume,
        channel: toFacadeChannel(options.channel),
        restart: options.restart,
      });
      if (!element) return null;
      const entry = getAudioEntry(name);
      const channel = toFacadeChannel(options.channel) ??
        (entry?.role === "bgm"
          ? "bgm"
          : entry?.role === "voice" || entry?.role === "dialogue"
            ? "voice"
            : entry?.role === "sfx" || entry?.role === "ambience"
              ? "sfx"
              : "audio");
      const handle: AudioPlaybackHandle = {
        name,
        channel,
        element,
        stop: () => {
          element.pause();
          element.currentTime = 0;
        },
      };
      return handle;
    },
    stopAudio: (name) => {
      coreStopAudio(name);
    },
    stopAudioChannel: (channel) => {
      coreStopAudioChannel(toFacadeChannel(channel) ?? "audio");
    },
    unlockAudio: () => coreUnlockAudio(),
    getDialogue: (id) => {
      const fromCatalog = dialogueById.get(id);
      if (fromCatalog) return fromCatalog;
      const entry = getAudioEntry(id);
      if (entry?.transcript) {
        return {
          id: entry.assetId ?? entry.name,
          text: entry.transcript,
          audioId: entry.name,
        };
      }
      return undefined;
    },
    applyCombatImpact: (options: CombatImpactOptions) => {
      const target = runtime.get(options.targetId);
      if (!target) return;

      const controlled = runtime.getControlledEntity();
      const kind = options.kind ??
        (options.targetId === controlled ? "player" : "light");
      const preset = DEFAULT_COMBAT_IMPACTS[kind];
      const now = performance.now();
      const targetX = Number(target.x ?? 0) + Number(target.width ?? 0) / 2;
      const targetY = Number(target.y ?? 0) + Number(target.height ?? 0) / 2;
      const attacker = options.attackerId ? runtime.get(options.attackerId) : null;
      const attackerX = attacker
        ? Number(attacker.x ?? targetX) + Number(attacker.width ?? 0) / 2
        : targetX - Number(target.facingX ?? 1);
      const attackerY = attacker
        ? Number(attacker.y ?? targetY) + Number(attacker.height ?? 0) / 2
        : targetY;
      let directionX = targetX - attackerX;
      let directionY = targetY - attackerY;
      const directionLength = Math.hypot(directionX, directionY) || 1;
      directionX /= directionLength;
      directionY /= directionLength;

      const hitstopMs = options.hitstopMs ?? preset.hitstopMs;
      const trauma = options.trauma ?? preset.trauma;
      const flashMs = options.flashMs ?? preset.flashMs;
      const stunMs = options.stunMs ?? preset.stunMs;
      const knockback = options.knockback ?? preset.knockback;
      const shakeMagnitude = preset.shakeMagnitude;
      const contact = options.point ?? { x: targetX, y: targetY };

      runtime.patchEntity(options.targetId, {
        hitFlashUntilMs: now + Math.max(0, flashMs),
        hitShakeUntilMs: now + Math.max(0, stunMs),
        hitGlitchUntilMs: kind === "heavy" ? now + 55 : 0,
        hitFlashIntensity: kind === "heavy" ? 1 : 0.78,
        hitShakeMagnitude: shakeMagnitude,
        hurtUntilMs: now + Math.max(0, stunMs),
        impactVelocityX: directionX * Math.max(0, knockback),
        impactVelocityY: directionY * Math.max(0, knockback),
        impactImpulseUntilMs: now + Math.max(0, stunMs),
      });
      runtime.addHitstop(hitstopMs);
      runtime.addCameraTrauma(trauma);
      runtime.addImpactBurst(
        contact.x,
        contact.y,
        directionX,
        directionY,
        kind === "heavy",
      );

      if (kind === "player") {
        const invulnerableMs = options.invulnerableMs ??
          DEFAULT_COMBAT_IMPACTS.player.invulnerableMs;
        runtime.patchEntity(options.targetId, {
          invulnerableUntilMs: now + Math.max(0, invulnerableMs),
        });
        const feedback = runtime.getResource<CombatFeedbackState>(
          COMBAT_FEEDBACK_RESOURCE,
        );
        feedback.playerHurtUntilMs = Math.max(
          feedback.playerHurtUntilMs,
          now + Math.max(0, flashMs + 70),
        );
        duckAudioChannel("bgm", 0.7, 140);
      }

      if (options.sound) {
        corePlayAudio(options.sound, { channel: "sfx", restart: true });
      }
    },
    isEntityInvulnerable: (id) => runtime.isEntityInvulnerable(id),
    loadMap: (mapData, options = {}) => {
      applyLoadMap(mapData, options);
    },
    transitionMap: async (mapData, options = {}) => {
      const { during, fadeMs, peakOpacity, transitionStyle, ...loadOptions } =
        options as TransitionMapOptions;
      const closeOrigin = transitionOriginFor();
      await runScreenFade(
        () => {
          const swap = () => {
            applyLoadMap(mapData, loadOptions);
          };
          if (during) {
            during(swap);
          } else {
            swap();
          }
        },
        {
          fadeMs,
          peakOpacity,
          style: transitionStyle,
          closeOrigin,
          // Resolve after the map and player spawn are swapped, so the opening
          // iris expands from the destination rather than the old camera.
          openOrigin: () => transitionOriginFor(loadOptions.spawn),
        },
      );
    },
    defineArchetype: (name, defaults) => {
      runtime.defineArchetype(name, defaults);
    },
    applyEntityArchetype: (id, archetypeName, props = {}) => {
      runtime.applyEntityArchetype(id, archetypeName, props);
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
    getCharacterPlacements: () => runtime.getCharacterPlacements(),
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
    setMovementInput: (patch) => {
      runtime.setMovementInput(patch);
    },
    clearMovementInput: () => {
      runtime.clearMovementInput();
    },
    triggerMapEffect: (tag) => runtime.triggerMapEffect(tag),
  triggerNearestMapEffect: (tag, atX, atY) =>
    runtime.triggerNearestMapEffect(tag, atX, atY),
  triggerNearestGameplayEffect: (atX, atY, maxDistance) =>
    runtime.triggerNearestGameplayEffect(atX, atY, maxDistance),
    findPath: (from, to, options = {}) => runtime.findPath(from, to, options),
    isFeetPositionBlocked: (feetX, feetY, options = {}) =>
      runtime.isFeetPositionBlocked(feetX, feetY, options),
    resolveNearestWalkableFeet: (feetX, feetY, options = {}) =>
      runtime.resolveNearestWalkableFeet(feetX, feetY, options),
    ensureEntityOnWalkable: (id, options = {}) =>
      runtime.ensureEntityOnWalkable(id, options),
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
