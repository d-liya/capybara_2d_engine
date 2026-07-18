import type { GameAPI, GameMapData } from "../Game";
import type { GeneratedMap } from "../data";
import {
  NPC_WORLD_CONTEXT_RESOURCE,
  type Box2d,
  type NpcLocation,
  type NpcWorldContext,
  type NpcWorldItem,
} from "./types";

type UnknownRecord = Record<string, unknown>;

interface WorldContextBuildOptions {
  mapName?: string;
  connectedMaps?: GeneratedMap[];
}

interface PositionedGeneratedMap {
  map: GeneratedMap;
  offsetX: number;
  offsetY: number;
}

function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 26);
  return slug || fallback;
}

function normalizeBox(box: unknown): Box2d | undefined {
  if (!Array.isArray(box) || box.length < 4) return undefined;
  return [Number(box[0]), Number(box[1]), Number(box[2]), Number(box[3])];
}

function offsetBox(bounds: Box2d | undefined, offsetX: number, offsetY: number): Box2d | undefined {
  if (!bounds) return undefined;
  return [bounds[0] + offsetY, bounds[1] + offsetX, bounds[2] + offsetY, bounds[3] + offsetX];
}

function centerOf(bounds: Box2d | undefined): { x: number; y: number } {
  if (!bounds) return { x: 500, y: 500 };
  // Generated box_2d is [y1, x1, y2, x2].
  return { x: (bounds[1] + bounds[3]) / 2, y: (bounds[0] + bounds[2]) / 2 };
}

