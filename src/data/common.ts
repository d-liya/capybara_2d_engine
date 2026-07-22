import common from "./common.json";

export type CommonAssetRole = "bgm" | "sfx" | "voice" | "dialogue";

export interface CommonAssetEntry {
  name: string;
  label?: string;
  url: string;
  assetId?: string;
  kind?: "audio" | "voice" | "dialogue";
  role?: CommonAssetRole;
  parentAssetId?: string;
  transcript?: string;
  durationMs?: number;
}

export const commonAssets = common as CommonAssetEntry[];

const byName = new Map<string, string>();
for (const entry of commonAssets) {
  if (entry.name && entry.url) {
    byName.set(entry.name, entry.url);
  }
}

let runtimeCatalogLookup:
  | ((name: string) => CommonAssetEntry | undefined)
  | null = null;

/** Allows `getCommonAsset` to resolve runtime-registered catalog entries. */
export function setRuntimeCommonAssetLookup(
  lookup: (name: string) => CommonAssetEntry | undefined,
): void {
  runtimeCatalogLookup = lookup;
}

/** Look up any asset URL from common.json by name (image, audio, etc.). */
export function getCommonAssetUrl(name: string): string | undefined {
  return runtimeCatalogLookup?.(name)?.url ?? byName.get(name);
}

export function getCommonAsset(name: string): CommonAssetEntry | undefined {
  return (
    runtimeCatalogLookup?.(name) ??
    commonAssets.find((entry) => entry.name === name)
  );
}
