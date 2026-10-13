import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  server: { proxy: { "/api": (process.env.SCENIC_API_TARGET || "http://127.0.0.1:8787"), "/ws": { target: (process.env.SCENIC_API_TARGET || "http://127.0.0.1:8787"), ws: true } }, port: 5177, strictPort: true },
  preview: { port: 5177, strictPort: true },
});
