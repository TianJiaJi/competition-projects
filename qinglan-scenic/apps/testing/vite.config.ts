import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { environment } from '../../scripts/dev-testing.mjs';

// Stable across Vite config hot reloads, new on actual process restart.
const sessionHost = globalThis as typeof globalThis & { campusWorkbenchSession?: string };
const serviceSession = sessionHost.campusWorkbenchSession ||= `${process.pid}-${Date.now()}`;
// Standalone offline simulation; no business API proxy is needed.
export default defineConfig({
  plugins: [vue(), { name: 'campus-environment', configureServer(server) {
    server.middlewares.use('/__workbench_session', (req, res) => {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      res.end(JSON.stringify({ id: serviceSession }));
    });
    server.middlewares.use('/__campus_environment', async (req, res) => {
      if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
      res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.setHeader('Cache-Control', 'no-store');
      try { res.end(JSON.stringify(await environment())); } catch { res.statusCode = 503; res.end(JSON.stringify({ error: '环境检查失败' })); }
    });
  } }],
  server: {
    port: 5180,
    strictPort: true,
  },
});
