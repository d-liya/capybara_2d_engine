import { initGameService } from "./Core";
import * as Auth from "./Auth";
import * as Save from "./Save";
import * as Multiplayer from "./Multiplayer";
import * as Audio from "./Tts";
import { Agent, completeChat } from "./Ai";
import type {
  AgentCreateOptions,
  AgentToolDefinition,
  AiGroup,
  GameSDKAudioGroup,
  GameSDKAuthGroup,
  GameSDKInterface,
  GameSDKMultiplayerGroup,
  GameSDKSaveGroup,
  GameSDKStorageGroup,
  GameServerClientOptions,
} from "./types";

export type * from "./types";

/**
 * Unified SDK facade to simplify usage.
 *
 * Developers can initialize once and call methods from a single object
 * instead of importing individual sdk modules.
 */
export class GameSDK implements GameSDKInterface {
  /**
   * Optional eager initialization. Most gameplay code can skip this because SDK
   * calls lazy-initialize from `window.gameId`, which is injected by index.html.
   */
  init(options: GameServerClientOptions = {}): this {
    initGameService(options);
    return this;
  }

  auth: GameSDKAuthGroup = {
    getCurrentUser: () => Auth.getCurrentUser(),
    loginAsGuest: () => Auth.loginAsGuest(),
    sendLoginEmail: (email: string) => Auth.sendLoginEmail(email),
    verifyLoginEmail: (email: string, otp: string, name?: string) =>
      Auth.verifyLoginEmail(email, otp, name),
    logout: () => Auth.logout(),
    ensureGuestSession: () => Auth.ensureGuestSession(),
  };

  save: GameSDKSaveGroup = {
    loadGameData: () => Save.loadGameData(),
    saveGameData: (data: Record<string, unknown>) => Save.saveGameData(data),
    loadSharedState: () => Save.loadSharedState(),
    saveSharedState: (data: Record<string, unknown>) =>
      Save.saveSharedState(data),
    getStorage: <T = unknown>(key: string) => Save.getStorage<T>(key),
    setStorage: <T = unknown>(key: string, value: T) =>
      Save.setStorage<T>(key, value),
    deleteStorage: (key: string) => Save.deleteStorage(key),
  };

  storage: GameSDKStorageGroup = {
    get: <T = unknown>(key: string) => Save.getStorage<T>(key),
    set: <T = unknown>(key: string, value: T) => Save.setStorage<T>(key, value),
    delete: (key: string) => Save.deleteStorage(key),
  };

  multiplayer: GameSDKMultiplayerGroup = {
    joinRoom: (roomId: string, metadata: Record<string, unknown> = {}) =>
      Multiplayer.joinRoom(roomId, metadata),
    leaveRoom: () => Multiplayer.leaveRoom(),
    getRoomState: () => Multiplayer.getRoomState(),
    updateRoomState: (newState: Record<string, unknown>) =>
      Multiplayer.updateRoomState(newState),
    getRoomPlayers: () => Multiplayer.getRoomPlayers(),
  };

