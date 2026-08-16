import {
  isTypewriterSoundCharacter,
  playTypewriterBlip,
  playTypewriterStartClip,
  typewriterCharacterCount,
} from "./typewriter";

const STYLE_ID = "capybara-opening-intro-style";
const HANDOFF_MS = 580;
const CARD_FADE_MS = 180;
const WORLD_REVEAL_MS = 720;
const TYPE_CHARACTER_MS = 32;

export type OpeningIntroConfig = {
  /** One short sentence per card. An empty list disables the intro. */
  storyCards?: string[];
};

export type OpeningIntro = {
  /** Mount the black layer before the loading gate fades away. */
  prepare(): void;
  /** Play every card, then reveal the already-loaded world. */
  play(): Promise<void>;
};

function injectStyles(): void {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .cpy-opening-intro {
      position: fixed;
      inset: 0;
      z-index: 9998;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      padding: max(28px, env(safe-area-inset-top)) max(28px, env(safe-area-inset-right)) max(28px, env(safe-area-inset-bottom)) max(28px, env(safe-area-inset-left));
      background: #0c0c0c;
      color: #ececec;
      font-family: "Geist Pixel", "Geist Mono", monospace;
      font-weight: 400;
      font-synthesis: none;
      font-feature-settings: "liga" 0, "calt" 0;
      opacity: 1;
      transition: opacity ${WORLD_REVEAL_MS}ms ease;
      will-change: opacity;
      cursor: pointer;
      -webkit-user-select: none;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    .cpy-opening-intro.is-revealing-world {
      opacity: 0;
      pointer-events: none;
    }

    .cpy-opening-intro-card {
      position: relative;
      width: min(560px, 78vw);
      min-height: 7em;
      display: flex;
      align-items: center;
      opacity: 0;
      transition: opacity ${CARD_FADE_MS}ms steps(4, end);
    }

    .cpy-opening-intro-card.is-visible {
      opacity: 1;
    }

    .cpy-opening-intro-text {
      margin: 0;
      font-size: clamp(15px, 2.4vw, 20px);
      line-height: 1.5;
      letter-spacing: 0.01em;
      white-space: pre-wrap;
      text-wrap: pretty;
    }

    .cpy-opening-intro-continue {
      position: absolute;
      right: 0;
      bottom: 0;
      width: 0;
      height: 0;
      border-left: 6px solid transparent;
      border-right: 6px solid transparent;
      border-top: 7px solid #ececec;
      opacity: 0;
      animation: cpy-opening-intro-pulse 900ms steps(2, end) infinite;
    }

    .cpy-opening-intro-continue.is-visible {
      opacity: 1;
    }

    .cpy-opening-intro-skip {
      position: absolute;
      top: max(22px, env(safe-area-inset-top));
      right: max(24px, env(safe-area-inset-right));
      margin: 0;
      padding: 8px;
      border: 0;
      background: transparent;
      color: #a0a0a0;
      font: inherit;
      font-size: 12px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      cursor: pointer;
    }

    .cpy-opening-intro-skip:hover,
    .cpy-opening-intro-skip:focus-visible {
      color: #ececec;
      outline: 1px solid #ececec;
      outline-offset: 2px;
    }

    @keyframes cpy-opening-intro-pulse {
      0%, 49% { transform: translateY(0); }
      50%, 100% { transform: translateY(2px); }
    }

    @media (prefers-reduced-motion: reduce) {
      .cpy-opening-intro,
      .cpy-opening-intro-card {
        transition-duration: 1ms;
      }

      .cpy-opening-intro-continue {
        animation: none;
      }
    }
  `;
  document.head.appendChild(style);
}

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function waitForPixelFont(): Promise<void> {
  if (!document.fonts) return;
  try {
    await Promise.race([
      document.fonts.load('400 16px "Geist Pixel"'),
      wait(1200),
    ]);
  } catch {
    // The monospace fallback still preserves the intro layout offline.
  }
}

function waitForOpacity(element: HTMLElement, durationMs: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      element.removeEventListener("transitionend", onEnd);
      resolve();
    };
    const onEnd = (event: TransitionEvent) => {
      if (event.target === element && event.propertyName === "opacity") finish();
    };
    element.addEventListener("transitionend", onEnd);
    window.setTimeout(finish, durationMs + 50);
  });
}

export function createOpeningIntro(config: OpeningIntroConfig): OpeningIntro {
  const cards = Array.isArray(config.storyCards)
    ? config.storyCards.filter(
        (card): card is string => typeof card === "string" && card.trim().length > 0,
      )
    : [];

  let overlay: HTMLDivElement | null = null;
  let card: HTMLDivElement | null = null;
  let text: HTMLParagraphElement | null = null;
  let continueMark: HTMLDivElement | null = null;
  let skipped = false;
  let prepared = false;
  let revealCurrent: (() => void) | null = null;
  let advanceCurrent: (() => void) | null = null;

  const prepare = () => {
    if (prepared || cards.length === 0) return;
    prepared = true;
    injectStyles();

    overlay = document.createElement("div");
    overlay.className = "cpy-opening-intro";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Story introduction");

    card = document.createElement("div");
    card.className = "cpy-opening-intro-card";

    text = document.createElement("p");
    text.className = "cpy-opening-intro-text";
    text.setAttribute("aria-live", "polite");

    continueMark = document.createElement("div");
    continueMark.className = "cpy-opening-intro-continue";
    continueMark.setAttribute("aria-hidden", "true");

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "cpy-opening-intro-skip";
    skip.textContent = "Skip";
    skip.addEventListener("click", (event) => {
      event.stopPropagation();
      skipped = true;
      revealCurrent?.();
      advanceCurrent?.();
    });

    card.append(text, continueMark);
    overlay.append(card, skip);
    document.body.appendChild(overlay);
  };

  const revealText = (value: string): Promise<void> => {
    if (!text) return Promise.resolve();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      text.textContent = value;
      return Promise.resolve();
    }

    playTypewriterStartClip();

    return new Promise((resolve) => {
      const startedAt = performance.now();
      let lastRevealedCount = 0;
      let frame = 0;
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        cancelAnimationFrame(frame);
        if (text) text.textContent = value;
        revealCurrent = null;
        resolve();
      };
      revealCurrent = finish;
      const draw = (now: number) => {
        if (!text || finished) return;
        const count = typewriterCharacterCount(
          value,
          now - startedAt,
          TYPE_CHARACTER_MS,
        );
        const newlyRevealed = count - lastRevealedCount;
        if (newlyRevealed > 0 && newlyRevealed <= 4) {
          const newCharacters = value.slice(lastRevealedCount, count);
          for (let index = newCharacters.length - 1; index >= 0; index -= 1) {
            if (isTypewriterSoundCharacter(newCharacters[index])) {
              playTypewriterBlip(470);
              break;
            }
          }
        }
        lastRevealedCount = count;
        text.textContent = value.slice(0, count);
        if (count >= value.length) {
          finish();
          return;
        }
        frame = requestAnimationFrame(draw);
      };
      frame = requestAnimationFrame(draw);
    });
  };

  const showCard = async (value: string) => {
    if (!card || !text || !continueMark) return;
    text.textContent = "";
    continueMark.classList.remove("is-visible");
    card.classList.add("is-visible");
    await revealText(value);
    if (skipped) return;

    continueMark.classList.add("is-visible");
    await new Promise<void>((resolve) => {
      advanceCurrent = resolve;
    });
    advanceCurrent = null;
    continueMark.classList.remove("is-visible");
    card.classList.remove("is-visible");
    await wait(CARD_FADE_MS);
  };

  const advance = () => {
    if (revealCurrent) {
      revealCurrent();
      return;
    }
    advanceCurrent?.();
  };

  const play = async () => {
    if (cards.length === 0) return;
    prepare();
    if (!overlay) return;
    await waitForPixelFont();

    const onClick = () => advance();
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== "Enter" &&
        event.code !== "Space" &&
        event.code !== "KeyE"
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (!event.repeat) advance();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (
        event.code === "Enter" ||
        event.code === "Space" ||
        event.code === "KeyE"
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    overlay.addEventListener("click", onClick);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);

    await wait(HANDOFF_MS);
    for (const storyCard of cards) {
      if (skipped) break;
      await showCard(storyCard.trim());
    }

    revealCurrent = null;
    advanceCurrent = null;
    overlay.removeEventListener("click", onClick);
    window.removeEventListener("keydown", onKeyDown, true);
    window.removeEventListener("keyup", onKeyUp, true);

    await nextPaint();
    overlay.classList.add("is-revealing-world");
    await waitForOpacity(overlay, WORLD_REVEAL_MS);
    overlay.remove();
    overlay = null;
  };

  return { prepare, play };
}
