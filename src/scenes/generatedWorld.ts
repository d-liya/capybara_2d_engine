import type { GameAPI } from "../Game";

/** Stub — overwritten by capybara_game asset sync when maps exist. */
export function createGeneratedWorld(_opts?: {
  onAudioReady?: (start: () => void) => void;
}): GameAPI | null {
  return null;
}
