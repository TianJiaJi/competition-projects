import {desktopDisplayCss} from '../../packages/ui/src/display/postcss';
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
export default defineConfig({css:{postcss:{plugins:[desktopDisplayCss()]}},
  plugins: [vue()],
  server: {
    proxy: {
      "/api": (process.env.SCENIC_API_TARGET || "http://127.0.0.1:8787"),
      "/ws": { target: (process.env.SCENIC_API_TARGET || "http://127.0.0.1:8787"), ws: true },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("/node_modules/three/")) return "three";
        },
      },
    },
  },
});
