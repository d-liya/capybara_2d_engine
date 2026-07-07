---
name: ai-agent-tool-calls
description: Autonomous SDK AI agents that call tools to inspect or affect game state. Use when building AI assistants or NPCs with sdk.ai.createAgent and tool loops.
---

# Recipe: AI Agent Tool Calls

Use this when the task asks for an autonomous NPC/assistant that can inspect or affect game state through tools. For named game NPCs, also read `docs/recipes/npc-primitives.md` and `docs/recipes/llm-backed-npc-tools.md`.

## Session/auth

AI calls require a user session; the SDK facade auto guest-auths when needed. See `docs/SDK_FACADE.md`.

## Basic agent

```ts
const agent = sdk.ai.createAgent(systemPrompt, {
  maxToolLoops: 10,
});
```

Agents always use model `capybara_agent`; do not pass a model in agent options. Keep `maxToolLoops` low for gameplay so an autonomous agent cannot stall the frame/UI. Persistent `history` adds storage writes and summarization cost, so add it only when the game explicitly requires cross-session/infinite memory; then read `docs/recipes/persistent-agent-history.md`.

## Tool pattern

Tools should be narrow, deterministic, and return small JSON objects. Do not expose the whole game object to the AI.

Keep tool `parameters` as a flat object schema. Prefer top-level fields like `amount`, `cropId`, and `reason` instead of nested objects or arrays of objects. Flat shapes are easier for the model to fill correctly and simpler to validate in `execute`.

```ts
sdk.ai.addTool(agent, {
  name: "get_farm_status",
  description: "Returns the current season, day, gold, and crop states.",
  parameters: {
    type: "object",
    properties: {},
    required: [],
  },
  execute: async () => {
    const farm = game.getResource<FarmState>("farm");
    return {
      season: farm.season,
      globalDay: farm.globalDay,
      seasonDay: farm.seasonDay,
      gold: farm.gold,
      crops: farm.crops.map((crop) => ({
        id: crop.id,
        state: crop.state,
        daysSincePlanting: crop.daysSincePlanting,
      })),
    };
  },
});
```

## Action tools

For tools that mutate game state, validate arguments and enforce game rules in code. The AI suggests intent; TypeScript code decides what is legal.

```ts
sdk.ai.addTool(agent, {
  name: "give_player_tip_reward",
  description: "Awards a small gold reward after a tutorial tip, once per day.",
  parameters: {
    type: "object",
    properties: {
      amount: { type: "number", minimum: 1, maximum: 5 },
      reason: { type: "string" },
    },
    required: ["amount", "reason"],
  },
  execute: async ({ amount, reason }) => {
    const safeAmount = Math.max(1, Math.min(5, Number(amount) || 1));
    const farm = game.getResource<FarmState>("farm");
    farm.gold += safeAmount;
    return { ok: true, awarded: safeAmount, reason: String(reason ?? "") };
  },
});
```

## Prompting rules for autonomous agents

Include:

- identity and role
- hard boundaries: what the agent may/may not do
- response length/style
- when to call tools
- what each tool does and how to call it, with a short example per tool
- tool safety instructions
- stable instructions about where to get current game facts, but not the changing facts themselves

Document tools in the system prompt, not just in `description`. Tell the model what each tool returns or changes, when to use it, and what arguments to pass. A one-line example call helps a lot.

Example:

```ts
const systemPrompt = `You are Marta, a warm elderly farm mentor in Harvest Hollow.
Stay in character. Keep replies to 2 short sentences.
Use current gameplay facts from tool results or from the latest user message, not from memory.

Tools:
- get_farm_status(): read-only. Use when you need exact season, day, gold, or crop state. Example: call get_farm_status with {} before answering "how are my crops?"
- give_player_tip_reward({ amount, reason }): awards 1-5 gold after a tutorial tip, once per day. Use only when the player completes a tip you just gave. Example: { "amount": 3, "reason": "watering basics" }

Use tools only when you need exact farm state or when the player explicitly asks about crops/gold.
Never invent crop states, gold totals, or save data. If a tool result conflicts with your memory, trust the tool.
You may suggest actions, but game code decides whether actions are legal.`;
```

Keep the system prompt stable for cache hits. Do not interpolate changing gameplay state such as season, day, gold, player location, crop state, quest state, or inventory into `createAgent(...)`. Pass those facts in the per-turn user message or read them through narrow tools.

## Avoid

- Do not let tools accept arbitrary code or raw entity ids from the model.
- Do not use nested parameter objects (for example `{ target: { x, y } }`). Split into flat fields (`targetX`, `targetY`) or use separate tools.
- Do not rely on tool `description` alone. Mirror tool names, args, and usage in the system prompt.
- Do not put changing gameplay facts in `createAgent(...)` system prompts; use per-turn user messages or tool results instead.
- Do not put private/generated URLs in prompts.
- Do not run agent calls every frame. Trigger them from inputs/events and cache results in resources.
