import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "github-pages" ? "/rolldo/" : "/",
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
}));
