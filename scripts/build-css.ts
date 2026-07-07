import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const INPUT = "styles.css";
const OUTPUT = "dist/styles.css";

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

export async function buildCss(): Promise<void> {
  const css = fs.readFileSync(INPUT, "utf8");
  const result = await postcss([tailwind()]).process(css, { from: INPUT });
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, result.css);
  console.log(`[css] wrote ${OUTPUT} (${result.css.length} bytes)`);
}

function scheduleRebuild(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    buildCss().catch((error) => {
      console.error("[css] build failed:", error);
    });
  }, 80);
}

export function watchCss(): void {
  buildCss().catch((error) => {
    console.error("[css] build failed:", error);
    process.exit(1);
  });

  fs.watch(INPUT, () => scheduleRebuild());
  fs.watch("src", { recursive: true }, () => scheduleRebuild());
  console.log("[css] watching styles.css and src/");
}

const isCli = path.basename(process.argv[1] ?? "").includes("build-css");

if (isCli) {
  if (process.argv.includes("--watch")) {
    watchCss();
  } else {
    buildCss().catch((error) => {
      console.error(error);
      process.exit(1);
    });
  }
}
