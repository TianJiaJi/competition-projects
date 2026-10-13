import {it,expect} from 'vitest';
import {initialSimulation,step,hourOf,upgradeSimulationFlow,level} from '../../apps/server/src/platform/simulation';
import {FLOW_VERSION,MAIN_STOPS,MAIN_MINUTES,flowTemplates,admissionWeights,createFormulaFlow,recordAdmission,formulaOccupancy,visitorDistribution} from '../../apps/server/src/platform/visitor-flow';
const day=Date.parse('2026-09-14T00:00:00+08:00');
const at=(minute:number)=>day+minute*60000;
const sum=(values:number[])=>values.reduce((a,b)=>a+b,0);
function steadyFlow(until:number){const flow=createFormulaFlow(day);for(let u=480;u<=Math.min(1019,until);u++)recordAdmission(flow,at(u),10);return flow;}

it('主线按指定次序和分段时间建模，入园权重为85/5/5/5、快慢档为25/50/25',()=>{
 const weights=admissionWeights(600);
 for(const [route,weight] of [['loop',.85],['creek',.05],['bamboo',.05],['lake',.05]] as const){
  expect(sum(flowTemplates.map((t,i)=>t.routeId===route?weights[i]:0))).toBeCloseTo(weight,12);
 }
 const main=flowTemplates.filter(t=>t.routeId==='loop');
 expect(main.map(t=>t.duration)).toEqual([170,200,240]);
 expect(main[1].stages.map(s=>s.id)).toEqual(MAIN_STOPS);
 expect(main[1].stages.map(s=>s.end-s.start)).toEqual(MAIN_MINUTES);
 expect(main.map(t=>t.weight/.85)).toEqual([.25,.5,.25]);
 for(const t of flowTemplates){expect(t.stages.every(s=>s.to>s.from&&s.end>s.start)).toBe(true);expect(t.stages.at(-1)!.to).toBe(t.geometry.length);}
});

it('晚入园剔除不能按时完成的游程，17点后不再入园',()=>{
 for(const minute of [899,900,969,1019]){
  const weights=admissionWeights(minute);expect(sum([...weights])).toBeCloseTo(1);
  flowTemplates.forEach((t,i)=>{if(weights[i])expect(minute+1+t.duration).toBeLessThanOrEqual(1140);});
 }
 expect(admissionWeights(1019).slice(0,3)).toEqual([0,0,0]);
 const flow=createFormulaFlow(day);recordAdmission(flow,at(1019),1000);recordAdmission(flow,at(1020),200);
 expect(flow.entered).toBe(1000);expect(formulaOccupancy(flow,at(1140))).toMatchObject({visitors:0,exited:1000});
});

it('分钟入园桶按卷积权重进入各段，过渡连续，退出与区域整数分配守恒',()=>{
 const flow=createFormulaFlow(day);recordAdmission(flow,at(480),10000);
 const early=formulaOccupancy(flow,at(481));expect(early.visitors).toBe(10000);expect(early.exited).toBe(0);
 // Normal-speed loop: its entrance transfers linearly into creek between minute 2 and 4.
 const middle=formulaOccupancy(flow,at(483));expect(middle.masses[1][0]).toBeCloseTo(2125);expect(middle.masses[1][1]).toBeCloseTo(2125);
 let exited=0;
 for(let minute=480;minute<=721;minute+=.5){
  const result=formulaOccupancy(flow,at(minute));
  expect(sum(result.counts)).toBe(result.visitors);expect(result.visitors+result.exited).toBe(10000);
  expect(result.exited).toBeGreaterThanOrEqual(exited);exited=result.exited;
 }
 expect(exited).toBe(10000);
 const withReal=visitorDistribution(flow,at(721),3,{markers:false});expect(withReal.visitors).toBe(3);expect(withReal.counts[0]).toBe(3);
});

it('早晨由入口展开，中午覆盖主线，傍晚向商业与出口收束',()=>{
 const morning=formulaOccupancy(steadyFlow(482),at(482));expect(morning.counts[0]).toBe(Math.max(...morning.counts));
 const noon=visitorDistribution(steadyFlow(720),at(720));
 expect(noon.counts.filter(n=>n>100).length).toBeGreaterThanOrEqual(7);
 expect(noon.counts[4]/noon.visitors).toBeLessThan(.25);
 expect(new Set(noon.markers.map(p=>p.regionId)).size).toBeGreaterThanOrEqual(7);
 const late=formulaOccupancy(steadyFlow(1019),at(1125));expect(late.counts[0]).toBe(Math.max(...late.counts));
});

