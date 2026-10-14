import {expect,test,type Page} from '@playwright/test';
import {assignments} from '../../apps/testing/src/campus-handoff';
import {fixtures,receive,nav,generateSpecial,downloadJson,noOverflow} from './helpers';
const stored=(page:Page)=>page.evaluate(()=>JSON.parse(localStorage.getItem('service-test-workbench.campus-task.v1')!));
test.beforeEach(async({page})=>fixtures(page));

test('生成前只有后端需求和执行方式；短时模板编排可取消，发布前不出现交互案例',async({page})=>{
 await receive(page);await nav(page,'专项测试');
 await expect(page.locator('.assignment-grid article')).toHaveCount(4);
 await expect(page.locator('.assignment-grid')).toContainText('怎么测试');
 await expect(page.locator('.assignment-grid')).toContainText('验收标准');
 await expect(page.locator('.special-workspace,.special-run-panel,.special-case-notes,.special-wait')).toHaveCount(0);
 await page.getByRole('button',{name:'生成专项用例',exact:true}).click();
 const dialog=page.getByRole('dialog',{name:'编排专项测试用例',exact:true});
 await expect(dialog).toContainText('不连接远程AI');await expect(dialog.locator('.generation-stages li')).toHaveCount(5);
 await expect(dialog.locator('.generation-artifacts article')).toHaveCount(4);
 await expect(page.locator('.special-workspace')).toHaveCount(0);
 await expect(dialog.locator('.generation-artifacts article.assembled').first()).toBeVisible();
 await dialog.screenshot({path:'.local/qa/testing-special-template-generation.png'});
 await dialog.getByRole('button',{name:'取消本次生成',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('未发布测试用例');
 await expect(page.locator('.special-workspace')).toHaveCount(0);
 let state=await stored(page);expect(state.specialGeneratedAt).toBeNull();expect(state.specialRuns).toBeNull();
 const start=Date.now();await page.getByRole('button',{name:'生成专项用例',exact:true}).click();
 await expect(dialog.getByLabel('场景配置预览')).toContainText('local-scenario-model');
 await expect(page.getByRole('group',{name:'选择专项场景'}).getByRole('button')).toHaveCount(4);
 expect(Date.now()-start).toBeLessThan(6500);
 await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'一键测试',exact:true})).toBeEnabled();
 await expect(page.locator('.request-token')).toHaveCount(0);await expect(page.locator('.special-summary')).toContainText('0 / 4');
 state=await stored(page);expect(state.specialGeneratedAt).toBeTruthy();
 for(const item of assignments)expect(state.specialRuns[item.id]).toMatchObject({step:0,requests:[],assertions:[]});
 await expect(page.locator('.assignment-requirements')).not.toHaveAttribute('open','');
});

