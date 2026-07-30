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

function hasBlockingUiOverlay(game: {
  getResource?: (name: string) => unknown;
}): boolean {
  if (typeof game.getResource !== "function") return false;
  const ui = game.getResource("ui") as
    | { overlays?: Record<string, boolean> }
    | null
    | undefined;
  if (!ui?.overlays || typeof ui.overlays !== "object") return false;
  return Object.values(ui.overlays).some((open) => open === true);
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
 * Tap/drag anywhere on the screen (except action buttons): a stick appears
 * under the finger and drives `setMovementInput` (same path as WASD). Action
 * buttons call `dispatchInputAction` with the same names as keyboard bindings.
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

  const hideStick = () => {
    if (!baseEl || !knobEl) return;
    baseEl.style.opacity = "0";
    knobEl.style.transform = "translate(-50%, -50%) translate(0px, 0px)";
  };

  const endStick = (
    pointerId: number,
    game: {
      setMovementInput: (patch: Partial<MovementInput>) => void;
      clearMovementInput: () => void;
    },
  ) => {
    if (activePointerId !== pointerId) return;
    activePointerId = null;
    heldDirs.clear();
    syncMovement(game);
    hideStick();
    try {
      if (stickLayer?.hasPointerCapture(pointerId)) {
        stickLayer.releasePointerCapture(pointerId);
      }
    } catch {
      // ignore
    }
  };

  const clearAll = (game: { clearMovementInput: () => void }) => {
    const locked = activePointerId;
    heldDirs.clear();
    game.clearMovementInput();
    hideStick();
    activePointerId = null;
    if (locked != null) {
      try {
        if (stickLayer?.hasPointerCapture(locked)) {
          stickLayer.releasePointerCapture(locked);
        }
      } catch {
        // ignore
      }
    }
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
    isVisible: (api) =>
      isTouchPrimaryDevice() && !hasBlockingUiOverlay(api.game),
    // Keep root non-interactive so empty HUD areas don't swallow taps; only
    // the stick layer / action buttons use pointer-events-auto.
    isInteractive: () => false,
    blocksWorldInput: () => false,

    mount(api) {
      root = document.createElement("div");
      root.className = [
        "absolute inset-0 pointer-events-none select-none touch-none",
        FONT,
      ].join(" ");
      root.dataset.touchControls = "true";

      // Full-screen capture — action buttons sit above and stopPropagation.
      stickLayer = document.createElement("div");
      stickLayer.className = "pointer-events-auto absolute inset-0";
      stickLayer.setAttribute("aria-label", "Movement joystick");
      stickLayer.style.touchAction = "none";

      baseEl = document.createElement("div");
      baseEl.className = [
        "pointer-events-none absolute",
        "capy-dial capy-fade rounded-full opacity-0",
      ].join(" ");
      baseEl.style.width = `${STICK_SIZE_PX}px`;
      baseEl.style.height = `${STICK_SIZE_PX}px`;
      baseEl.setAttribute("aria-hidden", "true");

      knobEl = document.createElement("div");
      knobEl.className = [
        "absolute left-1/2 top-1/2",
        "h-12 w-12 -translate-x-1/2 -translate-y-1/2",
        "capy-key rounded-full",
      ].join(" ");
      baseEl.appendChild(knobEl);
      stickLayer.appendChild(baseEl);

      const onPointerDown = (event: PointerEvent) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        // Recover from a stuck gesture (cancelled touch that never cleared).
        if (activePointerId != null && activePointerId !== event.pointerId) {
          endStick(activePointerId, api.game);
        }
        if (activePointerId != null) return;
        event.preventDefault();
        event.stopPropagation();
        activePointerId = event.pointerId;
        try {
          stickLayer?.setPointerCapture(event.pointerId);
        } catch {
          // Some browsers reject capture; tracking by pointerId still works.
        }
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
        endStick(event.pointerId, api.game);
      };

      const onLostCapture = (event: PointerEvent) => {
        // Only clear if this was our active stick — avoid racing releasePointerCapture.
        if (event.pointerId !== activePointerId) return;
        endStick(event.pointerId, api.game);
      };

      stickLayer.addEventListener("pointerdown", onPointerDown);
      stickLayer.addEventListener("pointermove", onPointerMove);
      stickLayer.addEventListener("pointerup", onPointerUp);
      stickLayer.addEventListener("pointercancel", onPointerUp);
      stickLayer.addEventListener("lostpointercapture", onLostCapture);

      root.appendChild(stickLayer);

      // --- Action buttons (right) ---
      if (actions.length > 0) {
        const right = document.createElement("div");
        right.className =
          "pointer-events-auto absolute bottom-5 right-4 z-10 flex flex-col-reverse gap-2";

        for (const entry of actions) {
          const button = document.createElement("button");
          button.type = "button";
          button.dataset.action = entry.action;
          button.textContent = entry.label;
          button.className = [
            FONT,
            "capy-key flex h-12 w-12 items-center justify-center rounded-full",
            "text-[14px] font-black",
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
            // Don't start a stick under an action button.
            event.stopPropagation();
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
      const onVisibility = () => {
        if (document.hidden) clearAll(api.game);
      };
      window.addEventListener("blur", onBlur);
      document.addEventListener("visibilitychange", onVisibility);
      api.setState({ onBlur, onVisibility });

      return root;
    },

    update(api) {
      // Modal/dialogue opened mid-gesture — drop the stick so it cannot fight the HUD.
      if (hasBlockingUiOverlay(api.game) && activePointerId != null) {
        clearAll(api.game);
      }
    },

    destroy(api) {
      const onBlur = api.state.onBlur as (() => void) | undefined;
      const onVisibility = api.state.onVisibility as (() => void) | undefined;
      if (onBlur) window.removeEventListener("blur", onBlur);
      if (onVisibility) {
        document.removeEventListener("visibilitychange", onVisibility);
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
