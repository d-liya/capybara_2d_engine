---
name: tts-prompting
description: Narrated intros, spoken lines, voiceover, and prompt-based TTS performance. Use when adding sdk.audio.speak voice acting, barks, cutscenes, or accessibility voiceover.
---

# Recipe: TTS Prompting

Use this when adding narrated intros, spoken NPC lines, creature/animal sounds, announcements, accessibility voiceover, cutscenes, or generated voiceover.

Capybara TTS uses Gemini Native Audio Generation: a language model that decides not only what to say, but how to say it. The selected `voiceName` sets the base speaker timbre; the prompt steers acting style, pacing, accent, scene, and local delivery tags.

Out of the box, simple transcripts sound natural. For game characters, you still need deliberate **voice casting** and a **shared profile per NPC** so the same sprite always sounds like the same person. The most common failures are (1) using different `voiceName` values or profile text across one character's lines, and (2) pairing a male-coded sprite or profile with a female prebuilt voice (or the reverse). See [Voice casting and consistency](#voice-casting-and-consistency) first.

## Session/auth

TTS calls require a user session; the SDK facade auto guest-auths when needed. See `docs/SDK_FACADE.md`.

## SDK contract

```ts
const voices = await sdk.audio.getSpeechVoices();

void sdk.audio.speak(TTS_PROMPT, {
  voiceName: "Sulafat",
  mode: "interrupt",
});
```

Core options:

```ts
sdk.audio.speak(text: string, options?: {
  voiceName?: string;
  speakers?: Array<{ speaker: string; voiceName: string }>;
  onComplete?: () => void;
  volume?: number;
  mode?: "interrupt" | "overlap" | "queue";
  useCache?: boolean;
});
```

- `text` is the full speech prompt: profile, scene, director notes, sample context, and transcript.
- `voiceName` selects the base prebuilt voice.
- `speakers` is for multi-speaker clips. Speaker names must match labels in the transcript. Capybara supports up to 2 speakers.
- TTS returns WAV audio through the server; the SDK decodes and plays it with Web Audio.

## Available voices

Fetch the authoritative voice list at runtime:

```ts
const { defaultVoice, voices } = await sdk.audio.getSpeechVoices();
console.table(voices);
```

Gemini/Capybara prebuilt voices include:

| Voice | Gender | Descriptor | Good for |
|---|---|---|---|
| Achernar | F | Soft | Narration, gentle elders |
| Achird | M | Friendly | Warm male NPCs, guides, merchants |
| Algenib | M | Gravelly | Rough guards, veterans |
| Algieba | M | Smooth | Calm male authority |
| Alnilam | M | Firm | Stern officials |
| Aoede | F | Breezy | Long narration, audiobook tone |
| Autonoe | F | Bright | Upbeat young women |
| Callirrhoe | F | Easy-going | Relaxed conversational NPCs |
| Charon | M | Informative | Guards, reporters, tutorials |
| Despina | F | Smooth | Polished hosts |
| Enceladus | M | Breathy | Intimate male narration |
| Erinome | F | Clear | Quest givers, clear instructions |
| Fenrir | M | Excitable | Energetic male barks |
| Gacrux | F | Mature | Older women, wise mentors |
| Iapetus | M | Clear | Neutral male gameplay lines |
| Kore | F | Firm | Businesslike women, support roles |
| Laomedeia | F | Upbeat | Cheerful female NPCs |
| Leda | F | Youthful | Young women, teens |
| Orus | M | Firm | Serious male authority |
| Puck | M | Upbeat | Energetic male rogues, sidekicks |
| Pulcherrima | F | Forward | Bold female leads |
| Rasalgethi | M | Informative | Male explainers, lorekeepers |
| Sadachbia | M | Lively | Animated male chatter |
| Sadaltager | M | Knowledgeable | Scholars, sages |
| Schedar | M | Even | Neutral male narration |
| Sulafat | F | Warm | Warm mothers, caretakers, cozy hosts |
| Umbriel | M | Easy-going | Laid-back male villagers |
| Vindemiatrix | F | Gentle | Soft-spoken women |
| Zephyr | F | Bright | Bright tutorials, young energy |
| Zubenelgenubi | M | Casual | Casual male villagers |

Gender reflects the default timbre of each prebuilt voice on the Gemini TTS model. Prompting can shift energy and age, but it cannot reliably flip gender. **Match `voiceName` gender to the character you show on screen.**

