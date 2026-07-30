import type { Widget } from "../core/WidgetManager";
import type { HoverTarget } from "../core/HoverTypes";

function resolveTooltipTitle(target: HoverTarget): string {
  const tooltip = target.tooltip;
  if (tooltip && typeof tooltip !== "string" && tooltip.title)
    return tooltip.title;
  return target.label || (typeof tooltip === "string" ? tooltip : "");
}

function resolveTooltipBody(_target: HoverTarget): string {
  // Labels only — hide description/body text from hover tooltips.
  return "";
}

/**
 * `normalizedToCanvasPoint` returns CSS pixels relative to the canvas origin
 * (not the viewport). Convert into coordinates relative to the HUD root so
 * absolute-positioned widgets line up with the painted world.
 */
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

function anchorForTarget(
  target: HoverTarget,
  game: {
    normalizedToCanvasPoint?: (
      x: number,
      y: number,
    ) => { x: number; y: number };
  },
  canvas: HTMLCanvasElement,
  hudRoot: HTMLElement,
): { x: number; y: number } | null {
  if (typeof game.normalizedToCanvasPoint !== "function") return null;

  const bounds = target.bounds;
  let canvasLocal: { x: number; y: number } | null = null;
  if (bounds) {
    canvasLocal = game.normalizedToCanvasPoint(
      (Number(bounds.x1) + Number(bounds.x2)) / 2,
      Number(bounds.y1),
    );
  } else if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
    canvasLocal = game.normalizedToCanvasPoint(
      Number(target.x),
      Number(target.y),
    );
  }

  if (!canvasLocal) return null;
  return canvasLocalToHudLocal(canvasLocal, canvas, hudRoot);
}

export function createTooltipWidget(): Widget {
  let root: HTMLDivElement | null = null;
  let cardEl: HTMLDivElement | null = null;
  let titleEl: HTMLDivElement | null = null;
  let bodyEl: HTMLDivElement | null = null;

  const renderTarget = (
    target: HoverTarget | null,
    hudRoot: HTMLElement,
    canvas: HTMLCanvasElement,
    game: {
      normalizedToCanvasPoint?: (
        x: number,
        y: number,
      ) => { x: number; y: number };
    },
  ) => {
    if (!root || !cardEl || !titleEl || !bodyEl) return;

    if (!target) {
      cardEl.style.opacity = "0";
      return;
    }

    const title = resolveTooltipTitle(target);
    const body = resolveTooltipBody(target);
    if (!title && !body) {
      cardEl.style.opacity = "0";
      return;
    }

    titleEl.textContent = title;
    bodyEl.textContent = body;
    bodyEl.hidden = !body;

    const hudRect = hudRoot.getBoundingClientRect();
    const anchor = anchorForTarget(target, game, canvas, hudRoot);
    // clientX/clientY are already viewport coords — only those need hud offset.
    const fallbackX =
      target.clientX !== undefined
        ? target.clientX - hudRect.left
        : hudRect.width / 2;
    const fallbackY =
      target.clientY !== undefined
        ? target.clientY - hudRect.top
        : hudRect.height / 2;
    const anchorX = anchor ? anchor.x : fallbackX;
    const anchorY = anchor ? anchor.y : fallbackY;

    // Make sure dimensions are current before clamping.
    const width = root.offsetWidth || 220;
    const height = root.offsetHeight || 52;
    const gap = 14;
    const margin = 8;

    let x = anchorX - width / 2;
    let y = anchorY - height - gap;

    // If there is no room above, put it below the target/pointer.
    if (y < margin) y = anchorY + gap;

    x = Math.min(
      Math.max(margin, x),
      Math.max(margin, hudRect.width - width - margin),
    );
    y = Math.min(
      Math.max(margin, y),
      Math.max(margin, hudRect.height - height - margin),
    );

    root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
    cardEl.style.opacity = "1";
  };

  return {
    id: "tooltip",
    zIndex: 500,
    isVisible: () => true,
    isInteractive: () => false,
    mount: () => {
      root = document.createElement("div");
      root.className = [
        "absolute left-0 top-0 pointer-events-none max-w-[calc(100vw-24px)]",
        "font-['Geist Pixel',_sans-serif] will-change-transform",
      ].join(" ");
      root.style.transform = "translate3d(0, 0, 0)";

      cardEl = document.createElement("div");
      cardEl.className = [
        "capy-panel capy-fade px-3 py-2",
        "opacity-0 will-change-[opacity]",
      ].join(" ");

      titleEl = document.createElement("div");
      titleEl.className = "capy-text text-sm font-bold leading-tight";

      bodyEl = document.createElement("div");
      bodyEl.className =
        "capy-text-dim mt-1 text-xs font-medium leading-snug";

      cardEl.append(titleEl, bodyEl);
      root.append(cardEl);
      return root;
    },
    update: ({ game, hudRoot, canvas }) => {
      const target =
        typeof game.getCurrentHoverTarget === "function"
          ? game.getCurrentHoverTarget()
          : null;
      renderTarget(
        target,
        hudRoot,
        canvas,
        game as {
          normalizedToCanvasPoint?: (
            x: number,
            y: number,
          ) => { x: number; y: number };
        },
      );
    },
  };
}
