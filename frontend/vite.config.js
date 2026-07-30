import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this site at https://<username>.github.io/Splittify/
  // (must match the exact casing of the repo name - GitHub Pages paths are
  // case-sensitive). If you ever move the frontend elsewhere (a custom
  // domain, Vercel, etc.), change this back to "/".
  base: "/Splittify/",
});
