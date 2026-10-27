import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: mode === "github-pages" ? "/rolldo/" : "/",
  server: {
    // Let the dev server serve ../shared (rules shared with the Express API).
    fs: { allow: [".."] },
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
}));
