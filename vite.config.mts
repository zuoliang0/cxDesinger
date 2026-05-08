/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-renderer",
    emptyOutDir: true
  },
  server: {
    host: "127.0.0.1",
    port: 5173
  },
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["node_modules/**", "dist-renderer/**", "dist-electron/**", "release/**"],
    setupFiles: ["src/renderer/test-setup.ts"]
  }
});
