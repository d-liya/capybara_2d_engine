import type {
  GameServerClient as SDKGameServerClient,
  GameServerClientOptions as SDKGameServerClientOptions,
  PresenceEntry as SDKPresenceEntry,
  User as SDKUser,
} from "./capybara-sdk-globals";

declare module "*.js";

declare global {
  type GameServerClient = SDKGameServerClient;
  type GameServerClientOptions = SDKGameServerClientOptions;
  type PresenceEntry = SDKPresenceEntry;
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
