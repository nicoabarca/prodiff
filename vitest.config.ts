import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vitest/config";

// Kept out of `vite.config.js`: that config is an async factory tuned for
// `tauri dev`/`tauri build` (fixed port, TAURI_DEV_HOST, src-tauri watch
// ignores), and nothing here should reach it.
export default defineConfig({
  plugins: [sveltekit()],
  test: {
    // Component tests need a DOM. The pure-arithmetic tests do not care that
    // one exists, so it is set once rather than per file.
    environment: "jsdom",
    setupFiles: ["./vitest-setup.ts"],
    include: ["src/**/*.{test,spec}.{js,ts}", "scripts/**/*.test.ts"]
  },
  // Resolve the `browser` entry point of every package, even though Vitest runs
  // in Node — this is what makes Svelte's runes compile in `*.svelte.ts` and
  // `*.svelte.test.ts` files.
  resolve: {
    conditions: ["browser"]
  }
});
