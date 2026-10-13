import {test,expect} from '@playwright/test';
const api='http://127.0.0.1:18789/api/v1';
test('同一运行的跨端人数守恒，清园后总数与区域归零，preview不能覆盖后端',async({page,request})=>{
 test.setTimeout(120000);
 await page.emulateMedia({reducedMotion:'reduce'});
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const auth=(await (await request.post(api+'/auth/login',{data:{username:'admin01',password:'123456'}})).json()).data;
 const headers={Authorization:'Bearer '+auth.token};
 const write=async(path:string,data:unknown)=>{const response=await request.post(api+path,{headers:{...headers,'Idempotency-Key':crypto.randomUUID()},data});expect(response.ok(),await response.text()).toBe(true);return (await response.json()).data;};
 const run=await write('/demo/runs',{mode:'replay',scenario:'weekday'});
 expect(run.paused).toBe(true);
 const get=async(path:string)=>(await (await request.get(api+path,{headers})).json()).data;
 const [publicState,ops,admin,gate]=await Promise.all([get('/public/state'),get('/screens/ops'),get('/admin/workspace'),get('/gate/workspace')]);
 for(const state of [publicState,ops,admin.snapshot]){
  expect(state.run.id).toBe(run.id);expect(state.run.businessTime).toBe(state.public.updatedAt);
  expect(state.public.visitors).toBe(publicState.public.visitors);
  expect(Object.values(state.public.regions).reduce((n:number,r:any)=>n+r.count,0)).toBe(state.public.visitors);
  expect(state.checkedInToday-state.exitedToday).toBe(state.public.visitors);
 }
 expect(gate.run.revision).toBe(publicState.run.revision);
 await write('/demo/clock',{time:'2026-09-14T19:30:00+08:00',paused:true});
 const closed=await get('/public/state');
 expect(closed.public.parkOpen).toBe(false);expect(closed.public.visitors).toBe(0);
 expect(Object.values(closed.public.regions).every((r:any)=>r.count===0&&r.availability==='closed')).toBe(true);
 await page.goto('http://127.0.0.1:15175/?preview=1');
 await expect(page.getByTestId('in-park')).toHaveText('0',{timeout:45000});
 await expect(page.locator('.open-status')).toHaveText('景区已闭园');
 expect(await page.locator('.region-values b').allTextContents()).toEqual(Array(9).fill('0'));
 await expect(page.locator('.preview-toolbar')).toHaveCount(0);
 await write('/demo/runs',{mode:'replay',scenario:'weekday'});
 const reopened=await get('/public/state');
 await expect(page.getByTestId('in-park')).toHaveText(reopened.public.visitors.toLocaleString('en-US'),{timeout:15000});
 await expect(page.locator('.open-status')).toHaveText('景区开放中');
 expect(errors).toEqual([]);
 await page.screenshot({path:'.local/platform-e2e/ops-consistent-live.png'});
});
