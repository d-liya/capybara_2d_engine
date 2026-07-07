# NPCs

Put one file per named character here.

NPC files define character identity and character-specific behavior, not render prefabs.
Use `src/archetypes/` for sprite/body defaults and `src/scenes/` for spawning/composition.

Pattern:

```ts
import type { EntityId, GameAPI } from "../Game";
import { registerNpc } from "../npc-primitives";
import { sdk } from "../sdk";

export const GUIDE_NPC_ID = "guide" as const;

/** Friendly male guide — reuse on every Guide line. */
const GUIDE_VOICE = "Achird" as const;

const GUIDE_GREETING_PROFILE = `
Synthesize speech from the structured prompt below. Perform only the words under #### TRANSCRIPT. Do not read section headings, director's notes, or sample context aloud.

# AUDIO PROFILE: Guide
## "Calm Trail Guide"

## THE SCENE: Footpath Conversation
The Guide is close to the player during normal gameplay. The line is practical, friendly, and in-world.

### DIRECTOR'S NOTES
Style: Calm, observant, and gently helpful.
Pace: Brief and measured.
Accent: Neutral English.

### SAMPLE CONTEXT
Authored proximity greetings, short movement reasons, and exploration hints.

#### TRANSCRIPT
`;

const GUIDE_GREETING_LINE = `
Guide: [quietly] I hear water beyond those trees.
`;

export function setupGuideNpc(game: GameAPI, entityId: EntityId): void {
  registerNpc(game, {
    id: GUIDE_NPC_ID,
    displayName: "Guide",
    canMove: true,
  }, entityId);
}

export function playGuideGreeting(): void {
  void sdk.audio.speak([GUIDE_GREETING_PROFILE, GUIDE_GREETING_LINE], {
    voiceName: GUIDE_VOICE,
  });
}
```

Typical named NPC files may include:

- NPC id constants
- one exported voice constant per voiced character
- `setup<Name>Npc(...)`
- scripted dialogue line selection
- authored/extractable speech prompts such as `sdk.audio.speak([PROFILE, LINE], options)`
- schedule/autonomy setup for that character
- LLM system prompt and memory id, when the character uses SDK AI
- character-specific tool registration, when the character uses tools

Do not add dynamic `speakNpcLine(game, npcId, text)` style helpers. Runtime transcripts are too slow and cannot be pre-extracted. Keep voiced words authored and static so the audio manifest can pre-generate/cache them.

Scenes should call NPC setup after spawning the matching archetype:

```ts
const guideEntityId = game.spawnAtFeet("npcGuide", 520, 640);
setupGuideNpc(game, guideEntityId);
```

See `docs/recipes/npc-primitives.md`, `docs/recipes/npc-dialogue.md`, and `docs/recipes/llm-backed-npc-tools.md`.
