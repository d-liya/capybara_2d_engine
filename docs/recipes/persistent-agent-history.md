---
name: persistent-agent-history
description: Cross-session conversation memory for LLM-backed NPCs. Use only when NPCs need memory across page reloads or long-running chat relationships.
---

# Recipe: Persistent AI Agent History

Use this only when an LLM-backed NPC or assistant explicitly needs long-running conversation memory across page reloads or play sessions.

Persistent history is **not default behavior**. It adds storage writes and background summarization cost, so do **not** enable it unless the game design requires cross-session memory, long-running NPC relationships, or an infinite assistant-style chat.

Do **not** use this for fixed greetings, barks, shop text, tutorials, signs, or small local dialogue trees. Use scripted/resource-driven dialogue for those cases.

## Session/auth

Persistent agent history requires a user session; the SDK facade auto guest-auths when needed. See `docs/SDK_FACADE.md`.

## Basic persistent agent

Pass a stable `history.id` only when persistent memory is required:

```ts
const agent = sdk.ai.createAgent(
  `You are Marta, a warm village mentor.
Stay in character. Keep replies short.
Use current gameplay facts from the latest user message or tools, not from memory.`,
  {
    history: {
      id: "npc:marta",
      summarizePrompt: `Summarize Marta's conversation with the player for future continuity.
Preserve durable facts, player preferences, promises, relationship changes, quest commitments, and unresolved threads.
Do not keep irrelevant small talk unless it affects continuity.`,
      maxMessages: 40,
      keepRecentMessages: 12,
    },
  },
);
```

The agent:

- always uses model `capybara_agent`
- lazily loads prior history on first `chat(...)`
- saves history after successful replies
- stores history in isolated `sdk.storage`, not the main `saveGameData(...)` blob
- schedules summarization in the background once `maxMessages` is exceeded
- uses model `capybara_summarize` for summarization
- keeps recent messages verbatim while older messages are compressed into a summary

## Choosing `history.id`

The id should describe the memory scope. It is scoped by the active game and authenticated user by the SDK storage layer, so usually it does not need to include `gameId` or `userId`.

Good examples:

```ts
"assistant:main"
"npc:blacksmith"
"npc:marta"
"party:guide"
"world:narrator"
```

Use separate ids when memories should be separate. For example, each open-ended NPC should usually have its own id:

```ts
history: { id: "npc:blacksmith", summarizePrompt: "..." }
history: { id: "npc:mayor", summarizePrompt: "..." }
```

Use a shared id only when the design intentionally wants shared memory.

## What memory should and should not mean

Persistent history is conversational continuity, not authoritative game state.

Good things for memory:

- the player's name or preferences
- promises made in conversation
- relationship tone
- facts the NPC revealed
- unresolved story threads
- roleplay continuity

Do not rely on memory for exact mutable game state such as gold, inventory, quest completion, crop state, player position, health, or unlocked areas. Put current facts in the per-turn user message or expose narrow tools. If memory conflicts with tool results or current game resources, trust the current game state.

## Per-turn facts still belong in `chat(...)`

Keep the system prompt stable. Do not interpolate changing state into `createAgent(...)`.

```ts
const reply = await agent.chat(
  `The player greets you near the farm.
Current game facts: season=${farm.season}, day=${farm.seasonDay}, gold=${farm.gold}.
Answer with one timely tip.`,
);
```

For agents that need exact or mutable state, also read `docs/recipes/ai-agent-tool-calls.md`.

## Streaming dialogue UI

Persistent history works with streaming the same way as regular agents:

```ts
dialogue.fullText = "";
dialogue.visibleText = "";
dialogue.isLoading = true;

const reply = await agent.chat(userMessage, {
  onChunk: (textDelta) => {
    dialogue.fullText += textDelta;
    // Let the dialogue widget/typewriter reveal from fullText.
  },
});

dialogue.fullText = reply;
dialogue.isLoading = false;
```

Background summarization should not block the reply from appearing. It may finish after the dialogue UI has already updated.

## Resetting memory

Use `resetMemory()` for explicit player actions such as "forget this conversation", debugging, or starting a new character relationship.

```ts
await agent.resetMemory();
```

When persistent history is configured, this clears both in-memory and stored history for that `history.id`.

## Avoid

- Do not use persistent agents for simple scripted NPCs.
- Do not put changing gameplay facts in the system prompt.
- Do not save agent history with `sdk.save.saveGameData(...)`; agent history uses isolated `sdk.storage` internally.
- Do not run agent chat every frame. Trigger chat from player input, dialogue choices, or explicit events.
- Do not treat summarized memory as canonical save data. Store canonical gameplay progress in resources and `saveGameData(...)`.
