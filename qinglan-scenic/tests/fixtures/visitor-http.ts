import type {Page} from '@playwright/test';
import {sampleSnapshot} from '../../packages/client/testing/snapshot';
// Browser UI fixtures are never bundled into the application.
export async function installVisitorFixture(page: Page, options: {diagnostics?:boolean} = {}) {
  if(options.diagnostics!==false)await page.addInitScript(()=>{const url=new URL(location.href);url.searchParams.set('scenicDiagnostics','1');history.replaceState(null,'',url);});
  await page.routeWebSocket('**/ws?*', () => {});
  await page.route('**/api/v1/public/state', route => route.fulfill({json:{data:{
    run:{id:'visitor-ui-test'}, public:sampleSnapshot(new Date('2026-09-11T04:00:00Z')),
  }}}));
}