function compactText(value: unknown, maxLength = 150): string {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function mapIdOf(map: GeneratedMap, fallback = "map"): string {
  return slugify(map.name || String((map as unknown as UnknownRecord).url ?? fallback), fallback);
}

function generatedMapFromGameMapData(mapData: GameMapData): GeneratedMap {
  const raw = mapData as unknown as UnknownRecord;
  const panel = (raw.panel ?? {}) as UnknownRecord;
  return {
    name: typeof raw.name === "string" ? raw.name : undefined,
    url: String(panel.url ?? ""),
    masks: panel.masks as GeneratedMap["masks"],
    spriteSheets: panel.spriteSheets as GeneratedMap["spriteSheets"],
    walkableBoxes: panel.walkableBoxes as GeneratedMap["walkableBoxes"],
    placement: panel.placement as GeneratedMap["placement"],
    mapOverlays: panel.mapOverlays as GeneratedMap["mapOverlays"],
    sprites: panel.sprites as GeneratedMap["sprites"],
  };
}

function directionGridDelta(direction: unknown): { x: number; y: number } {
  switch (direction) {
    case "east":
      return { x: 1, y: 0 };
    case "west":
      return { x: -1, y: 0 };
    case "south":
      return { x: 0, y: 1 };
    case "north":
      return { x: 0, y: -1 };
    default:
      return { x: 0, y: 0 };
  }
}

function collectPositionedMapsFromGameMapData(mapData: GameMapData): PositionedGeneratedMap[] {
  const entries: Array<PositionedGeneratedMap & { gridX: number; gridY: number }> = [];
  const queue: Array<{ data: unknown; fallbackName: string; gridX: number; gridY: number }> = [
    { data: mapData, fallbackName: "map", gridX: 0, gridY: 0 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const raw = current.data as UnknownRecord;
    if (!raw || typeof raw !== "object" || !raw.panel) continue;

    const map = generatedMapFromGameMapData(raw as unknown as GameMapData);
    if (!map.name) map.name = current.fallbackName;
    entries.push({
      map,
      gridX: current.gridX,
      gridY: current.gridY,
      offsetX: current.gridX * 1000,
      offsetY: current.gridY * 1000,
    });

    const extensions = Array.isArray(raw.extensions) ? raw.extensions as UnknownRecord[] : [];
    for (const extension of extensions) {
      const delta = directionGridDelta(extension.direction);
      queue.push({
        data: extension.panel,
        fallbackName: `${map.name ?? current.fallbackName}_${extension.direction ?? "extension"}`,
        gridX: current.gridX + delta.x,
        gridY: current.gridY + delta.y,
      });
    }
  }

  if (entries.length === 0) return [];

  // GameMap normalizes stitched panels so the minimum grid coordinate becomes 0,0.
  // World context must use the same normalized offsets or movement targets land on
  // the wrong panel for west/north/east/south extensions.
  const minGridX = Math.min(...entries.map((entry) => entry.gridX));
  const minGridY = Math.min(...entries.map((entry) => entry.gridY));

  return entries.map((entry) => ({
    map: entry.map,
    offsetX: (entry.gridX - minGridX) * 1000,
    offsetY: (entry.gridY - minGridY) * 1000,
  }));
}

function collectMapsFromGameMapData(mapData: GameMapData): GeneratedMap[] {
  return collectPositionedMapsFromGameMapData(mapData).map((entry) => entry.map);
}

function addItem(
  items: Record<string, NpcWorldItem>,
  counts: Record<string, number>,
  input: Omit<NpcWorldItem, "itemId" | "id"> & { sourceId?: string; preferredId: string },
): NpcWorldItem {
  const base = slugify(input.preferredId, "item");
  counts[base] = (counts[base] ?? 0) + 1;
  const itemId = counts[base] === 1 ? base : `${base}-${counts[base]}`;
  const item: NpcWorldItem = {
    itemId,
    preferredId: input.preferredId,
    id: itemId,
    sourceId: input.sourceId,
    name: input.name,
    kind: input.kind,
    x: input.x,
    y: input.y,
    bounds: input.bounds,
    description: input.description,
    tags: input.tags,
    mapId: input.mapId,
  };
  items[itemId] = item;
  return item;
}

function tagsFromText(...parts: unknown[]): string[] {
  const text = parts.join(" ").toLowerCase();
  return [
    "player",
    "npc",
    "spawn",
    "zone",
    "exit",
    "transition",
    "well",
    "forge",
    "orchard",
    "clue",
    "shed",
    "locked",
    "door",
    "bench",
    "tree",
    "vfx",
  ].filter((tag) => text.includes(tag));
}

function inferPlacementKind(raw: UnknownRecord): string {
  const text = `${raw.id ?? ""} ${raw.element_name ?? ""} ${raw.contents ?? ""} ${raw.placement_type ?? ""}`;
  if (/exit|transition/i.test(text)) return "exit";
  if (/player/i.test(text) && /character/i.test(text)) return "player_spawn";
  if (/npc|character/i.test(text)) return "npc_spawn";
  if (/zone/i.test(text)) return "zone";
  if (/clue/i.test(text)) return "clue";
  return compactText(raw.placement_type, 40) || "placement";
}

function formatPoint(item: { x: number; y: number }): string {
  return `${Math.round(item.x)},${Math.round(item.y)}`;
}

function formatWorldMarkdown(context: Omit<NpcWorldContext, "markdown">): string {
  const lines = [
    "# Static World Context",
    "Generated/static map context only. Runtime props, spawned entities, quests, inventory, and NPC/player state must be supplied separately.",
    `Active map: ${context.mapName ?? context.mapId ?? "unknown"}.`,
    "Use itemId exactly when calling location/world tools.",
    "",
    "## Items",
  ];

  for (const item of Object.values(context.items)) {
    const tags = item.tags?.length ? ` tags=${item.tags.join(",")}` : "";
    const source = item.sourceId && item.sourceId !== item.itemId ? ` source=${item.sourceId}` : "";
    const preferred = item.preferredId && item.preferredId !== item.itemId ? ` preferredId=${item.preferredId}` : "";
    const desc = item.description ? ` — ${item.description}` : "";
    lines.push(`- ${item.itemId}: ${item.name} (${item.kind ?? "item"}) map=${item.mapId ?? "unknown"} at ${formatPoint(item)}.${source}${preferred}${tags}${desc}`);
  }

  return lines.join("\n");
}

function createStaticWorldContextFromPositionedMaps(
  positionedMaps: PositionedGeneratedMap[],
  options: WorldContextBuildOptions = {},
): NpcWorldContext {
  const seenMaps = new Set<string>();
  const items: Record<string, NpcWorldItem> = {};
  const counts: Record<string, number> = {};

  for (const { map, offsetX, offsetY } of positionedMaps) {
    const mapId = mapIdOf(map);
    if (seenMaps.has(mapId)) continue;
    seenMaps.add(mapId);

    for (const rawWalkable of ((map as unknown as UnknownRecord).walkableBoxes as UnknownRecord[] | undefined) ?? []) {
      // Legacy: box_2d. Map v2: bbox.
      const localBounds = normalizeBox(rawWalkable.box_2d ?? rawWalkable.bbox);
      const bounds = offsetBox(localBounds, offsetX, offsetY);
      const center = centerOf(bounds);
      addItem(items, counts, {
        preferredId: `${mapId}-walkable`,
        sourceId: compactText(rawWalkable.id ?? rawWalkable.floor_id, 80),
        name:
          compactText(rawWalkable.label ?? rawWalkable.description, 80) ||
          "Walkable area",
        kind: "walkable_area",
        x: center.x,
        y: center.y,
        bounds,
        description: compactText(rawWalkable.description, 150) || "Area entities can move in.",
        tags: ["walkable"],
        mapId,
      });
    }

    let maskIndex = 0;
    for (const rawMask of ((map as unknown as UnknownRecord).masks as UnknownRecord[] | undefined) ?? []) {
      const localBounds = normalizeBox(rawMask.box_2d);
      const bounds = offsetBox(localBounds, offsetX, offsetY);
      const center = centerOf(bounds);
      const name = compactText(rawMask.name ?? rawMask.label, 80) || `Mask ${maskIndex + 1}`;
      const colliders = Array.isArray(rawMask.collider) ? rawMask.collider.length : 0;
      const polygons = Array.isArray(rawMask.collisionPolygons)
        ? rawMask.collisionPolygons.length
        : 0;
      const blocks =
        colliders > 0 ||
        polygons > 0 ||
        /boundary/i.test(String(rawMask.type ?? name));
      addItem(items, counts, {
        preferredId: `${mapId}-${name}`,
        name,
        kind: blocks ? "blocked_mask" : "static_mask",
        x: center.x,
        y: center.y,
        bounds,
        description: `${compactText(rawMask.label, 140)}${blocks ? ` Blocks movement (${polygons ? `${polygons} poly` : colliders || "boundary"}).` : ""}`,
        tags: tagsFromText(name, rawMask.label, rawMask.type, blocks ? "blocked" : ""),
        mapId,
      });
      maskIndex += 1;
    }

    // Map v2 sprites (when raw generated map is used before toMapData conversion).
    let spriteIndex = 0;
    for (const rawSprite of ((map as unknown as UnknownRecord).sprites as UnknownRecord[] | undefined) ?? []) {
      const localBounds = normalizeBox(rawSprite.collision_bbox);
      const bounds = offsetBox(localBounds, offsetX, offsetY);
      const center = centerOf(bounds);
      const name =
        compactText(rawSprite.label, 80) || `Sprite ${spriteIndex + 1}`;
      const category = compactText(rawSprite.category, 40) || "walkable_area";
      const polys = Array.isArray(rawSprite.collision_polygons)
        ? rawSprite.collision_polygons.length
        : 0;
      addItem(items, counts, {
        preferredId: `${mapId}-${name}`,
        name,
        kind: /boundary/i.test(category) ? "blocked_mask" : "map_sprite",
        x: center.x,
        y: center.y,
        bounds,
        description: polys ? `Collision polys: ${polys}.` : undefined,
        tags: tagsFromText(name, category, "blocked"),
        mapId,
      });
      spriteIndex += 1;
    }

    let vfxIndex = 0;
    for (const rawVfx of ((map as unknown as UnknownRecord).spriteSheets as UnknownRecord[] | undefined) ?? []) {
      const localBounds = normalizeBox(rawVfx.box_2d);
      const bounds = offsetBox(localBounds, offsetX, offsetY);
      const center = centerOf(bounds);
      const type = compactText(rawVfx.type ?? rawVfx.spriteSheetType ?? "background", 40);
      const label = compactText(rawVfx.label ?? rawVfx.mask_prompt, 80) || `VFX ${vfxIndex + 1}`;
      addItem(items, counts, {
        preferredId: `${mapId}-${label}-vfx`,
        name: label,
        kind: type === "gameplay" ? "triggered_vfx" : "background_vfx",
        x: center.x,
        y: center.y,
        bounds,
        description: `${type === "gameplay" ? "Triggered gameplay VFX" : "Background VFX that runs automatically"}.${rawVfx.linkedColliderLabel ? ` Linked to: ${compactText(rawVfx.linkedColliderLabel, 100)}.` : ""}`,
        tags: tagsFromText(label, type, "vfx"),
        mapId,
      });
      vfxIndex += 1;
    }

    for (const rawPlacement of ((map as unknown as UnknownRecord).placement as UnknownRecord[] | undefined) ?? []) {
      const localBounds = normalizeBox(rawPlacement.box_2d);
      const bounds = offsetBox(localBounds, offsetX, offsetY);
      const center = centerOf(bounds);
      const name = compactText(rawPlacement.element_name ?? rawPlacement.contents ?? rawPlacement.id, 80) || "Placement";
      const kind = inferPlacementKind(rawPlacement);
      addItem(items, counts, {
        preferredId: String(rawPlacement.id ?? `${mapId}-${name}`),
        sourceId: compactText(rawPlacement.id, 80),
        name,
        kind,
        x: center.x,
        y: center.y,
        bounds,
        description: compactText(rawPlacement.reasoning ?? rawPlacement.contents, 150),
        tags: tagsFromText(rawPlacement.id, name, kind, rawPlacement.contents),
        mapId,
      });
    }

    for (const rawOverlay of ((map as unknown as UnknownRecord).mapOverlays as UnknownRecord[] | undefined) ?? []) {
      const states = Array.isArray(rawOverlay.states) ? rawOverlay.states as UnknownRecord[] : [];
      const firstState = states[0];
      const localBounds = normalizeBox(firstState?.box_2d);
      const bounds = offsetBox(localBounds, offsetX, offsetY);
      const center = centerOf(bounds);
      const name = compactText(rawOverlay.anchorLabel ?? rawOverlay.id, 80) || "Map overlay";
      const stateNames = states.map((state) => compactText(state.name ?? state.label, 40)).filter(Boolean).join(", ");
      addItem(items, counts, {
        preferredId: String(rawOverlay.id ?? `${mapId}-${name}`),
        sourceId: compactText(rawOverlay.id, 80),
        name,
        kind: "map_overlay",
        x: center.x,
        y: center.y,
        bounds,
        description: `${compactText(rawOverlay.gamePlay, 140)} Current state: ${compactText(rawOverlay.currentMapStateLabel, 40) || "unknown"}. States: ${stateNames || "unknown"}.`,
        tags: tagsFromText(rawOverlay.id, name, rawOverlay.gamePlay, rawOverlay.currentMapStateLabel, stateNames),
        mapId,
      });
    }
  }

  const activeMap = positionedMaps[0]?.map;
  const activeMapId = activeMap ? mapIdOf(activeMap) : "unknown";
  const locations = items as Record<string, NpcLocation>;
  const contextBase = {
    mapId: activeMapId,
    mapName: options.mapName ?? activeMap?.name ?? activeMapId,
    items,
    locations,
  };

  return {
    ...contextBase,
    markdown: formatWorldMarkdown(contextBase),
  };
}

export function createStaticWorldContextFromMaps(
  activeMap: GeneratedMap,
  maps: GeneratedMap[] = [],
  options: WorldContextBuildOptions = {},
): NpcWorldContext {
  return createStaticWorldContextFromPositionedMaps(
    [activeMap, ...(options.connectedMaps ?? []), ...maps].map((map) => ({
      map,
      offsetX: 0,
      offsetY: 0,
    })),
    options,
  );
}

export function createStaticWorldContextFromGameMapData(
  mapData: GameMapData,
  options: WorldContextBuildOptions = {},
): NpcWorldContext {
  const positionedMaps = collectPositionedMapsFromGameMapData(mapData);
  if (!positionedMaps[0]) {
    const empty = { mapId: "unknown", mapName: "Unknown map", items: {}, locations: {} };
    return { ...empty, markdown: formatWorldMarkdown(empty) };
  }

  return createStaticWorldContextFromPositionedMaps(
    [
      ...positionedMaps,
      ...(options.connectedMaps ?? []).map((map) => ({ map, offsetX: 0, offsetY: 0 })),
    ],
    options,
  );
}

export function createNpcWorldContextFromMap(map: GeneratedMap): NpcWorldContext {
  return createStaticWorldContextFromMaps(map);
}

export function registerNpcWorldContext(game: GameAPI, context: NpcWorldContext): NpcWorldContext {
  try {
    const existing = game.getResource<NpcWorldContext>(NPC_WORLD_CONTEXT_RESOURCE);
    if (existing && typeof existing === "object") {
      Object.assign(existing, context);
      return existing;
    }
  } catch {
    // Resource does not exist yet.
  }
  game.registerResource(NPC_WORLD_CONTEXT_RESOURCE, context);
  return context;
}

export function registerStaticWorldContextFromMaps(
  game: GameAPI,
  activeMap: GeneratedMap,
  maps: GeneratedMap[] = [],
  options: WorldContextBuildOptions = {},
): NpcWorldContext {
  return registerNpcWorldContext(game, createStaticWorldContextFromMaps(activeMap, maps, options));
}

export function getNpcWorldContext(game: GameAPI): NpcWorldContext | null {
  try {
    return game.getResource<NpcWorldContext>(NPC_WORLD_CONTEXT_RESOURCE);
  } catch {
    return null;
  }
}

export function getNpcWorldMarkdown(gameOrContext: GameAPI | NpcWorldContext): string {
  const context = "markdown" in gameOrContext ? gameOrContext : getNpcWorldContext(gameOrContext);
  return context?.markdown ?? "";
}

export function getNpcLocation(gameOrContext: GameAPI | NpcWorldContext, itemId: string): NpcLocation | null {
  const context = "locations" in gameOrContext ? gameOrContext : getNpcWorldContext(gameOrContext);
  return context?.locations[itemId] ?? null;
}

export function findNpcLocationsByTag(context: NpcWorldContext, tag: string): NpcLocation[] {
  return Object.values(context.locations).filter((location) => location.tags?.includes(tag));
}

export function formatNpcWorldContextForPrompt(context: NpcWorldContext): string {
  return context.markdown;
}

export const formatStaticWorldContextForPrompt = formatNpcWorldContextForPrompt;
