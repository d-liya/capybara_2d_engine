import type { GameAPI } from "../Game";
import { getNpcState } from "./state";
import type { NpcId, NpcToolResult } from "./types";

export function barkNpc(
  game: GameAPI,
  npcId: NpcId,
  text: string,
  options: { durationMs?: number; ignoreCooldown?: boolean } = {},
): NpcToolResult {
  const npc = getNpcState(game, npcId);
  if (!npc) return { ok: false, message: `Unknown NPC: ${npcId}` };

  const now = performance.now();
  if (!options.ignoreCooldown && now - npc.lastBarkAtMs < npc.barkCooldownMs) {
    return { ok: false, message: "Bark is on cooldown." };
  }

  const safeText = String(text ?? "").trim().slice(0, 160);
  if (!safeText) return { ok: false, message: "Bark text is empty." };

  npc.barkText = safeText;
  npc.barkUntilMs = now + (options.durationMs ?? 3_500);
  npc.lastBarkAtMs = now;
  game.emit("npc:bark", { npcId, entityId: npc.entityId, displayName: npc.displayName, text: safeText });
  return { ok: true, text: safeText };
}

export function clearNpcBark(game: GameAPI, npcId: NpcId): NpcToolResult {
  const npc = getNpcState(game, npcId);
  if (!npc) return { ok: false, message: `Unknown NPC: ${npcId}` };
  npc.barkText = "";
  npc.barkUntilMs = 0;
  return { ok: true };
}
