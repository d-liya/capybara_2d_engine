/**
 * Opens the local dev URL once the esbuild server is listening.
 * Used by `npm run dev` so we don't need the unmaintained live-server package.
 *
 * Must stay alive: `concurrently -k` kills css/js if this process exits.
 */
import { exec } from "node:child_process";
import http from "node:http";

// Server binds 0.0.0.0 (see package.json); open/probe via localhost.
const HOST = "127.0.0.1";
const PORT = 3000;
const PATH = "/index.html";
const URL = `http://localhost:${PORT}${PATH}`;
const MAX_ATTEMPTS = 40;
const INTERVAL_MS = 250;

function isUp() {
  return new Promise((resolve) => {
    const req = http.get(
      { host: HOST, port: PORT, path: PATH, timeout: 500 },
      (res) => {
        res.resume();
        resolve(true);
      },
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd =
    platform === "darwin"
      ? `open "${url}"`
      : platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;
  exec(cmd, () => {
    /* ignore open failures (headless CI, etc.) */
  });
}

async function main() {
  let opened = false;
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    if (await isUp()) {
      openBrowser(URL);
      opened = true;
      console.log(`[dev:open] ${URL}`);
      break;
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
  if (!opened) {
    console.warn(
      `[dev:open] Server not ready at ${URL} — open it manually once esbuild starts.`,
    );
  }

  // Keep an active handle so Node does not exit (a bare never-resolving
  // Promise is not enough for the event loop).
  setInterval(() => {}, 60_000);
}

main().catch((err) => {
  console.error("[dev:open]", err);
  // Still stay alive so -k does not tear down the rest of `npm run dev`.
  setInterval(() => {}, 60_000);
});
