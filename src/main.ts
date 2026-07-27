import "../styles.css";
import { preloadAllAudio } from "./core/audio";
import {
  createLoadingGate,
  preloadDataAssets,
  setupOrientationReload,
} from "./utils/common";
import { allDataFiles } from "./data";
import { createMainScene } from "./scenes/mainScene";

async function bootstrap() {
  setupOrientationReload();
  preloadDataAssets(allDataFiles);
  void preloadAllAudio();

  const canvas = document.getElementById("game") as HTMLCanvasElement;
  const loadingGate = createLoadingGate(canvas);

  // Starter scene — SVG floor + box player until generated maps/characters exist.
  createMainScene({
    onAudioReady: loadingGate.onContinue,
    followZoom: 1,
    maxViewportScale: 0.6,
  });

  await loadingGate.waitForCompletion();
  loadingGate.teardown();
}

bootstrap();
