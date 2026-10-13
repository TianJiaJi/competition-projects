import {expect,test} from '@playwright/test';

test('shows a complete map, compares styles, zooms and exports an independent SVG',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/scenic-svg.html');
  const art=page.locator('[data-map-style="qinglv"]');
  await expect(art).toBeVisible();
  const fits=await page.locator('.map-scroll').evaluate(el=>el.scrollHeight<=el.clientHeight+2&&el.scrollWidth<=el.clientWidth+2);
  expect(fits).toBe(true);
  await page.getByRole('button',{name:'原版对照',exact:true}).click();
  await expect(page.locator('.map-frame svg')).toHaveCount(2);
  const ids=await page.locator('svg [id]').evaluateAll(els=>els.map(e=>e.id));
  expect(new Set(ids).size).toBe(ids.length);
  await page.getByRole('button',{name:'山水全图',exact:true}).click();
  const baseWidth=await page.locator('.map-stage').evaluate(el=>el.getBoundingClientRect().width);
  for(let i=0;i<6;i++)await page.getByRole('button',{name:'放大',exact:true}).click();
  await expect(page.locator('output')).toHaveText('400%');
  expect(await page.locator('.map-stage').evaluate(el=>el.getBoundingClientRect().width)).toBeCloseTo(baseWidth*4,0);
  expect(await page.locator('.map-scroll').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(true);
  await page.getByRole('button',{name:'全图',exact:true}).click();
  await expect(page.locator('output')).toHaveText('100%');
  const landmarks=await art.locator('[data-landmark-id]').count();
  await page.getByLabel('景点名称',{exact:true}).uncheck();
  await page.getByLabel('服务设施',{exact:true}).uncheck();
  await expect(art.locator('[data-label-id]')).toHaveCount(0);
  await expect(art.locator('[data-landmark-id]')).toHaveCount(landmarks);
  await expect(art.locator('[data-point-id="t1"]')).toHaveCount(0);
  const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'下载 SVG'}).click();
  const download=await downloaded;
  expect(download.suggestedFilename()).toBe('青岚山境-青绿山水游览图.svg');
  const stream=await download.createReadStream();let exported='';for await(const chunk of stream!)exported+=chunk.toString();
  const parsed=await page.evaluate(svg=>{const doc=new DOMParser().parseFromString(svg,'image/svg+xml');return {errors:doc.querySelectorAll('parsererror').length,style:doc.documentElement.getAttribute('data-map-style'),landmarks:doc.querySelectorAll('[data-landmark-id]').length};},exported);
  expect(parsed).toEqual({errors:0,style:'qinglv',landmarks});
  expect(errors).toEqual([]);
});

test('keeps main labels separate and remains usable in a narrow viewport',async({page})=>{
  await page.goto('/scenic-svg.html');
  const overlaps=await page.locator('[data-label-id] text').evaluateAll(els=>{
    const boxes=els.map(el=>({id:el.parentElement!.getAttribute('data-label-id'),r:el.getBoundingClientRect()}));
    return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>a.r.left<b.r.right&&a.r.right>b.r.left&&a.r.top<b.r.bottom&&a.r.bottom>b.r.top).map(b=>[a.id,b.id]));
  });
  expect(overlaps).toEqual([]);
  await page.setViewportSize({width:390,height:844});
  await expect(page.getByRole('button',{name:'下载 SVG'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'放大',exact:true}).click();
  await expect(page.locator('output')).toHaveText('150%');
});
