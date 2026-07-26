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
  stopAudio,
  type GameAPI,
  type GeneratedCharacterPlacement,
  type MapOverlayTarget,
  type MapPlacementTarget,
  type TouchControlsConfig,
} from "../Game"
import {
  toArchetype,
  toMapData,
  toSpriteSheets,
  type AnyGeneratedCharacter,
  type GeneratedMap,
} from "../data"
import {
  createEmptyMapTransitionPromptState,
  createMapTransitionPromptWidget,
  MAP_TRANSITION_PROMPT_RESOURCE,
  type MapTransitionPromptState,
} from "../widgets/MapTransitionPromptWidget"

/** Fallback art size when a placement has no usable box (source pixels). */
const CHARACTER_ART_WIDTH_PX = 76
const CHARACTER_ART_HEIGHT_PX = 114
const CHARACTER_SCALE = 1.3
/** Historical default panel size from the engine (`utils/common.ts`). */
const DEFAULT_PANEL_PIXEL_WIDTH = 2508
const DEFAULT_PANEL_PIXEL_HEIGHT = 1672

const PLAYER_RADIUS = 34
const NPC_RADIUS = 24

/** Fallback player walk speed when height is unknown (norm units / sec). */
const PLAYER_SPEED_DEFAULT = 55
const NPC_SPEED_DEFAULT = 20
/** Walk ≈ 0.85 body-heights/sec, clamped for dense village maps. */
const PLAYER_SPEED_HEIGHT_RATIO = 0.85
const PLAYER_SPEED_MIN = 40
const PLAYER_SPEED_MAX = 70

const INTERACT_RADIUS = 140

type PanelPixels = { width: number; height: number }

function defaultCharacterSize(panel: PanelPixels): {
  width: number
  height: number
} {
  // Convert source-art pixels → norm (X/Y axes are not square on landscape maps).
  return {
    width: ((CHARACTER_ART_WIDTH_PX * CHARACTER_SCALE) / panel.width) * 1000,
    height: ((CHARACTER_ART_HEIGHT_PX * CHARACTER_SCALE) / panel.height) * 1000,
  }
}

/**
 * Player walk speed from sprite height so placement-sized characters stay
 * readable on dense maps. NPCs keep a slow patrol default.
 */
function walkSpeedForHeight(
  height: number,
  role: "player" | "npc",
  override?: number
): number {
  if (Number.isFinite(override) && (override as number) > 0) {
    return override as number
  }
  if (role === "npc") return NPC_SPEED_DEFAULT
  if (!Number.isFinite(height) || height <= 0) return PLAYER_SPEED_DEFAULT
  return Math.min(
    PLAYER_SPEED_MAX,
    Math.max(PLAYER_SPEED_MIN, height * PLAYER_SPEED_HEIGHT_RATIO)
  )
}

/** Placement row as emitted by Maps compile (may exceed engine PlacementTarget). */
type AuthoredPlacement = {
  id: string
  element_name?: string
  box_2d?: number[]
  enterable?: boolean
  destinationMapId?: string
  destinationMapAssetId?: string
  /** Spawn footprint on the destination map `[ymin,xmin,ymax,xmax]` 0–1000. */
  destinationSpawnBox2d?: number[]
  interactionType?: string
}

function authoredPlacements(map: GeneratedMap): AuthoredPlacement[] {
  const raw = map.placement
  if (!Array.isArray(raw)) return []
  const out: AuthoredPlacement[] = []
  for (const p of raw) {
    if (!p || typeof p !== "object") continue
    const id =
      typeof (p as { id?: unknown }).id === "string"
        ? (p as { id: string }).id
        : ""
    if (!id) continue
    out.push(p as AuthoredPlacement)
  }
  return out
}

function placementBounds(box: number[] | undefined): {
  x1: number
  y1: number
  x2: number
  y2: number
} | null {
  if (!Array.isArray(box) || box.length < 4) return null
  const [y1, x1, y2, x2] = box.map(Number)
  if (![y1, x1, y2, x2].every(Number.isFinite)) return null
  return { x1, y1, x2, y2 }
}

export type BootstrapMapEntry = {
  /** Engine-stable map id (assetKey / export name), e.g. map_village */
  id: string
  map: GeneratedMap
}

export type BootstrapCharacterEntry = {
  /** Matches characterPlacements.assetId when possible; also used as archetype name */
  id: string
  character: AnyGeneratedCharacter
  /** Optional stable key used as archetype name override */
  archetype?: string
}

export type BootstrapArchetypeDefaults = {
  speed?: number
  radius?: number
  frameDurationMs?: number
}

