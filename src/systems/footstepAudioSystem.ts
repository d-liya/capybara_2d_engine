import type { EntityId, GameAPI } from "../Game";

interface TrackedFootstepEntity {
  x: number;
  y: number;
  distanceSinceStep: number;
  lastStepAtMs: number;
  phase: 0 | 1;
}

export interface FootstepAudioOptions {
  systemName?: string;
  stepDistance?: number;
  minIntervalMs?: number;
  playerVolume?: number;
  npcVolume?: number;
  maxNpcDistance?: number;
}

let audioContext: AudioContext | null = null;
let unlockListenersInstalled = false;

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

function unlockFootstepAudio(): void {
  const ctx = getAudioContext();
  if (!ctx || ctx.state === "closed") return;

  void ctx.resume().then(() => {
    // Play an inaudible one-sample buffer from the user gesture. This makes
    // later system-triggered footsteps reliable across stricter browsers.
    const buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    const source = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.00001;
    source.buffer = buffer;
    source.connect(gain).connect(ctx.destination);
    source.start();
  }).catch(() => undefined);
}

function installAudioUnlockListeners(): void {
  if (unlockListenersInstalled || typeof window === "undefined") return;
  unlockListenersInstalled = true;
  const unlock = () => unlockFootstepAudio();
  window.addEventListener("pointerdown", unlock, { passive: true });
  window.addEventListener("keydown", unlock);
  window.addEventListener("touchstart", unlock, { passive: true });
}

function entityFeet(entity: Record<string, unknown>): { x: number; y: number } {
  return {
    x: Number(entity.x ?? 0) + Number(entity.width ?? 0) / 2,
    y: Number(entity.y ?? 0) + Number(entity.height ?? 0),
  };
}

function playFootstep(volume: number, phase: 0 | 1) {
  const ctx = getAudioContext();
  if (!ctx || ctx.state !== "running") return;

  const now = ctx.currentTime;
  const duration = 0.075;

  const noiseBuffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * duration)), ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) {
    const fade = 1 - i / data.length;
    data[i] = (Math.random() * 2 - 1) * fade;
  }

  const noise = ctx.createBufferSource();
  noise.buffer = noiseBuffer;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(phase === 0 ? 760 : 620, now);
  filter.Q.setValueAtTime(0.8, now);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  const thump = ctx.createOscillator();
  thump.type = "sine";
  thump.frequency.setValueAtTime(phase === 0 ? 130 : 112, now);
  thump.frequency.exponentialRampToValueAtTime(phase === 0 ? 82 : 74, now + 0.055);

  const thumpGain = ctx.createGain();
  thumpGain.gain.setValueAtTime(0.0001, now);
  thumpGain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume * 0.55), now + 0.006);
  thumpGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

  noise.connect(filter).connect(gain).connect(ctx.destination);
  thump.connect(thumpGain).connect(ctx.destination);

  noise.start(now);
  noise.stop(now + duration);
  thump.start(now);
  thump.stop(now + 0.065);
}

export function setupFootstepAudioSystem(
  game: GameAPI,
  options: FootstepAudioOptions = {},
): void {
  const tracked = new Map<EntityId, TrackedFootstepEntity>();
  installAudioUnlockListeners();

  const systemName = options.systemName ?? "audio:footsteps";
  const stepDistance = options.stepDistance ?? 34;
  const minIntervalMs = options.minIntervalMs ?? 210;
  const playerVolume = options.playerVolume ?? 0.075;
  const npcVolume = options.npcVolume ?? 0.045;
  const maxNpcDistance = options.maxNpcDistance ?? 360;

  game.registerSystem(systemName, (_dt, api) => {
    const now = performance.now();
    const controlledId = api.getControlledEntity();
    const controlled = controlledId ? api.get(controlledId) : null;
    const controlledFeet = controlled ? entityFeet(controlled) : null;
    const activeIds = new Set<EntityId>();

    const characterIds = api.query((entity) =>
      entity.kind === "character" && entity.visible !== false,
    );

    for (const id of characterIds) {
      const entity = api.get(id);
      if (!entity) continue;
      activeIds.add(id);

      const feet = entityFeet(entity);
      const previous = tracked.get(id);
      if (!previous) {
        tracked.set(id, {
          x: feet.x,
          y: feet.y,
          distanceSinceStep: 0,
          lastStepAtMs: now,
          phase: 0,
        });
        continue;
      }

      const moved = Math.hypot(feet.x - previous.x, feet.y - previous.y);
      previous.x = feet.x;
      previous.y = feet.y;

      if (moved < 0.03) {
        previous.distanceSinceStep = Math.max(0, previous.distanceSinceStep - 0.5);
        continue;
      }

      previous.distanceSinceStep += moved;
      if (
        previous.distanceSinceStep < stepDistance ||
        now - previous.lastStepAtMs < minIntervalMs
      ) {
        continue;
      }

      const isPlayer = id === controlledId;
      let volume = isPlayer ? playerVolume : npcVolume;
      if (!isPlayer && controlledFeet) {
        const distanceToPlayer = Math.hypot(feet.x - controlledFeet.x, feet.y - controlledFeet.y);
        const attenuation = Math.max(0, 1 - distanceToPlayer / maxNpcDistance);
        volume *= attenuation;
      }

      if (volume > 0.002) {
        previous.phase = previous.phase === 0 ? 1 : 0;
        playFootstep(volume, previous.phase);
      }

      previous.distanceSinceStep = 0;
      previous.lastStepAtMs = now;
    }

    for (const id of tracked.keys()) {
      if (!activeIds.has(id)) tracked.delete(id);
    }
  });
}
