import {it,expect} from 'vitest';
import {sampleSnapshot,validateSnapshot} from '../../packages/client/src/index';
import {cableConfig} from '../../packages/scenic/src/cable';
it('keeps line capacity, directional queues and in-transit counts consistent',()=>{
  expect(cableConfig.totalCapacity).toBe(cableConfig.cabinCount*cableConfig.cabinSeats);
  expect(cableConfig.capacityPerMinute).toBe(cableConfig.cabinSeats*60/cableConfig.dispatchSeconds);
  let sawQueue=false;
  for(const hour of [8,9,12,14,15,17,19]){
    const date=new Date(`2026-09-11T${String(hour-8).padStart(2,'0')}:30:00Z`),s=sampleSnapshot(date);
    expect(validateSnapshot(s)).toEqual(s);
    expect(s.points.upper.cable?.direction).toBe('down');expect(s.points.lower.cable?.direction).toBe('up');
    for(const id of ['upper','lower']){
      const c=s.points[id].cable!;expect(c.totalCapacity).toBe(320);expect(c.inTransit).toBeLessThanOrEqual(160);expect(c.inTransit).toBeGreaterThanOrEqual(0);
      if(s.points[id].availability==='open'){
        expect(c.queueCount).toBeGreaterThanOrEqual(0);expect(c.waitMinutes).toBeGreaterThanOrEqual(0);sawQueue ||= c.queueCount!>0;
        expect(s.points[id].load).toBe(c.waitMinutes!>=10?'busy':c.waitMinutes!>=5?'moderate':'quiet');
      }else{expect(c.queueCount).toBeNull();expect(c.waitMinutes).toBeNull();}
    }
    expect(sampleSnapshot(date)).toEqual(s);
  }
  expect(sawQueue).toBe(true);
});
it('rejects impossible cable capacities and occupants',()=>{
  const s=sampleSnapshot(new Date('2026-09-11T04:00:00Z'));
  s.points.upper.cable!.inTransit=161;expect(()=>validateSnapshot(s)).toThrow('索道容量或排队数据不正确');
  s.points.upper.cable!.inTransit=0;s.points.upper.cable!.totalCapacity=321;expect(()=>validateSnapshot(s)).toThrow('索道容量或排队数据不正确');
});
