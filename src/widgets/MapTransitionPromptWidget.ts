import type { Widget } from "../core/WidgetManager";
import type { WidgetMountOptions } from "../types/UiState";
import { typewriterCharacterCount } from "../utils/typewriter";

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
  const visibleChars = typewriterCharacterCount(fullText, now - startedAt, 16);
  return fullText.slice(0, visibleChars);
}

function isTouchPrimaryDevice(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0
  );
}

/**
 * World-aligned enterable-zone affordance: a crisp location label and compact
 * key cue. Non-interactive — it never blocks movement.
 */
export function createMapTransitionPromptWidget(
  options?: WidgetMountOptions,
): Widget {
  let root: HTMLDivElement | null = null;
  let promptEl: HTMLDivElement | null = null;
  let locationEl: HTMLDivElement | null = null;
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

      promptEl = document.createElement("div");
      promptEl.className = [
        "absolute left-0 top-0 flex max-w-[min(280px,calc(100vw-24px))] flex-col items-center gap-1",
        "capy-fade px-2 py-1",
        "font-['Geist Pixel',_sans-serif]",
        "opacity-0 will-change-[transform,opacity]",
      ].join(" ");

      locationEl = document.createElement("div");
      locationEl.className = "capy-world-label text-center text-[13px] leading-tight";

      keyBadgeEl = document.createElement("span");
      keyBadgeEl.className = [
        "capy-world-key text-[11px] font-normal tracking-wide",
      ].join(" ");
      keyBadgeEl.textContent = "E";

      textEl = document.createElement("span");
      textEl.className = "capy-world-action text-[15px] font-normal leading-snug";

      const actionEl = document.createElement("div");
      actionEl.className = "flex items-center gap-2";
      const arrowEl = document.createElement("div");
      arrowEl.className = "capy-world-arrow";
      actionEl.append(keyBadgeEl, textEl);
      promptEl.append(locationEl, actionEl, arrowEl);
      root.append(promptEl);

      return root;
    },
    update: ({ game, hudRoot, canvas, now }) => {
      if (!root || !promptEl || !locationEl || !textEl || !keyBadgeEl) return;

      const state = getPromptState(
        game as { getResource<T = unknown>(name: string): T },
      );
      if (!state?.active || !state.bounds) {
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
      const touch = isTouchPrimaryDevice();
      keyBadgeEl.textContent = touch ? "Tap" : "E";
      locationEl.textContent = state.label;
      locationEl.hidden = !state.label;
      const fullText =
        state.promptText || "Enter";

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
