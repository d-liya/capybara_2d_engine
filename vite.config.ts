import { defineConfig } from "vite";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [tailwindcss()],
  server: {
    host: "0.0.0.0",
    port: 3000,
    open: "/index.html",
    strictPort: true,
    // E2B public preview hosts look like 3000-<sandboxId>.e2b.app
    allowedHosts: [".e2b.app"],
  },
  preview: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    allowedHosts: [".e2b.app"],
  },
  build: {
    outDir: "dist",
    target: "es2022",
    sourcemap: false,
    minify: "esbuild",
    rollupOptions: {
      input: "index.html",
    },
  },
});