Pick a voice whose gender, age feel, and descriptor match the role. Prompting steers performance; contradictions (for example, `Leda` + "gruff old fisherman") reduce quality and cause drift between lines.

## Voice casting and consistency

Treat each voiced NPC like cast casting in a game studio: one actor, one mic, one direction brief, reused on every line.

### Rules

1. **One `voiceName` per character.** Export it beside the profile, reuse it on every `sdk.audio.speak(...)` call for that NPC, and never swap voices between barks.
2. **One shared profile prefix per character.** Put `# AUDIO PROFILE`, `THE SCENE`, `DIRECTOR'S NOTES`, and `SAMPLE CONTEXT` in a single static constant (for example `MARTA_PROFILE`). Append only the line under `#### TRANSCRIPT`.
3. **Align gender and age three ways:** sprite/persona in `src/data/assets.md`, pronouns and character description in the audio profile, and the `voiceName` gender column above must agree.
4. **Keep director notes stable.** Change inline tags per line, not the core Style/Pace/Accent block, unless the character's role truly changes (cutscene vs bark is fine; angry vs calm is better handled with tags).
5. **Document casting in the NPC file.** Add a short comment or constant so future lines do not pick a random voice.

```ts
/** Warm adult woman — keep every Marta line on this voice. */
const MARTA_VOICE = "Sulafat" as const;

const MARTA_PROFILE = `...`;

export function playMartaGreetingLine(): void {
  void sdk.audio.speak([MARTA_PROFILE, MARTA_GREETING_LINE], {
    voiceName: MARTA_VOICE,
    mode: "interrupt",
  });
}
```

### Common mistakes

| Mistake | Symptom | Fix |
|---|---|---|
| Different `voiceName` on each bark | Same NPC sounds like different people | One exported voice constant per NPC |
| Rewriting the whole profile per line | Tone/accent drift | Shared profile + small transcript constants |
| Female character + male voice (or reverse) | Gender feels wrong immediately | Recast using the gender table |
| Profile describes a child, voice is mature | Uncanny delivery | Use `Leda`/`Puck` for youths; `Gacrux`/`Schedar` for elders |
| Picking voices by descriptor only | Male sprite gets `Achird`-like friendly picks on wrong gender | Check gender column first, descriptor second |

### Quick casting by role

| Role | Starting voices |
|---|---|
| Warm village woman | `Sulafat`, `Vindemiatrix`, `Callirrhoe` |
| Young woman / teen | `Leda`, `Autonoe`, `Laomedeia` |
| Firm guard or official (M) | `Charon`, `Orus`, `Alnilam` |
| Friendly male guide / merchant | `Achird`, `Umbriel`, `Zubenelgenubi` |
| Energetic male rogue / kid brother | `Puck`, `Fenrir`, `Sadachbia` |
| Gruff male veteran | `Algenib`, `Enceladus` |
| Wise elder woman | `Gacrux`, `Achernar` |
| Cozy narrator | `Sulafat`, `Aoede`, `Schedar` |
| Creature / non-human | Pick any voice, but write animal/creature direction in Style and tags; do not rely on gender |

When two NPCs must feel distinct, give them different `voiceName` values **and** different profile titles/scenes, not just different transcript text on the same voice.

## Prompt structure

For anything beyond a throwaway test, use this structure:

```txt
Synthesize speech from the structured prompt below. Perform only the words under #### TRANSCRIPT. Do not read section headings, director's notes, or sample context aloud.

# AUDIO PROFILE: <speaker name or persona>
## "<voice/performance title>"

## THE SCENE: <scene title>
<Where the speaker is, what is happening around them, the mood, and how the situation affects delivery.>

### DIRECTOR'S NOTES
Style: <attitude, emotional baseline, acting style, what to avoid>
Pace: <speed, rhythm, pauses, urgency>
Accent: <specific accent/dialect or Neutral English>

### SAMPLE CONTEXT
<What kind of audio this is and where it will be used.>

#### TRANSCRIPT
<exact words/sounds to perform, with optional inline tags>
```

Notes:

