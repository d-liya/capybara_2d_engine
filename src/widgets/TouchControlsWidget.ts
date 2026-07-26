import type { Widget } from "../core/WidgetManager";
import type { TouchControlAction, TouchControlsConfig } from "../Game.types";
import type { MovementInput } from "../core/types";

type Direction = keyof MovementInput;

const DIRECTIONS: Direction[] = ["up", "down", "left", "right"];

const FONT = "font-['Geist Pixel',_sans-serif]";

/** Outer ring diameter in CSS pixels. */
const STICK_SIZE_PX = 128;
/** Max knob travel from center. */
const STICK_RADIUS_PX = 44;
/** Ignore tiny finger noise before registering a direction. */
const DEADZONE = 0.22;
/** Axis must exceed this (normalized) to count as that cardinal. */
const AXIS_THRESHOLD = 0.35;

function isTouchPrimaryDevice(): boolean {
  return (
    window.matchMedia("(pointer: coarse)").matches ||
    navigator.maxTouchPoints > 0
  );
}

function dirsFromStick(dx: number, dy: number): Set<Direction> {
  const out = new Set<Direction>();
  const mag = Math.hypot(dx, dy);
  if (mag < DEADZONE * STICK_RADIUS_PX) return out;

  const nx = dx / mag;
  const ny = dy / mag;
  if (ny < -AXIS_THRESHOLD) out.add("up");
  if (ny > AXIS_THRESHOLD) out.add("down");
  if (nx < -AXIS_THRESHOLD) out.add("left");
  if (nx > AXIS_THRESHOLD) out.add("right");

  // Pure diagonals that sit under the axis threshold still need a direction.
  if (out.size === 0) {
    if (Math.abs(nx) >= Math.abs(ny)) {
      out.add(nx < 0 ? "left" : "right");
    } else {
      out.add(ny < 0 ? "up" : "down");
    }
  }
  return out;
}

/**
 * Mobile floating virtual joystick + action buttons.
 *
 * Tap/drag on the left side of the screen: a stick appears under the finger
 * and drives `setMovementInput` (same path as WASD). Action buttons on the
 * right call `dispatchInputAction` with the same names as keyboard bindings.
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
  let stickLayer: HTMLDivElement | null = null;
  let baseEl: HTMLDivElement | null = null;
  let knobEl: HTMLDivElement | null = null;
  let activePointerId: number | null = null;
  let originX = 0;
  let originY = 0;
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
    hideStick();
    activePointerId = null;
  };

  const showStick = (clientX: number, clientY: number) => {
    if (!root || !baseEl || !knobEl) return;
    const rect = root.getBoundingClientRect();
    originX = clientX - rect.left;
    originY = clientY - rect.top;

    const half = STICK_SIZE_PX * 0.5;
    const x = Math.min(
      Math.max(originX, half),
      Math.max(half, rect.width - half),
    );
    const y = Math.min(
      Math.max(originY, half),
      Math.max(half, rect.height - half),
    );
    originX = x;
    originY = y;

    baseEl.style.left = `${x - half}px`;
    baseEl.style.top = `${y - half}px`;
    baseEl.style.opacity = "1";
    knobEl.style.transform = "translate(-50%, -50%) translate(0px, 0px)";
  };

  const hideStick = () => {
    if (!baseEl || !knobEl) return;
    baseEl.style.opacity = "0";
    knobEl.style.transform = "translate(-50%, -50%) translate(0px, 0px)";
  };

  const applyStickOffset = (
    clientX: number,
    clientY: number,
    game: {
      setMovementInput: (patch: Partial<MovementInput>) => void;
      clearMovementInput: () => void;
    },
  ) => {
    if (!root || !knobEl) return;
    const rect = root.getBoundingClientRect();
    let dx = clientX - rect.left - originX;
    let dy = clientY - rect.top - originY;
    const mag = Math.hypot(dx, dy);
    if (mag > STICK_RADIUS_PX && mag > 0) {
      const scale = STICK_RADIUS_PX / mag;
      dx *= scale;
      dy *= scale;
    }

    knobEl.style.transform = `translate(-50%, -50%) translate(${dx}px, ${dy}px)`;
    heldDirs = dirsFromStick(dx, dy);
    syncMovement(game);
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

      // Left ~70% of the screen: floating joystick capture zone.
      stickLayer = document.createElement("div");
      stickLayer.className =
        "pointer-events-auto absolute inset-y-0 left-0 w-[70%]";
      stickLayer.setAttribute("aria-label", "Movement joystick");
      stickLayer.style.touchAction = "none";

      baseEl = document.createElement("div");
      baseEl.className = [
        "pointer-events-none absolute",
        "rounded-full border border-white/25 bg-black/35",
        "opacity-0 transition-opacity duration-75",
      ].join(" ");
      baseEl.style.width = `${STICK_SIZE_PX}px`;
      baseEl.style.height = `${STICK_SIZE_PX}px`;
      baseEl.setAttribute("aria-hidden", "true");

      knobEl = document.createElement("div");
      knobEl.className = [
        "absolute left-1/2 top-1/2",
        "h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full",
        "border border-white/35 bg-white/30",
        "shadow-[0_0_12px_rgba(0,0,0,0.35)]",
      ].join(" ");
      baseEl.appendChild(knobEl);
      stickLayer.appendChild(baseEl);

      const onPointerDown = (event: PointerEvent) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if (activePointerId != null) return;
        event.preventDefault();
        event.stopPropagation();
        activePointerId = event.pointerId;
        stickLayer?.setPointerCapture(event.pointerId);
        showStick(event.clientX, event.clientY);
        applyStickOffset(event.clientX, event.clientY, api.game);
      };

      const onPointerMove = (event: PointerEvent) => {
        if (event.pointerId !== activePointerId) return;
        event.preventDefault();
        applyStickOffset(event.clientX, event.clientY, api.game);
      };

      const onPointerUp = (event: PointerEvent) => {
        if (event.pointerId !== activePointerId) return;
        event.preventDefault();
        activePointerId = null;
        heldDirs.clear();
        syncMovement(api.game);
        hideStick();
        try {
          stickLayer?.releasePointerCapture(event.pointerId);
        } catch {
          // ignore
        }
      };

      stickLayer.addEventListener("pointerdown", onPointerDown);
      stickLayer.addEventListener("pointermove", onPointerMove);
      stickLayer.addEventListener("pointerup", onPointerUp);
      stickLayer.addEventListener("pointercancel", onPointerUp);
      stickLayer.addEventListener("lostpointercapture", onPointerUp);

      root.appendChild(stickLayer);

      // --- Action buttons (right) ---
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
      stickLayer = null;
      baseEl = null;
      knobEl = null;
      heldDirs.clear();
      activePointerId = null;
    },
  };
}
