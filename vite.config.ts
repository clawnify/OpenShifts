import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true },
  resolve: { alias: { "@": path.resolve(__dirname, "./src/client") } },
  server: {
    proxy: {
      // In production app-router injects a verified X-Clawnify-Org-Id that a
      // client cannot forge. `vite dev` has no perimeter in front of it, so
      // without this every authenticated route answers 403 on a fresh clone and
      // the app looks broken. Dev only; the deploy pipeline never reads this file.
      "/api": {
        target: "http://localhost:8793",
        changeOrigin: true,
        headers: { "X-Clawnify-Org-Id": "local-dev-org", "X-Clawnify-Caller": "user" },
      },
      // Trailing slash matters: a bare "/s" prefix would also swallow the
      // admin's own /schedule route and hand it to the Worker.
      "/s/": { target: "http://localhost:8793", changeOrigin: true },
    },
  },
});
