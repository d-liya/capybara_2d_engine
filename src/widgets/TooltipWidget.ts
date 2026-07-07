import type { Widget } from "../core/WidgetManager";
import type { HoverTarget } from "../core/HoverTypes";

function resolveTooltipTitle(target: HoverTarget): string {
  const tooltip = target.tooltip;
  if (tooltip && typeof tooltip !== "string" && tooltip.title)
    return tooltip.title;
  return target.label || (typeof tooltip === "string" ? tooltip : "");
}

function resolveTooltipBody(target: HoverTarget): string {
  const tooltip = target.tooltip;
  if (tooltip && typeof tooltip !== "string" && tooltip.body)
    return tooltip.body;
  return "";
}

function anchorForTarget(
  target: HoverTarget,
  game: {
    normalizedToCanvasPoint?: (
      x: number,
      y: number,
    ) => { x: number; y: number };
  },
): { x: number; y: number } | null {
  if (typeof game.normalizedToCanvasPoint !== "function") return null;

  const bounds = target.bounds;
  if (bounds) {
    return game.normalizedToCanvasPoint(
      (Number(bounds.x1) + Number(bounds.x2)) / 2,
      Number(bounds.y1),
    );
  }

  if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
    return game.normalizedToCanvasPoint(Number(target.x), Number(target.y));
  }

  return null;
}

export function createTooltipWidget(): Widget {
  let root: HTMLDivElement | null = null;
  let cardEl: HTMLDivElement | null = null;
  let titleEl: HTMLDivElement | null = null;
  let bodyEl: HTMLDivElement | null = null;

  const renderTarget = (
    target: HoverTarget | null,
    hudRoot: HTMLElement,
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
      cardEl.style.transform = "translate3d(0, 6px, 0) scale(0.96)";
      return;
    }

    const title = resolveTooltipTitle(target);
    const body = resolveTooltipBody(target);
    if (!title && !body) {
      cardEl.style.opacity = "0";
      cardEl.style.transform = "translate3d(0, 6px, 0) scale(0.96)";
      return;
    }

    titleEl.textContent = title;
    bodyEl.textContent = body;
    bodyEl.hidden = !body;

    const hudRect = hudRoot.getBoundingClientRect();
    const anchor = anchorForTarget(target, game);
    const fallbackX =
      target.clientX !== undefined
        ? target.clientX - hudRect.left
        : hudRect.width / 2;
    const fallbackY =
      target.clientY !== undefined
        ? target.clientY - hudRect.top
        : hudRect.height / 2;
    const anchorX = anchor ? anchor.x - hudRect.left : fallbackX;
    const anchorY = anchor ? anchor.y - hudRect.top : fallbackY;

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
    cardEl.style.transform = "translate3d(0, 0, 0) scale(1)";
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
        "font-['Geist',_sans-serif] text-white will-change-transform",
      ].join(" ");
      root.style.transform = "translate3d(0, 0, 0)";

      cardEl = document.createElement("div");
      cardEl.className = [
        "rounded-[14px] border border-white/20 bg-black/40 px-3 py-2.5",
        "ring-1 ring-white/10",
        "opacity-0 will-change-[transform,opacity]",
        "transition-[opacity,transform] duration-200 ease-out",
      ].join(" ");
      cardEl.style.transform = "translate3d(0, 6px, 0) scale(0.96)";
      cardEl.style.transformOrigin = "bottom center";

      titleEl = document.createElement("div");
      titleEl.className =
        "text-sm font-bold leading-tight text-white/95 drop-shadow-[0_1px_1px_rgba(0,0,0,0.45)]";

      bodyEl = document.createElement("div");
      bodyEl.className = "mt-1 text-xs font-medium leading-snug text-white/75";

      cardEl.append(titleEl, bodyEl);
      root.append(cardEl);
      return root;
    },
    update: ({ game, hudRoot }) => {
      const target =
        typeof game.getCurrentHoverTarget === "function"
          ? game.getCurrentHoverTarget()
          : null;
      renderTarget(
        target,
        hudRoot,
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
