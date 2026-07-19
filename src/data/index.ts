export {
  toArchetype,
  toMapData,
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
  type GeneratedCollisionPoint,
  type GeneratedDirectionalCharacter,
  type GeneratedDirectionalSheet,
  type GeneratedMap,
  type GeneratedMapOverwrite,
  type GeneratedMapSprite,
  type GeneratedPixelBBox,
  type GeneratedSpriteSheet,
  type GeneratedWalkableBox,
  type ToMapDataOptions,
} from "./adapters";
export { getCommonAssetUrl, type CommonAssetEntry } from "./common";
export {
  getPropData,
  getPropItemUrl,
  type PropData,
  type PropItem,
} from "./props";

export const allDataFiles: unknown[] = [];
