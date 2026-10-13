import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [vue()],
  server: { host: '127.0.0.1', port: 5174, strictPort: true },
  resolve: {
    alias: { '@scenic/ui/contour': fileURLToPath(new URL('../src/contour/index.ts', import.meta.url)) },
  },
  build: {
    outDir: '../dist-examples', emptyOutDir: true,
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        contour: fileURLToPath(new URL('./contour.html', import.meta.url)),
      },
    },
  },
});
