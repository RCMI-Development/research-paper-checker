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
      // index.html es el directorio del Recinto; decinvest.html el Decanato de
      // Investigación; cotejos.html el lanzador directo de los tres cotejos.
      input: {
        index: resolve(root, "index.html"),
        decinvest: resolve(root, "decinvest.html"),
        cotejos: resolve(root, "cotejos.html"),
        dei: resolve(root, "dei.html"),
        dgof: resolve(root, "dgof.html"),
        iroc: resolve(root, "iroc.html"),
      },
    },
  },
});
