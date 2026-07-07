/**
 * WidgetManager coordinates pluggable DOM HUD widgets mounted above canvas.
 * Visibility and pointer hit-testing are driven by typed `ui` resource bindings
 * or explicit `isVisible` / `isInteractive` hooks — not CSS inference.
 */

import type { WidgetAPI } from "../Game.types";
import {
  UI_RESOURCE,
  isUiOverlayVisible,
  isUiPanelVisible,
  readUiState,
  type UiBinding,
  type UiState,
} from "../types/UiState";

export type { WidgetAPI };

export interface Widget<TGame = any> {
  id?: string;
  zIndex?: number;
  _element?: HTMLElement;
  /** Bind visibility to `game.getResource("ui")` panel or overlay flags. */
  ui?: UiBinding;
  mount?(api: WidgetAPI<TGame>): HTMLElement | void;
  update?(api: WidgetAPI<TGame>): void;
  onKeyDown?(event: KeyboardEvent, api: WidgetAPI<TGame>): boolean | void;
  onKeyUp?(event: KeyboardEvent, api: WidgetAPI<TGame>): boolean | void;
  /**
   * When omitted, visibility comes from `ui` binding or defaults to true.
   * Do not toggle `display` / `hidden` on the root in `update` — the manager owns that.
   */
  isVisible?(api: WidgetAPI<TGame>): boolean;
  /**
   * When visible, whether the root receives pointer events.
   * Defaults to `true` when `blocksWorldInput` is true, otherwise `false`.
   */
  isInteractive?(api: WidgetAPI<TGame>): boolean;
  /**
   * @deprecated Use `isInteractive`. Kept for older widgets during migration.
   */
  isPointerActive?(api: WidgetAPI<TGame>): boolean;
  blocksWorldInput?(api: WidgetAPI<TGame>): boolean;
  destroy?(api: WidgetAPI<TGame>): void;
}

interface WidgetManagerConfig {
  plugins?: Array<(options?: Record<string, unknown>) => Widget | null>;
  state?: Record<string, unknown>;
}

interface WidgetPresentation {
  visible: boolean;
  interactive: boolean;
}

interface UiResourceGame {
  getResource<T = unknown>(name: string): T;
}

export default class WidgetManager<
  TGame extends UiResourceGame = UiResourceGame,
