/**
 * Core.ts
 * Handles the initialization of the underlying Game Server SDK.
 */

export let apiClient: GameServerClient | null = null;
export let activeGameId: string | null = null;

/**
 * Initializes the game client from `window.gameId`.
 *
 * `window.gameId` is injected by `index.html`, so gameplay code should not pass
 * game ids around. SDK calls also lazy-initialize through `requireInit()`.
 *
 * @param {Object} [options] - Optional server overrides.
 * @param {string} [options.baseUrl] - Optional custom server URL if not using the default.
 */
export function initGameService(options: GameServerClientOptions = {}): void {
  if (!window.GameServerClient) {
    throw new Error("GameServerClient script not loaded from CDN.");
  }

  const resolvedGameId = window.gameId;
  if (!resolvedGameId) {
    throw new Error(
      "Missing window.gameId. Set it in index.html before using the SDK.",
    );
  }

  activeGameId = resolvedGameId;
  apiClient = new window.GameServerClient(options);

  console.log(`[Game Service] Initialized for game`);
}

/**
 * Ensures the service is initialized before making calls.
 */
export function requireInit(): void {
  if (!apiClient || !activeGameId) {
    initGameService();
  }
}
