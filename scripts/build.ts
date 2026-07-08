import * as esbuild from "esbuild";
import { buildCss } from "./build-css";

async function runBuild(): Promise<void> {
  await buildCss();
  await esbuild.build({
    entryPoints: ["src/main.ts"],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: true,
    legalComments: "none",
    outfile: "dist/main.js",
  });

  console.log("[build] wrote dist/styles.css and dist/main.js");
}

runBuild().catch((error) => {
  console.error(error);
  process.exit(1);
});
