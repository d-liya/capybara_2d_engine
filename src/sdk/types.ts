import type * as Audio from "./Tts";
import { Agent } from "./Ai";

/**
 * Public SDK facade TypeScript contract.
 *
 * Pair with docs/SDK_FACADE.md for behavior and src/sdk/index.ts for the
 * runtime entrypoint. Bundle this file with sdk/index.ts for one-pass agent tasks.
 *
 * User is the reference example. Sibling types below follow the same
 * public-contract pattern. Update shapes here when the facade API changes.
 */
export interface User {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  image: string | null;
  createdAt: string;
  updatedAt: string;
  isAnonymous: boolean | null;
}

/** Public SDK facade type. Same pattern as User. */
export interface GameServerClientOptions {
  baseUrl?: string;
  tokenStorageKey?: string;
  bearerToken?: string;
}

/** Public SDK facade type. Same pattern as User. */
export interface PresenceEntry {
  userId: string;
  joinedAt: string;
  metadata: Record<string, unknown>;
}

/** Public SDK facade type. Same pattern as User. */
export interface SpeechVoice {
  voiceName: string;
  style: string;
}

/** Public SDK facade type. Same pattern as User. */
export interface SpeechVoicesResponse {
  defaultVoice: string;
  voices: SpeechVoice[];
}

/** Public SDK facade type. Same pattern as User. */
export interface BinaryResponse {
  contentType: string;
  data: ArrayBuffer;
}

/** Public SDK facade type. Same pattern as User. */
export interface ManagedSpeechHandle {
  context: AudioContext;
  done: Promise<BinaryResponse>;
  stop: () => void;
  setVolume: (volume: number) => void;
  pause: () => void;
  resume: () => void;
  play: () => void;
}

/** Public SDK facade type. Same pattern as User. */
export interface LlmResponsePayload {
  input?: string | Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
  model?: string;
  stream?: boolean;
  instructions?: string;
  metadata?: Record<string, unknown>;
  previous_response_id?: string;
  prompt_cache_key?: string;
  prompt_cache_retention?: "in_memory" | "24h";
  max_output_tokens?: number;
  temperature?: number;
  top_p?: number;
  tools?: Array<Record<string, unknown>>;
  [key: string]: unknown;
}

/** Public SDK facade type. Same pattern as User. */
export interface LlmResponse {
  id?: string;
  object?: "response" | string;
  created_at?: number;
  model?: string;
  output_text?: string;
  output?: Array<Record<string, unknown>>;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Public SDK facade type. Same pattern as User. */
export interface ResponseStreamEvent {
  type?: string;
  delta?: string;
  response?: LlmResponse;
  item?: Record<string, unknown>;
  usage?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AgentHistoryOptions {
  id: string;
  summarizePrompt: string;
  maxMessages?: number;
  keepRecentMessages?: number;
}

export interface AgentCreateOptions {
  maxToolLoops?: number;
  stream?: boolean;
  providerOptions?: Record<string, any>;
  metadata?: Record<string, any>;
  history?: AgentHistoryOptions;
  [key: string]: any;
}

export interface AgentToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: Record<string, any>) => Promise<any> | any;
}

export interface AiGroup {
  completeChat: {
    (
      payload: LlmResponsePayload & { stream: false },
    ): Promise<LlmResponse | Record<string, unknown>>;
    (
      payload: LlmResponsePayload,
    ): AsyncGenerator<ResponseStreamEvent, void, unknown>;
  };
  createAgent: (systemPrompt: string, options?: AgentCreateOptions) => Agent;
  addTool: (agent: Agent, tool: AgentToolDefinition) => void;
  Agent: typeof Agent;
}

export interface GameSDKAuthGroup {
  getCurrentUser: () => Promise<User | null>;
  loginAsGuest: () => Promise<User>;
  sendLoginEmail: (email: string) => Promise<void>;
  verifyLoginEmail: (
    email: string,
    otp: string,
    name?: string,
  ) => Promise<User>;
  logout: () => Promise<void>;
  ensureGuestSession: () => Promise<User>;
}

export interface GameSDKSaveGroup {
  loadGameData: () => Promise<Record<string, unknown> | null>;
  saveGameData: (data: Record<string, unknown>) => Promise<void>;
  loadSharedState: () => Promise<Record<string, unknown> | null>;
  saveSharedState: (data: Record<string, unknown>) => Promise<void>;
  getStorage: <T = unknown>(key: string) => Promise<T | null>;
  setStorage: <T = unknown>(key: string, value: T) => Promise<void>;
  deleteStorage: (key: string) => Promise<void>;
}

export interface GameSDKStorageGroup {
  get: <T = unknown>(key: string) => Promise<T | null>;
  set: <T = unknown>(key: string, value: T) => Promise<void>;
  delete: (key: string) => Promise<void>;
}

export interface GameSDKMultiplayerGroup {
  joinRoom: (
    roomId: string,
    metadata?: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  leaveRoom: () => Promise<void>;
  getRoomState: () => Promise<Record<string, unknown>>;
  updateRoomState: (
    newState: Record<string, unknown>,
  ) => Promise<Record<string, unknown>>;
  getRoomPlayers: () => Promise<PresenceEntry[]>;
}

export interface GameSDKAudioGroup {
  getSpeechVoices: () => Promise<SpeechVoicesResponse>;
  speak: (
    text: Audio.SpeechInput,
    options?: Audio.SpeechOptions,
  ) => ManagedSpeechHandle;
  preloadSpeech: (
    text: Audio.SpeechInput,
    options?: { voiceName?: string; speakers?: Audio.SpeechSpeaker[] },
  ) => Promise<BinaryResponse>;
  preloadSpeechManifest: (
    manifestUrl?: string,
  ) => Promise<
    Array<{
      text: string;
      voiceName?: string;
      speakers?: Audio.SpeechSpeaker[];
      source?: string;
    }>
  >;
  stopAllSpeech: () => void;
}

export interface GameSDKInterface {
  init: (options?: GameServerClientOptions) => GameSDKInterface;
  auth: GameSDKAuthGroup;
  save: GameSDKSaveGroup;
  storage: GameSDKStorageGroup;
  multiplayer: GameSDKMultiplayerGroup;
  audio: GameSDKAudioGroup;
  ai: AiGroup;
}
