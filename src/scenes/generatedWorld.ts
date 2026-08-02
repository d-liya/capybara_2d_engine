import type { GameAPI } from "../Game";
import type { BootstrapGameplayOptions } from "./bootstrapWorldFromAssets";

/**
 * Stub — overwritten by capybara_game asset sync when maps exist.
 *
 * Generated implementations MUST forward gameplay opts into bootstrap:
 *
 *   return bootstrapWorldFromAssets({
 *     maps,
 *     characters,
 *     commonAudio,
 *     ...opts,
 *   });
 *
 * Hand-written gameplay belongs in `mainScene` (`configureGameplay`) or in
 * options passed to `createMainScene` — never edit this file by hand.
 */
export function createGeneratedWorld(
  _opts?: BootstrapGameplayOptions
): GameAPI | null {
  return null;
}
