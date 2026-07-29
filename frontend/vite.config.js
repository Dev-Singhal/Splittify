import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this site at https://<username>.github.io/splittify/,
  // so asset paths need this prefix. If you ever move the frontend
  // elsewhere (a custom domain, Vercel, etc.), change this back to "/".
  base: "/splittify/",
});
