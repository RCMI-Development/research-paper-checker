import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:4000",
    },
  },
  build: {
    rollupOptions: {
      // Cada cotejo es una página independiente; index.html solo las lanza.
      input: {
        index: resolve(root, "index.html"),
        dei: resolve(root, "dei.html"),
        dgof: resolve(root, "dgof.html"),
        iroc: resolve(root, "iroc.html"),
      },
    },
  },
});