export type BootstrapWorldOptions = {
  canvasId?: string
  maps: BootstrapMapEntry[]
  characters?: BootstrapCharacterEntry[]
  /**
   * Prefer this map id on boot. Falls back to first map with a player
   * placement, else maps[0].
   */
  startMapId?: string
  /** common.json-style audio catalog (or registerAudioCatalog payload). */
  commonAudio?: Array<{
    name: string
    url: string
    role?: string
    kind?: string
    label?: string
    id?: string
    assetId?: string
    parentAssetId?: string
    transcript?: string
    durationMs?: number
    /** Playback gain 0–1. */
    volume?: number
    /** Start on map enter when true. */
    autoplay?: boolean
  }>
  cameraEdgePadding?: number
  /**
   * Camera zoom while following (desktop + touch). Default `1.45` so the
   * player is readable on dense village maps.
   */
  followZoom?: number
  /** Soft camera follow stiffness. Default `10`. */
  cameraFollowLerp?: number
  /** Cap on CSS canvas upscale; default 1 avoids magnifying map art. */
  maxViewportScale?: number
  /**
   * On-screen touch actions. Defaults to `{ actions: [{ action: "interact", label: "E" }] }`.
   * Pass `false` to disable the default touch chrome.
   */
  touchControls?: false | TouchControlsConfig
  onAudioReady?: (start: () => void) => void
  /** Called after the first map + entities are live. */
  onBootstrapped?: (game: GameAPI) => void
  /**
   * Optional override for character spawn archetype selection.
   * Return null to skip spawning that placement.
   */
  resolveCharacterArchetype?: (
    placement: GeneratedCharacterPlacement
  ) => string | null | undefined
  /** Override default player/npc archetype fields (speed, radius, …). */
  archetypeDefaults?: {
    player?: BootstrapArchetypeDefaults
    npc?: BootstrapArchetypeDefaults
  }
  /**
   * When false, skip the built-in interact binding (map enter / overlay /
   * gameplay VFX). Default true. Use with `onInteract` or scene systems.
   */
  enableDefaultInteract?: boolean
  /**
   * Runs on interact `down` before the built-in handler.
   * Return `true` to claim the event and skip default interact.
   */
  onInteract?: (game: GameAPI) => boolean | void
}

/**
 * Gameplay-facing options that `createGeneratedWorld` / `createMainScene`
 * should forward into bootstrap. Asset sync supplies maps/characters/audio;
 * hand-written code customizes via these fields without editing generated files.
 */
export type BootstrapGameplayOptions = Omit<
  BootstrapWorldOptions,
  "maps" | "characters" | "commonAudio"
>

function archetypeNameForAssetId(assetId: string): string {
  const trimmed = assetId.trim()
  if (!trimmed) return "char_unknown"
  return trimmed.startsWith("char_") ? trimmed : `char_${trimmed}`
}

function characterAssetId(entry: BootstrapCharacterEntry): string {
  const fromJson = (entry.character as { assetId?: unknown }).assetId
  if (typeof fromJson === "string" && fromJson.trim()) return fromJson.trim()
  return entry.id.trim()
}

function feetFromBox(box: readonly number[]): { x: number; y: number } {
  const [y1, x1, y2, x2] = box
  return { x: (x1 + x2) / 2, y: y2 }
}

/**
 * Measure one panel in canvas pixels. Zoom/cssScale cancel when we convert
 * box → fit → norm with the same basis.
 */
function panelPixelSize(game: GameAPI): PanelPixels {
  try {
    const origin = game.normalizedToCanvasPoint(0, 0)
    const xAxis = game.normalizedToCanvasPoint(1000, 0)
    const yAxis = game.normalizedToCanvasPoint(0, 1000)
    const width = Math.abs(xAxis.x - origin.x)
    const height = Math.abs(yAxis.y - origin.y)
    if (width > 1e-6 && height > 1e-6) return { width, height }
  } catch {
    // Fall through to default.
  }
  return {
    width: DEFAULT_PANEL_PIXEL_WIDTH,
    height: DEFAULT_PANEL_PIXEL_HEIGHT,
  }
}

function placementBoxSize(placement: GeneratedCharacterPlacement): {
  width: number
  height: number
} | null {
  const box = placement.box_2d
  const fromBoxW =
    Array.isArray(box) && box.length >= 4 ? Math.max(0, box[3]! - box[1]!) : 0
  const fromBoxH =
    Array.isArray(box) && box.length >= 4 ? Math.max(0, box[2]! - box[0]!) : 0
  const width =
    typeof placement.width === "number" &&
    Number.isFinite(placement.width) &&
    placement.width > 0
      ? placement.width
      : fromBoxW
  const height =
    typeof placement.height === "number" &&
    Number.isFinite(placement.height) &&
    placement.height > 0
      ? placement.height
      : fromBoxH
  if (width <= 0 || height <= 0) return null
  return { width, height }
}

/** Source-art aspect ratio (w/h) from a generated character's first sheet. */
function characterAspect(
  character: AnyGeneratedCharacter | undefined
): number {
  const fallback = CHARACTER_ART_WIDTH_PX / CHARACTER_ART_HEIGHT_PX
  if (!character) return fallback
  for (const sheet of toSpriteSheets(character)) {
    const w = Number(sheet.width)
    const h = Number(sheet.height)
    if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      return w / h
    }
  }
  return fallback
}

/**
 * Object-contain `aspect` (art w/h) inside the editor placement box so the
 * sprite fills the box on its constraining axis instead of being letterboxed
 * small by `imageFit: "contain"`.
 */
function containSize(
  box: { width: number; height: number },
  aspect: number
): { width: number; height: number } {
  if (!Number.isFinite(aspect) || aspect <= 0) return box
  if (box.width <= 0 || box.height <= 0) return box
  const boxAspect = box.width / box.height
  if (boxAspect > aspect) {
    // Box is wider than the art → constrain by height.
    return { width: box.height * aspect, height: box.height }
  }
  // Box is narrower/taller than the art → constrain by width.
  return { width: box.width, height: box.width / aspect }
}

/**
 * Size a character entity from its editor placement box while preserving the
 * source-art aspect ratio (object-contain). Falls back to the default
 * character size when no usable box is present.
 */
