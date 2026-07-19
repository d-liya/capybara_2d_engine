const ANIMATION_DURATION_MS = 5000;
const LOGO_CROSSFADE_MS = 420;
const OVERLAY_FADE_MS = 550;
const DEV_REVEAL_MS = 420;
const STYLE_ID = "capybara-loading-style";

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
      line-height: 1;
      text-align: center;
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
      transition: width ${ANIMATION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
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
      transition: width ${ANIMATION_DURATION_MS}ms cubic-bezier(0.4, 0, 0.2, 1);
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
  if (isDevMode()) {
    document.body.style.opacity = "0";
    document.body.style.transition = `opacity ${DEV_REVEAL_MS}ms ease`;

    return {
      onContinue: () => () => undefined,
      waitForCompletion: () => Promise.resolve(),
      teardown: () => {
        requestAnimationFrame(() => {
          document.body.style.opacity = "1";
        });
      },
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

  setTimeout(() => {
    void showTitleAndContinue();
  }, ANIMATION_DURATION_MS);

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
