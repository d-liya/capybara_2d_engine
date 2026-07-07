import { preloadAllAudio } from "./core/audio";
import { createLoadingGate, preloadDataAssets } from "./utils";
import { allDataFiles } from "./data";
import { sdk } from "./sdk";

async function bootstrap() {
  preloadDataAssets(allDataFiles);
  void preloadAllAudio();
  void sdk.audio.preloadSpeechManifest(
    new URL("./audio-manifest.json", import.meta.url).href,
  );

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const loadingGate = createLoadingGate(canvas);

  // Create and start the game scene here, for example:
  // createMainScene({ onAudioReady: loadingGate.onContinue });
  // Start browser-gated audio from loadingGate.onContinue, not from passive
  // scene startup. The production loading gate emits this from the Tap To
  // Continue gesture so calls like music.play(), AudioContext.resume(), and
  // sdk.audio.speak(...) are much less likely to be blocked by autoplay rules.

  await loadingGate.waitForCompletion();
  loadingGate.teardown();
}

bootstrap();