function sizeFromPlacement(
  placement: GeneratedCharacterPlacement,
  game: GameAPI,
  aspect: number
): { width: number; height: number } {
  const box = placementBoxSize(placement)
  if (!box) return defaultCharacterSize(panelPixelSize(game))
  return containSize(box, aspect)
}

function radiusForSize(
  size: { width: number; height: number },
  role: "player" | "npc",
  panel: PanelPixels
): number {
  const base = role === "player" ? PLAYER_RADIUS : NPC_RADIUS
  const ref = defaultCharacterSize(panel)
  const scaled = (base * size.height) / ref.height
  return Math.max(8, Number.isFinite(scaled) ? scaled : base)
}

function distanceToBounds(
  x: number,
  y: number,
  bounds: { x1: number; y1: number; x2: number; y2: number }
): number {
  // Distance to the nearest edge (0 when inside), so large doors/overlays
  // stay interactable near their edges instead of only near the center.
  const clampedX = Math.max(bounds.x1, Math.min(x, bounds.x2))
  const clampedY = Math.max(bounds.y1, Math.min(y, bounds.y2))
  return Math.hypot(x - clampedX, y - clampedY)
}

function pointInBounds(
  x: number,
  y: number,
  bounds: { x1: number; y1: number; x2: number; y2: number }
): boolean {
  return x >= bounds.x1 && x <= bounds.x2 && y >= bounds.y1 && y <= bounds.y2
}

function pickStartMap(opts: BootstrapWorldOptions): BootstrapMapEntry {
  if (opts.startMapId) {
    const found = opts.maps.find((m) => m.id === opts.startMapId)
    if (found) return found
  }
  for (const entry of opts.maps) {
    const placements = entry.map.characterPlacements ?? []
    if (placements.some((p) => p.role === "player")) return entry
    const playerId = entry.map.playerCharacterId
    if (playerId && placements.some((p) => p.assetId === playerId)) {
      return entry
    }
  }
  return opts.maps[0]!
}

const DEFAULT_BGM_VOLUME = 0.05
const DEFAULT_SFX_VOLUME = 0.5

type CommonAudioClip = NonNullable<BootstrapWorldOptions["commonAudio"]>[number]

