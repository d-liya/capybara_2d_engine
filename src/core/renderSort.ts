/**
 * Y-sort draw order for the world render queue.
 *
 * Layers:
 * - `ground` — map `ground_patch` mask sprites (tilled beds, floor decals)
 * - `occluder` — map walkable props, trees, buildings (characters sort by Y with these)
 * - `prop` — spawned entities (`game.spawn`, `placeProp`, etc.)
 *
 * Map `ground_patch` art is painted in `drawBackground` (not the Y-sort queue).
 * Spawned props still use the `prop` layer and Y-sort with `occluder` masks and
 * each other by `renderY` (e.g. player walks in front of / behind crop rows).
 */
export type RenderLayer = "ground" | "occluder" | "prop";

export interface RenderSortable {
  renderY: number;
  renderLayer: RenderLayer;
}

const LAYER_RANK: Record<RenderLayer, number> = {
  ground: 0,
  occluder: 1,
  prop: 2,
};

const layerOf = (item: RenderSortable): RenderLayer =>
  item.renderLayer ?? "occluder";

/** Ascending sort: lower values are drawn first (behind). */
export function compareRenderSort(a: RenderSortable, b: RenderSortable): number {
  const layerA = layerOf(a);
  const layerB = layerOf(b);
  const aGround = layerA === "ground";
  const bGround = layerB === "ground";
  const aProp = layerA === "prop";
  const bProp = layerB === "prop";

  if (aGround && bProp) return -1;
  if (aProp && bGround) return 1;

  const dy = a.renderY - b.renderY;
  if (dy !== 0) return dy;

  return LAYER_RANK[layerA] - LAYER_RANK[layerB];
}
