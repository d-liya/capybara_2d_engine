const OVERLAY_ID = "capybara-screen-fade";

function getOverlay(): HTMLDivElement {
  let overlay = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = [
      "position:fixed",
      "inset:0",
      "z-index:9000",
      "background:#000",
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
    overlay.style.transition = `opacity ${durationMs}ms ease-in-out`;
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

/** Fade to black, run work, then fade back in. */
export async function runScreenFade(
  action: () => void,
  options: { fadeMs?: number } = {},
): Promise<void> {
  const fadeMs = options.fadeMs ?? 400;
  const overlay = getOverlay();

  overlay.style.pointerEvents = "auto";
  await waitForOpacityTransition(overlay, 1, fadeMs);

  action();
  await waitForNextPaint();

  await waitForOpacityTransition(overlay, 0, fadeMs);
  overlay.style.pointerEvents = "none";
}
