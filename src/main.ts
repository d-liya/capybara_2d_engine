import "../styles.css";
import { preloadAllAudio } from "./core/audio";
import {
  createLoadingGate,
  preloadDataAssets,
  setupOrientationReload,
} from "./utils/common";
import { allDataFiles, intro } from "./data";
import { createMainScene } from "./scenes/mainScene";
import { enableAnalyticsByDefault } from "./sdk";
import { createOpeningIntro } from "./utils/openingIntro";
import { installTypewriterAudioUnlock } from "./utils/typewriter";

async function bootstrap() {
  setupOrientationReload();
  preloadDataAssets(allDataFiles);
  void preloadAllAudio();

  // This enables analytics by default (SDK init + guest session + playtime). DO not remove unless you don't want to track playtime.
  void enableAnalyticsByDefault();

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const loadingGate = createLoadingGate(canvas, { dataFiles: allDataFiles });
  installTypewriterAudioUnlock();
  const openingIntro = createOpeningIntro(intro);

  // Starter scene — SVG floor + box player until generated maps/characters exist.
  createMainScene({
    onAudioReady: loadingGate.onContinue,
    followZoom: 1,
    maxViewportScale: 0.6,
  });

  await loadingGate.waitForCompletion();
  openingIntro.prepare();
  loadingGate.teardown();
  await openingIntro.play();
}

bootstrap();
