/**
 * Prop types and lookup helpers. Stable — Maps sync must not overwrite this file.
 * Prop JSON registration lives in `./generated-props` (rewritten on sync).
 */
import { getCommonAssetUrl } from "./common";
import { allPropFiles } from "./generated-props";

export interface PropItem {
  name: string;
  label?: string;
  description?: string;
  url: string;
  box_2d?: number[];
}

export interface PropData {
  assetId?: string;
  name: string;
  label?: string;
  description?: string;
  gamePlay?: string;
  url: string;
  box_2d?: number[];
  parentAssetId?: string;
  items?: PropItem[];
}

export { allPropFiles };

const byGroup = new Map<string, PropData>();
for (const prop of allPropFiles) {
  if (prop.name) byGroup.set(prop.name, prop);
}

export function getPropData(groupName: string): PropData | undefined {
  return byGroup.get(groupName);
}

/** Sheet / group image URL (e.g. `prop_crops`). */
export function getPropGroupUrl(groupName: string): string | undefined {
  return byGroup.get(groupName)?.url;
}

/** Stage or variant URL inside a prop group (e.g. `prop_crops` + `bare_soil_patch`). */
export function getPropItemUrl(
  groupName: string,
  itemName: string,
): string | undefined {
  const url = byGroup
    .get(groupName)
    ?.items?.find((item) => item.name === itemName)?.url;
  if (url) return url;
  return getCommonAssetUrl(itemName);
}
