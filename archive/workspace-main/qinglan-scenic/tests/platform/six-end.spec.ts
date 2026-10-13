import {test,expect} from '@playwright/test';
const api='http://127.0.0.1:18789/api/v1';
async function login(request:any,username:string){const r=await request.post(api+'/auth/login',{data:{username,password:'123456'}});expect(r.ok()).toBeTruthy();return (await r.json()).data;}
async function write(request:any,auth:any,path:string,data:any){const r=await request.post(api+path,{headers:{Authorization:'Bearer '+auth.token,'X-Run-Id':auth.runId,'Idempotency-Key':crypto.randomUUID()},data});const result=await r.json();expect(r.ok(),JSON.stringify(result)).toBeTruthy();return result.data;}
test('管理员审批与前线处置共享一个任务，公开大屏免登录',async({page,request})=>{const admin=await login(request,'admin01');const run=await write(request,admin,'/demo/runs',{mode:'replay',scenario:'oa'});admin.runId=run.id;await write(request,admin,'/demo/clock',{paused:true});const staff=await login(request,'staff01');staff.runId=run.id;const tasks=(await (await request.get(api+'/tasks',{headers:{Authorization:'Bearer '+staff.token,'X-Run-Id':run.id}})).json()).data.items;const task=tasks.find((t:any)=>t.category==='help');const started=await write(request,staff,'/tasks/'+task.id+'/start',{expectedVersion:task.version});const receipt=await write(request,staff,'/oa-requests',{taskId:task.id,expectedVersion:started.version,type:'supplies',reason:'现场演示补水请求',needs:'饮用水五瓶'});
 await page.goto('/');await page.getByRole('textbox',{name:'账号',exact:true}).fill('admin01');await page.getByRole('textbox',{name:'密码',exact:true}).fill('123456');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('heading',{name:'工作台',exact:true})).toBeVisible();await page.goto('/#/oa');await page.getByRole('row').filter({hasText:'现场演示补水请求'}).getByRole('button',{name:'查看申请'}).click();await page.getByRole('textbox',{name:'审批意见',exact:true}).fill('已备妥物资，请领取');await page.getByRole('button',{name:'批准',exact:true}).click();await page.getByRole('button',{name:'确认提交',exact:true}).click();await expect(page.getByText('审批已保存，前线将同步收到结果',{exact:true})).toBeVisible();const result=(await (await request.get(api+'/oa-requests/'+receipt.request.id,{headers:{Authorization:'Bearer '+staff.token,'X-Run-Id':run.id}})).json()).data;expect(result.status).toBe('approved');const screen=await request.get(api+'/screens/ops');expect(screen.ok()).toBeTruthy();expect((await screen.json()).data.run.id).toBe(run.id);await page.screenshot({path:'.local/platform-e2e/admin-oa.png',fullPage:true});});
