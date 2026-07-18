export {
  toArchetype,
  toMapData,
  toPlayerSprite,
  pixelBBoxToBox2d,
  type GeneratedCharacter,
  type GeneratedCollisionPoint,
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

/**
 * Register generated JSON handles here after asset generation, e.g.:
 *
 *   import mapMain from "./map.json";
 *   import charPlayer from "./char_player.json";
 *   export { mapMain, charPlayer };
 *   export const allDataFiles = [mapMain, charPlayer];
 *
 * `allDataFiles` is preloaded by `src/main.ts`.
 */
export const allDataFiles: unknown[] = [];
