/**
 * Auto-wire a playable world from Maps-compiled `src/data/*` JSON.
 *
 * Spawns character placements, sets the controlled player, starts BGM,
 * and binds a default interact action for state overlays / gameplay VFX /
 * enterable map transitions. Custom gameplay systems should build on top
 * of this — do not re-spawn placements by hand.
 */
import {
  createGame,
  getAudio,
  playAudio,
  type GameAPI,
  type GeneratedCharacterPlacement,
  type MapOverlayTarget,
  type MapPlacementTarget,
} from "../Game";
import {
  toArchetype,
  toMapData,
  type AnyGeneratedCharacter,
  type GeneratedMap,
} from "../data";
import { runScreenFade } from "../utils/screenFade";

const CHARACTER_SIZE = {
  width: 76 * 1.3,
  height: 114 * 1.3,
};

const INTERACT_RADIUS = 140;

/** Placement row as emitted by Maps compile (may exceed engine PlacementTarget). */
type AuthoredPlacement = {
  id: string;
  element_name?: string;
  box_2d?: number[];
  enterable?: boolean;
  destinationMapId?: string;
  destinationMapAssetId?: string;
  interactionType?: string;
};

function authoredPlacements(map: GeneratedMap): AuthoredPlacement[] {
  const raw = map.placement;
  if (!Array.isArray(raw)) return [];
  const out: AuthoredPlacement[] = [];
  for (const p of raw) {
    if (!p || typeof p !== "object") continue;
    const id = typeof (p as { id?: unknown }).id === "string" ? (p as { id: string }).id : "";
    if (!id) continue;
    out.push(p as AuthoredPlacement);
  }
  return out;
}

