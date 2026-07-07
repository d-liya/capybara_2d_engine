type AuthoredSpeechInput = string | readonly string[];

export interface AuthoredSpeechCue {
  prompt: AuthoredSpeechInput;
  options?: {
    voiceName?: string;
    speakers?: Array<{ speaker: string; voiceName: string }>;
    volume?: number;
    mode?: "interrupt" | "overlap" | "queue";
  };
  subtitle?: string;
}

/**
 * NPC speech is intentionally authored/static.
 *
 * Do not add a runtime `speakNpcLine(game, npcId, text)` helper here. Dynamic
 * transcripts cannot be extracted by the build-time audio manifest and are too
 * slow for normal gameplay. Author speech as static `sdk.audio.speak([...])`
 * calls near the NPC/scene that owns the line so scripts/audio-extract-plugin.ts
 * can pre-generate/cache the audio.
 */
export function defineAuthoredSpeechCue(cue: AuthoredSpeechCue): AuthoredSpeechCue {
  return cue;
}
