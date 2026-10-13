import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/performance',outputDir:'.local/qa/performance-results',workers:1,use:{baseURL:'http://localhost:5173',viewport:{width:1920,height:1080},deviceScaleFactor:1,channel:'chromium'},webServer:{command:'pnpm dev',url:'http://localhost:5173',reuseExistingServer:true}});
