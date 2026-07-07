import type { GameAPI } from "../Game";
import { getNpcState } from "./state";
import type { NpcId, NpcToolResult } from "./types";

export function setNpcThinking(
  game: GameAPI,
  npcId: NpcId,
  thinking = true,
): NpcToolResult {
  const npc = getNpcState(game, npcId);
  if (!npc) return { ok: false, message: `Unknown NPC: ${npcId}` };
  npc.isThinking = thinking;
  if (thinking && !npc.thoughtText) {
    npc.thoughtUntilMs = performance.now() + npc.thoughtDurationMs;
  }
  return { ok: true };
}

export function setNpcThought(
  game: GameAPI,
  npcId: NpcId,
  text: string,
  durationMs?: number,
): NpcToolResult {
  const npc = getNpcState(game, npcId);
  if (!npc) return { ok: false, message: `Unknown NPC: ${npcId}` };
  const safeText = String(text ?? "")
    .trim()
    .slice(0, 120);
  npc.isThinking = false;
  npc.thoughtText = safeText;
  npc.thoughtUntilMs =
    performance.now() + (durationMs ?? npc.thoughtDurationMs);
  return { ok: true, text: safeText };
}

export function clearNpcThought(game: GameAPI, npcId: NpcId): NpcToolResult {
  const npc = getNpcState(game, npcId);
  if (!npc) return { ok: false, message: `Unknown NPC: ${npcId}` };
  npc.isThinking = false;
  npc.thoughtText = "";
  npc.thoughtUntilMs = 0;
  return { ok: true };
}
