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
      // index.html es el portal; dec-invest.html lanza los cotejos.
      // Cada cotejo es además una página independiente que funciona sola.
      input: {
        index: resolve(root, "index.html"),
        decInvest: resolve(root, "dec-invest.html"),
        dei: resolve(root, "dei.html"),
        dgof: resolve(root, "dgof.html"),
        iroc: resolve(root, "iroc.html"),
        // Prototipos de sobrecapa: iframe vs. componente en la misma página.
        protoIframe: resolve(root, "proto-iframe.html"),
        protoSpa: resolve(root, "proto-spa.html"),
      },
    },
  },
});