> {
  private canvas: HTMLCanvasElement;
  private hudRoot: HTMLElement;
  private widgets: Widget<TGame>[];
  private _game: TGame;
  state: Record<string, unknown>;

  constructor(
    canvas: HTMLCanvasElement,
    hudRoot: string | HTMLElement,
    config: WidgetManagerConfig = {},
  ) {
    this.canvas = canvas;
    this.hudRoot =
      typeof hudRoot === "string" ? document.getElementById(hudRoot) : hudRoot;
    this.widgets = [];
    this._game = null as TGame;
    this.state = {
      ...(config.state ?? {}),
    };

    if (!this.hudRoot) {
      throw new Error("WidgetManager requires a valid HUD root element.");
    }

    for (const pluginFactory of config.plugins ?? []) {
      this.registerPlugin(pluginFactory);
    }
  }

  registerPlugin(
    pluginFactory: (options?: Record<string, unknown>) => Widget | null,
    options: Record<string, unknown> = {},
  ): void {
    if (typeof pluginFactory !== "function") return;
    const widget = pluginFactory(options);
    if (!widget) return;

    this.widgets.push(widget);
    this.widgets.sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));

    const api = this._api();
    if (typeof widget.mount === "function") {
      const element = widget.mount(api);
      if (element instanceof HTMLElement) {
        widget._element = element;
        element.style.zIndex = String(widget.zIndex ?? 0);
        element.style.pointerEvents = "none";
        element.hidden = true;
        this.hudRoot.appendChild(element);
        if (typeof widget.update === "function") {
          widget.update(api);
        }
        this._applyPresentation(widget, api);
      }
    }
  }

  private _resolvePresentation(
    widget: Widget<TGame>,
    api: WidgetAPI<TGame>,
  ): WidgetPresentation {
    const visible = this._resolveVisible(widget, api);
    if (!visible) {
      return { visible: false, interactive: false };
    }

    if (typeof widget.isInteractive === "function") {
      return { visible: true, interactive: widget.isInteractive(api) === true };
    }

    if (typeof widget.isPointerActive === "function") {
      return {
        visible: true,
        interactive: widget.isPointerActive(api) === true,
      };
    }

    if (typeof widget.blocksWorldInput === "function") {
      return {
        visible: true,
        interactive: widget.blocksWorldInput(api) === true,
      };
    }

    return { visible: true, interactive: false };
  }

  private _resolveVisible(
    widget: Widget<TGame>,
    api: WidgetAPI<TGame>,
  ): boolean {
    if (widget.ui) {
      const ui = readUiState(api.game);
      if (!ui) return false;
      if (widget.ui.type === "panel") {
        return isUiPanelVisible(ui, widget.ui.id);
      }
      return isUiOverlayVisible(ui, widget.ui.id);
    }

    if (typeof widget.isVisible === "function") {
      return widget.isVisible(api) === true;
    }

    return true;
  }

  private _applyPresentation(
    widget: Widget<TGame>,
    api: WidgetAPI<TGame>,
  ): void {
    const element = widget._element;
    if (!element) return;

    const { visible, interactive } = this._resolvePresentation(widget, api);
    element.hidden = !visible;
    element.setAttribute("aria-hidden", visible ? "false" : "true");
    element.style.pointerEvents = visible && interactive ? "auto" : "none";
  }

  private _isWidgetVisible(
    widget: Widget<TGame>,
    api: WidgetAPI<TGame>,
  ): boolean {
    return this._resolvePresentation(widget, api).visible;
  }

  setState(patch: Record<string, unknown>): void {
    this.state = {
      ...this.state,
      ...patch,
    };
  }

  setGame(game: TGame): void {
    this._game = game;
  }

  _api(game: TGame | null = null, now = performance.now()): WidgetAPI<TGame> {
    if (game !== null) this._game = game;
    const mgr = this;
    return {
      canvas: this.canvas,
      hudRoot: this.hudRoot,
      get game() {
        return mgr._game;
      },
      get state() {
        return mgr.state;
      },
      now,
      setState: (patch) => mgr.setState(patch),
    };
  }

  /** Apply typed visibility + pointer state after widget content updates. */
  syncPresentation(now: number, game: TGame): void {
    const api = this._api(game, now);
    for (const widget of this.widgets) {
      this._applyPresentation(widget, api);
    }
  }

  update(now: number, game: TGame): void {
    const api = this._api(game, now);
    for (const widget of this.widgets) {
      if (typeof widget.update === "function") widget.update(api);
    }
    this.syncPresentation(now, game);
  }

  handleKey(event: KeyboardEvent, game: TGame): boolean {
    const api = this._api(game);
    for (let i = this.widgets.length - 1; i >= 0; i -= 1) {
      const widget = this.widgets[i];
      if (!this._isWidgetVisible(widget, api)) continue;
      const handler =
        event.type === "keydown" ? widget.onKeyDown : widget.onKeyUp;
      if (typeof handler !== "function") continue;
      if (handler(event, api) === true) {
        return true;
      }
    }
    return false;
  }

  blocksWorldInput(game: TGame): boolean {
    const api = this._api(game);
    return this.widgets.some((widget) => {
      if (!this._isWidgetVisible(widget, api)) return false;
      if (typeof widget.blocksWorldInput !== "function") return false;
      return widget.blocksWorldInput(api) === true;
    });
  }

  destroy(game: TGame | null = null): void {
    const api = this._api(game);
    for (const widget of this.widgets) {
      if (typeof widget.destroy === "function") widget.destroy(api);
      if (widget._element?.parentNode === this.hudRoot) {
        this.hudRoot.removeChild(widget._element);
      }
    }
    this.widgets = [];
  }
}

export { UI_RESOURCE, type UiBinding, type UiState };
