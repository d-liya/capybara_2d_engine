const OVERLAY_ID = "capybara-screen-fade";

/** Default door/room travel: short soft dim, not a full theatrical blackout. */
export const LIGHT_SCREEN_FADE = {
  fadeMs: 140,
  peakOpacity: 0.45,
} as const;

function getOverlay(): HTMLDivElement {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:9000",
      "background:var(--color-capy-ink, #150e21)",
      "opacity:0",
      "pointer-events:none",
    ].join(";");
    document.body.appendChild(overlay);
  }
  return overlay;
}

function waitForOpacityTransition(
  overlay: HTMLDivElement,
  targetOpacity: number,
  durationMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      overlay.removeEventListener("transitionend", onEnd);
      resolve();
    };

    const onEnd = (event: TransitionEvent) => {
      if (event.target !== overlay || event.propertyName !== "opacity") return;
      finish();
    };

    overlay.addEventListener("transitionend", onEnd);
    // Quantized fade, like a 16-bit hardware brightness ramp.
    // Fewer steps on short fades so it still reads as a blink, not a crawl.
    const steps = durationMs <= 180 ? 4 : 8;
    overlay.style.transition = `opacity ${durationMs}ms steps(${steps}, end)`;
    requestAnimationFrame(() => {
      overlay.style.opacity = String(targetOpacity);
    });
    window.setTimeout(finish, durationMs + 50);
  });
}

function waitForNextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

export type ScreenFadeOptions = {
  /** One-way fade duration in ms (default: light door fade). */
  fadeMs?: number;
  /**
   * Peak overlay opacity while the map swaps (0–1).
   * Below 1 keeps the world faintly visible — a soft blink instead of a hard cut.
   */
  peakOpacity?: number;
};

/** Soft dim, run work, then lift. Defaults match light door travel. */
export async function runScreenFade(
  action: () => void,
  options: ScreenFadeOptions = {},
): Promise<void> {
  const fadeMs = options.fadeMs ?? LIGHT_SCREEN_FADE.fadeMs;
  const peakOpacity = Math.min(
    1,
    Math.max(0, options.peakOpacity ?? LIGHT_SCREEN_FADE.peakOpacity),
  );
  const overlay = getOverlay();

  overlay.style.pointerEvents = "auto";
  await waitForOpacityTransition(overlay, peakOpacity, fadeMs);

  action();
  await waitForNextPaint();

  await waitForOpacityTransition(overlay, 0, fadeMs);
  overlay.style.pointerEvents = "none";
}
