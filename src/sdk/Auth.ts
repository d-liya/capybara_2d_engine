/**
 * Auth.ts
 * Manages player authentication and sessions.
 */
import { apiClient, requireInit } from "./Core";

/**
 * Checks if the user is currently logged in.
 * @returns {Promise<Object|null>} The user object, or null if not logged in.
 */
export async function getCurrentUser(): Promise<User | null> {
  requireInit();
  try {
    const response = await apiClient.getSession();
    return response.user;
  } catch (error) {
    return null; // Not logged in or expired session
  }
}

/**
 * Signs the user in as an anonymous guest.
 * @returns {Promise<Object>} The authenticated user object.
 */
export async function loginAsGuest(): Promise<User> {
  requireInit();
  const existingUser = await getCurrentUser();
  if (existingUser) return existingUser;
  const response = await apiClient.signInGuest();
  return response.user;
}

/**
 * Returns the current authenticated user, or signs in as a guest if needed.
 * The SDK facade calls this automatically for save/load, AI, TTS, storage,
 * and multiplayer operations when no user is logged in.
 */
export async function ensureGuestSession(): Promise<User> {
  const existingUser = await getCurrentUser();
  if (existingUser) return existingUser;
  return loginAsGuest();
}

/**
 * Sends a One-Time Password (OTP) to the user's email.
 * @param {string} email
 * @returns {Promise<void>}
 */
export async function sendLoginEmail(email: string): Promise<void> {
  requireInit();
  await apiClient.authWithEmailOtp({ email });
}

/**
 * Verifies the OTP sent to the email and logs the user in.
 * @param {string} email
 * @param {string} otp - The code from the email.
 * @param {string} [name] - Optional display name for new users.
 * @returns {Promise<Object>} The authenticated user object.
 */
export async function verifyLoginEmail(
  email: string,
  otp: string,
  name?: string,
): Promise<User> {
  requireInit();
  const response = await apiClient.authWithEmailOtp({ email, otp, name });
  if (!("user" in response)) {
    throw new Error("OTP verification did not return an authenticated user");
  }
  return response.user;
}

/**
 * Logs the current user out.
 * @returns {Promise<void>}
 */
export async function logout(): Promise<void> {
  requireInit();
  await apiClient.signOut();
}
