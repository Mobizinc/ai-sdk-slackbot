import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./lib"),
      "@tests": path.resolve(__dirname, "./tests"),
      "@api": path.resolve(__dirname, "./api"),
    },
  },
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
