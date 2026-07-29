/** Fallback gate length when there are no map assets to probe. */
const DEFAULT_GATE_MS = 1600;
/** Floor so a warm cache / fast CDN still gets a readable brand wipe. */
const MIN_GATE_MS = 1600;
/** Ceiling so a hung image request cannot stall forever. */
const MAX_GATE_MS = 5000;
/** Extra beat after the probe image loads before showing Continue. */
const GATE_DELTA_MS = 280;
const LOGO_CROSSFADE_MS = 420;
const OVERLAY_FADE_MS = 550;
const DEV_REVEAL_MS = 420;
const STYLE_ID = "capybara-loading-style";
const IMAGE_URL_RE = /\.(png|jpe?g|gif|bmp|webp|svg)(\?|#|$)/i;
/**
 * One splash per browser tab session — skip when a mobile WebView remounts
 * the page after switching apps (same tab session, navigation type "navigate").
 * Explicit refresh (navigation type "reload") always shows the gate again.
 */
const SESSION_GATE_KEY = "capybara.loadingGate.completed";

function hasCompletedLoadingGateThisSession(): boolean {
  try {
    return sessionStorage.getItem(SESSION_GATE_KEY) === "1";
  } catch {
    return false;
  }
}

function markLoadingGateCompletedThisSession(): void {
  try {
    sessionStorage.setItem(SESSION_GATE_KEY, "1");
  } catch {
    // Private mode / blocked storage — gate may show again; acceptable.
  }
}

function isReloadNavigation(): boolean {
  try {
    const entries = performance.getEntriesByType("navigation");
    const nav = entries[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === "reload") {
      return true;
    }
  } catch {
    // Fall through to legacy API.
  }
  try {
    // Legacy PerformanceNavigation.TYPE_RELOAD === 1
    return (
      typeof performance !== "undefined" &&
      "navigation" in performance &&
      (performance as Performance & { navigation?: { type?: number } })
        .navigation?.type === 1
    );
  } catch {
    return false;
  }
}

/** Skip remount splash, but always show again after an explicit refresh. */
function shouldSkipLoadingGate(): boolean {
  if (isReloadNavigation()) {
    return false;
  }
  return hasCompletedLoadingGateThisSession();
}

function isE2bHost(hostname: string): boolean {
  // e.g. 3000-xxxx.e2b.dev, *.e2b.app
  return (
    hostname === "e2b.dev" ||
    hostname === "e2b.app" ||
    hostname.endsWith(".e2b.dev") ||
    hostname.endsWith(".e2b.app")
  );
}

function isDevMode(): boolean {
  const host = window.location.hostname;
  const path = window.location.pathname;
  if (path.includes("/workspace/")) {
    return true;
  }
  if (isE2bHost(host)) {
    return true;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
}

function injectLoadingStyles(): void {
  const existing = document.getElementById(STYLE_ID);
  if (existing) {
    existing.remove();
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cpy-loading-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background-color: #0c0c0c;
      color: #ececec;
      /* Google Fonts only ships Geist Pixel at weight 400. Safari is strict about
         weight matching and will fall back to system sans if we request 500/700. */
      font-family: "Geist Pixel", sans-serif;
      font-weight: 400;
      font-synthesis: none;
      opacity: 1;
      transition: opacity ${OVERLAY_FADE_MS}ms ease;
    }

    .cpy-loading-center {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0;
      opacity: 0;
      animation: cpy-loading-fade-in 1s ease forwards;
    }

    .cpy-loading-logo {
      position: relative;
      display: inline-block;
      opacity: 1;
      transform: scale(1);
      transition:
        opacity ${LOGO_CROSSFADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1),
        transform ${LOGO_CROSSFADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .cpy-loading-logo.is-swapping {
      opacity: 0;
      transform: scale(0.985);
      pointer-events: none;
    }

    .cpy-loading-logo-content {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
      width: max-content;
      max-width: min(92vw, 22em);
      box-sizing: border-box;
    }

    .cpy-loading-logo-dim {
      color: #444;
    }

    .cpy-loading-logo-bright {
      color: #fff;
    }

    .cpy-loading-brand {
      margin: 0;
      font-size: clamp(32px, 8vw, 48px);
      font-weight: 400;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      line-height: 1.15;
      text-align: center;
      white-space: normal;
      overflow-wrap: break-word;
      word-break: normal;
      max-width: 100%;
    }

    /* Game title phase: allow long names to wrap instead of overflowing. */
    .cpy-loading-logo.is-title .cpy-loading-logo-content {
      width: min(92vw, 22em);
      max-width: min(92vw, 22em);
    }

    .cpy-loading-subtitle {
      margin: 0;
      font-size: clamp(12px, 2.6vw, 14px);
      letter-spacing: 0.34em;
      text-indent: 0.34em;
      text-transform: uppercase;
      line-height: 1;
      text-align: center;
    }

    .cpy-loading-subtitle:empty {
      display: none;
    }

    /* Game title phase: solid white, no grey base / wipe; also a continue target. */
    .cpy-loading-logo.is-title {
      cursor: pointer;
    }

    .cpy-loading-logo.is-title .cpy-loading-logo-dim {
      visibility: hidden;
    }

    .cpy-loading-logo.is-title .cpy-loading-reveal-mask {
      width: 100% !important;
      transition: none;
    }

    .cpy-loading-logo.is-title .cpy-loading-logo-bright {
      opacity: 1;
      transition: opacity 180ms ease;
    }

    .cpy-loading-logo.is-title:hover .cpy-loading-logo-bright,
    .cpy-loading-logo.is-title:focus-visible .cpy-loading-logo-bright {
      opacity: 0.7;
    }

    .cpy-loading-logo.is-title:focus-visible {
      outline: none;
    }

    .cpy-loading-logo.is-title:active .cpy-loading-logo-bright {
      opacity: 0.55;
    }

    .cpy-loading-reveal-mask {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      width: 0%;
      overflow: hidden;
      transition: width ${MAX_GATE_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    .cpy-loading-status {
      position: absolute;
      bottom: 30px;
      left: 50%;
      transform: translateX(-50%);
      font-family: "Geist Pixel", sans-serif;
      font-size: 12px;
      font-weight: 400;
      font-synthesis: none;
      letter-spacing: 0.02em;
      color: #fff;
      opacity: 0;
      animation: cpy-loading-fade-in 1s ease 0.5s forwards;
    }

    .cpy-loading-status.is-hidden {
      opacity: 0 !important;
      animation: none;
      pointer-events: none;
    }

    /* Bottom Continue CTA — separate from the title card. */
    .cpy-loading-continue {
      position: absolute;
      bottom: 48px;
      left: 50%;
      transform: translateX(-50%);
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: #fff;
      font-family: "Geist Pixel", sans-serif;
      font-size: clamp(14px, 3vw, 16px);
      font-weight: 400;
      font-synthesis: none;
      letter-spacing: 0.28em;
      text-indent: 0.28em;
      text-transform: uppercase;
      line-height: 1;
      cursor: pointer;
      opacity: 0;
      pointer-events: none;
      transition: opacity ${LOGO_CROSSFADE_MS}ms cubic-bezier(0.22, 1, 0.36, 1);
    }

    .cpy-loading-continue.is-visible {
      opacity: 1;
      pointer-events: auto;
    }

    .cpy-loading-continue:hover,
    .cpy-loading-continue:focus-visible {
      opacity: 0.7;
      outline: none;
    }

    .cpy-loading-continue:active {
      opacity: 0.55;
    }

    .cpy-loading-progress {
      position: absolute;
      bottom: 0;
      left: 0;
      width: 100%;
      height: 3px;
      background-color: transparent;
      opacity: 1;
      transition: opacity 300ms ease;
    }

    .cpy-loading-progress.is-complete {
      opacity: 0;
    }

    .cpy-loading-progress-line {
      height: 100%;
      width: 0%;
      background-color: #fff;
      transition: width ${MAX_GATE_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
    }

    @keyframes cpy-loading-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
    }
  `;

  document.head.appendChild(style);
}

interface TitleBlock {
  root: HTMLDivElement;
  brand: HTMLHeadingElement;
  subtitle: HTMLParagraphElement;
}

function createTitleBlock(
  toneClass: "cpy-loading-logo-dim" | "cpy-loading-logo-bright",
  brandText: string,
  subtitleText: string,
): TitleBlock {
  const root = document.createElement("div");
  root.className = `cpy-loading-logo-content ${toneClass}`;

  const brand = document.createElement("h1");
  brand.className = "cpy-loading-brand";
  brand.textContent = brandText;

  const subtitle = document.createElement("p");
  subtitle.className = "cpy-loading-subtitle";
  subtitle.textContent = subtitleText;

  root.appendChild(brand);
  root.appendChild(subtitle);

  return { root, brand, subtitle };
}

interface OverlayElements {
  overlay: HTMLDivElement;
  status: HTMLDivElement;
  logo: HTMLDivElement;
  dim: TitleBlock;
  bright: TitleBlock;
  revealMask: HTMLDivElement;
  progress: HTMLDivElement;
  progressLine: HTMLDivElement;
  continueBtn: HTMLButtonElement;
}

function getGameTitle(): string {
  const fromWindow =
    typeof window.game_title === "string" ? window.game_title.trim() : "";
  if (fromWindow) {
    return fromWindow;
  }
  const fromDocument = document.title?.trim();
  if (fromDocument) {
    return fromDocument;
  }
  return "Game";
}

function createProductionOverlay(): OverlayElements {
  injectLoadingStyles();

  const overlay = document.createElement("div");
  overlay.className = "cpy-loading-overlay";

  const center = document.createElement("div");
  center.className = "cpy-loading-center";

  const logo = document.createElement("div");
  logo.className = "cpy-loading-logo";

  const dim = createTitleBlock("cpy-loading-logo-dim", "Capybara", "Presents");

  const revealMask = document.createElement("div");
  revealMask.className = "cpy-loading-reveal-mask";

  const bright = createTitleBlock(
    "cpy-loading-logo-bright",
    "Capybara",
    "Presents",
  );

  revealMask.appendChild(bright.root);
  logo.appendChild(dim.root);
  logo.appendChild(revealMask);
  center.appendChild(logo);

  const status = document.createElement("div");
  status.className = "cpy-loading-status";
  status.textContent = "www.capybara.build";

  const continueBtn = document.createElement("button");
  continueBtn.type = "button";
  continueBtn.className = "cpy-loading-continue";
  continueBtn.textContent = "Continue";
  continueBtn.setAttribute("aria-label", "Continue");

  const progress = document.createElement("div");
  progress.className = "cpy-loading-progress";

  const progressLine = document.createElement("div");
  progressLine.className = "cpy-loading-progress-line";
  progress.appendChild(progressLine);

  overlay.appendChild(center);
  overlay.appendChild(status);
  overlay.appendChild(continueBtn);
  overlay.appendChild(progress);

  return {
    overlay,
    status,
    logo,
    dim,
    bright,
    revealMask,
    progress,
    progressLine,
    continueBtn,
  };
}

function setLogoCopy(
  dim: TitleBlock,
  bright: TitleBlock,
  brandText: string,
  subtitleText: string,
): void {
  dim.brand.textContent = brandText;
  bright.brand.textContent = brandText;
  dim.subtitle.textContent = subtitleText;
  bright.subtitle.textContent = subtitleText;
}

function waitForTransitionEnd(
  element: HTMLElement,
  propertyName: string,
  fallbackMs: number,
): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) {
        return;
      }
      settled = true;
      element.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === element && event.propertyName === propertyName) {
        finish();
      }
    };
    element.addEventListener("transitionend", onEnd);
    setTimeout(finish, fallbackMs + 40);
  });
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function looksLikeMapData(value: Record<string, unknown>): boolean {
  return (
    Array.isArray(value.walkableBoxes) ||
    Array.isArray(value.masks) ||
    Array.isArray(value.sprites) ||
    Array.isArray(value.mapOverlays) ||
    Array.isArray(value.characterPlacements) ||
    (typeof value.url === "string" && typeof value.name === "string")
  );
}

/** Prefer the first map-shaped entry's top-level `url` (background image). */
function findFirstMapImageUrl(dataFiles: unknown[]): string | null {
  for (const data of dataFiles) {
    if (!data || typeof data !== "object" || Array.isArray(data)) continue;
    const obj = data as Record<string, unknown>;
    if (!looksLikeMapData(obj)) continue;
    const url = obj.url;
    if (typeof url !== "string" || url.length === 0) continue;
    if (IMAGE_URL_RE.test(url) || url.startsWith("http") || url.startsWith("/")) {
      return url;
    }
  }
  return null;
}

function loadImageProbe(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
    if (img.complete && img.naturalWidth > 0) resolve();
  });
}

/**
 * Default gate length, or probe the first map background to approximate
 * connection speed and dismiss shortly after that image is ready.
 */
async function resolveGateDurationMs(dataFiles: unknown[]): Promise<number> {
  if (!Array.isArray(dataFiles) || dataFiles.length === 0) {
    return DEFAULT_GATE_MS;
  }

  const url = findFirstMapImageUrl(dataFiles);
  if (!url) {
    return DEFAULT_GATE_MS;
  }

  const started = performance.now();
  try {
    await loadImageProbe(url);
  } catch {
    return DEFAULT_GATE_MS;
  }

  const elapsed = performance.now() - started;
  return clamp(elapsed + GATE_DELTA_MS, MIN_GATE_MS, MAX_GATE_MS);
}

export const LOADING_GATE_CONTINUE_EVENT = "capybara:loading-gate-continue";

export interface LoadingGateContinueDetail {
  /** True when emitted from a real browser user gesture such as click/tap/key. */
  userActivated: boolean;
}

export type LoadingGateContinueListener = (
  detail: LoadingGateContinueDetail,
) => void;

export interface LoadingGate {
  /**
   * Fires synchronously from the loading gate continue gesture in production.
   * Put browser-gated work such as music.play() or AudioContext.resume()
   * here instead of passive scene startup.
   */
  onContinue(listener: LoadingGateContinueListener): () => void;
  waitForCompletion(): Promise<void>;
  teardown(): void;
}

export function createCoreLoadingGate(
  canvas: HTMLCanvasElement | null,
  options: Record<string, unknown> = {},
): LoadingGate {
  const skipSplash = shouldSkipLoadingGate();

  if (isDevMode()) {
    if (skipSplash) {
      return {
        onContinue: () => () => undefined,
        waitForCompletion: () => Promise.resolve(),
        teardown: () => undefined,
      };
    }

    document.body.style.opacity = "0";
    document.body.style.transition = `opacity ${DEV_REVEAL_MS}ms ease`;

    return {
      onContinue: () => () => undefined,
      waitForCompletion: () => Promise.resolve(),
      teardown: () => {
        markLoadingGateCompletedThisSession();
        requestAnimationFrame(() => {
          document.body.style.opacity = "1";
        });
      },
    };
  }

  // App-switch remounts keep sessionStorage and are not "reload" — skip splash.
  // Explicit refresh is "reload" and shows the gate again via shouldSkipLoadingGate.
  if (skipSplash) {
    return {
      onContinue: (listener) => {
        // No user gesture available; scenes should unlock audio on first input.
        listener({ userActivated: false });
        return () => undefined;
      },
      waitForCompletion: () => Promise.resolve(),
      teardown: () => undefined,
    };
  }

  if (canvas) {
    canvas.style.visibility = "hidden";
  }

  const {
    overlay,
    status,
    logo,
    dim,
    bright,
    revealMask,
    progress,
    progressLine,
    continueBtn,
  } = createProductionOverlay();
  document.body.appendChild(overlay);

  let isResolved = false;
  let hasEmittedContinue = false;
  let resolvePromise!: () => void;
  const completionPromise = new Promise<void>((resolve) => {
    resolvePromise = resolve;
  });
  const continueListeners = new Set<LoadingGateContinueListener>();

  const emitContinueIfNeeded = (detail: LoadingGateContinueDetail) => {
    if (hasEmittedContinue) {
      return;
    }
    hasEmittedContinue = true;
    if (detail.userActivated) {
      markLoadingGateCompletedThisSession();
    }
    for (const listener of continueListeners) {
      listener(detail);
    }
    window.dispatchEvent(
      new CustomEvent<LoadingGateContinueDetail>(LOADING_GATE_CONTINUE_EVENT, {
        detail,
      }),
    );
  };

  const resolveIfNeeded = () => {
    if (isResolved) {
      return;
    }
    isResolved = true;
    resolvePromise();
  };

  const enableContinue = () => {
    const onContinue = () => {
      emitContinueIfNeeded({ userActivated: true });
      resolveIfNeeded();
    };

    // Both game title and bottom Continue dismiss the gate.
    logo.setAttribute("role", "button");
    logo.setAttribute("tabindex", "0");
    logo.setAttribute("aria-label", "Continue");

    for (const target of [logo, continueBtn] as HTMLElement[]) {
      target.addEventListener("click", onContinue, { once: true });
      target.addEventListener(
        "keydown",
        (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onContinue();
          }
        },
        { once: true },
      );
    }
  };

  /**
   * 1. Capybara presents + letter wipe + progress bar (full load)
   * 2. When bar ends → opacity to game title (center)
   * 3. Continue button fades in at the bottom
   * 4. Clicking either the game title or Continue proceeds
   */
  const showTitleAndContinue = async () => {
    progress.classList.add("is-complete");
    status.classList.add("is-hidden");

    logo.classList.add("is-swapping");
    await waitForTransitionEnd(logo, "opacity", LOGO_CROSSFADE_MS);

    setLogoCopy(dim, bright, getGameTitle(), "");
    revealMask.style.transition = "none";
    revealMask.style.width = "100%";
    logo.classList.add("is-title");

    await nextFrame();
    logo.classList.remove("is-swapping");
    await waitForTransitionEnd(logo, "opacity", LOGO_CROSSFADE_MS);

    continueBtn.classList.add("is-visible");
    enableContinue();
  };

  setTimeout(() => {
    progressLine.style.width = "100%";
    revealMask.style.width = "100%";
  }, 50);

  const dataFiles = Array.isArray(options.dataFiles)
    ? (options.dataFiles as unknown[])
    : [];
  const gateStarted = performance.now();

  void (async () => {
    const targetMs = await resolveGateDurationMs(dataFiles);
    const elapsed = performance.now() - gateStarted;
    const remaining = Math.max(0, targetMs - elapsed);

    // Finish the wipe on the remaining budget (or snap if already due).
    const finishMs = Math.max(80, remaining);
    const wipeEasing = "cubic-bezier(0.4, 0, 0.2, 1)";
    progressLine.style.transition = `width ${finishMs}ms ${wipeEasing}`;
    revealMask.style.transition = `width ${finishMs}ms ${wipeEasing}`;
    progressLine.style.width = "100%";
    revealMask.style.width = "100%";

    await sleep(remaining);
    await showTitleAndContinue();
  })();

  return {
    onContinue: (listener) => {
      continueListeners.add(listener);
      return () => {
        continueListeners.delete(listener);
      };
    },
    waitForCompletion: () => completionPromise,
    teardown: () => {
      resolveIfNeeded();

      if (canvas) {
        canvas.style.visibility = "visible";
      }

      requestAnimationFrame(() => {
        overlay.style.opacity = "0";
      });

      setTimeout(() => {
        overlay.remove();
      }, OVERLAY_FADE_MS + 20);
    },
  };
}
