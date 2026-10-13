import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  base: "./",
  plugins: [vue()],
  server: { host: "localhost", port: 5506, strictPort: true },
  build: { chunkSizeWarningLimit: 1500 },
});
