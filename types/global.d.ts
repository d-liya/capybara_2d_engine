import type {
  GameServerClient as SDKGameServerClient,
  GameServerClientOptions as SDKGameServerClientOptions,
  PresenceEntry as SDKPresenceEntry,
  User as SDKUser,
} from "./capybara-sdk-globals";

declare module "*.js";
declare module "*.css";

declare global {
  type GameServerClient = SDKGameServerClient;
  type GameServerClientOptions = SDKGameServerClientOptions;
  type PresenceEntry = SDKPresenceEntry;
  type User = SDKUser;

  interface Window {
    gameId?: string;
    /** Display title for the production loading gate (set in index.html). */
    game_title?: string;
    webkitAudioContext?: typeof AudioContext;
    GameServerClient: new (
      options?: SDKGameServerClientOptions,
    ) => SDKGameServerClient;
  }
}

export {};
