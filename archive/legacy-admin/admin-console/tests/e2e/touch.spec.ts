import {test,expect} from '@playwright/test';

for(const viewport of [{width:1920,height:1080},{width:1366,height:768},{width:1180,height:820},{width:1024,height:768},{width:768,height:1024},{width:960,height:600}]){
  test(`single-finger controls and consistent tablet layout ${viewport.width}x${viewport.height}`,async({browser})=>{
    const context=await browser.newContext({viewport,hasTouch:true,isMobile:true,reducedMotion:'reduce'});
    const page=await context.newPage();
    try{
      await page.goto('http://localhost:5173/?alwaysOpen=1');
      const canvas=page.locator('.scene-canvas');await expect(canvas).toHaveAttribute('data-intro-state','ready',{timeout:30000});
      const initial=await page.locator('.top-information').evaluate(el=>getComputedStyle(el).getPropertyValue('--glass-tint-opacity'));
      await page.getByRole('button',{name:'卫生间',exact:true}).tap();
      await page.getByRole('button',{name:'设施',exact:true}).tap();
      await page.locator('[data-point-choice="t1"]').tap();
      await expect.poll(()=>page.locator(".panel-content").evaluate(el=>el.scrollTop)).toBe(0);
      await page.screenshot({path:`.local/qa/touch-detail-${viewport.width}x${viewport.height}.png`});
      const panel=page.locator('.detail-panel');await expect(panel).toBeVisible();
      const rect=await panel.boundingBox(),head=await page.locator('.top-information').boundingBox();
      expect(rect!.y).toBeGreaterThanOrEqual(head!.y+head!.height+15);
      expect(rect!.x).toBeGreaterThanOrEqual(0);expect(rect!.x+rect!.width).toBeLessThanOrEqual(viewport.width);
      expect(rect!.y+rect!.height).toBeLessThan(viewport.height-70);
      expect(await panel.evaluate(el=>getComputedStyle(el).getPropertyValue('--glass-tint-opacity'))).toBe('0.82');
      expect(await page.locator('.top-information').evaluate(el=>getComputedStyle(el).getPropertyValue('--glass-tint-opacity'))).toBe(initial);
      // A real single touch scrolls the long card without moving the map.
      const content=page.locator('.panel-content'),box=await content.boundingBox();
      const cdp=await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box!.x+box!.width/2,y:box!.y+box!.height-12}]});
      for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box!.x+box!.width/2,y:box!.y+box!.height-12-i*Math.min(25,box!.height/8)}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      if(await content.evaluate(el=>el.scrollHeight>el.clientHeight+5))await expect.poll(()=>content.evaluate(el=>el.scrollTop)).toBeGreaterThan(0);
      await page.getByRole('button',{name:'关闭详情',exact:true}).tap();
      await expect(canvas).toHaveAttribute('data-target','[0,2,2]');
      for(const name of ['游览','人流','卫生间','安全']){
        await page.getByRole('button',{name,exact:true}).tap();
        const capsule=await page.locator('.is-current-terminal .pin-body').boundingBox(),disc=await page.locator('.is-current-terminal .pin-disc').boundingBox();
        expect(capsule!.height).toBeCloseTo(36,3);expect(capsule!.height).toBeCloseTo(disc!.height,3);expect(disc!.width).toBeCloseTo(disc!.height,3);
        for(const other of await page.locator('.map-pin:not(.is-current-terminal) .pin-disc').all()){
          const circle=await other.boundingBox();expect(circle!.height).toBeCloseTo(capsule!.height,3);expect(circle!.width).toBeCloseTo(capsule!.height,3);
        }
        expect((await page.locator('.is-current-terminal').boundingBox())!.height).toBeGreaterThanOrEqual(44);
      }
      await page.getByRole('button',{name:'人流',exact:true}).tap();
      await expect(page.locator('.region-count').first()).toHaveClass(/liquid-glass-material/);
      expect(await page.locator('.region-count').first().evaluate(el=>getComputedStyle(el).getPropertyValue('--glass-tint-opacity'))).toBe('0.09');
      await page.getByRole('button',{name:'手机导览',exact:false}).tap();await expect(panel).toBeVisible();
      await page.getByRole('button',{name:'关闭详情',exact:true}).tap();
      const mapBox=await canvas.boundingBox(),x=mapBox!.width*.5,y=mapBox!.height*.5;
      const angle=await canvas.getAttribute('data-azimuth');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      for(let i=1;i<=5;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+i*15,y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await expect(canvas).not.toHaveAttribute('data-azimuth',angle!);await expect(panel).toHaveCount(0);
      const distance=Number(await canvas.getAttribute('data-distance'));
      await page.getByRole('button',{name:'放大沙盘',exact:true}).tap();
      await expect.poll(async()=>Number(await canvas.getAttribute('data-distance'))).toBeLessThan(distance);
      expect(await page.evaluate(()=>visualViewport!.scale)).toBe(1);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await page.screenshot({path:`.local/qa/touch-${viewport.width}x${viewport.height}.png`});
    }finally{await context.close();}
  });
}

