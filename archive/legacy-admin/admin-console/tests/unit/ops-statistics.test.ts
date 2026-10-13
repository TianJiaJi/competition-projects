import {it,expect} from 'vitest';
import {buildSnapshot,scenarios} from '../../apps/ops/src/mock';
import {summarizeAlerts} from '../../apps/ops/src/alert-stats';
import {regionLabelSites} from '../../packages/scenic/src/region-label-anchors';
it('默认今日 24 条、17 条完成、7 条未完成且时长来自记录',()=>{
 const d=buildSnapshot(),s=summarizeAlerts(d.alerts,d.businessTime);
 expect([s.total,s.pending,s.processing,s.resolved]).toEqual([24,5,2,17]);
 const durations=d.alerts.filter(a=>a.status==='resolved').map(a=>(Date.parse(a.records.find(r=>r.kind==='completed')!.at)-Date.parse(a.records.find(r=>r.kind==='started')!.at))/60000);
 expect(s.averageProcessingMinutes).toBe(Math.round(durations.reduce((a,b)=>a+b,0)/17*10)/10);
});
for(const scenario of scenarios)it(`${scenario.id} 趋势、状态和事件记录同源`,()=>{
 const d=buildSnapshot(scenario.id),s=summarizeAlerts(d.alerts,d.businessTime);
 expect(s.trend.reduce((n,p)=>n+p.created,0)).toBe(s.total);
 expect(s.trend.reduce((n,p)=>n+p.completed,0)).toBe(s.resolved);
 expect(s.pending+s.processing+s.resolved).toBe(s.total);
 expect(s.trend.at(-1)!.time<=d.businessTime.slice(11,16)).toBe(true);
});
it('九个容器锚点具有固定岛屿位置和有效朝向',()=>{
 expect(Object.keys(regionLabelSites)).toHaveLength(9);
 for(const [id,p] of Object.entries(regionLabelSites)){if(id!=='Z8')expect(Math.hypot(p.x,p.z)).toBeGreaterThan(25);expect(Math.hypot(p.nx,p.nz)).toBeCloseTo(1,1);}
});

it("公共通行区固定湖中央，山顶容器适度抬高",()=>{expect(regionLabelSites.Z8).toMatchObject({x:0,z:3,alwaysVisible:true});expect(regionLabelSites.Z4.y).toBe(1.4);});
