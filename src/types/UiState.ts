/**
 * Typed HUD visibility shared across widgets.
 *
 * Panel and overlay ids are **game-defined strings** — the engine does not
 * ship fixed names tied to generated `Hud...` scaffolds.
 *
 * - `panels`: passive HUD chrome (many can be true at once)
 * - `overlays`: modals / full-screen UI (use `setExclusiveOverlay` if you want one modal)
 */

export const UI_RESOURCE = "ui" as const;

export interface UiState<
  TPanels extends Record<string, boolean> = Record<string, boolean>,
  TOverlays extends Record<string, boolean> = Record<string, boolean>,
> {
  panels: TPanels;
  overlays: TOverlays;
}

export type UiPanelBinding<T extends string = string> = {
  type: "panel";
  id: T;
};

export type UiOverlayBinding<T extends string = string> = {
  type: "overlay";
  id: T;
};

export type UiBinding = UiPanelBinding | UiOverlayBinding;

export type UiStatePatch<
  TPanels extends Record<string, boolean> = Record<string, boolean>,
  TOverlays extends Record<string, boolean> = Record<string, boolean>,
> = {
  panels?: Partial<TPanels>;
  overlays?: Partial<TOverlays>;
};

/** Empty UI state — scenes register keys via `createUiState` or `patchUi`. */
export function createDefaultUiState(): UiState {
  return {
    panels: {},
    overlays: {},
  };
}

/**
 * Build game UI state with inferred panel/overlay id types.
 *
 * @example
 * export const uiKeys = createUiState(
 *   { seasonBar: false, hotbar: false },
 *   { title: true, dialogue: false },
 * );
 * game.registerResource("ui", uiKeys);
 */
export function createUiState<
  const TPanels extends Record<string, boolean>,
  const TOverlays extends Record<string, boolean>,
>(panels: TPanels, overlays: TOverlays): UiState<TPanels, TOverlays> {
  return { panels, overlays };
}

export function isUiPanelVisible(
  state: UiState | null | undefined,
  id: string,
): boolean {
  if (!state) return false;
  return state.panels[id] === true;
}

export function isUiOverlayVisible(
  state: UiState | null | undefined,
  id: string,
): boolean {
  if (!state) return false;
  return state.overlays[id] === true;
}

export function patchUiState<T extends UiState>(
  current: T,
  patch: UiStatePatch<T["panels"], T["overlays"]>,
): T {
  return {
    ...current,
    panels: patch.panels ? { ...current.panels, ...patch.panels } : current.panels,
    overlays: patch.overlays
      ? { ...current.overlays, ...patch.overlays }
      : current.overlays,
  };
}

/** Show exactly one overlay; leaves panels unchanged. */
export function setExclusiveOverlay<T extends UiState>(
  state: T,
  activeId: keyof T["overlays"] & string,
): T {
  const overlays = { ...state.overlays };
  for (const key of Object.keys(overlays)) {
    overlays[key] = key === activeId;
  }
  return { ...state, overlays };
}

interface UiResourceReader {
  getResource?: <T = unknown>(name: string) => T;
}

export function readUiState(
  game: UiResourceReader | null | undefined,
): UiState | null {
  if (!game) return null;
  return game.getResource<UiState>(UI_RESOURCE) ?? null;
}

export function mergeUiPatch<T extends UiState>(
  current: T,
  patch: UiStatePatch<T["panels"], T["overlays"]>,
): T {
  return patchUiState(current, patch);
}

/** Options passed as the second argument to `game.useWidget(factory, options)`. */
export interface WidgetMountOptions {
  ui?: UiBinding;
}
