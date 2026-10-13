import type { SafetyKind } from '@scene/contracts';

/** Small fixtures beside existing walking surfaces. Existing roads keep their IDs. */
export interface VisitorFixture {
  id:string; name:string; kind:'terminal'|'safety'; regionId:string;
  x:number; z:number; connectTo:string; safetyKind?:SafetyKind;
}
export const visitorFixtures:VisitorFixture[]=[
  {id:'terminal-entry',name:'入口广场游客终端',kind:'terminal',regionId:'Z0',x:10,z:24,connectTo:'entry'},
  {id:'terminal-bamboo',name:'竹间驿游客终端',kind:'terminal',regionId:'Z2',x:20.8,z:4.2,connectTo:'bamboo-court'},
  {id:'terminal-summit',name:'山顶平台游客终端',kind:'terminal',regionId:'Z4',x:8,z:-18.9,connectTo:'t4'},
  {id:'terminal-market',name:'归云集游客终端',kind:'terminal',regionId:'Z0',x:-10.8,z:23.65,connectTo:'market'},
  {id:'aed-entry',name:'入口 AED',kind:'safety',safetyKind:'aed',regionId:'Z0',x:7,z:24,connectTo:'entry'},
  {id:'aed-summit',name:'山顶 AED',kind:'safety',safetyKind:'aed',regionId:'Z4',x:9.3,z:-21,connectTo:'t4'},
  {id:'aid-entry',name:'入口急救点',kind:'safety',safetyKind:'first-aid',regionId:'Z0',x:13.7,z:24.4,connectTo:'t1'},
  {id:'aid-bamboo',name:'竹间驿急救点',kind:'safety',safetyKind:'first-aid',regionId:'Z2',x:22.1,z:-1.5,connectTo:'supply'},
  {id:'help-creek',name:'溪谷一键求助点',kind:'safety',safetyKind:'help',regionId:'Z1',x:23,z:16,connectTo:'t2'},
  {id:'help-gorge',name:'峡谷一键求助点',kind:'safety',safetyKind:'help',regionId:'Z3',x:19.8,z:-4,connectTo:'t3'},
  {id:'help-forest',name:'林间一键求助点',kind:'safety',safetyKind:'help',regionId:'Z6',x:-15.7,z:9.5,connectTo:'t6'},
  {id:'help-falls',name:'瀑布一键求助点',kind:'safety',safetyKind:'help',regionId:'Z7',x:-12.3,z:-17,connectTo:'falls'},
  {id:'ring-creek',name:'溪谷救生圈',kind:'safety',safetyKind:'lifebuoy',regionId:'Z1',x:20,z:17.5,connectTo:'creek'},
  {id:'ring-lake',name:'湖畔救生圈',kind:'safety',safetyKind:'lifebuoy',regionId:'Z5',x:-16.2,z:1.5,connectTo:'lake'},
  {id:'fire-market',name:'归云集灭火器',kind:'safety',safetyKind:'extinguisher',regionId:'Z0',x:-12.55,z:23.4,connectTo:'market'},
  {id:'fire-lower',name:'索道下站灭火器',kind:'safety',safetyKind:'extinguisher',regionId:'Z0',x:-12.4,z:18,connectTo:'lower'},
  {id:'fire-bamboo',name:'竹间驿灭火器',kind:'safety',safetyKind:'extinguisher',regionId:'Z2',x:22.1,z:-2.7,connectTo:'supply'},
  {id:'shelter-entry',name:'入口广场应急避难点',kind:'safety',safetyKind:'shelter',regionId:'Z0',x:2,z:23,connectTo:'entry'},
  {id:'shelter-summit',name:'山顶平台应急避难点',kind:'safety',safetyKind:'shelter',regionId:'Z4',x:1,z:-22.6,connectTo:'summit'},
];
export const safetyLabels:Record<SafetyKind,string>={aed:'AED', 'first-aid':'急救点',help:'一键求助点',lifebuoy:'救生圈',extinguisher:'灭火器',shelter:'应急避难点'};
export const terminalIds=visitorFixtures.filter(p=>p.kind==='terminal').map(p=>p.id);
export function resolveTerminal(search:string):{id:string;warning?:string}{
  const query=new URLSearchParams(search);
  const id=query.get('terminalId');
  if(id===null)return {id:'terminal-entry'};
  return terminalIds.includes(id)?{id}:{id:'terminal-entry',warning:'终端编号无效，已使用入口终端'};
}
