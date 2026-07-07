import type { EntityId, GameAPI } from "../Game";

export const NPC_STATE_RESOURCE = "npcPrimitives";
export const NPC_WORLD_CONTEXT_RESOURCE = "npcWorldContext";

export type NpcId = string;
export type Box2d = [number, number, number, number];

export interface NpcDefinition {
  id: NpcId;
  displayName: string;
  archetype?: string;
  canMove?: boolean;
  barkCooldownMs?: number;
  thoughtDurationMs?: number;
}

export interface NpcRuntimeState {
  id: NpcId;
  entityId: EntityId;
  displayName: string;
  canMove: boolean;
  barkCooldownMs: number;
  thoughtDurationMs: number;
  isThinking: boolean;
  thoughtText: string;
  thoughtUntilMs: number;
  barkText: string;
  barkUntilMs: number;
  lastBarkAtMs: number;
  currentDestinationId?: string;
  currentActivity?: string;
}

export interface NpcPrimitivesState {
  npcs: Record<NpcId, NpcRuntimeState>;
}

export interface NpcLocation {
  itemId: string;
  /** Best source/generated id before collision handling. Useful for prompts/debugging. */
  preferredId?: string;
  id: string;
  name: string;
  x: number;
  y: number;
  bounds?: Box2d;
  kind?: string;
  description?: string;
  tags?: string[];
  mapId?: string;
}

export interface NpcWorldItem extends NpcLocation {
  sourceId?: string;
}

export interface NpcWorldContext {
  mapId?: string;
  mapName?: string;
  /** Stable, short ids for LLM tool calls. */
  items: Record<string, NpcWorldItem>;
  /** Alias kept for movement/location helpers. */
  locations: Record<string, NpcLocation>;
  markdown: string;
}

export interface NpcObservation {
  npcId: NpcId;
  npcName: string;
  npcX: number;
  npcY: number;
  playerEntityId: EntityId | null;
  playerX: number | null;
  playerY: number | null;
  distanceToPlayer: number | null;
  isPlayerNear: boolean;
}

export interface NpcToolResult {
  ok: boolean;
  message?: string;
  [key: string]: unknown;
}

export interface NpcToolContext {
  game: GameAPI;
  npcId: NpcId;
  now?: number;
}

export interface NpcAiToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<NpcToolResult> | NpcToolResult;
}
