const ANIMATION_DURATION_MS = 5000;
const LOGO_CROSSFADE_MS = 420;
const OVERLAY_FADE_MS = 550;
const DEV_REVEAL_MS = 420;
const STYLE_ID = "capybara-loading-style";

function isDevMode(): boolean {
  const host = window.location.hostname;
  const path = window.location.pathname;
  if (path.includes("/workspace/")) {
    return true;
  }
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0";
}

function injectLoadingStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
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
    }

    .cpy-loading-subtitle {
      margin: 0;
      font-size: clamp(12px, 2.6vw, 14px);
      letter-spacing: 0.34em;
      text-indent: 0.34em;
      text-transform: uppercase;
      line-height: 1;
    }

    .cpy-loading-subtitle:empty {
      display: none;
    }

    /* Continue is solid white — no dim grey base, no second wipe. */
    .cpy-loading-logo.is-continue {
      cursor: pointer;
    }

    .cpy-loading-logo.is-continue .cpy-loading-logo-dim {
      visibility: hidden;
    }

    .cpy-loading-logo.is-continue .cpy-loading-reveal-mask {
      position: relative;
      width: 100% !important;
      transition: none;
    }

    .cpy-loading-logo.is-continue .cpy-loading-logo-bright {
      opacity: 1;
      transition: opacity 180ms ease;
    }

    .cpy-loading-logo.is-continue:hover .cpy-loading-logo-bright,
    .cpy-loading-logo.is-continue:focus-visible .cpy-loading-logo-bright {
      opacity: 0.7;
    }

    .cpy-loading-logo.is-continue:focus-visible {
      outline: none;
    }

    .cpy-loading-logo.is-continue:active .cpy-loading-logo-bright {
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

  const progress = document.createElement("div");
  progress.className = "cpy-loading-progress";

  const progressLine = document.createElement("div");
  progressLine.className = "cpy-loading-progress-line";
  progress.appendChild(progressLine);

  overlay.appendChild(center);
  overlay.appendChild(status);
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

  const { overlay, logo, dim, bright, revealMask, progress, progressLine } =
    createProductionOverlay();
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
    logo.classList.add("is-continue");
    logo.setAttribute("role", "button");
    logo.setAttribute("tabindex", "0");
    logo.setAttribute("aria-label", "Continue");

    const onContinue = () => {
      emitContinueIfNeeded({ userActivated: true });
      resolveIfNeeded();
    };

    logo.addEventListener("click", onContinue, { once: true });
    logo.addEventListener(
      "keydown",
      (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onContinue();
        }
      },
      { once: true },
    );
  };

  const showContinuePrompt = async () => {
    progress.classList.add("is-complete");

    // Fade out title card, swap to solid white "Continue", fade it in.
    logo.classList.add("is-swapping");
    await waitForTransitionEnd(logo, "opacity", LOGO_CROSSFADE_MS);

    setLogoCopy(dim, bright, "Continue", "");
    revealMask.style.transition = "none";
    revealMask.style.width = "100%";
    logo.classList.add("is-continue");

    // Next frame so the browser paints the new copy before fading in.
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => resolve());
    });

    logo.classList.remove("is-swapping");
    await waitForTransitionEnd(logo, "opacity", LOGO_CROSSFADE_MS);

    enableContinue();
  };

  setTimeout(() => {
    progressLine.style.width = "100%";
    revealMask.style.width = "100%";
  }, 50);

  setTimeout(() => {
    void showContinuePrompt();
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
