import config from './playwright.admin.config';
export default { ...config, use: { ...config.use, baseURL: 'http://localhost:5186' }, webServer: { ...config.webServer, command: 'pnpm --filter @scenic/admin exec vite --host 0.0.0.0 --port 5186 --strictPort', url: 'http://localhost:5186' } };
