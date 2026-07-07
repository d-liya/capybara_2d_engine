

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

export interface GameSDKInterface {
  init: (options?: GameServerClientOptions) => GameSDKInterface;
  auth: GameSDKAuthGroup;
  save: GameSDKSaveGroup;
  storage: GameSDKStorageGroup;
  multiplayer: GameSDKMultiplayerGroup;
}
