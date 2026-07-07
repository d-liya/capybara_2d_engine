/**
 * Save.ts
 * Cloud save data management.
 */
import { apiClient, activeGameId, requireInit } from "./Core";
import { ensureGuestSession } from "./Auth";

/**
 * Loads the player's saved game data.
 * @returns {Promise<Object|null>} The save data object, or null if no save exists.
 */
export async function loadGameData(): Promise<Record<string, unknown> | null> {
  requireInit();
  await ensureGuestSession();
  try {
    const record = await apiClient.getSave(activeGameId);
    return record.data;
  } catch (error) {
    if (error.status === 404) {
      return null; // No save data exists yet, return null cleanly
    }
    throw error;
  }
}

/**
 * Saves the player's game data to the cloud.
 * @param {Object} data - Arbitrary JSON serializable state.
 * @returns {Promise<void>}
 */
export async function saveGameData(
  data: Record<string, unknown>,
): Promise<void> {
  requireInit();
  await ensureGuestSession();
  await apiClient.updateSave(activeGameId, data);
}

/**
 * Loads shared game state visible to every player of the active game.
 * @returns {Promise<Object|null>} The shared state object, or null if unset.
 */
export async function loadSharedState(): Promise<Record<string, unknown> | null> {
  requireInit();
  await ensureGuestSession();
  const record = await apiClient.getSharedState(activeGameId);
  return record.data;
}

/**
 * Saves shared game state visible to every player of the active game.
 * @param {Object} data - Arbitrary JSON serializable state.
 * @returns {Promise<void>}
 */
export async function saveSharedState(
  data: Record<string, unknown>,
): Promise<void> {
  requireInit();
  await ensureGuestSession();
  await apiClient.updateSharedState(activeGameId, data);
}

/**
 * Loads an isolated key/value storage record scoped to the active game and user.
 * Returns null when the key does not exist.
 */
export async function getStorage<T = unknown>(key: string): Promise<T | null> {
  requireInit();
  await ensureGuestSession();
  try {
    const record = await apiClient.getKv<T>(activeGameId, key);
    return record.value;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Saves an isolated key/value storage record scoped to the active game and user.
 */
export async function setStorage<T = unknown>(
  key: string,
  value: T,
): Promise<void> {
  requireInit();
  await ensureGuestSession();
  await apiClient.setKv(activeGameId, key, value);
}

/**
 * Deletes an isolated key/value storage record scoped to the active game and user.
 */
export async function deleteStorage(key: string): Promise<void> {
  requireInit();
  await ensureGuestSession();
  await apiClient.deleteKv(activeGameId, key);
}
