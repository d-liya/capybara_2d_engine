---
name: npc-dialogue
description: Scripted and AI-backed NPC dialogue, bubbles, branching trees, and TTS integration. Use when adding talkable NPCs, barks, or conversational interactions.
---

# Recipe: NPC Dialogue

Use this for NPCs the player can talk to or hear during gameplay. Most NPC dialogue should be scripted/resource-driven. Use SDK AI agents when the NPC needs open-ended conversation, memory, reasoning over current facts, or tool calls.

## Choose the dialogue approach

| Need | Use |
|---|---|
| Fixed greetings, tutorial text, shopkeeper lines, warnings, quest accept/complete text, combat barks, signs, flavor chatter | Scripted/resource-driven dialogue |
| Small branching conversation with known choices/results | Local dialogue tree in resources/widgets |
| Dynamic line selected from season, quest step, relationship, time, or inventory | Deterministic code selecting from local line tables |
| Open-ended player questions, generated personality replies, conversation memory, reasoning over current facts, or natural-language tool use | `sdk.ai.createAgent(...)` |
| NPC/assistant that can inspect or mutate game state through tools | `sdk.ai.createAgent(...)` plus `sdk.ai.addTool(...)` |

TTS playback is separate from SDK AI. Scripted lines can be voiced with authored/extractable `sdk.audio.speak([PROFILE, LINE], options)` calls. Use one reusable static TTS profile prefix per NPC so all barks/dialogue keep a consistent voice, tone, scene, style, pace, and accent; pick one `voiceName` per character and match it to the character's gender on screen (see `docs/recipes/tts-prompting.md`). Define each spoken bark/line as a static transcript constant in the named NPC module, then expose no-argument authored cue functions that call `sdk.audio.speak(...)`. Do not use dynamic NPC speech helpers; runtime transcripts are too slow, bypass the audio manifest, and make character voice inconsistent.

## File organization

Use one file per named NPC:

```txt
src/archetypes/characters.ts  // sprite/body definitions
src/npcs/marta.ts             // Marta identity, voice profile, dialogue behavior
src/widgets/DialogueWidget.ts // dialogue UI
src/scenes/MainScene.ts       // composition only
```

NPC files define identity and behavior. Archetypes define render defaults. Scenes spawn and wire things together.

## Archetype

Use real handles and animation names from `src/data/assets.md`.

```ts
import { charMarta, toArchetype } from "../data";

export function defineCharacterArchetypes(game: GameAPI): void {
  game.defineArchetype("npcMarta", toArchetype(charMarta, {
    kind: "character",
    label: "Marta",
    tooltip: "Press E nearby to talk.",
    activeAnimation: "char_marta_default_animation",
    speed: 24,
    width: 100,
    height: 120,
  }));
}
```

## NPC setup

```ts
import type { EntityId, GameAPI } from "../Game";
import { registerNpc } from "../npc-primitives";

export const MARTA_NPC_ID = "marta" as const;

export function setupMartaNpc(game: GameAPI, entityId: EntityId): void {
  registerNpc(game, {
    id: MARTA_NPC_ID,
    displayName: "Marta",
    canMove: true,
  }, entityId);
}
```

## Dialogue state

Register dialogue state as a resource.

```ts
export interface DialogueState {
  isOpen: boolean;
  isLoading: boolean;
  npcEntityId: EntityId | null;
  npcName: string;
  visibleText: string;
  fullText: string;
  revealStartedAt: number;
  error?: string;
}

game.registerResource("dialogue", {
  isOpen: false,
  isLoading: false,
  npcEntityId: null,
  npcName: "",
  visibleText: "",
  fullText: "",
  revealStartedAt: 0,
});
```

Open/close through UI state:

```ts
function openDialogue(game: GameAPI) {
  const dialogue = game.getResource<DialogueState>("dialogue");
  dialogue.isOpen = true;
  game.patchUi({ overlays: { dialogue: true } });
}

function closeDialogue(game: GameAPI) {
  const dialogue = game.getResource<DialogueState>("dialogue");
  dialogue.isOpen = false;
  game.patchUi({ overlays: { dialogue: false } });
}
```

Mount the dialogue widget with an overlay binding:

```ts
game.useWidget(createDialogueWidget, {
  ui: { type: "overlay", id: "dialogue" },
});
```

## Input

Bind an `interact` action:

```ts
game.bindInputAction("interact", ["KeyE", "Space"]);
```

On `interact` down:

1. If dialogue is open, advance or close it.
2. Otherwise find a nearby NPC.
3. Face the NPC toward the player.
4. Open dialogue and fill the dialogue resource.

## Scripted dialogue

Use local line tables for most NPCs.