test('一键测试按顺序自动切换场景和播放动画，全部完成静默归档，报告按钮可重复查看',async({page})=>{
 const requests:string[]=[];await page.route('**/api/**',route=>{requests.push(route.request().url());return route.abort();});
 await receive(page);await generateSpecial(page);
 await page.getByLabel('专项补充检查点').fill('人工核对申请人');await page.getByRole('button',{name:'保存专项用例补充',exact:true}).click();
 await page.locator('.scenario-picker').evaluate(el=>{
  el.setAttribute('data-selection-history',el.querySelector('[aria-pressed="true"]')!.getAttribute('aria-label')!);
  new MutationObserver(()=>{const active=el.querySelector('[aria-pressed="true"]')?.getAttribute('aria-label');const seen=(el.getAttribute('data-selection-history') || '').split('|');if(active && active!==seen.at(-1))el.setAttribute('data-selection-history',[...seen,active].join('|'));}).observe(el,{subtree:true,attributes:true,attributeFilter:['aria-pressed']});
 });
 await page.getByRole('button',{name:'一键测试',exact:true}).click();
 await expect(page.getByRole('progressbar',{name:'专项自动测试进度'})).toBeVisible();
 await expect(page.locator('.request-token.processing .spinning').first()).toBeVisible();
 await expect(page.getByLabel('场景参数',{exact:true})).toBeDisabled();
 await expect(page.getByRole('navigation').getByRole('button',{name:/^API测试/})).toBeEnabled();
 await expect(page.getByRole('button',{name:'立即重置工作台',exact:true})).toBeDisabled();
 await page.screenshot({path:'.local/qa/testing-special-auto-running.png',fullPage:true});
 await expect(page.locator('.special-run-panel .badge.good')).toHaveText('已完成',{timeout:18000});
 await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.special-summary')).toContainText('4 / 4');
 expect((await page.locator('.scenario-picker').getAttribute('data-selection-history'))?.split('|')).toEqual(assignments.map(item=>item.title));
 await expect(page.locator('.special-completion')).toContainText('补充检查待人工确认');
 await expect(page.getByRole('button',{name:'一键测试',exact:true})).toHaveCount(0);
 const before=await stored(page);expect(before.reports.filter((report:{kind:string})=>report.kind==='special')).toHaveLength(1);
 await page.getByRole('button',{name:'查看报告',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'专项验收报告',exact:true})).toBeVisible();
 const report=await downloadJson(page,'导出原始 JSON');expect(report.scenarios).toHaveLength(4);expect(report.status).toBe('completed');
 expect(report.caseNotes.duplicate.result).toBe('pending');
 for(const run of report.scenarios){expect(run.step).toBe(3);expect(run.assertions).toHaveLength(3);expect(run.assertions.every((check:{passed:boolean})=>check.passed)).toBe(true);}
 await page.keyboard.press('Escape');await page.getByRole('button',{name:'查看报告',exact:true}).click();
 const reopened=await downloadJson(page,'导出原始 JSON');expect(reopened).toEqual(report);
 await page.keyboard.press('Escape');expect((await stored(page)).revision).toBe(before.revision);
 await page.reload();await nav(page,'专项测试');await expect(page.locator('.special-run-panel .badge.good')).toHaveText('已完成');
 await page.getByRole('button',{name:'查看报告',exact:true}).click();expect(await downloadJson(page,'导出原始 JSON')).toEqual(report);
 await page.keyboard.press('Escape');expect(requests).toEqual([]);await noOverflow(page);
});