test('browser zoom guards preserve mouse/trackpad and interrupted return restores fixed origin',async({page})=>{
  await page.clock.install({time:new Date('2026-09-12T04:00:00Z')});
  await page.goto('/?alwaysOpen=1');const canvas=page.locator('.scene-canvas');
  await expect(canvas).toHaveAttribute('data-intro-state','ready',{timeout:30000});
  const keys=await page.evaluate(()=>['+','=','-','0'].map(key=>{
    const event=new KeyboardEvent('keydown',{key,metaKey:true,bubbles:true,cancelable:true});document.dispatchEvent(event);return event.defaultPrevented;
  }));expect(keys.every(Boolean)).toBe(true);
  const wheel=await page.evaluate(()=>[false,true].map(ctrlKey=>{const e=new WheelEvent('wheel',{deltaY:30,ctrlKey,cancelable:true,bubbles:true});document.body.dispatchEvent(e);return e.defaultPrevented;}));expect(wheel).toEqual([false,true]);
  const scrollCamera=await canvas.getAttribute('data-scroll-camera');
  await page.getByRole('button',{name:'设施',exact:true}).click();await page.locator('[data-point-choice="t4"]').click();await page.clock.runFor(1300);
  expect(await canvas.getAttribute('data-target')).not.toBe('[0,2,2]');
  await expect(canvas).toHaveAttribute('data-scroll-camera',scrollCamera!);
  await expect(canvas).toHaveAttribute('data-scroll-layer','background');
  const target=await canvas.getAttribute('data-target');
  const angle=Number(await canvas.getAttribute('data-azimuth'));
  await page.mouse.move(700,580);await page.mouse.down();await page.mouse.move(1000,580,{steps:10});await page.mouse.up();
  expect(Number(await canvas.getAttribute('data-azimuth'))).not.toBe(angle);await expect(canvas).toHaveAttribute('data-target',target!);
  // Freeze wind only: the base stays still while only the floating model turns.
  await page.emulateMedia({reducedMotion:'reduce'});await page.clock.runFor(50);
  const transform=await canvas.getAttribute('data-scroll-transform');
  const footprint=await canvas.getAttribute('data-scroll-footprint');
  await page.mouse.move(700,580);await page.mouse.down();await page.mouse.move(850,580,{steps:5});await page.mouse.up();await page.clock.runFor(50);
  await expect(canvas).toHaveAttribute('data-scroll-transform',transform!);
  const afterTurn=JSON.parse((await canvas.getAttribute('data-scroll-footprint'))!).flat();
  JSON.parse(footprint!).flat().forEach((value:number,i:number)=>expect(afterTurn[i]).toBeCloseTo(value,7));
  const rotatedFootprint=await canvas.getAttribute('data-scroll-footprint');
  await page.getByRole('button',{name:'放大沙盘',exact:true}).click();await page.clock.runFor(50);
  await expect(canvas).toHaveAttribute('data-scroll-transform',transform!);
  await expect(canvas).not.toHaveAttribute('data-scroll-footprint',rotatedFootprint!);
  await page.screenshot({path:'.local/qa/scroll-world-detail.png'});
  await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.clock.runFor(50);
  await expect(canvas).toHaveAttribute('data-scroll-transform',transform!);
  await page.getByRole('button',{name:'设施',exact:true}).click();await page.locator('[data-point-choice="t4"]').click();await page.clock.runFor(50);
  await expect(canvas).toHaveAttribute('data-scroll-transform',transform!);
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.getByRole('button',{name:'关闭详情',exact:true}).click();await page.clock.runFor(250);
  await page.mouse.move(700,580);await page.mouse.down();await page.mouse.move(800,580,{steps:3});await page.mouse.up();await page.clock.runFor(50);
  await expect(canvas).toHaveAttribute('data-target','[0,2,2]');
  await page.getByRole('button',{name:'放大沙盘',exact:true}).click();await page.clock.runFor(1300);
  await expect(canvas).toHaveAttribute('data-target','[0,2,2]');
  await expect(canvas).toHaveAttribute('data-scroll-camera',scrollCamera!);
  const distance=Number(await canvas.getAttribute('data-distance'));
  await page.getByRole('button',{name:'看全景',exact:true}).click();
  await expect(canvas).toHaveAttribute('data-camera-motion','flying');await page.clock.runFor(300);
  const middle=Number(await canvas.getAttribute('data-distance'));expect(middle).toBeGreaterThan(distance);expect(middle).toBeLessThan(106.482);
  await page.clock.runFor(1300);await expect(canvas).toHaveAttribute('data-distance','106.482');await expect(canvas).toHaveAttribute('data-target','[0,2,2]');
});

test('phone can open and reach navigation',async({browser})=>{
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  try{const page=await context.newPage();await page.goto('http://localhost:5173/?alwaysOpen=1');await expect(page.locator('.scene-canvas')).toHaveAttribute('data-intro-state','ready',{timeout:30000});await page.getByRole('button',{name:'设施',exact:true}).tap();await expect(page.locator('.detail-panel')).toBeVisible();expect(await page.evaluate(()=>visualViewport!.scale)).toBe(1);}finally{await context.close();}
});
