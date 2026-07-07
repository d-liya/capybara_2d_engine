/**
 * Tts.ts
 * Text-to-speech audio generation, caching, and playback.
 */
import { activeGameId, apiClient, requireInit } from "./Core";
import { ensureGuestSession } from "./Auth";
import { withServiceGuard } from "./ServiceGuards";

let audioContext: AudioContext | null = null;

type SpeechMode = "interrupt" | "overlap" | "queue";

export type SpeechInput = string | readonly string[];

export interface SpeechSpeaker {
  speaker: string;
  voiceName: string;
}

export interface SpeechOptions {
  /** Prebuilt Capybara TTS voice name such as "Kore", "Puck", or "Sulafat". */
  voiceName?: string;
  /** Multi-speaker mapping. Speaker names must match labels in the transcript. Maximum 2 speakers. */
  speakers?: SpeechSpeaker[];
  onComplete?: () => void;
  onError?: (error: Error) => void;
  /** Per-line playback volume. 1 is normal volume. */
  volume?: number;
  /**
   * interrupt: stop currently playing speech before starting this line.
   * overlap: allow multiple speech lines to play at once.
   * queue: wait for previous managed speech to finish before playing this line.
   */
  mode?: SpeechMode;
  /** Set false to bypass the local speech cache and use the SDK playback helper directly. */
  useCache?: boolean;
}

export interface ManagedSpeechHandle extends SpeechToAudioHandle {
  setVolume: (volume: number) => void;
  pause: () => void;
  resume: () => void;
  play: () => void;
}

interface AudioManifestEntry {
  text: string;
  voiceName?: string;
  speakers?: SpeechSpeaker[];
  source?: string;
}

const speechCache = new Map<string, Promise<BinaryResponse>>();
const activeSpeech = new Set<{ stop: () => void }>();
let queueTail: Promise<unknown> = Promise.resolve();

// Shared Audio Context to prevent browser restrictions
function getAudioContext(): AudioContext {
  if (!audioContext) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextCtor();
  }
  return audioContext;
}

function getActiveClient(): { client: GameServerClient; gameId: string } {
  requireInit();
  if (!apiClient || !activeGameId) {
    throw new Error("Game SDK is not initialized");
  }
  return { client: apiClient, gameId: activeGameId };
}

function normalizeVoiceName(voiceName?: string): string | undefined {
  return typeof voiceName === "string" && voiceName.trim()
    ? voiceName.trim()
    : undefined;
}

function normalizeSpeakers(speakers?: SpeechSpeaker[]): SpeechSpeaker[] | undefined {
  if (!Array.isArray(speakers)) return undefined;

  const normalized = speakers
    .map((speaker) => ({
      speaker: typeof speaker?.speaker === "string" ? speaker.speaker.trim() : "",
      voiceName: normalizeVoiceName(speaker?.voiceName) ?? "",
    }))
    .filter((speaker) => speaker.speaker && speaker.voiceName)
    .slice(0, 2);

  return normalized.length ? normalized : undefined;
}

function resolveSpeechInput(input: SpeechInput): string {
  return typeof input === "string" ? input : input.join("");
}

function getSpeechKey(
  text: string,
  voiceName?: string,
  speakers?: SpeechSpeaker[],
): string {
  return JSON.stringify([activeGameId, text, voiceName ?? "", speakers ?? []]);
}

function emptyBinaryResponse(): BinaryResponse {
  return { contentType: "audio/wav", data: new ArrayBuffer(0) };
}

function fetchSpeechResponse(
  text: string,
  options: { voiceName?: string; speakers?: SpeechSpeaker[] } = {},
): Promise<BinaryResponse> {
  const { client, gameId } = getActiveClient();
  const voiceName = normalizeVoiceName(options.voiceName);
  const speakers = normalizeSpeakers(options.speakers);
  const key = getSpeechKey(text, voiceName, speakers);
  const cached = speechCache.get(key);
  if (cached) return cached;

  const request = withServiceGuard("tts", () =>
    client.synthesizeSpeech({
      text,
      gameId,
      voiceName,
      speakers,
    }),
  ).catch((error) => {
    speechCache.delete(key);
    throw error;
  });

  speechCache.set(key, request);
  return request;
}

