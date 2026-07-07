---
name: llm-backed-npc-tools
description: SDK AI agents with game-state tools for named NPCs. Use when an NPC needs to inspect or mutate game state through sdk.ai.addTool functions.
---

# Recipe: LLM-backed NPC tools

Use this when a named NPC needs an SDK AI agent that can inspect or affect game state through tools.

Tools are plain JavaScript functions registered with `sdk.ai.addTool(...)`. Keep each tool narrow, deterministic, and small. Define tools in the NPC file or nearby feature module so the available actions match that character.

Do not expose dynamic text-to-speech tools such as `speak({ text })`. Runtime transcripts are too slow and cannot be pre-extracted. If an AI NPC should produce voiced output, expose stable authored line ids and map those ids to static `sdk.audio.speak([PROFILE, LINE], options)` calls in game code.

## Character file pattern

```ts
import type { EntityId, GameAPI } from "../Game";
import { sdk } from "../sdk";
import {
  getNpcPlayerProximity,
  getNpcWorldMarkdown,
  moveNpcToLocation,
  registerNpc,
  setNpcThought,
} from "../npc-primitives";

export const GUIDE_NPC_ID = "guide" as const;

/** Male guide — keep on every Guide line. */
const GUIDE_VOICE = "Achird" as const;

// Define GUIDE_PROFILE and GUIDE_BRIDGE_LINE as static TTS constants — see docs/recipes/tts-prompting.md.

export function setupGuideNpc(game: GameAPI, entityId: EntityId): void {
  registerNpc(game, {
    id: GUIDE_NPC_ID,
    displayName: "Guide",
    canMove: true,
  }, entityId);
}

export function playGuideAuthoredLine(lineId: "bridge_hint"): void {
  if (lineId === "bridge_hint") {
    void sdk.audio.speak([GUIDE_PROFILE, GUIDE_BRIDGE_LINE], { voiceName: GUIDE_VOICE });
  }
}
```

## Agent prompt

```ts
function createGuideSystemPrompt(game: GameAPI): string {
  return `You are Guide, a calm trail guide in a top-down adventure game.
Stay in character. Keep text under 12 words.
Use itemId exactly when calling movement tools.
Use line ids exactly when calling authored speech tools.

Available authored line ids:
- bridge_hint: Guide quietly says the bridge is safer at dawn.

Tools:
- get_world_context(): returns static generated map context. Use itemId exactly.
- observe_player(): returns distance to the player.
- move_to_location({ itemId }): moves you to a world-context itemId.
- set_thought({ text }): shows a short private thought bubble.
- play_authored_line({ lineId }): plays one preauthored voiced line by id. Do not invent line ids.

World context:
${getNpcWorldMarkdown(game)}`;
}
```

## Tool examples

```ts
export function createGuideAgent(game: GameAPI) {
  const agent = sdk.ai.createAgent(createGuideSystemPrompt(game), {
    maxToolLoops: 4,
  });

  sdk.ai.addTool(agent, {
    name: "get_world_context",
    description: "Returns compact static map context. Use itemId exactly in tool calls.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: () => ({ ok: true, markdown: getNpcWorldMarkdown(game) }),
  });

  sdk.ai.addTool(agent, {
    name: "observe_player",
    description: "Returns distance to the player and whether they are nearby.",
    parameters: { type: "object", properties: {}, required: [] },
    execute: () => ({
      ok: true,
      observation: getNpcPlayerProximity(game, GUIDE_NPC_ID),
    }),
  });

  sdk.ai.addTool(agent, {
    name: "move_to_location",
    description: "Move to a world-context itemId.",
    parameters: {
      type: "object",
      properties: { itemId: { type: "string" } },
      required: ["itemId"],
    },
    execute: ({ itemId }) => moveNpcToLocation(game, GUIDE_NPC_ID, String(itemId ?? "")),
  });

  sdk.ai.addTool(agent, {
    name: "set_thought",
    description: "Show a short private thought bubble above the NPC.",
    parameters: {
      type: "object",
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    execute: ({ text }) => setNpcThought(game, GUIDE_NPC_ID, String(text ?? "")),
  });

  sdk.ai.addTool(agent, {
    name: "play_authored_line",
    description: "Play one preauthored Guide voice line by id.",
    parameters: {
      type: "object",
      properties: { lineId: { type: "string", enum: ["bridge_hint"] } },
      required: ["lineId"],
    },
    execute: ({ lineId }) => {
      if (lineId !== "bridge_hint") return { ok: false, message: "Unknown line id" };
      playGuideAuthoredLine("bridge_hint");
      return { ok: true, lineId };
    },
  });

  return agent;
}
```

## Guidelines

- Add only the tools the character needs.
- Prefer world-context `itemId` movement over raw coordinate movement.
- Put authored voice profiles, line transcripts, and line-id mappings in the NPC file.
- Add persistent `history` only when the game explicitly needs cross-session memory; read `docs/recipes/persistent-agent-history.md` first.
- Keep voiced output authored/static and extractable.
- Let LLM output text to dialogue/thought bubbles when needed, but do not feed that dynamic text into TTS.
- Trigger agent calls from input, navigation completion, schedule ticks, or meaningful events.
- Store results in resources/bubbles/widgets; do not block the render loop.
