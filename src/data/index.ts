export {
  toArchetype,
  toMapData,
  mergeMapSidecars,
  mergeMapSprites,
  toPlayerSprite,
  toSpriteSheets,
  directionalToSpriteSheets,
  multiClipDirectionalToSpriteSheets,
  legacyDirectionalToSpriteSheets,
  isDirectionalCharacter,
  isMultiClipDirectionalCharacter,
  isLegacyDirectionalCharacter,
  pixelBBoxToBox2d,
  type AnyGeneratedCharacter,
  type CharacterFacing,
  type GeneratedCharacter,
  type GeneratedCharacterPlacement,
  type GeneratedCollisionPoint,
  type GeneratedDirectionalCharacter,
  type GeneratedDirectionalSheet,
  type GeneratedHudPlacement,
  type GeneratedMap,
  type GeneratedMapPlacementsFile,
  type GeneratedMapSprite,
  type GeneratedMapSpriteIndexEntry,
  type GeneratedMapSpritesFile,
  type GeneratedPixelBBox,
  type GeneratedSpriteSheet,
  type GeneratedWalkableBox,
  type ToMapDataOptions,
} from "./adapters";
export {
  getCommonAsset,
  getCommonAssetUrl,
  type CommonAssetEntry,
  type CommonAssetRole,
} from "./common";
export {
  getPropData,
  getPropItemUrl,
  type PropData,
  type PropItem,
} from "./props";

/**
 * Register generated maps like:
 *
 *   import mapFarmBase from "./map_farm.json";
 *   import mapFarmSprites from "./map_farm.sprites.json";
 *   import mapFarmPlacements from "./map_farm.placements.json";
 *   export const mapFarm = mergeMapSidecars(mapFarmBase, {
 *     sprites: mapFarmSprites,
 *     placements: mapFarmPlacements,
 *   });
 *
 * Keep full `sprites[]` (polygons) in `map_*.sprites.json` and
 * placement / characterPlacements / hudPlacements in `map_*.placements.json`.
 * Lean layout (`url`, walkableBoxes, mapOverlays) stays in `map_*.json`.
 * Put the merged handle in `allDataFiles`.
 */
export const allDataFiles: unknown[] = [];
