import {
  commonAssets,
  setRuntimeCommonAssetLookup,
  type CommonAssetEntry,
  type CommonAssetRole,
} from "../data/common";

const AUDIO_URL_PATTERN = /\.(mp3|ogg|wav|aac|flac|opus|m4a|webm)(\?|$)/i;

export type AudioChannel = "bgm" | "sfx" | "voice" | "audio";

export interface AudioPlayOptions {
  loop?: boolean;
  volume?: number;
  channel?: AudioChannel;
  /** Restart an already playing loop. Defaults to false for loops. */
  restart?: boolean;
}

const catalog = new Map<string, CommonAssetEntry>();
const cache = new Map<string, HTMLAudioElement>();
const activeByChannel = new Map<AudioChannel, Set<HTMLAudioElement>>();
const activeByName = new Map<string, Set<HTMLAudioElement>>();

/** Default gain when callers omit `volume` (and the catalog has none). */
const DEFAULT_VOLUME_BY_ROLE: Partial<Record<CommonAssetRole, number>> = {
  bgm: 0.05,
  ambience: 1,
  sfx: 1,
  voice: 1,
  dialogue: 1,
};

/**
 * Soft edge length for looping clips. Fades the start up and the end down so
 * imperfect loop points don't click when HTMLAudio wraps.
 */
const LOOP_EDGE_FADE_SEC = 2.5;

type LoopEdgeFade = {
  targetVolume: number;
  rafId: number;
};

const loopEdgeFades = new WeakMap<HTMLAudioElement, LoopEdgeFade>();

