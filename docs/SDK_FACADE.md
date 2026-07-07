# Capybara SDK Facade Guide

Use this guide before opening SDK internals. Gameplay code should import the facade from `src/sdk/index.ts`.

This file is the source of truth for SDK-facing behavior. Workflow and engine docs should link here instead of restating auth, save/load, AI, TTS, storage, or multiplayer contracts.

## Import

From files under `src/scenes`, `src/systems`, `src/inputs`, or `src/widgets`:

```ts
import { sdk } from "../sdk";
```

Adjust the relative path if needed.

## Initialization

Gameplay code usually does **not** call `sdk.init()`.

SDK calls lazy-initialize from `window.gameId`, which is injected by `index.html`. Do not pass a game id in gameplay code.

Only call eager initialization when explicitly required for custom client options:

```ts
sdk.init({ baseUrl: "https://example.invalid" });
```

## Auth/session behavior

Cloud save, AI, TTS, and multiplayer require an authenticated user session. The SDK facade now handles the default guest-session path automatically: if no user is logged in, calls such as `sdk.audio.speak(...)`, `sdk.ai.createAgent(...).chat(...)`, `sdk.save.loadGameData()`, `sdk.save.saveGameData(...)`, `sdk.save.loadSharedState()`, `sdk.save.saveSharedState(...)`, `sdk.storage.*`, and `sdk.multiplayer.*` sign in as a guest before contacting the service.

Gameplay code usually does **not** need to call `sdk.auth.ensureGuestSession()`.

Use explicit auth only when the game has a player-facing account flow. If the task explicitly asks for email login, implement email OTP:

```ts
await sdk.auth.sendLoginEmail(email);
const user = await sdk.auth.verifyLoginEmail(email, otp, name);
```

The explicit helper remains available for unusual cases where a scene wants to warm the guest session before any SDK feature is used:

```ts
await sdk.auth.ensureGuestSession();
```

## Save/load exact contract

Save data is scoped by the active `window.gameId` and authenticated user.

```ts
const saved = await sdk.save.loadGameData();
```

Contract:

```ts
sdk.save.loadGameData(): Promise<Record<string, unknown> | null>
sdk.save.saveGameData(data: Record<string, unknown>): Promise<void>
sdk.save.loadSharedState(): Promise<Record<string, unknown> | null>
sdk.save.saveSharedState(data: Record<string, unknown>): Promise<void>
sdk.storage.get<T = unknown>(key: string): Promise<T | null>
sdk.storage.set<T = unknown>(key: string, value: T): Promise<void>
sdk.storage.delete(key: string): Promise<void>
```

- `loadGameData()` returns the raw saved data object, not `{ data: ... }`.
- `loadGameData()` returns `null` when no save exists.
- `loadGameData()` throws for non-404 SDK/server errors.
- `saveGameData(data)` overwrites/replaces the saved data object for the current user/game.
- `loadSharedState()` returns one shared JSON object for the whole game, visible to every authenticated player.
- `loadSharedState()` returns `null` when no shared state exists yet.
- `saveSharedState(data)` overwrites/replaces that shared object for the active game.
- `sdk.storage` stores isolated key/value records scoped to the active game and authenticated user. Prefer it for agent history, settings, independent feature blobs, and data that should not overwrite the main game save.
- Save only JSON-serializable gameplay data.
- Do not save entity ids, DOM state, audio elements, map JSON, URLs that can be re-derived from asset names, or SDK objects.

Recommended pattern:

```ts
type SavePayload = {
  version: 1;
  season: "spring" | "summer" | "autumn" | "winter";
  globalDay: number;
  seasonDay: number;
  gold: number;
  crops: Array<{ id: string; state: number; daysSincePlanting: number }>;
};

// Facade auto guest-auths if no user is logged in.
const saved = (await sdk.save.loadGameData()) as SavePayload | null;
if (saved?.version === 1) {
  // hydrate resources from saved
}

await sdk.save.saveGameData({
  version: 1,
  season: farm.season,
  globalDay: farm.globalDay,
  seasonDay: farm.seasonDay,
  gold: farm.gold,
  crops: farm.crops.map((crop) => ({
    id: crop.id,
    state: crop.state,
    daysSincePlanting: crop.daysSincePlanting,
  })),
});
```

Save on important transitions such as day advance, harvest, or explicit checkpoint. Do not save every frame.

## TTS narration, speech, and voiced sound design

Use TTS for authored voice and vocal sound design: narrated intros, scripted NPC lines, creature vocalizations, and ambient chatter. Spoken words should come from prewritten scripts, not live LLM output. Read `docs/recipes/tts-prompting.md` for prompt templates, voice tables, inline tags, multi-speaker clips, preloading, and playback policy.

Contract:

```ts
const voices = await sdk.audio.getSpeechVoices();

const handle = sdk.audio.speak(
  text: string | string[],
  options?: {
    voiceName?: string; // prebuilt voice, e.g. "Kore", "Puck", "Sulafat"
    speakers?: Array<{ speaker: string; voiceName: string }>; // max 2, names must match transcript labels
    onComplete?: () => void;
    volume?: number; // 1 is normal volume
    mode?: "interrupt" | "overlap" | "queue"; // defaults to "interrupt"
    useCache?: boolean; // defaults to true
  },
);

handle.stop();
handle.pause();
handle.resume();
handle.play();
handle.setVolume(0.5);
await handle.done;
```

Example:

```ts
void sdk.audio.speak(TTS_PROMPT, { voiceName: "Sulafat" });
```

When speech controls a gameplay sequence, keep the returned handle and wait for
it before advancing:

