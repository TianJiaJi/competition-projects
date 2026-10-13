import {describe,it,expect} from 'vitest';
import {displayMetrics,unscaleRect} from '../../packages/ui/src/display/geometry';
import {desktopDisplayCss} from '../../packages/ui/src/display/postcss';
describe('desktop composition and coordinate contract',()=>{
  for(const zoom of [.8,1,1.25,1.5,1.75,2])it(`keeps the original composition and control proportions at ${zoom}`,()=>{
    const metrics=displayMetrics(1920/zoom,1080/zoom);
    expect(metrics.width).toBeCloseTo(1920);expect(metrics.height).toBeCloseTo(1080);
    expect(36*metrics.scale/(1920/zoom)).toBeCloseTo(36/1920);
    const rect=unscaleRect({left:80/zoom,top:120/zoom,width:420/zoom,height:300/zoom},metrics.scale);
    for(const [key,value] of Object.entries({left:80,top:120,width:420,height:300,right:500,bottom:420}))expect(rect[key as keyof typeof rect]).toBeCloseTo(value);
  });
  it('keeps DPR out of layout and scales the whole composition with the window',()=>{
    expect(displayMetrics(1920,1080)).toEqual({scale:1,width:1920,height:1080});
    expect(displayMetrics(960,540)).toEqual({scale:.5,width:1920,height:1080});
    expect(displayMetrics(1280,720).width).toBe(1920);
  });
  it('converts only viewport dimensions, retaining accessibility media queries',()=>{
    const declarations=[{value:'calc(100dvh - 48px)'},{value:'min(420px, 26vw)'},{value:'rotate(20deg)'}];
    const rules=[{name:'media',params:'(max-height:700px) and (min-width:761px)'},{name:'media',params:'(prefers-reduced-motion: reduce)'},{name:'media',params:'(forced-colors: active)'}];
    desktopDisplayCss().Once({walkDecls:fn=>declarations.forEach(fn),walkAtRules:(_,fn)=>rules.forEach(fn)});
    expect(declarations[0].value).toBe('calc(calc(100 * var(--desktop-vh, 1dvh)) - 48px)');
    expect(declarations[1].value).toContain('--desktop-vw');expect(declarations[2].value).toBe('rotate(20deg)');
    expect(rules[0]).toEqual({name:'container',params:'desktop-viewport (max-height:700px) and (min-width:761px)'});
    expect(rules.slice(1).every(rule=>rule.name==='media')).toBe(true);
  });
});
