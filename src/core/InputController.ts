import type { MovementInput } from "./types";

type InputActionPhase = "down" | "up";

interface GameLike {
  canvas: HTMLCanvasElement;
  keys: MovementInput;
  debug: boolean;
  hideMapBackground: boolean;
  handleInputAction(action: string, phase: InputActionPhase): void;
  handlePointerMove(clientX: number, clientY: number): void;
  handlePointerLeave(): void;
  widgets: {
    handleKey(e: KeyboardEvent, game: GameLike): boolean;
    blocksWorldInput(game: GameLike): boolean;
  };
}

export default class InputController {
  private game: GameLike;
  private keyMap: Record<string, keyof MovementInput>;
  private actionKeyMap: Map<string, Set<string>>;
  private _onKeyDown: (e: KeyboardEvent) => void;
  private _onKeyUp: (e: KeyboardEvent) => void;
  private _onPointerMove: (e: PointerEvent) => void;
  private _onPointerLeave: () => void;

  constructor(game: GameLike, keyMap: Record<string, keyof MovementInput>) {
    this.game = game;
    this.keyMap = keyMap;
    this.actionKeyMap = new Map();
    this._onKeyDown = this._handleKeyDown.bind(this);
    this._onKeyUp = this._handleKeyUp.bind(this);
    this._onPointerMove = this._handlePointerMove.bind(this);
    this._onPointerLeave = this._handlePointerLeave.bind(this);
  }

  bindAction(action: string, keyCodes: string[]): void {
    for (const code of keyCodes) {
      const set = this.actionKeyMap.get(code) ?? new Set<string>();
      set.add(action);
      this.actionKeyMap.set(code, set);
    }
  }

  setup(): void {
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("keyup", this._onKeyUp);
    this.game.canvas.addEventListener("pointermove", this._onPointerMove);
    this.game.canvas.addEventListener("pointerleave", this._onPointerLeave);
  }

  destroy(): void {
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("keyup", this._onKeyUp);
    this.game.canvas.removeEventListener("pointermove", this._onPointerMove);
    this.game.canvas.removeEventListener("pointerleave", this._onPointerLeave);
  }

  _handlePointerMove(e: PointerEvent): void {
    this.game.handlePointerMove(e.clientX, e.clientY);
  }

  _handlePointerLeave(): void {
    this.game.handlePointerLeave();
  }

  _handleKeyDown(e: KeyboardEvent): void {
    const { widgets } = this.game;
    if (widgets.handleKey(e, this.game)) {
      e.preventDefault();
      return;
    }

    const action = this.keyMap[e.code];
    if (action) {
      if (widgets.blocksWorldInput(this.game)) {
        e.preventDefault();
        return;
      }
      this.game.keys[action] = true;
      e.preventDefault();
    }

    const inputActions = this.actionKeyMap.get(e.code);
    if (inputActions && !e.repeat) {
      for (const inputAction of inputActions) {
        this.game.handleInputAction(inputAction, "down");
      }
      e.preventDefault();
    }

    if (e.code === "Backquote") {
      this.game.debug = !this.game.debug;
    }

    // Toggle map background so cut-out masks/sprites are easy to inspect.
    if (e.code === "KeyB" && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) {
      this.game.hideMapBackground = !this.game.hideMapBackground;
    }
  }

  _handleKeyUp(e: KeyboardEvent): void {
    const { widgets } = this.game;
    if (widgets.handleKey(e, this.game)) {
      e.preventDefault();
      return;
    }

    const action = this.keyMap[e.code];
    if (action) this.game.keys[action] = false;

    const inputActions = this.actionKeyMap.get(e.code);
    if (inputActions) {
      for (const inputAction of inputActions) {
        this.game.handleInputAction(inputAction, "up");
      }
      e.preventDefault();
    }
  }
}