- Start with the **synthesize speech** preamble. Vague prompts sometimes fail the speech classifier, get rejected, or cause the model to read director's notes aloud.
- `#### TRANSCRIPT` must contain the exact spoken/performed content only.
- Direction and transcript should agree. If the line is mundane gameplay, avoid trailer-style direction.
- Do not over-specify every micro-detail; give the model space to perform naturally.
- Use `THE SCENE` and `SAMPLE CONTEXT` to make repeated character lines consistent.
- In `# AUDIO PROFILE`, use pronouns and age cues that match the selected `voiceName` gender.
- Use a specific accent if it matters: `Croydon English`, `Southern California English`, `Neutral North American English`, etc.
- Use broadly understood audio, acting, and game terms in profile names and
  titles. Avoid very new slang, team-specific jargon, or abstract labels that do
  not clearly describe a performance. For example, prefer `"Overconfident Indie
  Dev Documentary Narrator"` or `"Brash Tech Documentary Narrator"` over
  `"Overconfident Vibe-Coder Documentary"`.

## Good default for gameplay NPC barks

Use a restrained default. Most gameplay voice should feel close, short, and human-sized.

```txt
Synthesize speech from the structured prompt below. Perform only the words under #### TRANSCRIPT. Do not read section headings, director's notes, or sample context aloud.

# AUDIO PROFILE: Rowan
## "Grounded Village Guard"

## THE SCENE: Gate at the Edge of Town
Rowan is standing near a village gate during regular gameplay. The player is close enough to hear him without cinematic projection. This is a practical warning, not a trailer line.

### DIRECTOR'S NOTES
Style: Alert, protective, and conversational. Firm but not hostile. Avoid announcer energy or exaggerated hero acting.
Pace: Brief and clear, with a natural pause after the warning.
Accent: Neutral English.

### SAMPLE CONTEXT
Sparse proximity bark for an important NPC warning.

#### TRANSCRIPT
[serious] Careful, traveler. The bridge is out ahead.
```

```ts
void sdk.audio.speak(GUARD_WARNING_PROMPT, {
  voiceName: "Charon", // male — matches Rowan (he/him) in the profile
  mode: "interrupt",
});
```

## Inline tags

Tags are inline modifiers like `[whispers]` or `[laughs]` in square brackets. They change tone, pace, and emotional color for a phrase or section. You can also use them for interjections and non-verbal sounds such as `[cough]`, `[sighs]`, or `[gasp]`.

There is no fixed list; experiment with emotions and expressions. If the transcript is not in English, keep tags in **English** for best results.

Useful tags:

- `[amazed]`, `[bored]`, `[curious]`, `[excitedly]`, `[reluctantly]`
- `[very fast]`, `[very slow]`, `[sarcastically, one painfully slow word at a time]`
- `[whispers]`, `[shouting]`
- `[sighs]`, `[gasp]`, `[giggles]`, `[laughs]`, `[cough]`
- `[mischievously]`, `[panicked]`, `[sarcastic]`, `[serious]`, `[tired]`, `[trembling]`

Same line, different delivery:

```txt
[excitedly] Hey there, I'm a new text to speech model, and I can say things in many different ways.
[bored] Hey there, I'm a new text to speech model…
[reluctantly] Hey there, I'm a new text to speech model…
[very fast] Hey there, I'm a new text to speech model…
[whispers] Hey there… [shouting] and I can say things in many different ways! [whispers] How can I help you today?
[like a cartoon dog] Hey there, I'm a new text to speech model…
[like dracula] Hey there, I'm a new text to speech model…
```

Creative tags can steer character, creature, and environmental performances:

```txt
[like a nervous dog] H-hey... I found the trail.
```

```txt
[soft owl hoot, distant] Hoo... hoo...
```

```txt
[like dracula, amused] The cellar is perfectly safe after sunset.
```

```txt
[singing quietly] Apples in the morning, coins by noon.
```

Guidelines:

- Use tags for local changes, not every sentence.
- Tags can describe emotion, pace, volume, creature-like delivery, non-verbal sounds, or vocal texture.
- Keep tags coherent with the scene, profile gender/age, and selected `voiceName`.
- Combine tags with a shared profile for character-wide consistency; use tags for line-specific color.

## NPC character profile pattern

When adding voice to a sprite-based character, ground the performance on `src/data/assets.md` first. Generated character entries describe persona, role, tone, and gameplay intent for that art. The TTS profile, selected `voiceName`, scene, and director notes should match that persona so the spoken performance feels like the same character the player sees on screen.

