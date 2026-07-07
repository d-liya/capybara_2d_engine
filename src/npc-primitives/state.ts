import type { EntityId, GameAPI } from "../Game";
import {
  NPC_STATE_RESOURCE,
  type NpcDefinition,
  type NpcId,
  type NpcPrimitivesState,
  type NpcRuntimeState,
} from "./types";

export function createNpcPrimitivesState(): NpcPrimitivesState {
  return { npcs: {} };
}

export function ensureNpcPrimitivesState(game: GameAPI): NpcPrimitivesState {
  try {
    const existing = game.getResource<NpcPrimitivesState>(NPC_STATE_RESOURCE);
    if (existing && typeof existing === "object" && existing.npcs) return existing;
  } catch {
    // Resource does not exist yet.
  }

  const state = createNpcPrimitivesState();
  game.registerResource(NPC_STATE_RESOURCE, state);
  return state;
}

export function registerNpc(
  game: GameAPI,
  definition: NpcDefinition,
  entityId: EntityId,
): NpcRuntimeState {
  const state = ensureNpcPrimitivesState(game);
  const npc: NpcRuntimeState = {
    id: definition.id,
    entityId,
    displayName: definition.displayName,
    canMove: definition.canMove !== false,
    barkCooldownMs: definition.barkCooldownMs ?? 12_000,
    thoughtDurationMs: definition.thoughtDurationMs ?? 3_000,
    isThinking: false,
    thoughtText: "",
    thoughtUntilMs: 0,
    barkText: "",
    barkUntilMs: 0,
    lastBarkAtMs: -Infinity,
  };
  state.npcs[definition.id] = npc;
  return npc;
}

export function getNpcState(
  game: GameAPI,
  npcId: NpcId,
): NpcRuntimeState | null {
  const state = ensureNpcPrimitivesState(game);
  return state.npcs[npcId] ?? null;
}

export function listNpcStates(game: GameAPI): NpcRuntimeState[] {
  return Object.values(ensureNpcPrimitivesState(game).npcs);
}

export function unregisterNpc(game: GameAPI, npcId: NpcId): void {
  const state = ensureNpcPrimitivesState(game);
  delete state.npcs[npcId];
}
