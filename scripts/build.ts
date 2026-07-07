import * as esbuild from "esbuild";
import { hashDistFile, updateIndexHtmlAssets } from "./asset-hash";
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

  const stylesFile = hashDistFile("dist/styles.css", "styles", ".css");
  const mainFile = hashDistFile("dist/main.js", "main", ".js");
  updateIndexHtmlAssets({ main: mainFile, styles: stylesFile });
  console.log(`[build] hashed assets: dist/${mainFile}, dist/${stylesFile}`);
}

runBuild().catch((error) => {
  console.error(error);
  process.exit(1);
});
