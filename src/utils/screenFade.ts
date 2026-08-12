const OVERLAY_ID = "capybara-screen-fade";

/**
 * Door travel is a physical iris, closing around the character and opening
 * from their arrival point. The timing is deliberately stepped so it reads as
 * a painted-pixel scene change rather than a web-page crossfade.
 */
export const LIGHT_SCREEN_FADE = {
  fadeMs: 260,
  peakOpacity: 0.45,
} as const;

export type ScreenTransitionStyle = "iris" | "fade";
export type ScreenTransitionOrigin = { x: number; y: number };

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
      "clip-path:circle(0px at 50% 50%)",
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
  /** One-way transition duration in ms (default: 260). */
  fadeMs?: number;
  /**
   * Peak overlay opacity while the map swaps (0–1).
   * Below 1 keeps the world faintly visible — a soft blink instead of a hard cut.
   */
  peakOpacity?: number;
  /** Iris is the default for map travel; fade remains available for custom cuts. */
  style?: ScreenTransitionStyle;
  /** Viewport coordinates for the circle closing around the departure point. */
  closeOrigin?: ScreenTransitionOrigin;
  /** Viewport coordinates for the circle opening at the arrival point. */
  openOrigin?: ScreenTransitionOrigin | (() => ScreenTransitionOrigin);
};

function clampOrigin(origin?: ScreenTransitionOrigin): ScreenTransitionOrigin {
  const width = window.innerWidth || 1;
  const height = window.innerHeight || 1;
  return {
    x: Math.round(Math.min(width, Math.max(0, origin?.x ?? width / 2))),
    y: Math.round(Math.min(height, Math.max(0, origin?.y ?? height / 2))),
  };
}

function circleAt(origin: ScreenTransitionOrigin, radius: string): string {
  return `circle(${radius} at ${origin.x}px ${origin.y}px)`;
}

function waitForClipTransition(
  overlay: HTMLDivElement,
  clipPath: string,
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
      if (event.target !== overlay || event.propertyName !== "clip-path") return;
      finish();
    };
    overlay.addEventListener("transitionend", onEnd);
    overlay.style.transition = `clip-path ${durationMs}ms steps(10, end)`;
    requestAnimationFrame(() => {
      overlay.style.clipPath = clipPath;
    });
    window.setTimeout(finish, durationMs + 60);
  });
}

/** Run a stepped iris by default, or the legacy dim when explicitly requested. */
export async function runScreenFade(
  action: () => void,
  options: ScreenFadeOptions = {},
): Promise<void> {
  const fadeMs = options.fadeMs ?? LIGHT_SCREEN_FADE.fadeMs;
  if ((options.style ?? "iris") === "iris") {
    const overlay = getOverlay();
    const closeOrigin = clampOrigin(options.closeOrigin);

    overlay.style.pointerEvents = "auto";
    overlay.style.transition = "none";
    overlay.style.opacity = "1";
    overlay.style.clipPath = circleAt(closeOrigin, "150vmax");
    // Commit the full-screen circle before snapping it shut.
    await waitForNextPaint();
    await waitForClipTransition(overlay, circleAt(closeOrigin, "0px"), fadeMs);

    action();
    await waitForNextPaint();

    const openOrigin = clampOrigin(
      typeof options.openOrigin === "function"
        ? options.openOrigin()
        : options.openOrigin,
    );
    overlay.style.transition = "none";
    overlay.style.clipPath = circleAt(openOrigin, "0px");
    await waitForNextPaint();
    await waitForClipTransition(overlay, circleAt(openOrigin, "150vmax"), fadeMs);
    overlay.style.pointerEvents = "none";
    overlay.style.opacity = "0";
    return;
  }

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
