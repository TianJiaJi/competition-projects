import {defineConfig} from '@playwright/test';
const backend='http://127.0.0.1:18789';
const database=process.env.TEST_DATABASE_URL||'postgresql://aiden@127.0.0.1/scenic_test';
export default defineConfig({
  testDir:'.',outputDir:'.local/qa/display-results',workers:1,timeout:45000,
  use:{channel:'chromium',viewport:{width:1920,height:1080},screenshot:'only-on-failure',trace:'retain-on-failure'},
  projects:[
    {name:'visitor',testMatch:'**/tests/e2e/display.spec.ts',use:{baseURL:'http://localhost:5173'}},
    {name:'ops',testMatch:'**/tests/ops/display.spec.ts',use:{baseURL:'http://localhost:5175'}},
    {name:'admin',testMatch:'**/apps/admin/tests/e2e/admin-display.spec.ts',use:{baseURL:'http://127.0.0.1:5198'}},
    {name:'demo',testMatch:'**/tests/display/demo.spec.ts',use:{baseURL:'http://127.0.0.1:5196'}},
    {name:'gate',testMatch:'**/tests/display/gate.spec.ts',use:{baseURL:'http://127.0.0.1:5197',viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}},
    {name:'mobile',testMatch:'**/tests/display/mobile.spec.ts',use:{baseURL:'http://127.0.0.1:15176',viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}},
  ],
  webServer:[
    {command:'pnpm dev',url:'http://localhost:5173',reuseExistingServer:true,timeout:60000},
    {command:'pnpm dev:ops',url:'http://localhost:5175',reuseExistingServer:true,timeout:60000},
    {command:'node apps/server/scripts/serve-test.ts',url:backend+'/api/v1/health',timeout:60000,env:{DATABASE_URL:database,TEST_DATABASE_URL:database,PORT:'18789',ALLOWED_ORIGINS:[5196,5197,5198,15176].map(port=>`http://127.0.0.1:${port}`).join(',')}},
    ...([{app:'admin',port:5198},{app:'demo',port:5196},{app:'gate',port:5197}] as const).map(({app,port})=>({command:`pnpm --filter @scenic/${app} exec vite --host 127.0.0.1 --port ${port} --strictPort`,url:`http://127.0.0.1:${port}`,timeout:60000,env:{SCENIC_API_TARGET:backend}})),
    {command:'pnpm --filter @scenic/mobile exec uni --host 127.0.0.1 --port 15176',url:'http://127.0.0.1:15176',timeout:60000,env:{MOBILE_API_TARGET:backend}},
  ],
});
