import { initGameService } from "./Core";
import * as Auth from "./Auth";
import * as Save from "./Save";
import * as Multiplayer from "./Multiplayer";
import type {
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

}

export const sdk = new GameSDK();

export { initGameService } from "./Core";
export * as Auth from "./Auth";
export * as Save from "./Save";
export * as Multiplayer from "./Multiplayer";
