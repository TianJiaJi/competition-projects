import {test,expect} from '@playwright/test';
import {installVisitorFixture} from '../fixtures/visitor-http';
for(const dpr of [1,1.25,1.5,1.75,2])test(`desktop display ${dpr*100}% keeps composition proportions and picking aligned`,async({browser})=>{
  const viewport={width:Math.round(1920/dpr),height:Math.round(1080/dpr)};
  const context=await browser.newContext({viewport,deviceScaleFactor:dpr,reducedMotion:'reduce'});
  try{
    const page=await context.newPage();await installVisitorFixture(page);await page.goto('http://localhost:5173/?alwaysOpen=1');
    const canvas=page.locator('.scene-canvas');await expect(canvas).toHaveAttribute('data-intro-state','ready',{timeout:30000});
    const info=await page.evaluate(()=>{
      const host=document.querySelector<HTMLElement>('.scene-canvas')!,canvas=host.querySelector('canvas')!;
      const pin=document.querySelector('.is-current-terminal .pin-disc')!.getBoundingClientRect();
      return {hostWidth:host.clientWidth,bufferWidth:canvas.width,bufferHeight:canvas.height,pin:pin.width*devicePixelRatio,scale:Number(document.documentElement.dataset.desktopScale)};
    });
    expect(info.pin).toBeCloseTo(36,1);expect(Math.abs(info.hostWidth-1920)).toBeLessThan(2);
    expect(Math.abs(info.bufferWidth-1920)).toBeLessThan(2);expect(Math.abs(info.bufferHeight-1080)).toBeLessThan(2);
    await page.getByRole('button',{name:'设施',exact:true}).click();await page.locator('[data-point-choice="t4"]').click();
    const panel=page.locator('.detail-panel');await expect(panel).toBeVisible();
    const rect=await panel.boundingBox();expect(rect!.x).toBeGreaterThan(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(viewport.width+1);
    await expect(page.locator('.point-card-leader line')).toHaveCount(1);
    await expect.poll(async()=>{
      const left=(await panel.boundingBox())!.x;
      const x2=Number(await page.locator('.point-card-leader line').getAttribute('x2'));
      return Math.abs(x2*info.scale-left);
    }).toBeLessThan(1);
    await page.screenshot({path:`.local/qa/display/visitor-${dpr}.png`});
    await page.getByRole('button',{name:'关闭详情',exact:true}).click();
    const angle=Number(await canvas.getAttribute('data-azimuth'));
    await page.mouse.move(viewport.width*.5,viewport.height*.5);await page.mouse.down();await page.mouse.move(viewport.width*.5+90/dpr,viewport.height*.5,{steps:5});await page.mouse.up();
    const change=Math.abs(Number(await canvas.getAttribute('data-azimuth'))-angle);
    // 90 physical px corresponds to the same angle on every display scale.
    expect(change).toBeCloseTo(2*Math.PI*90/1080,2);
    const proportion=await page.locator('.is-current-terminal .pin-disc').evaluate(el=>el.getBoundingClientRect().width/innerWidth);
    await page.setViewportSize({width:Math.round(1366/dpr),height:Math.round(768/dpr)});
    // Chromium rounds layout coordinates to fractional CSS pixels. Allow < 0.05px.
    await expect.poll(async()=>page.locator('.is-current-terminal .pin-disc').evaluate((el,ratio)=>Math.abs(el.getBoundingClientRect().width-innerWidth*ratio),proportion)).toBeLessThan(0.05);
  }finally{await context.close();}
});
test('diagnostics is opt-in and old DPR calibration cannot change the composition',async({page})=>{
  await installVisitorFixture(page,{diagnostics:false});await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>localStorage.setItem('scenic.desktop-display.calibration.v1','1.2'));
  await page.goto('/?alwaysOpen=1');await expect(page.locator('.scene-canvas')).toHaveAttribute('data-intro-state','ready',{timeout:30000});
  expect(await page.evaluate(()=>window.scenicDiagnostics)).toBeUndefined();
  expect(await page.locator('.scene-canvas').getAttribute('data-island-transform')).toBeNull();
  await page.goto('/?alwaysOpen=1&scenicDiagnostics=1&displaySettings=1');
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-intro-state','ready',{timeout:30000});
  await expect(page.locator('[data-display-settings]')).toHaveCount(0);
  expect(await page.evaluate(()=>Number(document.documentElement.dataset.desktopScale))).toBe(1);
  const reports=await page.evaluate(()=>window.scenicDiagnostics!.reports()) as any[];
  expect(reports[0].display.bufferWidth).toBeCloseTo(1920,0);expect(reports[0].draw.triangles).toBeGreaterThan(0);
  await page.getByText('沙盘诊断',{exact:true}).click();
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'导出性能记录'}).click();expect((await downloadPromise).suggestedFilename()).toBe('scenic-diagnostics.json');
});

test('retina DPR does not shrink UI at 100% and browser zoom preserves the same composition',async({browser})=>{
  for(const zoom of [1,1.5]){
    const context=await browser.newContext({viewport:{width:1920/zoom,height:1080/zoom},deviceScaleFactor:2*zoom,reducedMotion:'reduce'});
    try{
      const page=await context.newPage();await installVisitorFixture(page);await page.goto('http://localhost:5173/?alwaysOpen=1');
      await expect(page.locator('.scene-canvas')).toHaveAttribute('data-intro-state','ready',{timeout:30000});
      const dimensions=await page.locator('.is-current-terminal .pin-disc').evaluate(el=>({pin:el.getBoundingClientRect().width,viewport:innerWidth,scale:Number(document.documentElement.dataset.desktopScale)}));
      expect(dimensions.pin/dimensions.viewport).toBeCloseTo(36/1920,5);
      expect(dimensions.scale).toBeCloseTo(1/zoom);
      if(zoom===1)expect(dimensions.pin).toBeCloseTo(36,2);
      await page.screenshot({path:`.local/qa/display/retina-zoom-${zoom}.png`,scale:'css'});
    }finally{await context.close();}
  }
});
