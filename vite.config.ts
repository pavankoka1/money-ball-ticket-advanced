import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    // Listen on all interfaces so phones on the same Wi‑Fi can open the dev URL.
    host: true,
    port: 5173,
  },
});
