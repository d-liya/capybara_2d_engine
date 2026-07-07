import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const INDEX_PATH = "index.html";
const STYLES_REF = /href="dist\/styles(?:\.[a-f0-9]+)?\.css"/;
const MAIN_REF = /src="dist\/main(?:\.[a-f0-9]+)?\.js"/;

export function contentHash(content: string | Buffer, length = 8): string {
  return crypto.createHash("sha256").update(content).digest("hex").slice(0, length);
}

export function hashDistFile(
  sourcePath: string,
  baseName: string,
  ext: string,
): string {
  const content = fs.readFileSync(sourcePath);
  const hash = contentHash(content);
  const hashedName = `${baseName}.${hash}${ext}`;
  const destPath = path.join(path.dirname(sourcePath), hashedName);
  fs.renameSync(sourcePath, destPath);
  return hashedName;
}

export function updateIndexHtmlAssets(assets: {
  main: string;
  styles: string;
}): void {
  let html = fs.readFileSync(INDEX_PATH, "utf8");
  html = html.replace(STYLES_REF, `href="dist/${assets.styles}"`);
  html = html.replace(MAIN_REF, `src="dist/${assets.main}"`);
  fs.writeFileSync(INDEX_PATH, html);
}

export function normalizeIndexHtmlAssets(): void {
  updateIndexHtmlAssets({ main: "main.js", styles: "styles.css" });
}
