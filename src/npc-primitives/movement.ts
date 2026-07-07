import type { GameAPI } from "../Game";
import { getNpcState } from "./state";
import { getNpcLocation } from "./worldContext";
import type { NpcId, NpcToolResult } from "./types";

export function moveNpcToPoint(
  game: GameAPI,
  npcId: NpcId,
  x: number,
  y: number,
  options: { speed?: number; stopDistance?: number; destinationId?: string } = {},
): NpcToolResult {
  const npc = getNpcState(game, npcId);
  if (!npc) return { ok: false, message: `Unknown NPC: ${npcId}` };
  if (!npc.canMove) return { ok: false, message: `${npc.displayName} cannot move.` };

  const result = game.setEntityDestination(
    npc.entityId,
    { x, y },
    { speed: options.speed ?? 28, stopDistance: options.stopDistance ?? 12 },
  );
  npc.currentDestinationId = options.destinationId;
  npc.currentActivity = "moving";
  return { ok: result.status === "found", message: "Destination requested.", x, y, destinationId: options.destinationId, status: result.status };
}

export function moveNpcToLocation(
  game: GameAPI,
  npcId: NpcId,
  locationId: string,
  options: { speed?: number; stopDistance?: number } = {},
): NpcToolResult {
  const location = getNpcLocation(game, locationId);
  if (!location) return { ok: false, message: `Unknown location: ${locationId}` };
  return moveNpcToPoint(game, npcId, location.x, location.y, {
    ...options,
    destinationId: locationId,
  });
}

export function stopNpc(game: GameAPI, npcId: NpcId): NpcToolResult {
  const npc = getNpcState(game, npcId);
  if (!npc) return { ok: false, message: `Unknown NPC: ${npcId}` };
  game.clearEntityDestination(npc.entityId);
  npc.currentDestinationId = undefined;
  npc.currentActivity = "idle";
  return { ok: true };
}

export function facePlayer(game: GameAPI, npcId: NpcId): NpcToolResult {
  const npc = getNpcState(game, npcId);
  const playerId = game.getControlledEntity();
  if (!npc || !playerId) return { ok: false, message: "NPC or player missing." };
  const npcEntity = game.get(npc.entityId);
  const player = game.get(playerId);
  if (!npcEntity || !player) return { ok: false, message: "NPC or player entity missing." };
  game.setEntityFacingX(npc.entityId, Number(player.x ?? 0) < Number(npcEntity.x ?? 0) ? -1 : 1);
  return { ok: true };
}
