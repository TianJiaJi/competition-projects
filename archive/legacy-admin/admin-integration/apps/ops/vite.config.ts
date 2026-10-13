import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "three";
          if (
            id.includes("/node_modules/echarts/") ||
            id.includes("/node_modules/zrender/")
          )
            return "charts";
        },
      },
    },
  },
});
