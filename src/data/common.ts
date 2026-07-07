import common from "./common.json";

export interface CommonAssetEntry {
  name: string;
  url: string;
}

export const commonAssets = common as CommonAssetEntry[];

const byName = new Map<string, string>();
for (const entry of commonAssets) {
  if (entry.name && entry.url) {
    byName.set(entry.name, entry.url);
  }
}

/** Look up any asset URL from common.json by name (image, audio, etc.). */
export function getCommonAssetUrl(name: string): string | undefined {
  return byName.get(name);
}
