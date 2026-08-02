import type { Widget } from "../core/WidgetManager";
import { NPC_STATE_RESOURCE, type NpcPrimitivesState } from "../npc-primitives/types";
import type { WidgetMountOptions } from "../types/UiState";

interface BubbleNode {
  root: HTMLDivElement;
  card: HTMLDivElement;
  name: HTMLDivElement;
  text: HTMLDivElement;
  tail: HTMLDivElement;
  lastFullText: string;
  revealStartedAt: number;
}

function getNpcStateSafe(game: {
  getResource<T = unknown>(name: string): T;
}): NpcPrimitivesState | null {
  try {
    return game.getResource<NpcPrimitivesState>(NPC_STATE_RESOURCE);
  } catch {
    return null;
  }
}

export function createNpcBubbleWidget(options?: WidgetMountOptions): Widget {
  const nodes = new Map<string, BubbleNode>();
  let root: HTMLDivElement | null = null;

  function createNode(npcId: string): BubbleNode {
    const item = document.createElement("div");
    item.className = [
      "absolute left-0 top-0 pointer-events-none w-[260px]",
      "font-['Geist Pixel',_sans-serif]",
      "capy-fade opacity-0 will-change-[transform,opacity]",
    ].join(" ");
    item.dataset.npcBubbleId = npcId;

    const card = document.createElement("div");
    card.className = "capy-panel relative w-[260px] px-4 py-3";

    const name = document.createElement("div");
    name.className = [
      "mb-1.5 flex items-center gap-2",
      "text-[10px] font-normal uppercase tracking-[0.16em]",
      "text-capy-accent [text-shadow:1px_1px_0_var(--color-capy-ink)]",
      "after:h-[2px] after:flex-1 after:bg-capy-rim",
    ].join(" ");

    const text = document.createElement("div");
    text.className =
      "capy-text min-h-[38px] text-[13px] font-normal leading-snug";

    // Hard-edged notch built from the panel tones, not a blurred glass wedge.
    const tail = document.createElement("div");
    tail.className = [
      "absolute left-1/2 top-full h-3 w-3 -translate-x-1/2 -translate-y-2 rotate-45",
      "border-b-2 border-r-2 border-capy-ink bg-capy-panel",
    ].join(" ");

    card.append(name, text, tail);
    item.append(card);
    root?.appendChild(item);
    const node = {
      root: item,
      card,
      name,
      text,
      tail,
      lastFullText: "",
      revealStartedAt: 0,
    };
    nodes.set(npcId, node);
    return node;
  }

  function revealText(
    fullText: string,
    startedAt: number,
    now: number,
  ): string {
    if (!fullText) return "";
    const charsPerSecond = fullText.length <= 28 ? 46 : 38;
    const visibleChars = Math.max(
      1,
      Math.floor(((now - startedAt) / 1000) * charsPerSecond),
    );
    return fullText.slice(0, Math.min(fullText.length, visibleChars));
  }

  return {
    id: "npc-bubbles",
    zIndex: 420,
    ...(options?.ui ? { ui: options.ui } : {}),
    isInteractive: () => false,
    mount: () => {
      root = document.createElement("div");
      root.className = "absolute inset-0 pointer-events-none";
      return root;
    },
    update: ({ game, hudRoot, canvas, now }) => {
      if (!root) return;
      const state = getNpcStateSafe(
        game as { getResource<T = unknown>(name: string): T },
      );
      const activeIds = new Set<string>();
      if (!state) {
        for (const node of nodes.values()) node.root.style.opacity = "0";
        return;
      }

      // normalizedToCanvasPoint is canvas-local CSS px, not viewport client coords.
      const canvasRect = canvas.getBoundingClientRect();
      const hudRect = hudRoot.getBoundingClientRect();
      const canvasToHudX = canvasRect.left - hudRect.left;
      const canvasToHudY = canvasRect.top - hudRect.top;

      for (const npc of Object.values(state.npcs)) {
        const entity = game.get(npc.entityId);
        if (!entity) continue;

        const isThoughtVisible =
          npc.isThinking || (!!npc.thoughtText && npc.thoughtUntilMs > now);
        const isBarkVisible = !!npc.barkText && npc.barkUntilMs > now;
        if (!isThoughtVisible && !isBarkVisible) continue;

        const text = isBarkVisible
          ? npc.barkText
          : npc.isThinking
            ? "Thinking…"
            : npc.thoughtText;
        const point = game.normalizedToCanvasPoint(
          Number(entity.x ?? 0) + Number(entity.width ?? 0) / 2,
          Number(entity.y ?? 0),
        );

        const node = nodes.get(npc.id) ?? createNode(npc.id);
        if (node.lastFullText !== text) {
          node.lastFullText = text;
          node.revealStartedAt = now;
        }

        node.name.textContent = npc.displayName;
        node.text.textContent = revealText(text, node.revealStartedAt, now);
        const x = point.x + canvasToHudX - 130;
        const y = point.y + canvasToHudY - node.root.offsetHeight - 64;
        node.root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
        node.root.style.opacity = "1";
        activeIds.add(npc.id);
      }

      for (const [npcId, node] of nodes) {
        if (!activeIds.has(npcId)) node.root.style.opacity = "0";
      }
    },
  };
}
