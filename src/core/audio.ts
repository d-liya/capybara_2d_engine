import { commonAssets, getCommonAssetUrl } from "../data/common";

const AUDIO_URL_PATTERN = /\.(mp3|ogg|wav|aac|flac|opus|m4a|webm)(\?|$)/i;

const catalog = new Map<string, string>();
const cache = new Map<string, HTMLAudioElement>();

for (const entry of commonAssets) {
  if (entry.name && entry.url && AUDIO_URL_PATTERN.test(entry.url)) {
    catalog.set(entry.name, entry.url);
  }
}

/** All audio names in common.json (entries whose url is an audio file). */
export function listAudioNames(): string[] {
  return [...catalog.keys()];
}

/** Resolve the audio URL for a name from common.json. */
export function getAudioUrl(name: string): string | undefined {
  return catalog.get(name);
}

/**
 * Returns a cached HTMLAudioElement for a common.json name.
 * Creates and preloads the element on first use.
 */
export function getAudio(name: string): HTMLAudioElement | null {
  const url = catalog.get(name);
  if (!url) {
    console.warn(`[audio] Unknown audio name: ${name}`);
    return null;
  }

  let element = cache.get(name);
  if (!element) {
    element = new Audio();
    element.preload = "auto";
    element.src = url;
    cache.set(name, element);
  }

  return element;
}

/** Preload every audio clip listed in common.json. */
export function preloadAllAudio(): Promise<void[]> {
  return Promise.all(listAudioNames().map((name) => preloadAudio(name)));
}

export function preloadAudio(name: string): Promise<void> {
  const element = getAudio(name);
  if (!element) return Promise.resolve();

  return new Promise((resolve, reject) => {
    if (element.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) {
      resolve();
      return;
    }

    const finish = () => {
      element.removeEventListener("canplaythrough", finish);
      element.removeEventListener("loadeddata", finish);
      resolve();
    };

    element.addEventListener("canplaythrough", finish, { once: true });
    element.addEventListener("loadeddata", finish, { once: true });
    element.onerror = () => reject(new Error(`Failed to load audio: ${name}`));
    element.load();
  });
}

/** Play a one-shot copy so overlapping sounds work. */
export function playAudio(name: string): void {
  const element = getAudio(name);
  if (!element) return;

  const playback = element.cloneNode(true) as HTMLAudioElement;
  playback.play().catch(() => {});
}

export function stopAudio(name: string): void {
  const element = cache.get(name);
  if (!element) return;
  element.pause();
  element.currentTime = 0;
}