function isAudioEntry(entry: CommonAssetEntry): boolean {
  return Boolean(
    entry.name &&
      entry.url &&
      (entry.role || AUDIO_URL_PATTERN.test(entry.url)),
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(t: number): number {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

function resolveTargetVolume(
  entry: CommonAssetEntry,
  options: AudioPlayOptions,
): number {
  const roleDefault =
    (entry.role && DEFAULT_VOLUME_BY_ROLE[entry.role]) ?? 1;
  const raw =
    typeof options.volume === "number"
      ? options.volume
      : typeof entry.volume === "number"
        ? entry.volume
        : roleDefault;
  return clamp01(raw);
}

function stopLoopEdgeFade(playback: HTMLAudioElement): void {
  const state = loopEdgeFades.get(playback);
  if (!state) return;
  cancelAnimationFrame(state.rafId);
  loopEdgeFades.delete(playback);
}

/**
 * While a clip loops, scale gain by position: quiet at the head/tail, full in
 * the middle. Caps fade length so short clips still reach the target volume.
 */
function loopEdgeFactor(playback: HTMLAudioElement): number {
  const duration = playback.duration;
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const fade = Math.min(LOOP_EDGE_FADE_SEC, duration * 0.25);
  if (fade <= 0) return 1;
  const t = playback.currentTime;
  if (t < fade) return smoothstep(t / fade);
  if (t > duration - fade) return smoothstep((duration - t) / fade);
  return 1;
}

function startLoopEdgeFade(
  playback: HTMLAudioElement,
  targetVolume: number,
): void {
  stopLoopEdgeFade(playback);

  const tick = () => {
    const state = loopEdgeFades.get(playback);
    if (!state) return;

    if (!playback.paused) {
      playback.volume = clamp01(state.targetVolume * loopEdgeFactor(playback));
    }

    state.rafId = requestAnimationFrame(tick);
  };

  const state: LoopEdgeFade = { targetVolume, rafId: 0 };
  loopEdgeFades.set(playback, state);
  playback.volume = clamp01(targetVolume * loopEdgeFactor(playback));
  state.rafId = requestAnimationFrame(tick);
}

function trackActive(
  name: string,
  channel: AudioChannel,
  playback: HTMLAudioElement,
): void {
  const byChannel = activeByChannel.get(channel) ?? new Set<HTMLAudioElement>();
  byChannel.add(playback);
  activeByChannel.set(channel, byChannel);

  const byName = activeByName.get(name) ?? new Set<HTMLAudioElement>();
  byName.add(playback);
  activeByName.set(name, byName);

  const untrack = () => {
    byChannel.delete(playback);
    byName.delete(playback);
    stopLoopEdgeFade(playback);
  };
  playback.addEventListener("ended", untrack, { once: true });
  playback.addEventListener("pause", untrack, { once: true });
}

function stopElement(element: HTMLAudioElement): void {
  stopLoopEdgeFade(element);
  element.pause();
  element.currentTime = 0;
}

/** Register generated or runtime-provided audio catalog entries. */
export function registerAudioAssets(entries: CommonAssetEntry[]): void {
  for (const entry of entries) {
    if (isAudioEntry(entry)) {
      catalog.set(entry.name, entry);
    }
  }
}

registerAudioAssets(commonAssets);
setRuntimeCommonAssetLookup((name) => catalog.get(name));

/** All audio names in common.json (entries whose url is an audio file). */
export function listAudioNames(role?: CommonAssetRole): string[] {
  return [...catalog.values()]
    .filter((entry) => !role || entry.role === role)
    .map((entry) => entry.name);
}

export function getAudioEntry(name: string): CommonAssetEntry | undefined {
  return catalog.get(name);
}

/** Resolve the audio URL for a name from common.json. */
export function getAudioUrl(name: string): string | undefined {
  return catalog.get(name)?.url;
}

/**
 * Returns a cached HTMLAudioElement for a common.json name.
 * Creates and preloads the element on first use.
 */
export function getAudio(name: string): HTMLAudioElement | null {
  const entry = catalog.get(name);
  if (!entry) {
    console.warn(`[audio] Unknown audio name: ${name}`);
    return null;
  }

  let element = cache.get(name);
  if (!element) {
    element = new Audio();
    element.preload = "auto";
    element.src = entry.url;
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

function channelFor(
  entry: CommonAssetEntry,
  requested?: AudioChannel,
): AudioChannel {
  if (requested) return requested;
  return entry.role === "bgm"
    ? "bgm"
    : entry.role === "voice" || entry.role === "dialogue"
      ? "voice"
      : entry.role === "sfx" || entry.role === "ambience"
        ? "sfx"
        : "audio";
}

/**
 * Play a catalog entry. Browser autoplay rejection is intentionally non-fatal;
 * call from a user gesture when starting BGM or voice for the first time.
 */
export function playAudio(
  name: string,
  options: AudioPlayOptions = {},
): HTMLAudioElement | null {
  const entry = catalog.get(name);
  const element = getAudio(name);
  if (!element || !entry) return null;

  const loop =
    options.loop ??
    (entry.role === "bgm" ||
      entry.role === "ambience" ||
      entry.looping === true);
  const playback = loop
    ? element
    : (element.cloneNode(true) as HTMLAudioElement);
  playback.loop = loop;
  const targetVolume = resolveTargetVolume(entry, options);
  if (options.restart || (!loop && playback.currentTime > 0)) {
    playback.currentTime = 0;
  }

  const channel = channelFor(entry, options.channel);
  trackActive(name, channel, playback);
  if (loop) {
    startLoopEdgeFade(playback, targetVolume);
  } else {
    stopLoopEdgeFade(playback);
    playback.volume = targetVolume;
  }
  playback.play().catch(() => {});
  return playback;
}

export function stopAudio(name: string): void {
  const active = activeByName.get(name);
  if (active) {
    for (const element of [...active]) {
      stopElement(element);
    }
    active.clear();
  }

  const cached = cache.get(name);
  if (cached) {
    stopElement(cached);
  }
}

export function stopAudioChannel(channel: AudioChannel): void {
  const active = activeByChannel.get(channel);
  if (!active) return;
  for (const element of [...active]) {
    stopElement(element);
  }
  active.clear();
}

/** Retry playback for active clips after a user gesture unlocks autoplay. */
export async function unlockAudio(): Promise<void> {
  const retries: Promise<void>[] = [];
  for (const active of activeByChannel.values()) {
    for (const element of active) {
      retries.push(
        element.play().then(
          () => undefined,
          () => undefined,
        ),
      );
    }
  }
  await Promise.all(retries);
}

/** Convenience wrapper for generated dialogue/voice entries. */
export function playDialogue(
  name: string,
  options: Omit<AudioPlayOptions, "channel" | "loop"> = {},
): HTMLAudioElement | null {
  return playAudio(name, { ...options, channel: "voice", loop: false });
}