test('取消自动测试不误启动后项，已完成项保留；切换栏目不打断，返回后可继续并保存新报告',async({page})=>{
 await receive(page);await generateSpecial(page);await page.getByRole('button',{name:'一键测试',exact:true}).click();
 await expect(page.getByRole('button',{name:assignments[1].title,exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.request-token.processing').first()).toBeVisible();
 await page.getByRole('button',{name:'停止一键测试',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('一键测试已停止');
 const stopped=await stored(page);expect(stopped.specialRuns.duplicate.step).toBe(3);
 for(const id of ['stock','permission','retry'])expect(stopped.specialRuns[id]).toMatchObject({step:0,requests:[],assertions:[],events:[]});
 await expect(page.locator('.special-run-panel .badge.good')).toHaveCount(0);
 await page.getByRole('button',{name:'一键测试',exact:true}).click();await nav(page,'UI测试');
 await expect(page.getByRole('button',{name:'一键完成五端检查',exact:true})).toBeEnabled();
 await nav(page,'专项测试');await expect(page.getByRole('progressbar',{name:'专项自动测试进度'})).toBeVisible();
 await expect(page.locator('.special-run-panel .badge.good')).toHaveText('已完成',{timeout:18000});
 const completed=await stored(page);expect(completed.specialRuns.duplicate).toEqual(stopped.specialRuns.duplicate);
 await page.getByRole('button',{name:'查看报告',exact:true}).click();const report=await downloadJson(page,'导出原始 JSON');
 await page.keyboard.press('Escape');await page.getByRole('button',{name:assignments[0].title,exact:true}).click();
 await page.getByLabel('场景参数',{exact:true}).selectOption('3');
 await expect(page.getByRole('button',{name:'一键测试',exact:true})).toBeEnabled();
 const reset=await stored(page);expect(reset.reports.find((item:{id:string})=>item.id===report.id).scenarios[0].step).toBe(3);
 await page.getByRole('button',{name:'一键测试',exact:true}).click();await expect(page.locator('.special-run-panel .badge.good')).toHaveText('已完成',{timeout:10000});
 await page.getByRole('button',{name:'查看报告',exact:true}).click();const latest=await downloadJson(page,'导出原始 JSON');
 expect(latest.id).not.toBe(report.id);expect(latest.scenarios[0].parameter).toBe('3');expect(latest.scenarios[1]).toEqual(report.scenarios[1]);
});

test('专项触发请求中途刷新后，一键继续不重放已处理请求或重复累计回执',async({page})=>{
 await receive(page);await generateSpecial(page);await page.getByLabel('场景参数',{exact:true}).selectOption('20');
 await page.getByRole('button',{name:'一键测试',exact:true}).click();
 await expect.poll(async()=>{const state=await stored(page);return state.specialRuns.duplicate.requests.filter((request:{status:string})=>!['queued','processing'].includes(request.status)).length;}).toBeGreaterThan(0);
 await page.reload();await nav(page,'专项测试');
 const restored=await stored(page);expect(restored.specialRuns.duplicate.step).toBe(1);
 await expect(page.getByRole('progressbar',{name:'专项自动测试进度'})).toHaveCount(0);
 await page.getByRole('button',{name:'一键测试',exact:true}).click();
 await expect(page.locator('.special-run-panel .badge.good')).toHaveText('已完成',{timeout:18000});
 const completed=await stored(page);expect(completed.specialRuns.duplicate.state.writes).toBe(1);expect(completed.specialRuns.duplicate.state.responseIds).toHaveLength(20);
 for(const item of assignments){const run=completed.specialRuns[item.id];expect(run.assertions.every((check:{passed:boolean})=>check.passed)).toBe(true);expect(run.events.filter((event:{requestId:string})=>event.requestId!=='—')).toHaveLength(run.requests.length);}
 await page.getByRole('button',{name:'查看报告',exact:true}).click();const report=await downloadJson(page,'导出原始 JSON');expect(report.status).toBe('completed');expect(report.scenarios[0].parameter).toBe('20');
});

test('顺序执行时当前请求在队列内部跟随，场景切换不反复滚动整页',async({page})=>{
 await receive(page);await generateSpecial(page);await page.getByRole('button',{name:'一键测试',exact:true}).click();
 await expect(page.getByRole('button',{name:assignments[1].title,exact:true})).toHaveAttribute('aria-pressed','true');
 const scrollY=await page.evaluate(()=>window.scrollY);
 await expect.poll(()=>page.locator('.request-grid').evaluate(el=>el.scrollTop)).toBeGreaterThan(20);
 await expect.poll(()=>page.locator('.request-grid').evaluate(el=>{
  const current=el.querySelector('.processing');if(!current)return false;
  const token=current.getBoundingClientRect(),viewport=el.getBoundingClientRect();return token.top>=viewport.top-1 && token.bottom<=viewport.bottom+1;
 })).toBe(true);
 expect(await page.evaluate(()=>window.scrollY)).toBe(scrollY);
 await page.getByRole('button',{name:'停止一键测试',exact:true}).click();await expect(page.getByRole('status')).toContainText('一键测试已停止');
});

for(const width of [1280,390])test(`专项需求与生成后交互 ${width}px 无横向溢出`,async({page})=>{
 await page.setViewportSize({width,height:900});await receive(page);await nav(page,'专项测试');await noOverflow(page);
 await page.screenshot({path:`.local/qa/testing-special-requirements-${width}.png`,fullPage:true});
 await generateSpecial(page);await noOverflow(page);await expect(page.getByRole('button',{name:'一键测试',exact:true})).toBeVisible();
 await page.screenshot({path:`.local/qa/testing-special-generated-${width}.png`,fullPage:true});
});