```ts
const handle = sdk.audio.speak(INTRO_PROMPT, { voiceName: "Sulafat" });
await handle.done;
startNextSceneStep();
```

You can also use `onComplete` for callback-style flow. Avoid firing several
`sdk.audio.speak(...)` calls in a row without awaiting, queueing, or stopping the
previous handle; they can overlap, interrupt each other, or advance scene logic
before the player hears the line.

Use `getSpeechVoices()` for the authoritative runtime voice list. For multi-speaker clips, pass `speakers` with labels that match the transcript (max 2). Cast each NPC with one stable `voiceName` matched to on-screen gender; see `docs/recipes/tts-prompting.md` for the voice table and consistency rules.

Playback mode:

- `interrupt` — default. Stops currently playing managed speech before starting this line. Use for most NPC dialogue to avoid accidental overlap.
- `overlap` — allows multiple speech lines to play at once. Use only when simultaneous voices are intentional.
- `queue` — waits for the previous managed speech line to finish before starting.

Speech is cache-backed by default. The build step writes `dist/audio-manifest.json` from statically discoverable `sdk.audio.speak(...)` calls, and `src/main.ts` preloads that manifest on game mount. Prefer static prompt strings (or static string arrays joined at runtime) so lines can be pre-generated. Deploy `audio-manifest.json` alongside `main.js`/`styles.css`.

Additional helpers:

```ts
await sdk.audio.preloadSpeech(TTS_PROMPT, { voiceName: "Sulafat" });
await sdk.audio.preloadSpeechManifest();
sdk.audio.stopAllSpeech();
```

Set `useCache: false` to bypass the local cache and use the SDK playback helper directly. Per-line volume/pause/resume are only fully supported by cache-backed playback; direct playback can only reliably start/stop/suspend the shared context.

Browser autoplay rules still apply — trigger TTS from user interaction when possible. See `docs/recipes/tts-prompting.md` for playback policy.

## AI NPC dialogue

Do not use SDK AI for every talking NPC. Default to scripted/resource-driven dialogue for fixed greetings, guard warnings, shopkeeper lines, quest text, barks, signs, tutorials, and small local dialogue trees. Use `sdk.ai.createAgent(systemPrompt, options)` only when the user explicitly needs AI-generated conversation, open-ended replies, persistent conversational memory, dynamic reasoning over game state, or tool-calling behavior.

Read `docs/recipes/npc-dialogue.md` for dialogue wiring. For tool-calling agents, read `docs/recipes/ai-agent-tool-calls.md`. For LLM-backed named NPCs with tools, read `docs/recipes/llm-backed-npc-tools.md`. For cross-session memory, read `docs/recipes/persistent-agent-history.md`.

Contract:

```ts
sdk.ai.createAgent(systemPrompt: string, options?: {
  maxToolLoops?: number;
  providerOptions?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  history?: {
    id: string;
    summarizePrompt: string;
    maxMessages?: number;
    keepRecentMessages?: number;
  };
}): Agent

agent.chat(userText?: string, options?: {
  onChunk?: (textDelta: string, chunk: ChatStreamChunk) => void;
}): Promise<string>
agent.resetMemory(): Promise<void>
```

Persistent/infinite agent conversation is **opt-in only** because it adds storage writes and background summarization cost. Do not pass `history` unless the game explicitly requires cross-session memory, long-running NPC relationships, or an infinite assistant-style chat. When `history` is provided, the `id` is a stable storage id scoped to the active game/user, such as `npc:blacksmith` or `assistant:main`. The agent lazily loads previous history on first `chat(...)`, saves after successful replies, and schedules older-message summarization in the background once `maxMessages` is exceeded while preserving recent messages verbatim. Agents always use model `capybara_agent`; background summarization always uses model `capybara_summarize`.

`Agent.chat(...)` streams by default and returns the final full string. Pass `onChunk` for progressive dialogue UI. Pass `{ stream: false }` only when you need a non-streaming raw completion response.

## Complete chat shortcut

For one-off streaming text without persistent agent memory:

```ts
let text = "";
for await (const chunk of sdk.ai.completeChat({
  messages: [
    { role: "system", content: "You are a cozy farm NPC." },
    { role: "user", content: "Give one crop tip." },
  ],
})) {
  const delta = chunk.choices?.[0]?.delta?.content;
  if (typeof delta === "string") text += delta;
}
```

For a non-streaming raw response, explicitly pass `stream: false`:

```ts
const response = await sdk.ai.completeChat({
  stream: false,
  messages: [
    { role: "system", content: "You are a cozy farm NPC." },
    { role: "user", content: "Give one crop tip." },
  ],
});
```

Prefer `createAgent(...).chat(...)` over `completeChat(...)` for LLM-backed NPC dialogue unless you specifically need raw response metadata or manual stream iteration. For simple NPC dialogue, do not use either SDK AI API; use local resources/line tables instead.

## Tool-calling agents

For tool-calling NPCs/assistants, read `docs/recipes/ai-agent-tool-calls.md`. Use narrow tools and low loop limits (`maxToolLoops`).

## Multiplayer

Only use multiplayer when the task asks for multiplayer/account features.

```ts
await sdk.multiplayer.joinRoom("room-id", { name: "Player" });
```

## Do not read SDK internals by default

Avoid opening:

- `src/sdk/Ai.ts`
- `src/sdk/Save.ts`
- `src/sdk/Tts.ts`
- `src/sdk/Auth.ts`
- `src/sdk/Core.ts`
- `src/sdk/Multiplayer.ts`

Open them only if `src/sdk/index.ts` and this facade guide are insufficient or a real SDK bug is identified. If you do inspect an internal file during an autonomous task, inspect the smallest necessary file and mention why in the final summary.