function stopManagedSpeech(): void {
  for (const handle of Array.from(activeSpeech)) {
    handle.stop();
  }
  activeSpeech.clear();
}

function createBufferedSpeechHandle(
  responsePromise: Promise<BinaryResponse>,
  options: SpeechOptions,
  startAfter: Promise<unknown> = Promise.resolve(),
): ManagedSpeechHandle {
  const context = getAudioContext();
  const gain = context.createGain();
  gain.gain.value = options.volume ?? 1;
  gain.connect(context.destination);

  let response: BinaryResponse | null = null;
  let buffer: AudioBuffer | null = null;
  let source: AudioBufferSourceNode | null = null;
  let startedAt = 0;
  let offset = 0;
  let paused = false;
  let stopped = false;
  let finished = false;
  let resolveDone: (response: BinaryResponse) => void = () => undefined;
  let rejectDone: (error: unknown) => void = () => undefined;

  const done = new Promise<BinaryResponse>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });

  let handle: ManagedSpeechHandle;

  function cleanup(): void {
    activeSpeech.delete(handle);
    source = null;
    try {
      gain.disconnect();
    } catch {
      // Already disconnected.
    }
  }

  function complete(): void {
    if (finished) return;
    finished = true;
    cleanup();
    options.onComplete?.();
    resolveDone(response ?? emptyBinaryResponse());
  }

  function startSource(): void {
    if (!buffer || stopped || paused || finished) return;
    if (offset >= buffer.duration) {
      complete();
      return;
    }

    source = context.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    startedAt = context.currentTime - offset;
    source.onended = () => {
      if (paused || stopped || finished) return;
      offset = 0;
      complete();
    };
    source.start(0, offset);
  }

  handle = {
    context,
    done,
    stop: () => {
      if (stopped || finished) return;
      stopped = true;
      try {
        source?.stop();
      } catch {
        // Source may already be stopped; ignore.
      }
      cleanup();
      resolveDone(response ?? emptyBinaryResponse());
    },
    setVolume: (volume: number) => {
      gain.gain.value = Math.max(0, volume);
    },
    pause: () => {
      if (stopped || finished || paused) return;
      paused = true;
      if (source && buffer) {
        offset = Math.min(buffer.duration, context.currentTime - startedAt);
        try {
          source.stop();
        } catch {
          // Source may already be stopped; ignore.
        }
      }
      source = null;
    },
    resume: () => {
      if (stopped || finished || !paused) return;
      paused = false;
      startSource();
    },
    play: () => {
      handle.resume();
    },
  };

  activeSpeech.add(handle);

  void (async () => {
    try {
      response = await responsePromise;
      const decoded = await context.decodeAudioData(response.data.slice(0));
      buffer = decoded;
      await startAfter;
      if (!stopped && !paused) startSource();
    } catch (error) {
      cleanup();
      const err = error instanceof Error ? error : new Error(String(error));
      options.onError?.(err);
      rejectDone(err);
      console.error("TTS Error:", err);
    }
  })();

  return handle;
}

/**
 * Returns the prebuilt Capybara TTS voices supported by the game server.
 */
export async function getSpeechVoices(): Promise<SpeechVoicesResponse> {
  requireInit();
  await ensureGuestSession();
  const { client } = getActiveClient();
  return client.getSpeechVoices();
}

/**
 * Preloads a TTS line into the in-memory speech cache.
 * @param {string} text
 * @param {Object} [options]
 * @param {string} [options.voiceName] - Prebuilt voice name such as "Kore" or "Puck".
 * @param {Array} [options.speakers] - Multi-speaker mapping; speaker names must match transcript labels.
 * @returns {Promise<BinaryResponse>} Raw WAV audio response.
 */
export async function preloadSpeech(
  text: SpeechInput,
  options: { voiceName?: string; speakers?: SpeechSpeaker[] } = {},
): Promise<BinaryResponse> {
  requireInit();
  await ensureGuestSession();
  return fetchSpeechResponse(resolveSpeechInput(text), options);
}

