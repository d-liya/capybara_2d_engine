/**
 * Multiplayer.ts
 * Real-time room management and state synchronization.
 */
import { apiClient, activeGameId, requireInit } from "./Core";
import { ensureGuestSession } from "./Auth";

let currentRoomId: string | null = null;
let currentRoomVersion = 0;

/**
 * Joins a multiplayer room.
 * @param {string} roomId - The ID of the room to join.
 * @param {Object} [metadata] - Optional public metadata (e.g., character color).
 * @returns {Promise<Object>} The current shared state of the room.
 */
export async function joinRoom(
  roomId: string,
  metadata: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  requireInit();
  await ensureGuestSession();
  const response = await apiClient.joinRoom(activeGameId, roomId, metadata);
  currentRoomId = roomId;
  currentRoomVersion = response.state.version;
  return response.state.state;
}

/**
 * Leaves the current room.
 * @returns {Promise<void>}
 */
export async function leaveRoom(): Promise<void> {
  requireInit();
  await ensureGuestSession();
  if (!currentRoomId) return;
  await apiClient.leaveRoom(activeGameId, currentRoomId);
  currentRoomId = null;
  currentRoomVersion = 0;
}

/**
 * Gets the latest shared state of the current room.
 * @returns {Promise<Object>} The room's state object.
 */
export async function getRoomState(): Promise<Record<string, unknown>> {
  requireInit();
  await ensureGuestSession();
  if (!currentRoomId) throw new Error("You must join a room first.");

  const response = await apiClient.getRoomState(activeGameId, currentRoomId);
  currentRoomVersion = response.version; // Keep our version tracker up to date
  return response.state;
}

/**
 * Replaces the room's shared state. Automatically handles version tracking.
 * @param {Object} newState - The complete new state.
 * @returns {Promise<Object>} The confirmed updated state.
 */
export async function updateRoomState(
  newState: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  requireInit();
  await ensureGuestSession();
  if (!currentRoomId) throw new Error("You must join a room first.");

  try {
    const response = await apiClient.updateRoomState(
      activeGameId,
      currentRoomId,
      newState,
      currentRoomVersion, // Pass the internal version tracker
    );
    currentRoomVersion = response.version; // Update local version tracker
    return response.state;
  } catch (error) {
    if (error.status === 409) {
      throw new Error(
        "State conflict: Another player updated the room first. Fetch the latest state and try again.",
      );
    }
    throw error;
  }
}

/**
 * Gets a list of all players currently in the room.
 * @returns {Promise<Array>} Array of player objects including their metadata.
 */
export async function getRoomPlayers(): Promise<PresenceEntry[]> {
  requireInit();
  await ensureGuestSession();
  if (!currentRoomId) throw new Error("You must join a room first.");
  const response = await apiClient.getRoomPresence(activeGameId, currentRoomId);
  return response.players;
}
