import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "../shared/src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5174,
    fs: {
      allow: [path.resolve(__dirname, "..")],
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4174,
  },
});