test('游客H5注册、预约与二维码图片跳转',async({page,request})=>{const admin=await login(request,'admin01'),run=await write(request,admin,'/demo/runs',{mode:'replay',scenario:'weekday'});admin.runId=run.id;await write(request,admin,'/demo/clock',{paused:true});await page.goto('http://127.0.0.1:15176/#/pages/login/index');await page.getByText('没有账号，注册游客账号',{exact:true}).click();await page.getByRole('textbox').nth(0).fill('guest'+Date.now());await page.getByRole('textbox').nth(1).fill('测试游客');await page.locator('input[type=password]').fill('123456');await page.getByText('注册并登录',{exact:true}).click();await expect(page.getByText('登录 / 注册',{exact:true})).toBeVisible();await page.goto('http://127.0.0.1:15176/#/pages/booking/index');await page.locator('#contact input').fill('测试游客');await page.locator('#phone input').fill('13800000000');await page.locator('uni-button.slot').filter({hasText:'15:00—16:00'}).click();await page.getByText('确认预约',{exact:true}).click();await expect(page.getByText('预约成功',{exact:true})).toBeVisible();await page.goto('http://127.0.0.1:15176/#/pages/scan/index');const chooser=page.waitForEvent('filechooser');await page.getByText('选择二维码图片',{exact:true}).click();await (await chooser).setFiles('assets/景点二维码/听溪台.png');await expect(page.getByText('听溪台',{exact:true})).toBeVisible();await expect(page.getByPlaceholder('例如 lake，或 qinglan://poi/lake')).toHaveCount(0);await page.screenshot({path:'.local/platform-e2e/mobile-qr.png',fullPage:true});});
test('演示终端可在手机宽度登录并控制回放',async({page})=>{await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:15178');await page.getByLabel('账号',{exact:true}).fill('admin01');await page.getByLabel('密码',{exact:true}).fill('123456');await page.getByRole('button',{name:'登录',exact:true}).click();await expect(page.getByRole('heading',{name:'运行与场景'})).toBeVisible();await expect(page.getByRole('button',{name:'触发随机现场告警'})).toBeVisible();await page.screenshot({path:'.local/platform-e2e/demo-mobile.png',fullPage:true});});
test('演示回放跨心跳切换后继续和倍速始终控制当前运行',async({page,request})=>{
 test.setTimeout(120000);
 await page.goto('http://127.0.0.1:15178');
 await page.getByLabel('账号',{exact:true}).fill('admin01');
 await page.getByLabel('密码',{exact:true}).fill('123456');
 await page.getByRole('button',{name:'登录',exact:true}).click();
 await expect(page.getByRole('heading',{name:'运行与场景'})).toBeVisible();
 const oldRun=(await (await request.get(api+'/runtime')).json()).data.run;
 page.on('dialog',dialog=>dialog.accept());
 await page.getByRole('button',{name:'创建场景回放',exact:true}).click();
 await expect(page.getByRole('button',{name:'继续',exact:true})).toBeEnabled();
 const current=(await (await request.get(api+'/runtime')).json()).data.run;
 expect(current.id).not.toBe(oldRun.id);
 // Cross a real heartbeat after switching, while the new replay is paused.
 await page.waitForTimeout(5500);
 const command=page.waitForRequest(r=>r.url().endsWith('/demo/clock')&&r.method()==='POST');
 await page.getByRole('button',{name:'继续',exact:true}).click();
 const sent=await command;
 expect(sent.headers()['x-run-id']).toBe(current.id);
 await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeEnabled();
 for(const speed of [1,5,30,60,180]){
  await page.getByRole('button',{name:speed+'×',exact:true}).click();
  await expect(page.getByRole('button',{name:speed+'×',exact:true})).toHaveClass('selected');
  await expect.poll(async()=> (await (await request.get(api+'/runtime')).json()).data.run.speed).toBe(speed);
 }
 await expect.poll(async()=>Date.parse((await (await request.get(api+'/runtime')).json()).data.run.businessTime),{timeout:15000}).toBeGreaterThan(Date.parse(current.businessTime));
 await page.getByRole('button',{name:'暂停',exact:true}).click();
 await expect(page.getByRole('button',{name:'继续',exact:true})).toBeEnabled();
 const paused=(await (await request.get(api+'/runtime')).json()).data.run;
 const screen=(await (await request.get(api+'/screens/ops')).json()).data;
 expect(screen.run.id).toBe(current.id);expect(screen.run.businessTime).toBe(paused.businessTime);
 const old=(await (await request.get(api+'/public/state',{headers:{'X-Run-Id':oldRun.id}})).json()).data.run;
 expect(old.businessTime).toBe(oldRun.businessTime);expect(old.paused).toBe(oldRun.paused);expect(old.speed).toBe(oldRun.speed);
});
test('数据大屏免登录，趋势图坐标文字在容器内',async({page})=>{await page.setViewportSize({width:1366,height:768});await page.goto('http://127.0.0.1:15175');await expect(page.getByRole('heading',{name:'分时在园趋势'})).toBeVisible({timeout:30000});await expect(page.locator('input[type=password]')).toHaveCount(0);const chart=page.locator('.trend-chart');await expect(chart.locator('svg')).toBeVisible();const overflow=await chart.evaluate(el=>{const rect=el.getBoundingClientRect();return [...el.querySelectorAll('svg text')].filter(t=>{const r=t.getBoundingClientRect();return r.left<rect.left-1||r.right>rect.right+1||r.top<rect.top-1||r.bottom>rect.bottom+1;}).map(t=>t.textContent);});expect(overflow).toEqual([]);await expect(page.locator('.ops-screen')).toHaveAttribute('data-entry-state','ready',{timeout:45000});expect(await page.locator('.ops-screen').innerText()).not.toMatch(/\d+\.\d{3,}/);await page.screenshot({path:'.local/platform-e2e/ops-1366.png'});});
