import type { ComponentBag, EntitySpriteSheet, GameMapData } from "../Game";

/**
 * Adapters that turn generator-shaped JSON handles (from `src/data`) into the
 * shapes the engine facade consumes.
 *
 * Why these exist:
 * - Generated map JSON is **flat** (`{ name, url, masks, spriteSheets, ... }`),
 *   but `createGame({ map })` expects the nested `{ panel: { ... } }` shape.
 * - Generated character JSON exposes `spriteSheets`, but archetypes/player
 *   config want those sheets nested under a component/sprite key.
 *
 * These helpers key off data **shape**, not off generated names, so they stay
 * stable across regenerations and across games.
 */

/** One generated spritesheet entry (character or prop animation). */
export interface GeneratedSpriteSheet {
  name: string;
  url: string;
  frame_count?: number;
  width?: number;
  height?: number;
}

/** Generated character handle, e.g. the default export of `char_*.json`. */
export interface GeneratedCharacter {
  label: string;
  spriteSheets: GeneratedSpriteSheet[];
}

type PanelContent = GameMapData["panel"];

/** Flat generated map handle, e.g. the default export of `map_*.json`. */
export interface GeneratedMap {
  name?: string;
  url: string;
  masks?: PanelContent["masks"];
  spriteSheets?: PanelContent["spriteSheets"];
  walkableBoxes?: PanelContent["walkableBoxes"];
  placement?: PanelContent["placement"];
  mapOverlays?: PanelContent["mapOverlays"];
}

/** Options for stitching multi-panel maps or overriding panel pixel size. */
export interface ToMapDataOptions {
  extensions?: GameMapData["extensions"];
  panelPixelWidth?: number;
  panelPixelHeight?: number;
}

/**
 * Wrap a flat generated map JSON handle into the engine's `{ panel }` `MapData`.
 *
 * @example
 * import { mapFarm, toMapData } from "../data";
 * const game = createGame({ canvasId: "game", map: toMapData(mapFarm) });
 *
 * @example
 * // Multi-panel map: stitch additional flat panels on as extensions.
 * const game = createGame({
 *   canvasId: "game",
 *   map: toMapData(mapFarm, {
 *     extensions: [{ direction: "east", panel: toMapData(mapBarn) }],
 *   }),
 * });
 */
export function toMapData(
  map: GeneratedMap,
  options: ToMapDataOptions = {},
): GameMapData {
  return {
    name: map.name,
    panel: {
      url: map.url,
      masks: map.masks ?? [],
      spriteSheets: map.spriteSheets ?? [],
      walkableBoxes: map.walkableBoxes ?? [],
      placement: map.placement ?? [],
      mapOverlays: map.mapOverlays ?? [],
    },
    extensions: options.extensions,
    panelPixelWidth: options.panelPixelWidth,
    panelPixelHeight: options.panelPixelHeight,
  };
}

/**
 * Build an archetype component bag from a generated character handle.
 *
 * Use the result with `game.defineArchetype`. Merge extra defaults (speed,
 * label, tooltip, etc.) via the second argument.
 *
 * @example
 * import { charFarmer, toArchetype } from "../data";
 * game.defineArchetype("player", toArchetype(charFarmer, { speed: 190 }));
 * const playerId = game.spawnAtFeet("player", 500, 820);
 */
export function toArchetype(
  character: GeneratedCharacter,
  extra: ComponentBag = {},
): ComponentBag {
  return {
    spriteSheets: character.spriteSheets,
    ...extra,
  };
}

/**
 * Build the `sprite` payload for a bootstrap `player` config from a generated
 * character handle.
 *
 * @example
 * import { charFarmer, toPlayerSprite } from "../data";
 * const game = createGame({
 *   canvasId: "game",
 *   map: toMapData(mapFarm),
 *   player: { x: 500, y: 820, anchor: "feet", sprite: toPlayerSprite(charFarmer) },
 * });
 */
export function toPlayerSprite(character: GeneratedCharacter): {
  spriteSheets: EntitySpriteSheet[];
} {
  return { spriteSheets: character.spriteSheets };
}
