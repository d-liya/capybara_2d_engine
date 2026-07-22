import type { Widget } from "../core/WidgetManager";
import type { TouchControlAction, TouchControlsConfig } from "../Game.types";
import type { MovementInput } from "../core/types";

type Direction = keyof MovementInput;

const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

const FONT = "font-['Geist Pixel',_sans-serif]";

function isTouchPrimaryDevice(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0
  );
}

/**
 * Minimal mobile D-pad + action buttons.
 *
 * Movement uses `setMovementInput` (same path as WASD). Action buttons call
 * `dispatchInputAction` with the same action names as keyboard bindings.
 */
export function createTouchControlsWidget(
  options: TouchControlsConfig = {},
): Widget {
  const actions: TouchControlAction[] = Array.isArray(options.actions)
    ? options.actions.filter(
        (entry) =>
          entry &&
          typeof entry.action === "string" &&
          entry.action.length > 0 &&
          typeof entry.label === "string",
      )
    : [];

  let root: HTMLDivElement | null = null;
  let heldDirs = new Set<Direction>();

  const syncMovement = (game: {
    setMovementInput: (patch: Partial<MovementInput>) => void;
    clearMovementInput: () => void;
  }) => {
    if (heldDirs.size === 0) {
      game.clearMovementInput();
      return;
    }
    const patch: Partial<MovementInput> = {};
    for (const dir of DIRECTIONS) {
      patch[dir] = heldDirs.has(dir);
    }
    game.setMovementInput(patch);
  };

  const clearAll = (game: { clearMovementInput: () => void }) => {
    heldDirs.clear();
    game.clearMovementInput();
  };

  return {
    id: "touch-controls",
    zIndex: 200,
    isVisible: () => isTouchPrimaryDevice(),
    isInteractive: () => true,
    blocksWorldInput: () => false,

    mount(api) {
      root = document.createElement("div");
      root.className = [
        "absolute inset-0 pointer-events-none select-none touch-none",
        FONT,
        "text-white/80",
      ].join(" ");
      root.dataset.touchControls = "true";

      // --- D-pad (discrete + layout) ---
      const left = document.createElement("div");
      left.className =
        "pointer-events-auto absolute bottom-5 left-4 grid h-[120px] w-[120px] grid-cols-3 grid-rows-3 gap-1";
      left.setAttribute("aria-label", "Movement");

      const dirCells: Array<{
        dir: Direction;
        label: string;
        col: number;
        row: number;
      }> = [
        { dir: "up", label: "▲", col: 2, row: 1 },
        { dir: "left", label: "◀", col: 1, row: 2 },
        { dir: "right", label: "▶", col: 3, row: 2 },
        { dir: "down", label: "▼", col: 2, row: 3 },
      ];

      const btnBase = [
        "flex items-center justify-center rounded-md",
        "border border-white/20 bg-black/40",
        "text-[13px] text-white/75",
        "active:bg-white/20 active:text-white",
      ].join(" ");

      for (const cell of dirCells) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.dataset.dir = cell.dir;
        btn.textContent = cell.label;
        btn.setAttribute("aria-label", cell.dir);
        btn.className = btnBase;
        btn.style.gridColumn = String(cell.col);
        btn.style.gridRow = String(cell.row);
        btn.style.touchAction = "none";

        const press = (event: PointerEvent) => {
          event.preventDefault();
          event.stopPropagation();
          btn.setPointerCapture(event.pointerId);
          heldDirs.add(cell.dir);
          syncMovement(api.game);
          btn.classList.add("bg-white/20", "text-white");
        };

        const release = (event: PointerEvent) => {
          event.preventDefault();
          event.stopPropagation();
          heldDirs.delete(cell.dir);
          syncMovement(api.game);
          btn.classList.remove("bg-white/20", "text-white");
          try {
            btn.releasePointerCapture(event.pointerId);
          } catch {
            // ignore
          }
        };

        btn.addEventListener("pointerdown", press);
        btn.addEventListener("pointerup", release);
        btn.addEventListener("pointercancel", release);
        left.appendChild(btn);
      }

      root.appendChild(left);

      // --- Action buttons ---
      if (actions.length > 0) {
        const right = document.createElement("div");
        right.className =
          "pointer-events-auto absolute bottom-5 right-4 flex flex-col-reverse gap-2";

        for (const entry of actions) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.action = entry.action;
          button.textContent = entry.label;
          button.className = [
            FONT,
            "flex h-12 w-12 items-center justify-center rounded-full",
            "border border-white/20 bg-black/40",
            "text-[14px] text-white/80",
            "active:bg-white/20 active:text-white",
          ].join(" ");
          button.style.touchAction = "none";

          const fire = (phase: "down" | "up", event: PointerEvent) => {
            event.preventDefault();
            event.stopPropagation();
            api.game.dispatchInputAction(entry.action, {
              phase,
              source: "touch",
            });
          };

          button.addEventListener("pointerdown", (event) => {
            button.setPointerCapture(event.pointerId);
            fire("down", event);
          });
          button.addEventListener("pointerup", (event) => {
            fire("up", event);
            try {
              button.releasePointerCapture(event.pointerId);
            } catch {
              // ignore
            }
          });
          button.addEventListener("pointercancel", (event) => {
            fire("up", event);
          });

          right.appendChild(button);
        }

        root.appendChild(right);
      }

      const onBlur = () => clearAll(api.game);
      window.addEventListener("blur", onBlur);
      api.setState({ onBlur });

      return root;
    },

    destroy(api) {
      const onBlur = api.state.onBlur as (() => void) | undefined;
      if (onBlur) {
        window.removeEventListener("blur", onBlur);
      }
      if (api.game && typeof api.game.clearMovementInput === "function") {
        clearAll(api.game);
      }
      root = null;
      heldDirs.clear();
    },
  };
}