For reusable NPC speech, define static profile and transcript constants in the NPC file. Export one `voiceName` constant and reuse it on every line. Call `sdk.audio.speak([PROFILE, LINE], options)` directly from meaningful gameplay events so the audio extractor can pre-generate/cache the line.

```ts
import { sdk } from "../sdk";

/** Young male villager — do not change between barks. */
const PIP_VOICE = "Puck" as const;

const PIP_PROFILE = `
Synthesize speech from the structured prompt below. Perform only the words under #### TRANSCRIPT. Do not read section headings, director's notes, or sample context aloud.

# AUDIO PROFILE: Pip
## "Curious Village Wanderer"

## THE SCENE: Village Paths and Orchard Edges
Pip is walking through a cozy top-down village and nearby orchard paths. He is close to the player, speaking casually while deciding where to go next. The moment is small and in-world, not dramatic narration.

### DIRECTOR'S NOTES
Style: Curious, observant, and lightly playful, but grounded. No overexcited mascot energy. A small smile in the voice is enough.
Pace: Casual and brief. Slightly quick when he notices something, but still conversational.
Accent: Neutral English.

### SAMPLE CONTEXT
Pip gives short movement reasons, little discoveries, and occasional soft reactions during gameplay. Inline tags can add local color, e.g. [curious], [murmurs], [small laugh], or [whispers].

#### TRANSCRIPT
`;

const PIP_TREES_LINE = `
Pip: [curious] I want to check those trees.
`;

export function playPipTreesLine(): void {
  void sdk.audio.speak([PIP_PROFILE, PIP_TREES_LINE], {
    voiceName: PIP_VOICE,
  });
}
```

Do not use runtime helpers that accept arbitrary line text. Dynamic transcripts are too slow and cannot be included in `audio-manifest.json`.

If the next gameplay step depends on the spoken line finishing, return or await
the handle instead of discarding it:

```ts
export async function playPipTreesLineThenMove(): Promise<void> {
  const handle = sdk.audio.speak([PIP_PROFILE, PIP_TREES_LINE], {
    voiceName: PIP_VOICE,
  });

  await handle.done;
  startPipWalkingToTrees();
}
```

## Director's notes in depth

`### DIRECTOR'S NOTES` is the most important block for stable performance. You can omit other sections in a pinch, but keep director notes.

Define only what matters. Too many strict rules limit creativity and can sound worse. Balance role/scene description with a few clear performance rules.

Common fields:

- **Style** — emotional baseline and acting approach. Prefer concrete voiceover language ("vocal smile", "high projection without shouting") over one-word labels like "happy".
- **Pace** — overall speed and rhythm, including when to pause or rush.
- **Accent** — be specific (`Brixton, London` beats `British`).

You can add custom bullets (breathing, articulation, what to avoid). Layer style traits when a character needs a signature sound, but keep them stable across all lines for that NPC.

## Animals, creatures, and non-verbal performances

TTS can be useful for more than humanoid speech. You can write creature-like vocalizations or stylized animal performances in the transcript.

```txt
# AUDIO PROFILE: Bramble
## "Sleepy Stable Dog"

## THE SCENE: Warm Stable Doorway
Bramble is half-asleep near the stable while the player walks past. The sound is small, close, and friendly.

### DIRECTOR'S NOTES
Style: Gentle dog-like vocal performance, not a human narrator pretending loudly.
Pace: Short, sleepy, with soft breath.
Accent: Not applicable; prioritize animal-like texture.

### SAMPLE CONTEXT
Ambient creature reaction during cozy gameplay.

#### TRANSCRIPT
[sleepy dog whuff] Ruff... [tiny yawn] hrrm.
```

```ts
void sdk.audio.speak(DOG_PROMPT, {
  voiceName: "Achird",
  mode: "interrupt",
});
```

Use this for rare characterful moments, not every ambient loop. For frequent ambience, use audio assets or procedural audio.

## Narration example

```txt
Synthesize speech from the structured prompt below. Perform only the words under #### TRANSCRIPT. Do not read section headings, director's notes, or sample context aloud.

# AUDIO PROFILE: Elowen
## "Warm Farm Storyteller"

## THE SCENE: First Morning on the Farm
Dawn light falls over a neglected field. The player is arriving at a place that feels quiet, personal, and full of possibility.

### DIRECTOR'S NOTES
Style: Gentle, reassuring, and quietly magical. A small vocal smile, not theatrical wonder.
Pace: Slow enough for a title screen, with soft pauses between sentences.
Accent: Neutral English.

### SAMPLE CONTEXT
Opening narration for a cozy farming game.

#### TRANSCRIPT
[softly] Welcome to Harvest Hollow. Your grandfather left you this farm. [short pause]
The fields have slept long enough, and so have you.
```

