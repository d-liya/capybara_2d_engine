import { getCommonAssetUrl } from "./common";

export interface PropItem {
  name: string;
  description?: string;
  url: string;
}

export interface PropData {
  name: string;
  url: string;
  items?: PropItem[];
}

/** All `prop_*.json` manifests — updated when prop assets are generated. */
export const allPropFiles: PropData[] = [];

const byGroup = new Map<string, PropData>();
for (const prop of allPropFiles) {
  if (prop.name) byGroup.set(prop.name, prop);
}

export function getPropData(groupName: string): PropData | undefined {
  return byGroup.get(groupName);
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
