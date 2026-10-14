import {defineConfig} from 'vite';
import {fileURLToPath} from 'node:url';
import uni from '@dcloudio/vite-plugin-uni';
import {scenario} from '../../scenario/config';
const plugin=typeof uni==='function'?uni:(uni as any).default;
export default defineConfig({
  base: './',
  plugins: [plugin()],
  // Excluding prebundling alone still resolves the symlink under node_modules,
  // whose versioned URLs are served immutable. Resolve live source instead so
  // new exports cannot be paired with an older browser-cached module.
  resolve: { alias: { '@scene/bookings': fileURLToPath(new URL('../../packages/bookings/src/index.ts', import.meta.url)) } },
  optimizeDeps: { exclude: ['@scene/bookings'] },
  server: { port: scenario.ports.mobile, strictPort: true },
});
