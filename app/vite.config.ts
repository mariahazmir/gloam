import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// VITE_GLOAM_HOSTED is read at build time and exposed to the app through
// import.meta.env. It is "true" only for the hosted build (Demo_Mode default on).
// Vite supports `?raw` imports natively, so no plugin is needed for them.
// GLOAM_BASE lets the GitHub Pages fallback build use the /gloam/ base path.
export default defineConfig(({ mode }) => ({
  base: loadEnv(mode, ".", "GLOAM_").GLOAM_BASE ?? "/",
  server: {
    // Allow `?raw` imports of docs/validation.md and the pack files in ../data.
    fs: { allow: [".."] },
    host: "127.0.0.1",
  },
  test: {
    environment: "node",
    setupFiles: ["tests/setup.ts"],
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
}));