function clampVolume(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

function audioBelongsToMap(
  clip: CommonAudioClip,
  mapAssetId: string | null | undefined
): boolean {
  if (!mapAssetId) return true
  const parent =
    typeof clip.parentAssetId === "string" ? clip.parentAssetId.trim() : ""
  // Legacy chat-wide clips (no parent) stay available on every map.
  if (!parent) return true
  return parent === mapAssetId
}

function findMapAudio(
  commonAudio: BootstrapWorldOptions["commonAudio"],
  mapAssetId: string | null | undefined,
  role: "bgm" | "sfx"
): CommonAudioClip[] {
  if (!commonAudio?.length) return []
  return commonAudio.filter(
    (a) => a.role === role && audioBelongsToMap(a, mapAssetId)
  )
}

function findBgmClip(
  commonAudio: BootstrapWorldOptions["commonAudio"],
  mapAssetId: string | null | undefined
): CommonAudioClip | null {
  const forMap = findMapAudio(commonAudio, mapAssetId, "bgm")
  if (forMap.length) {
    const auto = forMap.find((a) => a.autoplay !== false)
    return auto ?? null
  }
  // Fallback: first global BGM (older assets without parentAssetId / role).
  if (!commonAudio?.length) return null
  const byRole = commonAudio.find((a) => a.role === "bgm")
  if (byRole) return byRole
  const byName = commonAudio.find(
    (a) => a.kind === "audio" && /bgm|music/i.test(a.name)
  )
  return byName ?? null
}

function stopNamedAudio(name: string | null | undefined): void {
  if (!name) return
  try {
    stopAudio(name)
  } catch {
    // Older engine builds may not export stopAudio.
  }
  const audio = getAudio(name)
  if (audio) {
    try {
      audio.pause()
      audio.currentTime = 0
    } catch {
      // ignore
    }
  }
}

function playClip(
  clip: CommonAudioClip,
  opts: { loop: boolean; defaultVolume: number }
): void {
  const volume = clampVolume(clip.volume, opts.defaultVolume)
  const audio = getAudio(clip.name)
  if (audio) {
    audio.loop = opts.loop
    audio.volume = volume
    void audio.play().catch(() => {
      playAudio(clip.name, { loop: opts.loop, volume })
    })
  } else {
    playAudio(clip.name, { loop: opts.loop, volume })
  }
}

function clearMapLocal(game: GameAPI): void {
  for (const id of game.query((c) => c.mapLocal === true)) {
    game.destroy(id)
  }
}

function playerPlacementOnMap(
  map: GeneratedMap
): GeneratedCharacterPlacement | null {
  const placements = (map.characterPlacements ??
    []) as GeneratedCharacterPlacement[]
  const playerIdMeta =
    typeof map.playerCharacterId === "string" ? map.playerCharacterId : null
  const byRole = placements.find((p) => p.role === "player")
  if (byRole) return byRole
  if (playerIdMeta) {
    const byId = placements.find((p) => p.assetId === playerIdMeta)
    if (byId) return byId
  }
  return null
}

function resolveTransitionSpawn(opts: {
  destinationMap: GeneratedMap
  enterableAuthored: AuthoredPlacement | null | undefined
  fallbackFeet: { x: number; y: number }
}): { x: number; y: number } {
  // 1) Entrance-authored destination spawn bbox. This is the intended arrival
  //    point for *this* door and is placed outside the destination trigger to
  //    avoid transition loops, so it must win over a generic player marker.
  const spawnBox = opts.enterableAuthored?.destinationSpawnBox2d
  if (Array.isArray(spawnBox) && spawnBox.length >= 4) {
    const nums = spawnBox.slice(0, 4).map(Number)
    if (nums.every(Number.isFinite)) {
      return feetFromBox(nums as number[])
    }
  }

  // 2) Spawn stored on the destination map metadata.
  const entrySpawn =
    (opts.destinationMap as { entrySpawnBbox?: unknown }).entrySpawnBbox ??
    (opts.destinationMap as { spawnBbox?: unknown }).spawnBbox
  if (Array.isArray(entrySpawn) && entrySpawn.length >= 4) {
    const nums = entrySpawn.slice(0, 4).map(Number)
    if (nums.every(Number.isFinite)) {
      return feetFromBox(nums as number[])
    }
  }

  // 3) User-authored player placement on the destination map.
  const playerPlacement = playerPlacementOnMap(opts.destinationMap)
  if (
    playerPlacement &&
    Array.isArray(playerPlacement.box_2d) &&
    playerPlacement.box_2d.length >= 4
  ) {
    return feetFromBox(playerPlacement.box_2d)
  }

  // 4) Legacy: keep current feet.
  return opts.fallbackFeet
}

/**
 * Spawn map-local NPCs. The controlled player is spawned once as a non-mapLocal
 * entity on initial boot; later maps only contribute player placement markers
 * used by transition spawn resolution — never a second player instance.
 */
function spawnMapCharacters(
  game: GameAPI,
  opts: BootstrapWorldOptions,
  map: GeneratedMap,
  definedArchetypes: Set<string>,
  options?: { preserveExistingPlayer?: boolean }
): string | null {
  const placements = (map.characterPlacements ??
    []) as GeneratedCharacterPlacement[]
  const chars = opts.characters ?? []
  const byAssetId = new Map<string, BootstrapCharacterEntry>()
  for (const entry of chars) {
    byAssetId.set(entry.id, entry)
    const assetId = characterAssetId(entry)
    if (assetId) byAssetId.set(assetId, entry)
  }
  const playerIdMeta =
    typeof map.playerCharacterId === "string" ? map.playerCharacterId : null

  const existingControlled = game.getControlledEntity()
  const preservePlayer =
    options?.preserveExistingPlayer === true && existingControlled != null

  let controlledId: string | null = preservePlayer
    ? existingControlled
    : null
  let firstSpawnedId: string | null = null

  for (const placement of placements) {
    const resolved = opts.resolveCharacterArchetype?.(placement)
    if (resolved === null) continue

    const charEntry = byAssetId.get(placement.assetId)
    const archetype =
      (typeof resolved === "string" && resolved.trim()) ||
      (charEntry?.archetype?.trim()
        ? charEntry.archetype.trim()
        : archetypeNameForAssetId(
            charEntry ? characterAssetId(charEntry) : placement.assetId
          ))

    if (!definedArchetypes.has(archetype)) {
      console.warn(
        `[bootstrapWorldFromAssets] skip placement "${placement.label}" — unknown archetype ${archetype}`
      )
      continue
    }

    const box = placement.box_2d
    if (!Array.isArray(box) || box.length < 4) continue
    const feet = feetFromBox(box)
    const panel = panelPixelSize(game)
    const size = sizeFromPlacement(
      placement,
      game,
      characterAspect(charEntry?.character)
    )
    const role =
      placement.role === "player" || placement.role === "npc"
        ? placement.role
        : playerIdMeta && placement.assetId === playerIdMeta
          ? "player"
          : "npc"

    // Exactly one player entity: skip player markers when one already exists.
    if (role === "player" && preservePlayer) {
      continue
    }

    let entityId: string
    try {
      entityId = game.spawnAtFeet(archetype, feet.x, feet.y, {
        label: placement.label,
        // Player persists across maps; NPCs are map-local.
        mapLocal: role !== "player",
        kind: role === "player" ? "player" : "npc",
        width: size.width,
        height: size.height,
        radius: radiusForSize(size, role, panel),
        speed: walkSpeedForHeight(
          size.height,
          role,
          role === "player"
            ? opts.archetypeDefaults?.player?.speed
            : opts.archetypeDefaults?.npc?.speed
        ),
      })
    } catch (err) {
      console.warn(
        `[bootstrapWorldFromAssets] spawn failed for "${placement.label}"`,
        err
      )
      continue
    }

    if (!firstSpawnedId) firstSpawnedId = entityId
    if (role === "player" && !controlledId) {
      controlledId = entityId
    }
  }

  // Maps may omit an explicit Player — still make the first character walkable
  // on initial boot only (never invent a second player on transition).
  const toControl =
    controlledId ?? (preservePlayer ? existingControlled : firstSpawnedId)
  if (toControl) {
    game.setControlledEntity(toControl)
    // The controlled entity must survive map transitions. A map that omits an
    // explicit Player role may fall back to the first NPC (spawned mapLocal),
    // and clearMapLocal would destroy it on the next transition — promote it.
    game.patch(toControl, { mapLocal: false, kind: "player" })
  }
  return toControl
}

function nearestOverlay(
  overlays: MapOverlayTarget[],
  x: number,
  y: number,
  radius: number
): MapOverlayTarget | null {
  let best: MapOverlayTarget | null = null
  let bestDist = radius
  for (const overlay of overlays) {
    if (!overlay.states || overlay.states.length < 2) continue
    const d = distanceToBounds(x, y, overlay.bounds)
    if (d <= bestDist) {
      bestDist = d
      best = overlay
    }
  }
  return best
}

function nearestEnterableAuthored(
  placements: AuthoredPlacement[],
  x: number,
  y: number,
  radius: number
): AuthoredPlacement | null {
  let best: AuthoredPlacement | null = null
  let bestDist = radius
  for (const placement of placements) {
    if (!placement.enterable) continue
    const dest =
      (typeof placement.destinationMapId === "string" &&
        placement.destinationMapId.trim()) ||
      (typeof placement.destinationMapAssetId === "string" &&
        placement.destinationMapAssetId.trim()) ||
      ""
    if (!dest) continue
    const bounds = placementBounds(placement.box_2d)
    if (!bounds) continue
    const d = distanceToBounds(x, y, bounds)
    if (d <= bestDist) {
      bestDist = d
      best = placement
    }
  }
  return best
}

function nearestTypedAuthored(
  placements: AuthoredPlacement[],
  x: number,
  y: number,
  radius: number,
  types: string[]
): AuthoredPlacement | null {
  let best: AuthoredPlacement | null = null
  let bestDist = radius
  for (const placement of placements) {
    if (
      !placement.interactionType ||
      !types.includes(placement.interactionType)
    ) {
      continue
    }
    const bounds = placementBounds(placement.box_2d)
    if (!bounds) continue
    const d = distanceToBounds(x, y, bounds)
    if (d <= bestDist) {
      bestDist = d
      best = placement
    }
  }
  return best
}

function nearestEnterable(
  targets: MapPlacementTarget[],
  x: number,
  y: number,
  radius: number
): MapPlacementTarget | null {
  let best: MapPlacementTarget | null = null
  let bestDist = radius
  for (const target of targets) {
    if (!target.enterable || !target.destinationMapId) continue
    const d = distanceToBounds(x, y, target.bounds)
    if (d <= bestDist) {
      bestDist = d
      best = target
    }
  }
  return best
}

function cycleOverlayState(game: GameAPI, overlay: MapOverlayTarget): boolean {
  const states = overlay.states.filter(Boolean)
  if (states.length < 2) return false
  const current = game.getMapOverlayState(overlay.id) ?? overlay.currentState
  const idx = Math.max(0, states.indexOf(current))
  const next = states[(idx + 1) % states.length]!
  return game.setMapOverlayState(overlay.id, next)
}

function tryTriggerNearestGameplay(
  game: GameAPI,
  x: number,
  y: number,
  map?: GeneratedMap
): boolean {
  // getMapOverlays() is state/grid only — VFX lives on map sprites.
  // Duck-type so sandboxes on older engine revisions still boot.
  const api = game as GameAPI & {
    triggerNearestGameplayEffect?: (
      atX: number,
      atY: number,
      maxDistance?: number
    ) => boolean
  }
  if (typeof api.triggerNearestGameplayEffect === "function") {
    return api.triggerNearestGameplayEffect(x, y, INTERACT_RADIUS)
  }

  // Fallback: tag-trigger nearest authored gameplay VFX within radius.
  const overlays = Array.isArray(map?.mapOverlays) ? map!.mapOverlays! : []
  let bestTag: string | null = null
  let bestDist = INTERACT_RADIUS
  for (const overlay of overlays) {
    if ((overlay as { kind?: string }).kind !== "vfx") continue
    const states = Array.isArray(overlay.states) ? overlay.states : []
    for (const state of states) {
      const mode = (state as { mode?: string }).mode
      if (mode === "background") continue
      const bounds = placementBounds(
        Array.isArray(state.box_2d) ? state.box_2d : undefined
      )
      if (!bounds) continue
      const d = distanceToBounds(x, y, bounds)
      if (d > bestDist) continue
      bestDist = d
      bestTag =
        (typeof overlay.anchorLabel === "string" &&
          overlay.anchorLabel.trim()) ||
        overlay.id
    }
  }
  if (!bestTag) return false
  return game.triggerNearestMapEffect(bestTag, x, y)
}

function nearestTypedPlacement(
  targets: MapPlacementTarget[],
  x: number,
  y: number,
  radius: number,
  types: string[]
): MapPlacementTarget | null {
  let best: MapPlacementTarget | null = null
  let bestDist = radius
  for (const target of targets) {
    if (!target.interactionType || !types.includes(target.interactionType)) {
      continue
    }
    const d = distanceToBounds(x, y, target.bounds)
    if (d <= bestDist) {
      bestDist = d
      best = target
    }
  }
  return best
}

function resolveEnterableLabel(
  placement: AuthoredPlacement | MapPlacementTarget | null | undefined,
  mapsById: Map<string, BootstrapMapEntry>
): string {
  if (!placement) return ""
  const dest =
    ("destinationMapId" in placement &&
      typeof placement.destinationMapId === "string" &&
      placement.destinationMapId.trim()) ||
    ("destinationMapAssetId" in placement &&
      typeof (placement as AuthoredPlacement).destinationMapAssetId ===
        "string" &&
      (placement as AuthoredPlacement).destinationMapAssetId!.trim()) ||
    ""
  if (dest) {
    const entry = mapsById.get(dest)
    const name = entry?.map.name?.trim()
    if (name) return name
  }
  if ("elementName" in placement && typeof placement.elementName === "string") {
    return placement.elementName.trim()
  }
  if (
    "element_name" in placement &&
    typeof (placement as AuthoredPlacement).element_name === "string"
  ) {
    return (placement as AuthoredPlacement).element_name!.trim()
  }
  if ("label" in placement && typeof (placement as { label?: string }).label === "string") {
    return (placement as { label: string }).label.trim()
  }
  return ""
}

function clearTransitionPrompt(game: GameAPI): void {
  try {
    const prompt = game.getResource<MapTransitionPromptState>(
      MAP_TRANSITION_PROMPT_RESOURCE
    )
    if (!prompt.active && !prompt.bounds) return
    prompt.active = false
    prompt.label = ""
    prompt.promptText = ""
    prompt.bounds = null
  } catch {
    // Resource not registered.
  }
}

function updateTransitionPrompt(opts: {
  game: GameAPI
  mapsById: Map<string, BootstrapMapEntry>
  currentMapIdRef: { id: string }
  arrivalRef: {
    mapId: string | null
    bounds: { x1: number; y1: number; x2: number; y2: number } | null
  }
  transitionBusy: boolean
}): void {
  const { game, mapsById, currentMapIdRef, arrivalRef, transitionBusy } = opts
  let prompt: MapTransitionPromptState
  try {
    prompt = game.getResource<MapTransitionPromptState>(
      MAP_TRANSITION_PROMPT_RESOURCE
    )
  } catch {
    return
  }

  if (transitionBusy) {
    clearTransitionPrompt(game)
    return
  }

  const controlled = game.getControlledEntity()
  const feet = controlled != null ? game.getEntityFeet(controlled) : null
  if (!feet) {
    clearTransitionPrompt(game)
    return
  }
  const { x, y } = feet

  // Same walk-out release as interact — keep prompt + lockout in sync.
  if (
    arrivalRef.bounds &&
    arrivalRef.mapId === currentMapIdRef.id &&
    !pointInBounds(x, y, arrivalRef.bounds)
  ) {
    arrivalRef.mapId = null
    arrivalRef.bounds = null
  }
  const lockedInArrival =
    !!arrivalRef.bounds &&
    arrivalRef.mapId === currentMapIdRef.id &&
    pointInBounds(x, y, arrivalRef.bounds)
  if (lockedInArrival) {
    clearTransitionPrompt(game)
    return
  }

  const currentEntry =
    mapsById.get(currentMapIdRef.id) ??
    [...mapsById.values()].find((m) => m.id === currentMapIdRef.id)
  const authored = currentEntry ? authoredPlacements(currentEntry.map) : []

  const enterableAuthored = nearestEnterableAuthored(
    authored,
    x,
    y,
    INTERACT_RADIUS
  )
  const enterableTarget = enterableAuthored
    ? null
    : nearestEnterable(game.getPlacementTargets(), x, y, INTERACT_RADIUS)

  const dest =
    (enterableAuthored &&
      ((typeof enterableAuthored.destinationMapId === "string" &&
        enterableAuthored.destinationMapId.trim()) ||
        (typeof enterableAuthored.destinationMapAssetId === "string" &&
          enterableAuthored.destinationMapAssetId.trim()))) ||
    enterableTarget?.destinationMapId ||
    ""

  if (!dest || !mapsById.has(dest)) {
    clearTransitionPrompt(game)
    return
  }

  const bounds = enterableAuthored
    ? placementBounds(enterableAuthored.box_2d)
    : enterableTarget?.bounds ?? null
  if (!bounds) {
    clearTransitionPrompt(game)
    return
  }

  const label = resolveEnterableLabel(
    enterableAuthored ?? enterableTarget,
    mapsById
  )
  const touch =
    typeof window !== "undefined" &&
    (window.matchMedia("(pointer: coarse)").matches ||
      navigator.maxTouchPoints > 0)
  const promptText = touch
    ? `Tap E to enter${label ? `: ${label}` : ""}`
    : `Press E to enter${label ? `: ${label}` : ""}`

  prompt.active = true
  prompt.label = label
  prompt.promptText = promptText
  prompt.bounds = bounds
}

function handleDefaultInteract(
  game: GameAPI,
  opts: BootstrapWorldOptions,
  mapsById: Map<string, BootstrapMapEntry>,
  currentMapIdRef: { id: string },
  definedArchetypes: Set<string>,
  applyMapAudio?: (mapAssetId: string | null | undefined) => void,
  transitionState?: { busy: boolean },
  arrivalRef?: {
    mapId: string | null
    bounds: { x1: number; y1: number; x2: number; y2: number } | null
  }
): void {
  if (transitionState?.busy) return

  const controlled = game.getControlledEntity()
  const feet = controlled != null ? game.getEntityFeet(controlled) : null
  const x = feet?.x ?? 500
  const y = feet?.y ?? 500

  const currentEntry =
    mapsById.get(currentMapIdRef.id) ??
    opts.maps.find((m) => m.id === currentMapIdRef.id)
  const authored = currentEntry ? authoredPlacements(currentEntry.map) : []

  // Release the re-entry lock once the player walks out of the entrance they
  // arrived through (prevents an immediate transition loop after a door swap).
  if (
    arrivalRef?.bounds &&
    arrivalRef.mapId === currentMapIdRef.id &&
    !pointInBounds(x, y, arrivalRef.bounds)
  ) {
    arrivalRef.mapId = null
    arrivalRef.bounds = null
  }
  const lockedInArrival =
    !!arrivalRef?.bounds &&
    arrivalRef.mapId === currentMapIdRef.id &&
    pointInBounds(x, y, arrivalRef.bounds)

  // Prefer authored JSON — older engine builds drop enterable/interactionType
  // from getPlacementTargets().
  const enterableAuthored = nearestEnterableAuthored(
    authored,
    x,
    y,
    INTERACT_RADIUS
  )
  const enterableDest =
    (enterableAuthored &&
      ((typeof enterableAuthored.destinationMapId === "string" &&
        enterableAuthored.destinationMapId.trim()) ||
        (typeof enterableAuthored.destinationMapAssetId === "string" &&
          enterableAuthored.destinationMapAssetId.trim()))) ||
    nearestEnterable(game.getPlacementTargets(), x, y, INTERACT_RADIUS)
      ?.destinationMapId

  if (enterableDest && !lockedInArrival) {
    const next = mapsById.get(enterableDest)
    if (next) {
      const spawnFeet = resolveTransitionSpawn({
        destinationMap: next.map,
        enterableAuthored,
        fallbackFeet: { x, y },
      })
      if (transitionState) transitionState.busy = true
      void game
        .transitionMap(toMapData(next.map), {
          spawn: { x: spawnFeet.x, y: spawnFeet.y, anchor: "feet" },
          during: (swap) => {
            clearMapLocal(game)
            swap()
            currentMapIdRef.id = next.id
            spawnMapCharacters(game, opts, next.map, definedArchetypes, {
              preserveExistingPlayer: true,
            })
            const nextAssetId =
              typeof next.map.assetId === "string" && next.map.assetId.trim()
                ? next.map.assetId.trim()
                : next.id
            applyMapAudio?.(nextAssetId)
            // Suppress re-entry until the player leaves the entrance they
            // spawned into on the destination map.
            if (arrivalRef) {
              const destEnterable = nearestEnterableAuthored(
                authoredPlacements(next.map),
                spawnFeet.x,
                spawnFeet.y,
                INTERACT_RADIUS
              )
              arrivalRef.mapId = next.id
              arrivalRef.bounds = destEnterable
                ? placementBounds(destEnterable.box_2d)
                : null
            }
          },
        })
        .finally(() => {
          if (transitionState) transitionState.busy = false
        })
      return
    }
    console.warn(
      `[bootstrapWorldFromAssets] enterable destination "${enterableDest}" has no matching map — check destinationMapId / assetId`
    )
  }

  // state_change placements → cycle nearest multi-state overlay
  const statePlacement =
    nearestTypedAuthored(authored, x, y, INTERACT_RADIUS, ["state_change"]) ??
    nearestTypedPlacement(game.getPlacementTargets(), x, y, INTERACT_RADIUS, [
      "state_change",
    ])
  if (statePlacement) {
    const elementName =
      "elementName" in statePlacement
        ? statePlacement.elementName
        : statePlacement.element_name
    const overlay =
      game
        .getMapOverlays()
        .find(
          (o) =>
            (elementName && o.anchorLabel === elementName) ||
            o.id.includes(statePlacement.id)
        ) ?? nearestOverlay(game.getMapOverlays(), x, y, INTERACT_RADIUS)
    if (overlay && cycleOverlayState(game, overlay)) return
  }

  const overlay = nearestOverlay(game.getMapOverlays(), x, y, INTERACT_RADIUS)
  if (overlay && cycleOverlayState(game, overlay)) return

  // removal / animation → trigger nearest gameplay VFX (background loops already play)
  const fxPlacement =
    nearestTypedAuthored(authored, x, y, INTERACT_RADIUS, [
      "removal",
      "animation",
    ]) ??
    nearestTypedPlacement(game.getPlacementTargets(), x, y, INTERACT_RADIUS, [
      "removal",
      "animation",
    ])
  if (fxPlacement) {
    const elementName =
      "elementName" in fxPlacement
        ? fxPlacement.elementName
        : fxPlacement.element_name
    if (elementName && game.triggerNearestMapEffect(elementName, x, y)) return
    if (game.triggerNearestMapEffect(fxPlacement.id, x, y)) return
  }

  tryTriggerNearestGameplay(game, x, y, currentEntry?.map)
}

/**
 * Boot a playable scene from compiled Maps assets.
 * Returns null when `maps` is empty (caller should use the SVG starter).
 */
export function bootstrapWorldFromAssets(
  opts: BootstrapWorldOptions
): GameAPI | null {
  if (!opts.maps.length) return null

  const start = pickStartMap(opts)
  const mapsById = new Map<string, BootstrapMapEntry>()
  for (const entry of opts.maps) {
    mapsById.set(entry.id, entry)
    const name = entry.map.name?.trim()
    if (name) mapsById.set(name, entry)
    const assetId = entry.map.assetId?.trim()
    if (assetId) mapsById.set(assetId, entry)
  }
  const currentMapIdRef = { id: start.id }

  const game = createGame({
    canvasId: opts.canvasId ?? "game",
    map: toMapData(start.map),
    cameraEdgePadding: opts.cameraEdgePadding ?? 120,
    followZoom: opts.followZoom ?? 1.45,
    cameraFollowLerp: opts.cameraFollowLerp ?? 10,
    maxViewportScale: opts.maxViewportScale ?? 1,
    touchControls:
      opts.touchControls === false
        ? false
        : (opts.touchControls ?? {
            actions: [{ action: "interact", label: "E" }],
          }),
  })

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
            : undefined
        const kind =
          a.kind === "bgm" || a.kind === "sfx" || a.kind === "voice"
            ? a.kind
            : role === "bgm" || role === "sfx" || role === "voice"
              ? role
              : undefined
        const id =
          (typeof a.id === "string" && a.id.trim()) ||
          (typeof a.assetId === "string" && a.assetId.trim()) ||
          a.name ||
          `audio_${index}`
        return {
          id,
          name: a.name,
          url: a.url,
          role,
          kind,
          label: a.label,
          transcript: a.transcript,
          durationMs: a.durationMs,
          parentAssetId: a.parentAssetId,
          volume: a.volume,
          autoplay: a.autoplay,
        }
      }),
    })
  }

  const definedArchetypes = new Set<string>()

  const playerAssetIds = new Set<string>()
  for (const entry of opts.maps) {
    const mapPlayerId =
      typeof entry.map.playerCharacterId === "string"
        ? entry.map.playerCharacterId
        : null
    for (const p of entry.map.characterPlacements ?? []) {
      if (p.role === "player" || (mapPlayerId && p.assetId === mapPlayerId)) {
        playerAssetIds.add(p.assetId)
      }
    }
  }

  for (const entry of opts.characters ?? []) {
    const assetId = characterAssetId(entry)
    const primary = entry.archetype?.trim() || archetypeNameForAssetId(assetId)
    const isPlayerLike = playerAssetIds.has(assetId)
    const roleDefaults = isPlayerLike
      ? opts.archetypeDefaults?.player
      : opts.archetypeDefaults?.npc
    const size = defaultCharacterSize(panelPixelSize(game))
    const role = isPlayerLike ? "player" : "npc"
    const def = toArchetype(entry.character, {
      kind: isPlayerLike ? "player" : "npc",
      radius: roleDefaults?.radius ?? (isPlayerLike ? PLAYER_RADIUS : NPC_RADIUS),
      speed: walkSpeedForHeight(size.height, role, roleDefaults?.speed),
      frameDurationMs: roleDefaults?.frameDurationMs ?? 125,
      // Default only — spawn overrides with map-editor placement size.
      ...size,
    })
    game.defineArchetype(primary, def)
    definedArchetypes.add(primary)

    // Always also register under char_<assetId> so placements match.
    const alt = archetypeNameForAssetId(assetId)
    if (alt !== primary) {
      game.defineArchetype(alt, def)
      definedArchetypes.add(alt)
    }
  }

  spawnMapCharacters(game, opts, start.map, definedArchetypes)

  const activeBgmRef = { name: null as string | null }
  const transitionState = { busy: false }
  const arrivalRef = {
    mapId: null as string | null,
    bounds: null as { x1: number; y1: number; x2: number; y2: number } | null,
  }

  if (opts.enableDefaultInteract !== false) {
    game.registerResource(
      MAP_TRANSITION_PROMPT_RESOURCE,
      createEmptyMapTransitionPromptState()
    )
    game.useWidget(createMapTransitionPromptWidget)
    game.registerSystem("map:transitionPrompt", () => {
      updateTransitionPrompt({
        game,
        mapsById,
        currentMapIdRef,
        arrivalRef,
        transitionBusy: transitionState.busy,
      })
    })
  }

  const mapAssetIdFor = (mapId: string): string => {
    const entry = mapsById.get(mapId)
    const assetId = entry?.map.assetId?.trim()
    return assetId || mapId
  }

  const applyMapAudio = (mapAssetId: string | null | undefined) => {
    const nextBgm = findBgmClip(opts.commonAudio, mapAssetId)
    const nextName = nextBgm?.name ?? null
    if (activeBgmRef.name && activeBgmRef.name !== nextName) {
      stopNamedAudio(activeBgmRef.name)
    }
    activeBgmRef.name = nextName

    if (nextBgm && nextBgm.autoplay !== false) {
      playClip(nextBgm, { loop: true, defaultVolume: DEFAULT_BGM_VOLUME })
    }

    for (const sfx of findMapAudio(opts.commonAudio, mapAssetId, "sfx")) {
      if (sfx.autoplay !== true) continue
      playClip(sfx, { loop: false, defaultVolume: DEFAULT_SFX_VOLUME })
    }
  }

  const startMusic = () => {
    applyMapAudio(mapAssetIdFor(currentMapIdRef.id))
  }

  if (opts.onAudioReady) {
    opts.onAudioReady(startMusic)
  }
  if (typeof window !== "undefined") {
    window.addEventListener("pointerdown", startMusic, {
      once: true,
      passive: true,
    })
    window.addEventListener("keydown", startMusic, { once: true })
  }

  if (opts.enableDefaultInteract !== false) {
    game.bindInputAction("interact", ["KeyE"])
    game.onInputAction("interact", ({ phase }) => {
      if (phase !== "down") return
      if (opts.onInteract?.(game) === true) return
      handleDefaultInteract(
        game,
        opts,
        mapsById,
        currentMapIdRef,
        definedArchetypes,
        applyMapAudio,
        transitionState,
        arrivalRef
      )
    })
  } else if (opts.onInteract) {
    game.bindInputAction("interact", ["KeyE"])
    game.onInputAction("interact", ({ phase }) => {
      if (phase !== "down") return
      opts.onInteract?.(game)
    })
  }

  opts.onBootstrapped?.(game)
  return game
}