```ts
void sdk.audio.speak(INTRO_NARRATION_PROMPT, { voiceName: "Sulafat" }); // warm female narrator
```

## Multi-speaker prompt pattern

Use `speakers` when one clip should contain two voices. Labels in the transcript must exactly match speaker names.

```txt
# AUDIO PROFILE: Guard and Rogue
## "Short Bridge Cutscene"

## THE SCENE: Closed Bridge at Dusk
A guard blocks a narrow bridge while a rogue tries to talk their way through. The exchange is close and quick, not cinematic shouting.

### DIRECTOR'S NOTES
Guard Style: Serious, protective, and clipped.
Rogue Style: Playful, mischievous, and quick.
Pace: Snappy two-person exchange with no long pauses.
Accent: Neutral English for both speakers.

### SAMPLE CONTEXT
Short authored cutscene exchange.

#### TRANSCRIPT
Guard: [serious] The bridge is closed after sunset.
Rogue: [mischievously] Then I suppose we take the river path.
```

```ts
void sdk.audio.speak(BRIDGE_SCENE_PROMPT, {
  speakers: [
    { speaker: "Guard", voiceName: "Charon" },
    { speaker: "Rogue", voiceName: "Puck" },
  ],
  mode: "interrupt",
});
```

For ordinary dialogue UI, separate lines are usually easier to control. Use multi-speaker clips for authored exchanges, cutscenes, radio calls, or one-off scenes.

## Ask an LLM to draft a TTS prompt

Use this when you have context but no finished script:

```txt
You are a scriptwriter and audio director. I have a simple context but NO TRANSCRIPT.

TASK:
1. Write a creative, engaging script based on the given context.
2. Format the entire output as a structured TTS prompt. Follow the strict output format exactly.

You may include emotion, pace, creature, and interjection tags in brackets within the script. Examples: [amused], [sighs], [like a dog], [distant crow call], [whispers]. Be creative, but keep the tags coherent with the scene.

Use plain, widely recognized video-game, film, voiceover, and acting terms for
the audio profile. Avoid niche internet slang, brand-new job labels,
team-internal shorthand, or abstract trend words. A title should make the voice
performance obvious to a general model, e.g. "Warm Farm Storyteller", "Nervous
Dungeon Guide", "Brash Tech Documentary Narrator", or "Tired Harbor Guard".

STRICT OUTPUT FORMAT:

Synthesize speech from the structured prompt below. Perform only the words under #### TRANSCRIPT. Do not read section headings, director's notes, or sample context aloud.

# AUDIO PROFILE: [Invent a Name]
## "[Invent a Title]"

## THE SCENE: [Invent a Scene Title]
[Vivid description of the scene]

### DIRECTOR'S NOTES
Style: [Style instructions]
Pace: [Pace instructions]
Accent: [Accent instructions]

### SAMPLE CONTEXT
[Role/Persona description]

#### TRANSCRIPT
[Script]

----------------

INPUT CONTEXT:
...

CRITICAL RULES:
- Use the divider "#### TRANSCRIPT" exactly before the spoken/performed text.
- Match character gender/age to a sensible prebuilt voice (provide target gender in INPUT CONTEXT).
- Reuse one profile structure so lines for the same character stay consistent.
```

## Limitations and reliability

Gemini TTS behavior to plan for in games:

- **Voice vs prompt mismatch** — output may not strictly match the selected speaker. A deep male voice asked to play a young girl (or the reverse) sounds wrong and varies line to line. Align profile gender/age, pronouns, and `voiceName` before tuning tags.
- **Long clips drift** — quality can degrade after a few minutes. Split narration into smaller static chunks and queue them with `mode: "queue"`.
- **Occasional 500 errors** — rarely the model returns text tokens instead of audio. Retry failed synthesis once or twice in production wrappers if you add custom fetch logic; the SDK cache path will refetch on cache miss after failure.
- **Classifier false rejects** — vague prompts may be rejected or read aloud as meta-instructions. Use the synthesize-speech preamble and an explicit `#### TRANSCRIPT` section.
- **32k token context** — very large prompts are unsupported; keep profiles concise and split long scripts.
- **Text in, audio out** — TTS models do not accept audio input on this API surface.