  audio: GameSDKAudioGroup = {
    /**
     * Returns available prebuilt Capybara TTS voices from the game server.
     */
    getSpeechVoices: () => Audio.getSpeechVoices(),

    /**
     * Synthesizes and plays AI text-to-speech.
     *
     * The speech API uses prebuilt voices (`voiceName`) plus prompt text
     * for style control. Prefer the structured prompt pattern from
     * docs/recipes/tts-prompting.md: AUDIO PROFILE, THE SCENE, DIRECTOR'S NOTES,
     * SAMPLE CONTEXT, and TRANSCRIPT. Reuse one `voiceName` per NPC and match it
     * to on-screen gender. Put local delivery tags such as `[whispers]`,
     * `[sighs]`, or `[like a dog]` in TRANSCRIPT.
     *
     * Keep the returned handle and await `handle.done` when the next gameplay
     * step must wait for speech to finish. Multiple speak() calls fired without
     * awaiting, queueing, or stopping can overlap or interrupt each other.
     *
     * @param text - Prompt/transcript to speak. Include profile, director notes, speaker labels, transcript, and audio tags here.
     * @param options - Additional playback and voice options.
     * @param options.voiceName - Prebuilt voice name such as "Kore", "Puck", or "Sulafat".
     * @param options.speakers - Multi-speaker mapping. Speaker names must match labels in the transcript; max 2 speakers.
     * @param options.onComplete - Callback executed when the audio finishes playing.
     *
     * @example
     * sdk.audio.speak(`
     * # AUDIO PROFILE: Elowen
     * ## "Warm Farm Storyteller"
     *
     * ## THE SCENE: First Morning on the Farm
     * Dawn light falls over a neglected field.
     *
     * ### DIRECTOR'S NOTES
     * Style: Gentle, reassuring, and quietly magical.
     * Pace: Slow enough for a title screen, with soft pauses between sentences.
     * Accent: Neutral English.
     *
     * ### SAMPLE CONTEXT
     * Opening narration for a cozy farming game.
     *
     * #### TRANSCRIPT
     * [softly] Welcome to Harvest Hollow.
     * `, { voiceName: "Sulafat" });
     *
     * @example
     * sdk.audio.speak(`
     * # AUDIO PROFILE: Guard and Rogue
     * ## "Short Bridge Cutscene"
     *
     * ## THE SCENE: Closed Bridge at Dusk
     * A guard blocks a narrow bridge while a rogue tries to talk their way through.
     *
     * ### DIRECTOR'S NOTES
     * Guard Style: Serious, protective, and clipped.
     * Rogue Style: Playful, mischievous, and quick.
     * Pace: Snappy two-person exchange with no long pauses.
     * Accent: Neutral English for both speakers.
     *
     * ### SAMPLE CONTEXT
     * Short authored cutscene exchange.
     *
     * #### TRANSCRIPT
     * Guard: [serious] The bridge is closed after sunset.
     * Rogue: [mischievously] Then I suppose we take the river path.
     * `, {
     *   speakers: [
     *     { speaker: "Guard", voiceName: "Charon" },
     *     { speaker: "Rogue", voiceName: "Puck" },
     *   ],
     * });
     */
    speak: (text: Audio.SpeechInput, options: Audio.SpeechOptions = {}) =>
      Audio.speak(text, options),
    preloadSpeech: (
      text: Audio.SpeechInput,
      options: { voiceName?: string; speakers?: Audio.SpeechSpeaker[] } = {},
    ) => Audio.preloadSpeech(text, options),
    preloadSpeechManifest: (manifestUrl?: string) =>
      Audio.preloadSpeechManifest(manifestUrl),
    stopAllSpeech: () => Audio.stopAllSpeech(),
  };

  /**
   * AI helpers.
   *
   * Use these only for explicitly LLM-backed NPCs/assistants: open-ended conversation,
   * conversational memory, dynamic reasoning, or tool-calling. Simple NPC greetings,
   * quest text, barks, tutorials, and dialogue trees should use local resources/line tables.
   *
   * Quick start:
   * const agent = sdk.ai.createAgent("You are a helpful NPC");
   * sdk.ai.addTool(agent, {
   *   name: "getPlayerLevel",
   *   description: "Returns the player's level",
   *   parameters: { type: "object", properties: {}, required: [] },
   *   execute: async () => ({ level: 10 }),
   * });
   * const reply = await agent.chat("What can I do next?", {
   *   onChunk: (text) => appendToDialogue(text),
   * });
   */
  ai: AiGroup = {
    completeChat,
    createAgent: (systemPrompt: string, options: AgentCreateOptions = {}) =>
      new Agent(systemPrompt, options),
    addTool: (agent: Agent, tool: AgentToolDefinition) => {
      agent.addTool(tool);
    },
    Agent,
  };
}

export const sdk = new GameSDK();

export { initGameService } from "./Core";
export * as Auth from "./Auth";
export * as Save from "./Save";
export * as Multiplayer from "./Multiplayer";
export * as Audio from "./Tts";
export * as AI from "./Ai";
