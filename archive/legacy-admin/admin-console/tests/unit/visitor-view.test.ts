import {describe,it,expect} from 'vitest';
import {resolveTerminal,terminalIds,points,pointById,pointInView,safetyStatus,visitorFixtures,findRoute,edges,nodeById,isLake,isWaterfall,isIsland,pointSites,terrainHeight,distanceToRoadSegment} from '@scenic/scenic';
import {sampleSnapshot} from '../../packages/client/src/index';
import {plazaRestAreas} from '../../packages/scenic/src/plaza-furniture';
const snapshot=()=>sampleSnapshot(new Date('2026-09-11T04:00:00Z'));
describe('visitor views and terminal configuration',()=>{
  it('resolves all four URL terminal IDs, defaults only when absent and reports invalid input',()=>{
    for(const id of terminalIds)expect(resolveTerminal(`?terminalId=${id}`)).toEqual({id});
    expect(resolveTerminal('?alwaysOpen=1')).toEqual({id:'terminal-entry'});
    for(const query of ['?terminalId=missing','?terminalId=','?terminalId=entry'])expect(resolveTerminal(query)).toEqual({id:'terminal-entry',warning:'终端编号无效，已使用入口终端'});
  });
  it('uses mutually exclusive point visibility with the current terminal as the only exception',()=>{
    const current='terminal-summit';
    for(const view of ['default','crowd','toilet','safety'] as const){
      const visible=points.filter(p=>pointInView(p,view,current));
      expect(visible.some(p=>p.id===current)).toBe(true);
      if(view==='crowd')expect(visible.map(p=>p.id)).toEqual([current]);
      else if(view==='default')expect(visible.every(p=>!['safety','toilet'].includes(p.kind))).toBe(true);
      else expect(visible.every(p=>p.id===current||p.kind===view)).toBe(true);
    }
  });
  it('does not confuse equipment availability with visitor load',()=>{
    expect(safetyStatus('open')).toBe('可用');
    for(const s of ['closed','maintenance'] as const)expect(safetyStatus(s)).toBe('不可用');
    expect(safetyStatus('unknown')).toBe('状态未知');expect(safetyStatus()).toBe('状态未知');
    const s=snapshot();expect(s.points['fire-bamboo'].availability).toBe('maintenance');
    expect(s.points['aed-entry']).toMatchObject({availability:'open',load:'unknown'});
    expect(new Set(visitorFixtures.filter(p=>p.kind==='safety').map(p=>p.safetyKind)).size).toBe(6);
  });
  it('connects every terminal to open destinations and rejects closed access and equipment',()=>{
    const s=snapshot();
    for(const id of terminalIds){
      expect(findRoute(id,'creek','walk',s).ok,id).toBe(true);
      expect(findRoute(id,'aed-entry','walk',s).ok,id).toBe(true);
      expect(findRoute(id,'fire-bamboo','walk',s).ok,id).toBe(false);
      expect(findRoute(id,'lake','walk',s).ok,id).toBe(false);
      const same=findRoute(id,id,'walk',s);expect(same.ok&&same.distance).toBe(0);
      expect(findRoute(id,'creek','walk',{...s,closedEdgeIds:[`access-${id}`]}).ok).toBe(false);
    }
    s.points.t4.availability='maintenance';
    expect(findRoute('terminal-summit','creek','walk',s).ok).toBe(true);
    expect(findRoute('terminal-summit','t4','walk',s).ok).toBe(false);
    expect(findRoute('terminal-summit','creek','walk',{...s,closedEdgeIds:['road-24']}).ok).toBe(false);
    const route=findRoute('terminal-summit','market','cable',s);
    expect(route.ok&&route.edgeIds).toContain('access-terminal-summit');
    expect(route.ok&&route.edgeIds).toContain('cable-down');
    s.points.upper.availability='maintenance';
    expect(findRoute('terminal-summit','market','cable',s).ok).toBe(false);
    expect(findRoute('terminal-summit','market','walk',s).ok).toBe(true);
  });
  it('places terminals on dry clear ground outside buildings, planters and existing main roads',()=>{
    for(const id of terminalIds){
      const n=nodeById[pointById[id].nodeId];
      expect(isIsland(n.x,n.z),id).toBe(true);expect(isLake(n.x,n.z)||isWaterfall(n.x,n.z),id).toBe(false);
      for(const {building:b} of pointSites)expect(Math.abs(n.x-b.x)>b.width/2+.45||Math.abs(n.z-b.z)>b.depth/2+.35,`${id}/building`).toBe(true);
      for(const a of plazaRestAreas)expect(Math.abs(n.x-a.x)>a.width/2+.5||Math.abs(n.z-a.z)>a.depth/2+.4,`${id}/planter`).toBe(true);
      for(const road of edges.filter(e=>e.mode==='walk'&&!e.id.startsWith('access-')))for(let i=1;i<road.path!.length;i++)expect(distanceToRoadSegment(n.x,n.z,road.path![i-1],road.path![i]),`${id}/${road.id}`).toBeGreaterThan(.8);
      for(const dx of [-.4,.4])for(const dz of [-.3,.3])expect(Math.abs(terrainHeight(n.x+dx,n.z+dz)-terrainHeight(n.x,n.z)),id).toBeLessThan(.2);
    }
  });
});

describe('facility model emphasis',()=>{
  it('uses crowd colors for restroom models and availability colors for safety models',async()=>{
    const {facilityColor}=await import('@scenic/scenic');
    expect(facilityColor(pointById.t1,{availability:'open',load:'busy'})).toBe('#b33f36');
    expect(facilityColor(pointById.t1,{availability:'open',load:'moderate'})).toBe('#8a580e');
    expect(facilityColor(pointById.t1,{availability:'maintenance',load:'quiet'})).toBe('#616d6a');
    expect(facilityColor(pointById['aed-entry'],{availability:'open',load:'busy'})).toBe('#226b4d');
    expect(facilityColor(pointById['aed-entry'],{availability:'maintenance',load:'quiet'})).toBe('#b33f36');
    expect(facilityColor(pointById['aed-entry'])).toBe('#616d6a');
  });
  it('preserves existing shader hooks and updates one uniform without rebuilding materials',async()=>{
    const THREE=await import('three');const {createContextMuting}=await import('../../packages/scenic/src/focus-materials');
    const dim=createContextMuting(),mat=new THREE.MeshStandardMaterial({color:'#abcdef'});
    let calls=0;mat.onBeforeCompile=()=>{calls++;};
    const original=mat.color.getHex();dim.attach(mat);const version=mat.version;dim.attach(mat);expect(mat.version).toBe(version);
    const shader={uniforms:{},fragmentShader:'#include <opaque_fragment>'} as Parameters<typeof mat.onBeforeCompile>[0];
    mat.onBeforeCompile(shader,{} as import('three').WebGLRenderer);
    expect(calls).toBe(1);expect(shader.fragmentShader).toContain('outgoingLight = scenicMutedContext(outgoingLight)');
    expect(shader.uniforms.uScenicContextMuted).toBe(dim.amount);
    dim.amount.value=1;expect(shader.uniforms.uScenicContextMuted.value).toBe(1);
    dim.amount.value=0;expect(shader.uniforms.uScenicContextMuted.value).toBe(0);expect(mat.color.getHex()).toBe(original);
    const focus=new THREE.MeshStandardMaterial();focus.userData.focusMaterial=true;const v=focus.version;dim.attach(focus);expect(focus.version).toBe(v);
    mat.dispose();focus.dispose();
  });
});
