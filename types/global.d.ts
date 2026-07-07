import type {
  LlmResponsePayload as SDKLlmResponsePayload,
  LlmResponse as SDKLlmResponse,
  ResponseStreamEvent as SDKResponseStreamEvent,
  GameServerClient as SDKGameServerClient,
  BinaryResponse as SDKBinaryResponse,
  GameServerClientOptions as SDKGameServerClientOptions,
  PresenceEntry as SDKPresenceEntry,
  SpeechToAudioHandle as SDKSpeechToAudioHandle,
  SpeechVoicesResponse as SDKSpeechVoicesResponse,
  User as SDKUser,
} from "./capybara-sdk-globals";

declare module "*.js";

declare global {
  type LlmResponsePayload = SDKLlmResponsePayload;
  type LlmResponse = SDKLlmResponse;
  type ResponseStreamEvent = SDKResponseStreamEvent;
  type BinaryResponse = SDKBinaryResponse;
  type GameServerClient = SDKGameServerClient;
  type GameServerClientOptions = SDKGameServerClientOptions;
  type PresenceEntry = SDKPresenceEntry;
  type SpeechToAudioHandle = SDKSpeechToAudioHandle;
  type SpeechVoicesResponse = SDKSpeechVoicesResponse;
  type User = SDKUser;

  interface Window {
    gameId?: string;
    webkitAudioContext?: typeof AudioContext;
    GameServerClient: new (
      options?: SDKGameServerClientOptions,
    ) => SDKGameServerClient;
  }
}

export {};