## Playback policy for games

- Use TTS as an authored voice/sound-design tool: scripted NPC lines, narration, creature sounds, reaction noises, merchant calls, crowd beds, and two-person chatter can all be prewritten and voiced.
- Spoken words should normally be preauthored scripts/line tables. Do not generate important spoken dialogue with an LLM at runtime unless the task explicitly asks for an AI NPC.
- For ambient NPC chatter where exact words should not matter, write preauthored gibberish/non-semantic syllables with conversational timing, turn-taking, laughs, sighs, and tags. This gives the feel of conversation without inventing quest facts or distracting readable dialogue.
- Always show readable text/subtitles alongside meaningful speech. For gibberish/background chatter, subtitles can be omitted or replaced with a neutral cue such as “Nearby guards chat quietly.”
- Use `mode: "interrupt"` for most barks, `queue` for intentional sequences, and `overlap` only for deliberate simultaneous voices or crowd texture.
- Do not fire multiple `sdk.audio.speak(...)` calls back-to-back and assume they
  will behave like a script. If the next task should happen after a line, keep
  the handle and `await handle.done`, use `onComplete`, or use `mode: "queue"`
  for an intentional speech sequence.
- Use cooldowns and state flags. Never call TTS every frame.
- For very frequent non-vocal sounds such as footsteps and UI clicks, prefer audio assets or procedural audio over repeated TTS.

## Preloading and cache-aware TTS

Static `sdk.audio.speak(...)` calls are extracted during build into `dist/audio-manifest.json`. Dynamic lines cannot always be extracted.

For important known lines:

```ts
await sdk.audio.preloadSpeech(INTRO_PROMPT, { voiceName: "Sulafat" });
void sdk.audio.speak(INTRO_PROMPT, { voiceName: "Sulafat" });
```

`sdk.audio.speak(...)` and `sdk.audio.preloadSpeech(...)` also accept an array of static string parts. Prefer this when composing prompts from a reusable profile/prefix plus a line transcript/suffix; it keeps the prompt authored and extractable:

```ts
const PROFILE = `
# AUDIO PROFILE: Market Crowd
## "Warm Background Murmur"

## THE SCENE: Market lane ambience
Several people are nearby, but no exact words should read as quest information.

### DIRECTOR'S NOTES
Style: Soft background chatter, human and relaxed.
Pace: Overlapping but gentle, with small pauses and tiny laughs.
Accent: Neutral English.

### SAMPLE CONTEXT
Preauthored gibberish chatter for ambience.

#### TRANSCRIPT
`;

const CHATTER = `
Voice A: [murmurs] Loma tiri, vessa no.
Voice B: Mm-hm. [small laugh] Paru, paru.
Voice A: Sella... [sighs] mora tin.
`;

void sdk.audio.speak([PROFILE, CHATTER], {
  speakers: [
    { speaker: "Voice A", voiceName: "Aoede" },
    { speaker: "Voice B", voiceName: "Achird" },
  ],
  volume: 0.35,
  mode: "queue",
});
```

Avoid truly dynamic NPC speech. If an AI or system chooses speech, make it choose a stable authored line id, then map that id to a static `sdk.audio.speak([PROFILE, LINE], options)` cue.

## Browser lifecycle

Browser autoplay rules still apply. Trigger TTS from user interaction whenever possible: Start button, dialogue click, quest accept, area interaction, or NPC proximity after movement. If narration must start on load, attempt it once and retry from the first user gesture if playback was blocked.

## Languages

Capybara TTS detects language automatically. Put the target language directly in `#### TRANSCRIPT`. Keep inline tags in English for best results.

## Best practices

- Cast each voiced NPC once: one `voiceName`, one shared profile, many small transcript constants.
- Align sprite persona, profile pronouns, and `voiceName` gender before polishing tags.
- Use grounded, close-range direction for ordinary gameplay barks.
- Expose TTS tools only for characters that should speak aloud.
- Match emotional intensity to the scene and transcript.
- Use tags where they add local control, not on every sentence.
- Start prompts with the synthesize-speech preamble and an explicit `#### TRANSCRIPT`.
- Trigger TTS from meaningful events with cooldowns and state flags.
- Keep director notes stable; vary inline tags per line instead of rewriting the whole profile.
