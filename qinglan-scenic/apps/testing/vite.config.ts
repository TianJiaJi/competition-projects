import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

// Standalone offline simulation; no business API proxy is needed.
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5180,
    strictPort: true,
  },
});
