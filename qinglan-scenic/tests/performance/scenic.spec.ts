import {test, expect} from '@playwright/test';
import {mkdirSync, writeFileSync} from 'node:fs';
import {installVisitorFixture} from '../fixtures/visitor-http';

// Opt-in benchmark: real RAF/CDP timings, fixed snapshot and repeatable gestures.
test('scenic CPU and frame benchmark', async ({page, context}) => {
  test.setTimeout(180000);
  const output = process.env.SCENIC_BENCH_OUTPUT || '.local/qa/scenic-performance/latest';
  mkdirSync(output, {recursive:true});
  await installVisitorFixture(page,{diagnostics:false});
  await page.addInitScript(() => {
    let seed=12345;
    Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const original=requestAnimationFrame;
    const samples:number[]=[];
    Object.assign(window,{__benchFrames:samples});
    let previous=0;
    function tick(time:number){if(previous)samples.push(time-previous);previous=time;original(tick);}
    original(tick);
  });
  const cdp=await context.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto('/?alwaysOpen=1');
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-intro-state','ready',{timeout:60000});
  const measurements:unknown[]=[];
  async function measure(name:string, action?:()=>Promise<void>){
    await page.evaluate(()=>{(window as any).__benchFrames.length=0;});
    const before=await cdp.send('Performance.getMetrics');
    const start=Date.now();
    await action?.();
    await page.waitForTimeout(4000);
    const after=await cdp.send('Performance.getMetrics');
    const frames=await page.evaluate(()=>(window as any).__benchFrames as number[]);
    const metric=(list:typeof before,name:string)=>list.metrics.find(m=>m.name===name)?.value??0;
    const sorted=[...frames].sort((a,b)=>a-b);
    measurements.push({name,wallMs:Date.now()-start,frames:frames.length,meanFrameMs:frames.reduce((a,b)=>a+b,0)/frames.length,p95FrameMs:sorted[Math.floor(sorted.length*.95)],maxFrameMs:sorted.at(-1),taskMs:(metric(after,'TaskDuration')-metric(before,'TaskDuration'))*1000,scriptMs:(metric(after,'ScriptDuration')-metric(before,'ScriptDuration'))*1000});
  }
  await measure('rotation');
  await page.getByRole('button',{name:'设施',exact:true}).click();
  await measure('focus',()=>page.locator('[data-point-choice="t4"]').click());
  await measure('return',()=>page.getByRole('button',{name:'关闭详情',exact:true}).click());
  await measure('heat',()=>page.getByRole('button',{name:'人流',exact:true}).click());
  // Static visual comparisons intentionally freeze animation without changing scene content.
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/?alwaysOpen=1&scenicDiagnostics=1');
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-intro-state','ready',{timeout:60000});
  await page.addStyleTag({content:'[data-scenic-diagnostics], [data-display-settings] {visibility:hidden!important}'});
  await page.screenshot({path:`${output}/overview.png`});
  await page.getByRole('button',{name:'设施',exact:true}).click();
  await page.locator('[data-point-choice="t4"]').click();
  await page.screenshot({path:`${output}/detail.png`});
  const diagnostics=await page.evaluate(()=>(window as any).scenicDiagnostics?.reports?.()??null);
  writeFileSync(`${output}/metrics.json`,JSON.stringify({environment:await page.evaluate(()=>({userAgent:navigator.userAgent,dpr:devicePixelRatio,width:innerWidth,height:innerHeight})),measurements,diagnostics},null,2));

});
