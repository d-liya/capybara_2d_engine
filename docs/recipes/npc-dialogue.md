---
name: npc-dialogue
description: Scripted NPC dialogue, bubbles, and branching trees. Use when adding talkable NPCs, barks, or conversational interactions.
---

# Recipe: NPC Dialogue

Use this for NPCs the player can talk to or hear during gameplay. Most NPC dialogue should be scripted/resource-driven. Use SDK AI agents when the NPC needs open-ended conversation, memory, reasoning over current facts, or tool calls.

## Choose the dialogue approach

| Need | Use |
|---|---|
| Fixed greetings, tutorial text, shopkeeper lines, warnings, quest accept/complete text, combat barks, signs, flavor chatter | Scripted/resource-driven dialogue |
| Small branching conversation with known choices/results | Local dialogue tree in resources/widgets |
| Dynamic line selected from season, quest step, relationship, time, or inventory | Deterministic code selecting from local line tables |



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