it('代表点确定性分散，同一编号连续移动；轨迹插值严格沿现有步道',()=>{
 const flow=steadyFlow(720),time=at(720);
 const first=visitorDistribution(flow,time,0,{trajectory:true});
 expect(first).toEqual(visitorDistribution(JSON.parse(JSON.stringify(flow)),time,0,{trajectory:true}));
 expect(first.markers.length).toBeLessThanOrEqual(320);expect(first.markers.length).toBeGreaterThan(250);
 expect(new Set(first.markers.map(p=>p.id)).size).toBe(first.markers.length);
 expect(new Set(first.markers.map(p=>`${p.x.toFixed(5)},${p.z.toFixed(5)}`)).size).toBeGreaterThan(first.markers.length*.95);
 const second=visitorDistribution(flow,time+10000,0,{trajectory:true}),next=new Map(second.markers.map(p=>[p.id,p]));
 let matched=0;
 for(const p of first.markers){
  const q=next.get(p.id);if(!q)continue;matched++;
  const trajectory=p.trajectory!,i=trajectory.findIndex(v=>v.seconds>=10),a=trajectory[i-1],b=trajectory[i],fraction=(10-a.seconds)/(b.seconds-a.seconds);
  expect(q.x).toBeCloseTo(a.x+(b.x-a.x)*fraction,7);expect(q.z).toBeCloseTo(a.z+(b.z-a.z)*fraction,7);
 }
 expect(matched).toBeGreaterThan(250);
 // Check every interpolation interval, including its midpoint, against the actual polyline.
 for(const p of first.markers){
  const seed=Number(p.id.split('-').at(-1)),k=Math.floor(seed/4)%flowTemplates.length,path=flowTemplates[k].geometry.path;
  const distance=(x:number,z:number)=>{let nearest=Infinity;for(let j=1;j<path.length;j++){const a=path[j-1],b=path[j],dx=b.x-a.x,dz=b.z-a.z,t=Math.max(0,Math.min(1,((x-a.x)*dx+(z-a.z)*dz)/(dx*dx+dz*dz||1)));nearest=Math.min(nearest,Math.hypot(x-a.x-dx*t,z-a.z-dz*t));}return nearest;};
  const track=p.trajectory!;expect(track[0].seconds).toBe(0);expect(track.at(-1)!.seconds).toBe(60);
  for(let i=1;i<track.length;i++){expect(track[i].seconds).toBeGreaterThan(track[i-1].seconds);expect(distance((track[i-1].x+track[i].x)/2,(track[i-1].z+track[i].z)/2)).toBeLessThan(1e-7);}
 }
});

it('公式工作量有固定时间窗，不读取已离园的历史桶',()=>{
 const flow=steadyFlow(1019);let reads=0;
 flow.admissions=new Proxy(flow.admissions,{get(target,key,receiver){if(typeof key==='string'&&/^\d+$/.test(key))reads++;return Reflect.get(target,key,receiver);}});
 formulaOccupancy(flow,at(1000));expect(reads).toBeLessThanOrEqual(241);
});

it('全天闸机接入公式，人数、停车守恒；午夜清空分钟桶',()=>{
 const sim=initialSimulation(day);let exited=0;
 for(let i=0;i<8640;i++){
  step(sim,{});
  expect(sum(Object.values(sim.snapshot.regions).map(r=>r.count||0))).toBe(sim.snapshot.visitors);
  expect(sim.entered-sim.exited).toBe(sim.snapshot.visitors);
  expect(sim.parking.every(n=>n>=0)).toBe(true);
  if(hourOf(sim.time)!==0){expect(sim.exited).toBeGreaterThanOrEqual(exited);exited=sim.exited;}
 }
 expect(sim.snapshot.visitors).toBe(0);expect(sim.flow!.entered).toBe(0);expect(sum(sim.flow!.admissions)).toBe(0);
},60000);

