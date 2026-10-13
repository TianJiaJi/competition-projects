import { defineConfig } from "vite";
import uni from "@dcloudio/vite-plugin-uni";
const uniPlugin =
  typeof uni === "function" ? uni : (uni as { default: typeof uni }).default;
export default defineConfig({
  plugins: [uniPlugin()],
  server: {
    strictPort: true,
    proxy: {
      "/ws": { target: process.env.MOBILE_API_TARGET || "http://127.0.0.1:8787", ws: true },
      "/api": {
        target: process.env.MOBILE_API_TARGET || "http://127.0.0.1:8787",
        changeOrigin: true,
      },
    },
  },
});