function placementBounds(box: number[] | undefined): {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null {
  if (!Array.isArray(box) || box.length < 4) return null;
  const [y1, x1, y2, x2] = box.map(Number);
  if (![y1, x1, y2, x2].every(Number.isFinite)) return null;
  return { x1, y1, x2, y2 };
}

export type BootstrapMapEntry = {
  /** Engine-stable map id (assetKey / export name), e.g. map_village */
  id: string;
  map: GeneratedMap;
};

export type BootstrapCharacterEntry = {
  /** Matches characterPlacements.assetId when possible; also used as archetype name */
  id: string;
  character: AnyGeneratedCharacter;
  /** Optional stable key used as archetype name override */
  archetype?: string;
};

export type BootstrapWorldOptions = {
  canvasId?: string;
  maps: BootstrapMapEntry[];
  characters?: BootstrapCharacterEntry[];
  /**
   * Prefer this map id on boot. Falls back to first map with a player
   * placement, else maps[0].
   */
  startMapId?: string;
  /** common.json-style audio catalog (or registerAudioCatalog payload). */
  commonAudio?: Array<{
    name: string;
    url: string;
    role?: string;
    kind?: string;
    label?: string;
    id?: string;
    assetId?: string;
    transcript?: string;
    durationMs?: number;
  }>;
  cameraEdgePadding?: number;
  onAudioReady?: (start: () => void) => void;
  /** Called after the first map + entities are live. */
  onBootstrapped?: (game: GameAPI) => void;
  /**
   * Optional override for character spawn archetype selection.
   * Return null to skip spawning that placement.
   */
  resolveCharacterArchetype?: (
    placement: GeneratedCharacterPlacement,
  ) => string | null | undefined;
};

function archetypeNameForAssetId(assetId: string): string {
  const trimmed = assetId.trim();
  if (!trimmed) return "char_unknown";
  return trimmed.startsWith("char_") ? trimmed : `char_${trimmed}`;
}

function characterAssetId(entry: BootstrapCharacterEntry): string {
  const fromJson = (entry.character as { assetId?: unknown }).assetId;
  if (typeof fromJson === "string" && fromJson.trim()) return fromJson.trim();
  return entry.id.trim();
}

function feetFromBox(box: readonly number[]): { x: number; y: number } {
  const [y1, x1, y2, x2] = box;
  return { x: (x1 + x2) / 2, y: y2 };
}

function distanceToBounds(
  x: number,
  y: number,
  bounds: { x1: number; y1: number; x2: number; y2: number },
): number {
  const cx = (bounds.x1 + bounds.x2) / 2;
  const cy = (bounds.y1 + bounds.y2) / 2;
  return Math.hypot(x - cx, y - cy);
}

function pickStartMap(opts: BootstrapWorldOptions): BootstrapMapEntry {
  if (opts.startMapId) {
    const found = opts.maps.find((m) => m.id === opts.startMapId);
    if (found) return found;
  }
  for (const entry of opts.maps) {
    const placements = entry.map.characterPlacements ?? [];
    if (placements.some((p) => p.role === "player")) return entry;
    const playerId = entry.map.playerCharacterId;
    if (playerId && placements.some((p) => p.assetId === playerId)) {
      return entry;
    }
  }
  return opts.maps[0]!;
}

function findBgmName(
  commonAudio: BootstrapWorldOptions["commonAudio"],
): string | null {
  if (!commonAudio?.length) return null;
  const byRole = commonAudio.find((a) => a.role === "bgm");
  if (byRole?.name) return byRole.name;
  const byName = commonAudio.find(
    (a) => a.kind === "audio" && /bgm|music/i.test(a.name),
  );
  return byName?.name ?? null;
}

function clearMapLocal(game: GameAPI): void {
  for (const id of game.query((c) => c.mapLocal === true)) {
    game.destroy(id);
  }
}

function spawnMapCharacters(
  game: GameAPI,
  opts: BootstrapWorldOptions,
  map: GeneratedMap,
  definedArchetypes: Set<string>,
): string | null {
  const placements = (map.characterPlacements ??
    []) as GeneratedCharacterPlacement[];
  const chars = opts.characters ?? [];
  const byAssetId = new Map<string, BootstrapCharacterEntry>();
  for (const entry of chars) {
    byAssetId.set(entry.id, entry);
    const assetId = characterAssetId(entry);
    if (assetId) byAssetId.set(assetId, entry);
  }
  const playerIdMeta =
    typeof map.playerCharacterId === "string" ? map.playerCharacterId : null;

  let controlledId: string | null = null;
  let firstSpawnedId: string | null = null;

  for (const placement of placements) {
    const resolved = opts.resolveCharacterArchetype?.(placement);
    if (resolved === null) continue;

    const charEntry = byAssetId.get(placement.assetId);
    const archetype =
      (typeof resolved === "string" && resolved.trim()) ||
      (charEntry?.archetype?.trim()
        ? charEntry.archetype.trim()
        : archetypeNameForAssetId(
            charEntry ? characterAssetId(charEntry) : placement.assetId,
          ));

    if (!definedArchetypes.has(archetype)) {
      console.warn(
        `[bootstrapWorldFromAssets] skip placement "${placement.label}" — unknown archetype ${archetype}`,
      );
      continue;
    }

    const box = placement.box_2d;
    if (!Array.isArray(box) || box.length < 4) continue;
    const feet = feetFromBox(box);
    const role =
      placement.role === "player" || placement.role === "npc"
        ? placement.role
        : playerIdMeta && placement.assetId === playerIdMeta
          ? "player"
          : "npc";

    let entityId: string;
    try {
      entityId = game.spawnAtFeet(archetype, feet.x, feet.y, {
        label: placement.label,
        mapLocal: true,
        kind: role === "player" ? "player" : "npc",
      });
    } catch (err) {
      console.warn(
        `[bootstrapWorldFromAssets] spawn failed for "${placement.label}"`,
        err,
      );
      continue;
    }

    if (!firstSpawnedId) firstSpawnedId = entityId;
    if (role === "player" && !controlledId) {
      controlledId = entityId;
    }
  }

  // Maps may omit an explicit Player — still make the first character walkable.
  const toControl = controlledId ?? firstSpawnedId;
  if (toControl) {
    game.setControlledEntity(toControl);
  }
  return toControl;
}

function nearestOverlay(
  overlays: MapOverlayTarget[],
  x: number,
  y: number,
  radius: number,
): MapOverlayTarget | null {
  let best: MapOverlayTarget | null = null;
  let bestDist = radius;
  for (const overlay of overlays) {
    if (!overlay.states || overlay.states.length < 2) continue;
    const d = distanceToBounds(x, y, overlay.bounds);
    if (d <= bestDist) {
      bestDist = d;
      best = overlay;
    }
  }
  return best;
}

function nearestEnterableAuthored(
  placements: AuthoredPlacement[],
  x: number,
  y: number,
  radius: number,
): AuthoredPlacement | null {
  let best: AuthoredPlacement | null = null;
  let bestDist = radius;
  for (const placement of placements) {
    if (!placement.enterable) continue;
    const dest =
      (typeof placement.destinationMapId === "string" &&
        placement.destinationMapId.trim()) ||
      (typeof placement.destinationMapAssetId === "string" &&
        placement.destinationMapAssetId.trim()) ||
      "";
    if (!dest) continue;
    const bounds = placementBounds(placement.box_2d);
    if (!bounds) continue;
    const d = distanceToBounds(x, y, bounds);
    if (d <= bestDist) {
      bestDist = d;
      best = placement;
    }
  }
  return best;
}

function nearestTypedAuthored(
  placements: AuthoredPlacement[],
  x: number,
  y: number,
  radius: number,
  types: string[],
): AuthoredPlacement | null {
  let best: AuthoredPlacement | null = null;
  let bestDist = radius;
  for (const placement of placements) {
    if (!placement.interactionType || !types.includes(placement.interactionType)) {
      continue;
    }
    const bounds = placementBounds(placement.box_2d);
    if (!bounds) continue;
    const d = distanceToBounds(x, y, bounds);
    if (d <= bestDist) {
      bestDist = d;
      best = placement;
    }
  }
  return best;
}

function nearestEnterable(
  targets: MapPlacementTarget[],
  x: number,
  y: number,
  radius: number,
): MapPlacementTarget | null {
  let best: MapPlacementTarget | null = null;
  let bestDist = radius;
  for (const target of targets) {
    if (!target.enterable || !target.destinationMapId) continue;
    const d = distanceToBounds(x, y, target.bounds);
    if (d <= bestDist) {
      bestDist = d;
      best = target;
    }
  }
  return best;
}

function cycleOverlayState(game: GameAPI, overlay: MapOverlayTarget): boolean {
  const states = overlay.states.filter(Boolean);
  if (states.length < 2) return false;
  const current = game.getMapOverlayState(overlay.id) ?? overlay.currentState;
  const idx = Math.max(0, states.indexOf(current));
  const next = states[(idx + 1) % states.length]!;
  return game.setMapOverlayState(overlay.id, next);
}

function tryTriggerNearestGameplay(
  game: GameAPI,
  x: number,
  y: number,
  map?: GeneratedMap,
): boolean {
  // getMapOverlays() is state/grid only — VFX lives on map sprites.
  // Duck-type so sandboxes on older engine revisions still boot.
  const api = game as GameAPI & {
    triggerNearestGameplayEffect?: (
      atX: number,
      atY: number,
      maxDistance?: number,
    ) => boolean;
  };
  if (typeof api.triggerNearestGameplayEffect === "function") {
    return api.triggerNearestGameplayEffect(x, y, INTERACT_RADIUS);
  }

  // Fallback: tag-trigger nearest authored gameplay VFX within radius.
  const overlays = Array.isArray(map?.mapOverlays) ? map!.mapOverlays! : [];
  let bestTag: string | null = null;
  let bestDist = INTERACT_RADIUS;
  for (const overlay of overlays) {
    if ((overlay as { kind?: string }).kind !== "vfx") continue;
    const states = Array.isArray(overlay.states) ? overlay.states : [];
    for (const state of states) {
      const mode = (state as { mode?: string }).mode;
      if (mode === "background") continue;
      const bounds = placementBounds(
        Array.isArray(state.box_2d) ? state.box_2d : undefined,
      );
      if (!bounds) continue;
      const d = distanceToBounds(x, y, bounds);
      if (d > bestDist) continue;
      bestDist = d;
      bestTag =
        (typeof overlay.anchorLabel === "string" && overlay.anchorLabel.trim()) ||
        overlay.id;
    }
  }
  if (!bestTag) return false;
  return game.triggerNearestMapEffect(bestTag, x, y);
}

function nearestTypedPlacement(
  targets: MapPlacementTarget[],
  x: number,
  y: number,
  radius: number,
  types: string[],
): MapPlacementTarget | null {
  let best: MapPlacementTarget | null = null;
  let bestDist = radius;
  for (const target of targets) {
    if (!target.interactionType || !types.includes(target.interactionType)) {
      continue;
    }
    const d = distanceToBounds(x, y, target.bounds);
    if (d <= bestDist) {
      bestDist = d;
      best = target;
    }
  }
  return best;
}

function handleDefaultInteract(
  game: GameAPI,
  opts: BootstrapWorldOptions,
  mapsById: Map<string, BootstrapMapEntry>,
  currentMapIdRef: { id: string },
  definedArchetypes: Set<string>,
): void {
  const controlled = game.getControlledEntity();
  const feet = controlled != null ? game.getEntityFeet(controlled) : null;
  const x = feet?.x ?? 500;
  const y = feet?.y ?? 500;

  const currentEntry =
    mapsById.get(currentMapIdRef.id) ??
    opts.maps.find((m) => m.id === currentMapIdRef.id);
  const authored = currentEntry ? authoredPlacements(currentEntry.map) : [];

  // Prefer authored JSON — older engine builds drop enterable/interactionType
  // from getPlacementTargets().
  const enterableAuthored = nearestEnterableAuthored(
    authored,
    x,
    y,
    INTERACT_RADIUS,
  );
  const enterableDest =
    (enterableAuthored &&
      ((typeof enterableAuthored.destinationMapId === "string" &&
        enterableAuthored.destinationMapId.trim()) ||
        (typeof enterableAuthored.destinationMapAssetId === "string" &&
          enterableAuthored.destinationMapAssetId.trim()))) ||
    nearestEnterable(game.getPlacementTargets(), x, y, INTERACT_RADIUS)
      ?.destinationMapId;

  if (enterableDest) {
    const next = mapsById.get(enterableDest);
    if (next) {
      void runScreenFade(() => {
        clearMapLocal(game);
        game.loadMap(toMapData(next.map), {
          spawn: { x, y, anchor: "feet" },
        });
        currentMapIdRef.id = next.id;
        spawnMapCharacters(game, opts, next.map, definedArchetypes);
      });
      return;
    }
  }

  // state_change placements → cycle nearest multi-state overlay
  const statePlacement =
    nearestTypedAuthored(authored, x, y, INTERACT_RADIUS, ["state_change"]) ??
    nearestTypedPlacement(
      game.getPlacementTargets(),
      x,
      y,
      INTERACT_RADIUS,
      ["state_change"],
    );
  if (statePlacement) {
    const elementName =
      "elementName" in statePlacement
        ? statePlacement.elementName
        : statePlacement.element_name;
    const overlay =
      game
        .getMapOverlays()
        .find(
          (o) =>
            (elementName && o.anchorLabel === elementName) ||
            o.id.includes(statePlacement.id),
        ) ?? nearestOverlay(game.getMapOverlays(), x, y, INTERACT_RADIUS);
    if (overlay && cycleOverlayState(game, overlay)) return;
  }

  const overlay = nearestOverlay(game.getMapOverlays(), x, y, INTERACT_RADIUS);
  if (overlay && cycleOverlayState(game, overlay)) return;

  // removal / animation → trigger nearest gameplay VFX (background loops already play)
  const fxPlacement =
    nearestTypedAuthored(authored, x, y, INTERACT_RADIUS, [
      "removal",
      "animation",
    ]) ??
    nearestTypedPlacement(
      game.getPlacementTargets(),
      x,
      y,
      INTERACT_RADIUS,
      ["removal", "animation"],
    );
  if (fxPlacement) {
    const elementName =
      "elementName" in fxPlacement
        ? fxPlacement.elementName
        : fxPlacement.element_name;
    if (elementName && game.triggerNearestMapEffect(elementName, x, y)) return;
    if (game.triggerNearestMapEffect(fxPlacement.id, x, y)) return;
  }

  tryTriggerNearestGameplay(game, x, y, currentEntry?.map);
}

/**
 * Boot a playable scene from compiled Maps assets.
 * Returns null when `maps` is empty (caller should use the SVG starter).
 */
export function bootstrapWorldFromAssets(
  opts: BootstrapWorldOptions,
): GameAPI | null {
  if (!opts.maps.length) return null;

  const start = pickStartMap(opts);
  const mapsById = new Map<string, BootstrapMapEntry>();
  for (const entry of opts.maps) {
    mapsById.set(entry.id, entry);
    const name = entry.map.name?.trim();
    if (name) mapsById.set(name, entry);
    const assetId = entry.map.assetId?.trim();
    if (assetId) mapsById.set(assetId, entry);
  }
  const currentMapIdRef = { id: start.id };

  const game = createGame({
    canvasId: opts.canvasId ?? "game",
    map: toMapData(start.map),
    cameraEdgePadding: opts.cameraEdgePadding ?? 120,
    touchControls: { actions: [{ action: "interact", label: "E" }] },
  });

  if (opts.commonAudio?.length) {
    game.registerAudioCatalog({
      version: 1,
      audio: opts.commonAudio.map((a, index) => {
        const role =
          a.role === "bgm" ||
          a.role === "sfx" ||
          a.role === "voice" ||
          a.role === "dialogue" ||
          a.role === "tts"
            ? a.role
            : undefined;
        const kind =
          a.kind === "bgm" || a.kind === "sfx" || a.kind === "voice"
            ? a.kind
            : role === "bgm" || role === "sfx" || role === "voice"
              ? role
              : undefined;
        const id =
          (typeof a.id === "string" && a.id.trim()) ||
          (typeof a.assetId === "string" && a.assetId.trim()) ||
          a.name ||
          `audio_${index}`;
        return {
          id,
          name: a.name,
          url: a.url,
          role,
          kind,
          label: a.label,
          transcript: a.transcript,
          durationMs: a.durationMs,
        };
      }),
    });
  }

  const playerIdMeta =
    typeof start.map.playerCharacterId === "string"
      ? start.map.playerCharacterId
      : null;

  const definedArchetypes = new Set<string>();

  for (const entry of opts.characters ?? []) {
    const assetId = characterAssetId(entry);
    const primary =
      entry.archetype?.trim() || archetypeNameForAssetId(assetId);
    const isPlayerLike = Boolean(
      (start.map.characterPlacements ?? []).some(
        (p) =>
          p.assetId === assetId &&
          (p.role === "player" || playerIdMeta === assetId),
      ),
    );
    const def = toArchetype(entry.character, {
      kind: isPlayerLike ? "player" : "npc",
      radius: isPlayerLike ? 34 : 24,
      speed: isPlayerLike ? 95 : 20,
      frameDurationMs: 125,
      ...CHARACTER_SIZE,
    });
    game.defineArchetype(primary, def);
    definedArchetypes.add(primary);

    // Always also register under char_<assetId> so placements match.
    const alt = archetypeNameForAssetId(assetId);
    if (alt !== primary) {
      game.defineArchetype(alt, def);
      definedArchetypes.add(alt);
    }
  }

  spawnMapCharacters(game, opts, start.map, definedArchetypes);

  const bgmName = findBgmName(opts.commonAudio);
  const startMusic = () => {
    if (!bgmName) return;
    const audio = getAudio(bgmName);
    if (audio) {
      audio.loop = true;
      audio.volume = 0.05;
      void audio.play().catch(() => {
        playAudio(bgmName, { loop: true, volume: 0.05 });
      });
    } else {
      playAudio(bgmName, { loop: true, volume: 0.05 });
    }
  };

  if (opts.onAudioReady) {
    opts.onAudioReady(startMusic);
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", startMusic, {
      once: true,
      passive: true,
    });
    window.addEventListener("keydown", startMusic, { once: true });
  }

  game.bindInputAction("interact", ["KeyE"]);
  game.onInputAction("interact", ({ phase }) => {
    if (phase !== "down") return;
    handleDefaultInteract(
      game,
      opts,
      mapsById,
      currentMapIdRef,
      definedArchetypes,
    );
  });

  opts.onBootstrapped?.(game);
  return game;
}
