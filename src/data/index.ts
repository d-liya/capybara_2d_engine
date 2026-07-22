export {
  toArchetype,
  toMapData,
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
  type GeneratedMap,
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
 *   export const mapFarm = mergeMapSprites(mapFarmBase, mapFarmSprites);
 *
 * Keep full `sprites[]` (polygons) in `map_*.sprites.json`. Lean layout
 * (`url`, walkableBoxes, placement, mapOverlays, optional spriteIndex) stays
 * in `map_*.json` for agents. Put the merged handle in `allDataFiles`.
 */
export const allDataFiles: unknown[] = [];
