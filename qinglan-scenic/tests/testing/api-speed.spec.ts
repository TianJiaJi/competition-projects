import { expect, test } from '@playwright/test';
import { fixtures, receive, nav, generateApi } from './helpers';
import { API_CASE_COUNT } from '../../apps/testing/src/campus-handoff';
import { apiDisplayTiming } from '../../apps/testing/src/api-display-timing';
const budget=apiDisplayTiming(API_CASE_COUNT).reduce((sum,item)=>sum+item.delayMs,0);
test.beforeEach(async({page})=>{
 await fixtures(page);
 await page.addInitScript(()=>{
  const metrics={jsonCalls:0,jsonMs:0,writes:0};(window as any).__apiMetrics=metrics;
  const original=JSON.stringify;
  (JSON as any).stringify=function(...args:any[]){const started=performance.now();try{return (original as any)(...args);}finally{metrics.jsonCalls++;metrics.jsonMs+=performance.now()-started;}};
  const write=Storage.prototype.setItem;
  Storage.prototype.setItem=function(key,value){if(key==='service-test-workbench.campus-task.v1')metrics.writes++;return write.call(this,key,value);};
 });
});
for(const history of [false,true])test(`API展示预算与耗时（${history?'带大份历史并发报告':'空白本轮'}）`,async({page})=>{
 await receive(page);await generateApi(page);
 if(history){
  await page.evaluate(()=>{
   const key='service-test-workbench.campus-task.v1',store=JSON.parse(localStorage.getItem(key)!);
   const endpoint=store.apiCases[0];
   const sample={endpointId:endpoint.id,source:'model',weight:50,at:new Date().toISOString(),elapsedMs:10,status:200,outcome:'passed',checks:[],requestId:'performance-fixture',bytes:0,preview:'fixture only '.repeat(170)};
   store.reports=[{id:'performance-history',taskId:store.taskId,kind:'load',system:{id:'campus-delivery',name:'性能测试夹具',baseUrl:'http://localhost:5606',endpoints:store.apiCases},startedAt:new Date().toISOString(),elapsedMs:30000,status:'completed',samples:Array.from({length:1024},(_,i)=>({...sample,requestId:`performance-${i}`})),observations:[],events:[],frames:[{second:30,windowSeconds:1,completed:1,concurrency:2000,rps:1,targetRps:1,p50:10,p95:10,p99:10,failed:0,level:5,phase:'completed'}],config:{concurrency:2000,duration:30,rps:0,endpointId:endpoint.id}}];
   store.latestLoadId='performance-history';localStorage.setItem(key,JSON.stringify(store));
  });
  await page.reload();await nav(page,'API测试');
 }
 await page.evaluate(()=>Object.assign((window as any).__apiMetrics,{jsonCalls:0,jsonMs:0,writes:0}));
 const started=Date.now();await page.getByRole('button',{name:'运行全部API',exact:true}).click();
 await expect(page.getByRole('button',{name:'查看API测试报告',exact:true})).toBeVisible({timeout:60000});
 const elapsed=Date.now()-started;
 const measurement=await page.evaluate(()=>({...(window as any).__apiMetrics,results:Object.keys(JSON.parse(localStorage.getItem('service-test-workbench.campus-task.v1')!).apiResults).length}));
 console.log(JSON.stringify({history,budget,elapsed,...measurement}));
 expect(measurement.results).toBe(API_CASE_COUNT);
 expect(elapsed).toBeLessThan(budget+1800);
 expect(measurement.writes).toBeLessThan(40);
});
test('API运行中刷新立即保存已执行进度，停止后的阶段报告也完整保留',async({page})=>{
 await receive(page);await generateApi(page);
 await page.getByRole('button',{name:'运行全部API',exact:true}).click();
 await expect(page.locator('.api-table .badge.good').first()).toBeVisible();
 const recorded=await page.locator('.api-table .badge.good').count();
 await page.reload();await nav(page,'API测试');
 expect(await page.locator('.api-table .badge.good').count()).toBeGreaterThanOrEqual(recorded);
 await page.getByRole('button',{name:'运行全部API',exact:true}).click();
 await expect(page.locator('.api-table .badge.good').first()).toBeVisible();
 await page.getByRole('button',{name:'停止API测试',exact:true}).click();
 await expect(page.getByRole('button',{name:'查看API测试报告',exact:true})).toBeVisible();
 await page.reload();await nav(page,'API测试');
 await page.getByRole('button',{name:'查看API测试报告',exact:true}).click();
 await expect(page.getByRole('dialog',{name:'API测试报告',exact:true})).toContainText('阶段记录');
});
