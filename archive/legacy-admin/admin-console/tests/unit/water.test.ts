import {describe,it,expect} from 'vitest';
import {isLake,isIsland,terrainHeight,waterfallProfile,lakeCut,lakeShoreDistance,nodes} from '@scenic/scenic';

describe('continuous water geometry',()=>{
  it('opens the eastern lake mouth through to the map cut and keeps services on land',()=>{
    for(let x=7;x<30;x+=.5){expect(isLake(x,10),`${x},10`).toBe(true);expect(terrainHeight(x,10)).toBeLessThan(0);}
    expect(isIsland(29,10)).toBe(true);
    expect(isIsland(33,10)).toBe(false);
    for(const id of ['r1','r2','creek','t2']){
      const n=nodes.find(n=>n.id===id)!;expect(isLake(n.x,n.z),id).toBe(false);expect(isIsland(n.x,n.z),id).toBe(true);
    }
    const [a,b]=lakeCut;
    // The cut stays wavy rather than behaving like a solid shoreline.
    expect(lakeShoreDistance((a[0]+b[0])/2,(a[1]+b[1])/2)).toBeGreaterThan(2);
  });
  it('joins four visible falling curtains without uphill flow or intersections with the rock face',()=>{
    let vertical=0;
    waterfallProfile.forEach((p,i)=>{
      if(i){const before=waterfallProfile[i-1];expect(p.y).toBeLessThanOrEqual(before.y);expect(p.z).toBeGreaterThanOrEqual(before.z);if(p.z===before.z&&before.y-p.y>1)vertical++;}
      if(i>0)for(const dx of [-1.65,0,1.65])expect(terrainHeight(p.x+dx,p.z)).toBeLessThan(p.y);
    });
    expect(vertical).toBe(4);
    expect(waterfallProfile.at(-1)!.y).toBeLessThan(.25-.225);
  });
});
