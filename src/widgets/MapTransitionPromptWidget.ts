import type { Widget } from "../core/WidgetManager";
import type { WidgetMountOptions } from "../types/UiState";

/** Resource written by bootstrap proximity system. */
export const MAP_TRANSITION_PROMPT_RESOURCE = "mapTransitionPrompt";

export type MapTransitionPromptState = {
  active: boolean;
  /** Short destination / door label (e.g. map name). */
  label: string;
  /** Full prompt line shown above the zone. */
  promptText: string;
  /** Enterable footprint in normalized map space. */
  bounds: { x1: number; y1: number; x2: number; y2: number } | null;
};

export function createEmptyMapTransitionPromptState(): MapTransitionPromptState {
  return {
    active: false,
    label: "",
    promptText: "",
    bounds: null,
  };
}

function getPromptState(game: {
  getResource<T = unknown>(name: string): T;
}): MapTransitionPromptState | null {
  try {
    return game.getResource<MapTransitionPromptState>(
      MAP_TRANSITION_PROMPT_RESOURCE,
    );
  } catch {
    return null;
  }
}

function canvasLocalToHudLocal(
  canvasLocal: { x: number; y: number },
  canvas: HTMLCanvasElement,
  hudRoot: HTMLElement,
): { x: number; y: number } {
  const canvasRect = canvas.getBoundingClientRect();
  const hudRect = hudRoot.getBoundingClientRect();
  return {
    x: canvasLocal.x + canvasRect.left - hudRect.left,
    y: canvasLocal.y + canvasRect.top - hudRect.top,
  };
}

function revealText(fullText: string, startedAt: number, now: number): string {
  if (!fullText) return "";
  // Fast reveal for short gameplay prompts.
  const charsPerSecond = 64;
  const visibleChars = Math.max(
    1,
    Math.floor(((now - startedAt) / 1000) * charsPerSecond),
  );
  return fullText.slice(0, Math.min(fullText.length, visibleChars));
}

function isTouchPrimaryDevice(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0
  );
}

/**
 * World-aligned enterable-zone affordance: soft floor glow + "Press E to enter"
 * (or tap on touch) prompt. Non-interactive — does not block movement.
 */
export function createMapTransitionPromptWidget(
  options?: WidgetMountOptions,
): Widget {
  let root: HTMLDivElement | null = null;
  let glowEl: HTMLDivElement | null = null;
  let promptEl: HTMLDivElement | null = null;
  let keyBadgeEl: HTMLSpanElement | null = null;
  let textEl: HTMLSpanElement | null = null;
  let lastFullText = "";
  let revealStartedAt = 0;

  return {
    id: "map-transition-prompt",
    zIndex: 40,
    ...(options?.ui ? { ui: options.ui } : {}),
    isInteractive: () => false,
    isVisible: ({ game }) => {
      const state = getPromptState(
        game as { getResource<T = unknown>(name: string): T },
      );
      return Boolean(state?.active && state.bounds);
    },
    mount: () => {
      root = document.createElement("div");
      root.className = "absolute inset-0 pointer-events-none overflow-hidden";

      glowEl = document.createElement("div");
      glowEl.className =
        "absolute left-0 top-0 opacity-0 will-change-[transform,opacity]";

      const glowInner = document.createElement("div");
      glowInner.className = "capy-glow-pool h-full w-full";
      glowEl.appendChild(glowInner);

      promptEl = document.createElement("div");
      promptEl.className = [
        "absolute left-0 top-0 flex max-w-[min(280px,calc(100vw-24px))] items-center gap-2",
        "capy-panel capy-fade px-3 py-2",
        "font-['Geist Pixel',_sans-serif]",
        "opacity-0 will-change-[transform,opacity]",
      ].join(" ");

      keyBadgeEl = document.createElement("span");
      keyBadgeEl.className = [
        "capy-key inline-flex min-w-[1.6rem] items-center justify-center",
        "px-1.5 py-0.5 text-[11px] font-normal tracking-wide",
      ].join(" ");
      keyBadgeEl.textContent = "E";

      textEl = document.createElement("span");
      textEl.className = "capy-text text-[13px] font-normal leading-snug";

      promptEl.append(keyBadgeEl, textEl);
      root.append(glowEl, promptEl);

      return root;
    },
    update: ({ game, hudRoot, canvas, now }) => {
      if (!root || !glowEl || !promptEl || !textEl || !keyBadgeEl) return;

      const state = getPromptState(
        game as { getResource<T = unknown>(name: string): T },
      );
      if (!state?.active || !state.bounds) {
        glowEl.style.opacity = "0";
        promptEl.style.opacity = "0";
        return;
      }

      const { x1, y1, x2, y2 } = state.bounds;
      const topLeft = canvasLocalToHudLocal(
        game.normalizedToCanvasPoint(x1, y1),
        canvas,
        hudRoot,
      );
      const bottomRight = canvasLocalToHudLocal(
        game.normalizedToCanvasPoint(x2, y2),
        canvas,
        hudRoot,
      );

      const left = Math.min(topLeft.x, bottomRight.x);
      const top = Math.min(topLeft.y, bottomRight.y);
      const width = Math.max(24, Math.abs(bottomRight.x - topLeft.x));
      const height = Math.max(18, Math.abs(bottomRight.y - topLeft.y));
      // Soft pad so the glow reads as a floor halo under the door, not a tight box.
      const padX = width * 0.35;
      const padY = height * 0.55;
      const glowW = width + padX * 2;
      const glowH = Math.max(height * 0.7, height + padY);
      const glowX = left - padX;
      const glowY = top + height - glowH * 0.55;

      glowEl.style.width = `${Math.round(glowW)}px`;
      glowEl.style.height = `${Math.round(glowH)}px`;
      glowEl.style.transform = `translate3d(${Math.round(glowX)}px, ${Math.round(glowY)}px, 0)`;
      glowEl.style.opacity = "1";

      const touch = isTouchPrimaryDevice();
      keyBadgeEl.textContent = "E";
      const fullText =
        state.promptText ||
        (touch
          ? `Tap E to enter${state.label ? `: ${state.label}` : ""}`
          : `Press E to enter${state.label ? `: ${state.label}` : ""}`);

      if (lastFullText !== fullText) {
        lastFullText = fullText;
        revealStartedAt = now;
      }
      textEl.textContent = revealText(fullText, revealStartedAt, now);

      const promptW = promptEl.offsetWidth || 200;
      const promptH = promptEl.offsetHeight || 40;
      const centerX = left + width / 2;
      let promptX = centerX - promptW / 2;
      let promptY = top - promptH - 14;
      const hudW = hudRoot.clientWidth || window.innerWidth;
      const hudH = hudRoot.clientHeight || window.innerHeight;
      const margin = 8;
      if (promptY < margin) promptY = top + height + 10;
      promptX = Math.min(
        Math.max(margin, promptX),
        Math.max(margin, hudW - promptW - margin),
      );
      promptY = Math.min(
        Math.max(margin, promptY),
        Math.max(margin, hudH - promptH - margin),
      );

      promptEl.style.transform = `translate3d(${Math.round(promptX)}px, ${Math.round(promptY)}px, 0)`;
      promptEl.style.opacity = "1";
    },
  };
}
