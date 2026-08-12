import type { Widget } from "../core/WidgetManager";

/** Short-lived state written by `game.applyCombatImpact({ kind: "player" })`. */
export const COMBAT_FEEDBACK_RESOURCE = "combatFeedback";

export type CombatFeedbackState = {
  playerHurtUntilMs: number;
};

export function createCombatFeedbackState(): CombatFeedbackState {
  return { playerHurtUntilMs: 0 };
}

/**
 * A hard painted red frame, not a translucent vignette. It makes player damage
 * legible without covering the scene or fighting the map's colour script.
 */
export function createCombatFeedbackWidget(): Widget {
  let frame: HTMLDivElement | null = null;

  return {
    id: "combat-feedback",
    zIndex: 650,
    isVisible: () => true,
    isInteractive: () => false,
    mount: () => {
      const root = document.createElement("div");
      root.className = "absolute inset-0 pointer-events-none";

      frame = document.createElement("div");
      frame.className = "capy-hurt-frame absolute inset-0 opacity-0 will-change-[opacity]";
      root.append(frame);
      return root;
    },
    update: ({ game, now }) => {
      if (!frame) return;
      let state: CombatFeedbackState | null = null;
      try {
        state = (
          game as { getResource<T = unknown>(name: string): T }
        ).getResource<CombatFeedbackState>(COMBAT_FEEDBACK_RESOURCE);
      } catch {
        // The widget is safe to mount before a combat resource exists.
      }

      const remaining = Math.max(0, Number(state?.playerHurtUntilMs ?? 0) - now);
      // Three hard opacity bands keep the cue in the pixel-art language.
      frame.style.opacity = remaining > 100 ? "0.7" : remaining > 45 ? "0.42" : "0";
    },
  };
}