it('索道业务队列不改变公式离园，停车归还仍只执行一次',()=>{
 const sim=initialSimulation(day);sim.time=at(700);sim.flow=steadyFlow(500);sim.entered=sim.flow.entered;
 const expected=formulaOccupancy(sim.flow,sim.time+10000);
 sim.parking=[1,0,0];sim.cohorts=[{people:3,enterAt:at(500),exitAt:sim.time+10000,lot:0,cars:1,cable:'up',cableAt:at(600),cableDone:false}];
 sim.cable.up.queue=[{people:90,until:sim.time,owner:'independent-business-queue'}];
 step(sim,{lower:{availability:'maintenance',reason:'测试检修'}},0,[0,0,0],{demandScale:0});
 expect(sim.exited).toBe(expected.exited);expect(sim.snapshot.visitors).toBe(expected.visitors);expect(sim.cohorts).toHaveLength(0);expect(sim.carReturns).toHaveLength(1);
 for(let i=0;i<60;i++)step(sim,{},0,[0,0,0],{demandScale:0});
 expect(sim.parking[0]).toBe(0);expect(sim.carReturns).toHaveLength(0);
});

it('旧快照无需推进时钟即可迁移，保留业务记录和实际游客，并且幂等',()=>{
 const sim=initialSimulation(day);sim.time=at(700);sim.flowVersion=3;delete sim.flow;
 sim.entered=120;sim.exited=20;sim.snapshot.visitors=105;
 sim.cohorts=[{people:100,enterAt:at(600),exitAt:at(800),lot:0,cars:3,cable:'none',cableAt:0,cableDone:true}];
 sim.parking=[3,0,0];const business=structuredClone(sim.cohorts);
 expect(upgradeSimulationFlow(sim)).toBe(true);expect(sim.flowVersion).toBe(FLOW_VERSION);expect(sim.time).toBe(at(700));
 expect(sim.flow!.admissions[600]).toBe(100);expect(sim.flow!.exitedBaseline).toBe(20);
 expect(sim.cohorts).toEqual(business);expect(sim.parking).toEqual([3,0,0]);expect(sim.entered).toBe(120);
 expect(sim.snapshot.visitors).toBe(sim.entered-sim.exited+5);expect(sum(Object.values(sim.snapshot.regions).map(r=>r.count||0))).toBe(sim.snapshot.visitors);expect(sim.snapshot.regions.Z8.count).toBeGreaterThan(0);
 const migrated=structuredClone(sim);expect(upgradeSimulationFlow(sim)).toBe(false);expect(sim).toEqual(migrated);
});

it('区域人流达到约 55% 才进入适中，达到 80% 才标记拥挤',()=>{
 expect(level(.29,.3,.5)).toBe('quiet');
 expect(level(.3,.3,.5)).toBe('light');
 expect(level(.49,.3,.5)).toBe('light');
 expect(level(.5,.3,.5)).toBe('moderate');
 expect(level(.79,.3,.5)).toBe('moderate');
 expect(level(.8,.3,.5)).toBe('busy');
});

it('客流颜色映射使用设计规范中的四色，未知独立为灰色',async()=>{
 const {loadColors,loadLabels}=await import('@scenic/scenic');
 expect(loadColors).toMatchObject({quiet:'#83CBB6',light:'#3869A1',moderate:'#F0B65B',busy:'#B33F36'});
 expect(loadLabels).toMatchObject({quiet:'空闲',light:'较舒适',moderate:'适中',busy:'拥堵',unknown:'数据未知'});
});

it('完整安全设施上报可用和维护状态，且不随普通景点闭园变未知',()=>{
 const sim=initialSimulation(Date.parse('2026-09-14T00:00:00+08:00'));
 step(sim,{'aed-entry':{availability:'maintenance',reason:'自检'}});
 expect(sim.snapshot.points['aed-entry'].availability).toBe('maintenance');
 expect(sim.snapshot.points['help-gorge'].availability).toBe('open');
 expect(sim.snapshot.points['terminal-summit'].availability).toBe('open');
});

it('午夜已有完整真实零值；闭园清园结束后区域合计为零且不再标记开放',()=>{
 const sim=initialSimulation(Date.parse('2026-09-14T00:00:00+08:00'));
 expect(sim.snapshot.updatedAt).toBe(new Date(sim.time).toISOString());
 expect(sim.snapshot.visitors).toBe(0);expect(Object.keys(sim.snapshot.regions)).toHaveLength(9);
 expect(Object.values(sim.snapshot.regions).every(r=>r.count===0&&r.availability==='closed')).toBe(true);
 expect(sim.snapshot.points.lower.cable?.queueCount).toBe(0);
});
