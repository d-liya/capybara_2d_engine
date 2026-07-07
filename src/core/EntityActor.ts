import Actor from "./Actor";
import type { GameMap } from "./Actor";
import type { MovementInput } from "./types";

export default class EntityActor extends Actor {
  update(input: MovementInput, map: GameMap | null, dt: number): void {
    const dx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const dy = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    this.moveByDirection(dx, dy, map, dt);
  }
}
