const SENTENCE_PAUSE_MS = 220;
const COMMA_PAUSE_MS = 90;
const CLAUSE_PAUSE_MS = 60;
const TYPEWRITER_START_CLIP_URL =
  "https://assets.capybara.build/common/d19b-41e0-4668-a392-3d9d6a3994d6.mp3";

let audioContext: AudioContext | null = null;
let startClip: HTMLAudioElement | null = null;
let unlockListenersInstalled = false;

function delayAfter(character: string, characterDelayMs: number): number {
  if (character === "." || character === "!" || character === "?") {
    return characterDelayMs + SENTENCE_PAUSE_MS;
  }
  if (character === ",") return characterDelayMs + COMMA_PAUSE_MS;
  if (character === ";" || character === ":") {
    return characterDelayMs + CLAUSE_PAUSE_MS;
  }
  return characterDelayMs;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!audioContext) {
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor) return null;
    audioContext = new AudioContextCtor();
  }
  return audioContext;
}

function getStartClip(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") return null;
  if (!startClip) {
    startClip = new Audio(TYPEWRITER_START_CLIP_URL);
    startClip.preload = "auto";
  }
  return startClip;
}

export function typewriterCharacterCount(
  text: string,
  elapsedMs: number,
  characterDelayMs = 32,
): number {
  if (!text) return 0;

  let count = 1;
  let remainingMs = Math.max(0, elapsedMs);
  while (count < text.length) {
    const delayMs = delayAfter(text[count - 1], characterDelayMs);
    if (remainingMs < delayMs) break;
    remainingMs -= delayMs;
    count += 1;
  }
  return count;
}

export function isTypewriterSoundCharacter(character: string): boolean {
  return /[\p{L}\p{N}]/u.test(character);
}

export function unlockTypewriterAudio(): void {
  const context = getAudioContext();
  if (!context || context.state === "closed") return;
  void context.resume().catch(() => undefined);
}

export function installTypewriterAudioUnlock(): void {
  if (unlockListenersInstalled || typeof window === "undefined") return;
  unlockListenersInstalled = true;
  getStartClip()?.load();
  window.addEventListener("pointerdown", unlockTypewriterAudio, {
    capture: true,
    passive: true,
  });
  window.addEventListener("keydown", unlockTypewriterAudio, { capture: true });
}

export function playTypewriterStartClip(): void {
  const clip = getStartClip();
  if (!clip) return;
  clip.pause();
  clip.currentTime = 0;
  clip.volume = 0.65;
  void clip.play().catch(() => undefined);
}

export function playTypewriterBlip(baseFrequency = 500): void {
  const context = getAudioContext();
  if (!context || context.state !== "running") return;

  const now = context.currentTime;
  const frequency = Math.max(80, baseFrequency + (Math.random() - 0.5) * 48);
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(frequency, now);
  oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.72, now + 0.04);
  gain.gain.setValueAtTime(0.065, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.045);
}
