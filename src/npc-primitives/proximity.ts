import type { EntityId, GameAPI } from "../Game";
import { getNpcState } from "./state";
import type { NpcId, NpcObservation } from "./types";

function entityFeet(entity: Record<string, unknown>): { x: number; y: number } {
  const x = Number(entity.x ?? 0) + Number(entity.width ?? 0) / 2;
  const y = Number(entity.y ?? 0) + Number(entity.height ?? 0);
  return { x, y };
}

export function getNpcPlayerProximity(
  game: GameAPI,
  npcId: NpcId,
  options: { playerId?: EntityId | null; nearRadius?: number } = {},
): NpcObservation | null {
  const npc = getNpcState(game, npcId);
  if (!npc) return null;

  const npcEntity = game.get(npc.entityId);
  if (!npcEntity) return null;

  const playerEntityId = options.playerId ?? game.getControlledEntity();
  const playerEntity = playerEntityId ? game.get(playerEntityId) : null;
  const npcPoint = entityFeet(npcEntity);

  if (!playerEntityId || !playerEntity) {
    return {
      npcId,
      npcName: npc.displayName,
      npcX: npcPoint.x,
      npcY: npcPoint.y,
      playerEntityId: null,
      playerX: null,
      playerY: null,
      distanceToPlayer: null,
      isPlayerNear: false,
    };
  }

  const playerPoint = entityFeet(playerEntity);
  const distance = Math.hypot(playerPoint.x - npcPoint.x, playerPoint.y - npcPoint.y);
  return {
    npcId,
    npcName: npc.displayName,
    npcX: npcPoint.x,
    npcY: npcPoint.y,
    playerEntityId,
    playerX: playerPoint.x,
    playerY: playerPoint.y,
    distanceToPlayer: distance,
    isPlayerNear: distance <= (options.nearRadius ?? 100),
  };
}

export function isPlayerNearNpc(
  game: GameAPI,
  npcId: NpcId,
  radius = 100,
): boolean {
  return getNpcPlayerProximity(game, npcId, { nearRadius: radius })?.isPlayerNear === true;
}

// Backwards-compatible alias for older test code/tool examples. Prefer
// getNpcPlayerProximity for new gameplay code.
export const observePlayerFromNpc = getNpcPlayerProximity;
