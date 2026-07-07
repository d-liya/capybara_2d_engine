const ANIMATION_DURATION_MS = 5000;
const OVERLAY_FADE_MS = 550;
const DEV_REVEAL_MS = 420;
const STYLE_ID = "capybara-loading-style";
const MASCOT_URL =
  "https://www.capybara.build/_next/image?url=%2Fmascot-capybara.png&w=1920&q=75";

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
      font-family: "Bebas Neue", cursive;
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
      gap: 20px;
      opacity: 0;
      animation: cpy-loading-fade-in 1s ease forwards;
    }

    .cpy-loading-mascot {
      width: min(220px, 42vw);
      height: auto;
      display: block;
      object-fit: contain;
      user-select: none;
      pointer-events: none;
    }

    .cpy-loading-logo {
      position: relative;
      display: inline-block;
    }

    .cpy-loading-logo-content {
      display: flex;
      align-items: center;
      gap: 15px;
      width: max-content;
    }

    .cpy-loading-logo-dim {
      color: #444;
    }

    .cpy-loading-logo-bright {
      color: #fff;
    }

    .cpy-loading-brand {
      font-size: 28px;
      font-weight: 500;
      letter-spacing: -0.5px;
    }

    .cpy-loading-logo.is-continue {
      cursor: pointer;
    }

    .cpy-loading-logo.is-continue .cpy-loading-brand {
      transition: opacity 180ms ease;
    }

    .cpy-loading-logo.is-continue:active .cpy-loading-brand {
      opacity: 0.75;
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
      font-family: "Geist", sans-serif;
      font-size: 12px;
      font-weight: 400;
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

interface OverlayElements {
  overlay: HTMLDivElement;
  status: HTMLDivElement;
  logo: HTMLDivElement;
  brand: HTMLHeadingElement;
  brightBrand: HTMLHeadingElement;
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

  const mascot = document.createElement("img");
  mascot.className = "cpy-loading-mascot";
  mascot.src = MASCOT_URL;
  mascot.alt = "Capybara mascot";
  mascot.decoding = "async";
  center.appendChild(mascot);

  const logo = document.createElement("div");
  logo.className = "cpy-loading-logo";

  const dim = document.createElement("div");
  dim.className = "cpy-loading-logo-content cpy-loading-logo-dim";

  const brand = document.createElement("h1");
  brand.className = "cpy-loading-brand";
  brand.textContent = "Capybara";
  dim.appendChild(brand);

  const revealMask = document.createElement("div");
  revealMask.className = "cpy-loading-reveal-mask";

  const bright = document.createElement("div");
  bright.className = "cpy-loading-logo-content cpy-loading-logo-bright";

  const brightBrand = document.createElement("h1");
  brightBrand.className = "cpy-loading-brand";
  brightBrand.textContent = "Capybara";
  bright.appendChild(brightBrand);

  revealMask.appendChild(bright);
  logo.appendChild(dim);
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
    brand,
    brightBrand,
    revealMask,
    progress,
    progressLine,
  };
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

  const { overlay, logo, brand, brightBrand, revealMask, progress, progressLine } =
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

  const showContinuePrompt = () => {
    progress.classList.add("is-complete");
    brand.textContent = "Tap To Continue";
    brightBrand.textContent = "Tap To Continue";
    logo.classList.add("is-continue");
    logo.setAttribute("role", "button");
    logo.setAttribute("tabindex", "0");
    logo.setAttribute("aria-label", "Tap to continue");

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

  setTimeout(() => {
    progressLine.style.width = "100%";
    revealMask.style.width = "100%";
  }, 50);

  setTimeout(showContinuePrompt, ANIMATION_DURATION_MS);

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
