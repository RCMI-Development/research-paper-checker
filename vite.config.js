import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));

// Nombres bajo los cuales se sirve el sitio. localhost cubre el desarrollo;
// iroc.lvelazquez.cc es el nombre público del túnel de Cloudflare.
const PUBLIC_HOSTS = [
  "localhost",
  "127.0.0.1",
  "iroc.lvelazquez.cc",
  ...(process.env.PUBLIC_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
];

export default defineConfig({
  plugins: [react()],
  server: {
    // Escucha en todas las interfaces para que cloudflared alcance el servidor.
    host: "0.0.0.0",
    port: 5173,
    strictPort: true,
    // Vite rechaza peticiones cuyo Host no reconoce; un túnel las entrega con
    // el nombre público, así que hay que declararlo. Se añaden más sin tocar
    // este archivo:  PUBLIC_HOSTS="a.ejemplo.cc,b.ejemplo.cc" npm run dev
    allowedHosts: PUBLIC_HOSTS,
    proxy: {
      "/api": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
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