```ts
type MartaLineId = "greeting" | "questReady" | "questDone";

const martaLines: Record<MartaLineId, string> = {
  greeting: "Good morning, dear. The orchard is quiet today.",
  questReady: "Bring me three apples and I'll show you the old cider press.",
  questDone: "Beautiful work. These will make a fine batch.",
};

function getMartaLine(farm: FarmState): string {
  if (farm.completedQuests.includes("marta-apples")) return martaLines.questDone;
  if (farm.activeQuests.includes("marta-apples")) return martaLines.questReady;
  return martaLines.greeting;
}

export function speakToMarta(game: GameAPI): void {
  const dialogue = game.getResource<DialogueState>("dialogue");
  const farm = game.getResource<FarmState>("farm");
  const line = getMartaLine(farm);

  dialogue.npcName = "Marta";
  dialogue.fullText = line;
  dialogue.visibleText = "";
  dialogue.revealStartedAt = performance.now();
  dialogue.isOpen = true;
  game.patchUi({ overlays: { dialogue: true } });
}
```

## Authored voiced barks

For NPC moments that should be voiced, combine readable authored text with TTS. For background chatter where exact words should not matter, use preauthored gibberish/non-semantic transcripts with conversational rhythm and tags.

```ts
import { barkNpc } from "../npc-primitives";
import { sdk } from "../sdk";

/** Warm adult woman — same voice on every Marta line. */
const MARTA_VOICE = "Sulafat" as const;

const MARTA_PROFILE = `
Synthesize speech from the structured prompt below. Perform only the words under #### TRANSCRIPT. Do not read section headings, director's notes, or sample context aloud.

# AUDIO PROFILE: Marta
## "Warm Orchard Keeper"

## THE SCENE: Orchard Path Conversation
Marta is speaking near the orchard path during normal gameplay. The player is close enough to hear her naturally.

### DIRECTOR'S NOTES
Style: Welcoming, lightly amused, and grounded.
Pace: Relaxed and brief, like a friendly proximity greeting.
Accent: Neutral English.

### SAMPLE CONTEXT
First-time greetings, quest hints, and short orchard-related reactions.

#### TRANSCRIPT
`;

const MARTA_GREETING_LINE = `
Marta: [soft smile] You made it. The orchard has been waiting for you.
`;

export function playMartaGreetingLine(): void {
  void sdk.audio.speak([MARTA_PROFILE, MARTA_GREETING_LINE], {
    voiceName: MARTA_VOICE,
    mode: "interrupt",
  });
}

interface MartaBarkState {
  hasGreetedPlayer: boolean;
  lastBarkAtMs: number;
  proximityRadius: number;
}

function maybePlayMartaGreeting(game: GameAPI, distanceToPlayer: number) {
  const bark = game.getResource<MartaBarkState>("martaBark");
  if (bark.hasGreetedPlayer || distanceToPlayer > bark.proximityRadius) return;

  bark.hasGreetedPlayer = true;
  bark.lastBarkAtMs = performance.now();
  barkNpc(game, MARTA_NPC_ID, "You made it. The orchard has been waiting for you.", {
    ignoreCooldown: true,
  });

  playMartaGreetingLine();
}
```

Use TTS for first-time important greetings, quest beats, warnings, relationship moments, and authored reactions. Use resources for flags and cooldowns.

For new-game first passes, add at least a lightweight proximity bark for every friendly/neutral NPC before explicit interaction unless the design intentionally wants silent NPCs. Pair it with `facePlayer(...)` so the NPC reacts physically, and keep the bark visible through `NpcBubbleWidget`, bark subtitles, toasts, or dialogue UI even if TTS is not enabled. Use existing `barkNpc(...)` only when driving `NpcBubbleWidget`; otherwise update the game's subtitle/toast/dialogue resource directly. If the bark is voiced, reuse that NPC's static profile and static bark transcript through a no-argument cue function such as `playMartaGreetingLine()` instead of importing prompt constants into systems or inventing a `speakNpcLine(text)`-style function.

## LLM-backed dialogue

Use an SDK agent when the NPC needs generated conversation or tool use. For tool-using NPCs, read `docs/recipes/llm-backed-npc-tools.md` and `docs/recipes/ai-agent-tool-calls.md`. For cross-session memory or streaming UI patterns, read `docs/recipes/persistent-agent-history.md`.

## Typewriter text

Dialogue widgets should reveal newly shown text smoothly — see `src/widgets/AGENTS.md` for pacing rules.

```ts
dialogue.fullText = line;
dialogue.visibleText = "";
dialogue.revealStartedAt = performance.now();
```

## Movement and facing

Use NPC primitives for simple movement/facing.

```ts
import { facePlayer, moveNpcToLocation } from "../npc-primitives";

facePlayer(game, MARTA_NPC_ID);
moveNpcToLocation(game, MARTA_NPC_ID, "orchard-gate", { speed: 24 });
```

Check animation names in `src/data/assets.md` before making an NPC wander.
