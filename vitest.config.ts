import { defineConfig } from "vitest/config";

export default defineConfig({
  root: __dirname,
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
    exclude: [
      "node_modules/**",
      ".vercel/**",
      "dist/**",
      "build/**",
      "coverage/**",
      "admin/**",
    ],
  },
});
