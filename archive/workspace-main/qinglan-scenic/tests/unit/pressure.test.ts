import { describe, expect, it } from 'vitest';
import { referencePressure, regionPressure, pressureBands } from '../../packages/scenic/src/pressure';
import { sampleSnapshot } from '../../packages/client/testing/snapshot';
describe('参考承载压力（展示规则）',()=>{
  it.each([[0,0],[299,0],[300,1],[499,1],[500,2],[699,2],[700,3],[799,3],[800,4],[899,4],[900,5],[999,5],[1000,5],[1100,5]])('%s / 1000 属于第 %s 档',(count,band)=>{
    expect(referencePressure(count,1000).band).toBe(band);
  });
  it('满载与超载文案明确，低承载蓝色、舒适绿色',()=>{
    expect(referencePressure(900,1000).label).toBe('接近满载');
    expect(referencePressure(1000,1000).label).toBe('满载');
    expect(referencePressure(1001,1000).label).toBe('超载');
    expect(pressureBands[0].color).toBe('#3869A1');
    expect(pressureBands[1].color).toBe('#83CBB6');
  });
  it.each([[undefined,1000],[null,1000],[-1,1000],[NaN,1000],[Infinity,1000],[1,0],[1,-1],[1,NaN],[1,Infinity]])('无效人数/容量 %s / %s 为未知',(count,capacity)=>{
    expect(referencePressure(count,capacity)).toMatchObject({band:-1,ratio:null,label:'状态未知'});
  });
  it('业务load不决定展示，关闭与未知不可显示成宽松',()=>{
    const s=sampleSnapshot();
    s.regions.Z8={count:1000,availability:'open',load:'busy'};
    expect(regionPressure(s,'Z8').label).toBe('舒适');
    s.regions.Z8.availability='maintenance';
    expect(regionPressure(s,'Z8').label).toBe('未开放');
    expect(regionPressure(s,'missing').label).toBe('状态未知');
  });
});
