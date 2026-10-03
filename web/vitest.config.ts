import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/tests/setup.ts"],
    passWithNoTests: true,
    // room for a few 5 s waits (src/tests/setup.ts asyncUtilTimeout) in one test
    testTimeout: 20000,
  },
});