/**
 * Preloads all statically discoverable sdk.audio.speak(...) calls from the build manifest.
 * The build writes dist/audio-manifest.json via scripts/audio-extract-plugin.ts.
 */
export async function preloadSpeechManifest(
  manifestUrl = "audio-manifest.json",
): Promise<AudioManifestEntry[]> {
  requireInit();
  await ensureGuestSession();
  getActiveClient();

  try {
    const response = await fetch(manifestUrl, { cache: "no-cache" });
    if (!response.ok) return [];

    const entries = (await response.json()) as AudioManifestEntry[];
    const unique = new Map<string, AudioManifestEntry>();
    for (const entry of entries) {
      if (!entry?.text) continue;
      const voiceName = normalizeVoiceName(entry.voiceName);
      const speakers = normalizeSpeakers(entry.speakers);
      unique.set(getSpeechKey(entry.text, voiceName, speakers), {
        ...entry,
        voiceName,
        speakers,
      });
    }

    await Promise.allSettled(
      Array.from(unique.values()).map((entry) => preloadSpeech(entry.text, entry)),
    );

    return Array.from(unique.values());
  } catch (error) {
    console.warn("[tts] Speech manifest preload skipped", error);
    return [];
  }
}

/**
 * Immediately speaks the given text out loud.
 *
 * By default this uses the managed cache-backed path. If the line was preloaded
 * from audio-manifest.json it plays from memory; if not, it generates WAV audio,
 * stores it in the cache, then plays it. Set useCache:false to bypass the cache
 * and use the SDK's synthesizeSpeechToAudio helper directly.
 *
 * @param {string} text - The prompt/transcript to speak. Include style instructions and audio tags in this text.
 * @param {Object} [options]
 * @param {string} [options.voiceName] - Prebuilt voice name such as "Kore" or "Puck".
 * @param {Array} [options.speakers] - Multi-speaker mapping; speaker names must match transcript labels.
 * @param {Function} [options.onComplete] - Callback when audio finishes playing on the cache-backed path.
 * @param {number} [options.volume] - Per-line volume. 1 is normal volume.
 * @param {string} [options.mode] - interrupt, overlap, or queue. Defaults to interrupt.
 * @returns {Object} A handle object with stop(), pause(), resume(), play(), and setVolume().
 */
export function speak(
  text: SpeechInput,
  options: SpeechOptions = {},
): ManagedSpeechHandle {
  const resolvedText = resolveSpeechInput(text);
  requireInit();
  const sessionReady = ensureGuestSession();
  getActiveClient();
  const mode = options.mode ?? "interrupt";

  if (mode === "interrupt") {
    stopManagedSpeech();
    queueTail = Promise.resolve();
  }

  if (options.useCache === false) {
    console.warn(
      "[tts] useCache:false still uses cache-backed playback so the SDK can auto-authenticate first. Disable cache only after a user session exists.",
    );
  }

  const startAfter = mode === "queue" ? queueTail : Promise.resolve();
  const handle = createBufferedSpeechHandle(
    sessionReady.then(() => fetchSpeechResponse(resolvedText, options)),
    options,
    startAfter,
  );

  if (mode === "queue") {
    queueTail = handle.done.catch(() => undefined);
  }

  return handle;
}

/**
 * Downloads audio data as a buffer (useful for preloading sound effects).
 * @param {string} text
 * @param {Object} [options] - TTS options.
 * @param {string} [options.voiceName] - Prebuilt voice name such as "Kore" or "Puck".
 * @param {Array} [options.speakers] - Multi-speaker mapping; speaker names must match transcript labels.
 * @returns {Promise<ArrayBuffer>} Raw audio data.
 */
export async function preloadSpeechAudio(
  text: SpeechInput,
  options: { voiceName?: string; speakers?: SpeechSpeaker[] } = {},
): Promise<ArrayBuffer> {
  const response = await preloadSpeech(text, options);
  return response.data;
}

export function stopAllSpeech(): void {
  stopManagedSpeech();
  queueTail = Promise.resolve();
}
