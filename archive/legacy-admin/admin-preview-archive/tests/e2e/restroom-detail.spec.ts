import {test,expect} from '@playwright/test';

test('shows separate gender counts, preserves zero, and keeps missing data unknown',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/?alwaysOpen=1');
  await expect(page.locator('.scene-canvas')).toHaveAttribute('data-intro-state','ready',{timeout:30000});
  await page.evaluate(async(root)=>{
    const vueModule='/node_modules/.vite/deps/vue.js';
    const {createApp,h,reactive}=await import(vueModule);
    const {default:Info}=await import(`${root}/packages/ui/src/scenic/ScenicPointInfo.vue`);
    const {pointById}=await import(`${root}/packages/scenic/src/data.ts`);
    const {sampleSnapshot}=await import(`${root}/packages/client/src/index.ts`);
    (document.querySelector('#app') as HTMLElement&{__vue_app__?:{unmount:()=>void}}).__vue_app__?.unmount();
    const snapshot=reactive(sampleSnapshot(new Date('2026-09-11T04:00:00Z')));
    snapshot.points.t1.restroom={totalStalls:12,occupiedStalls:9,availableStalls:0,queueCount:3,
      male:{totalStalls:5,occupiedStalls:4,availableStalls:0,queueCount:0},
      female:{totalStalls:7,occupiedStalls:5,availableStalls:0,queueCount:3}};
    const host=document.createElement('div');host.style.cssText='width:330px;padding:18px;background:#edf3ed';document.body.append(host);
    createApp({render:()=>h(Info,{point:pointById.t1,snapshot})}).mount(host);
    (window as any).setRestroomCase=(mode:string)=>{
      if(mode==='missing')delete snapshot.points.t1.restroom.female;
      else snapshot.points.t1.availability=mode;
    };
  },`/@fs${process.cwd()}`);
  await expect(page.getByTestId('male-total')).toHaveText('5个');await expect(page.getByTestId('female-total')).toHaveText('7个');
  await expect(page.getByTestId('male-occupied')).toHaveText('4个');await expect(page.getByTestId('female-occupied')).toHaveText('5个');
  await expect(page.getByTestId('male-available')).toHaveText('0个');await expect(page.getByTestId('female-available')).toHaveText('0个');
  await expect(page.getByTestId('male-queue')).toHaveText('0人');await expect(page.getByTestId('female-queue')).toHaveText('3人');
  await page.locator('.restroom-summary summary').click();await expect(page.getByTestId('stalls-total')).toHaveText('12个');
  await page.evaluate(()=>(window as any).setRestroomCase('missing'));await expect(page.getByTestId('female-total')).toHaveText('暂无数据');
  await page.evaluate(()=>(window as any).setRestroomCase('unknown'));await expect(page.getByTestId('male-available')).toHaveText('暂无数据');await expect(page.getByTestId('male-queue')).toHaveText('暂无数据');
  await page.evaluate(()=>(window as any).setRestroomCase('maintenance'));await expect(page.getByTestId('male-available')).toHaveText('0个');await expect(page.getByTestId('female-available')).toHaveText('0个');
});
