import {displayMetrics,unscaleRect} from './geometry';
export {displayMetrics,unscaleRect,DESKTOP_DESIGN_WIDTH} from './geometry';
export const DISPLAY_CHANGE='scenic-display-change';
export function displayScale(){return Number(document.documentElement.dataset.desktopScale)||1;}
export function layoutViewport(){const scale=displayScale();return {width:window.innerWidth/scale,height:window.innerHeight/scale};}
export function layoutRect(element:Element){return unscaleRect(element.getBoundingClientRect(),displayScale());}
export function layoutPoint(x:number,y:number){const scale=displayScale();return {x:x/scale,y:y/scale};}

/** Desktop composition scales as a whole. Mobile entrypoints do not install it. */
export function installDesktopDisplay(){
  const root=document.documentElement;
  const previous=root.getAttribute('style');
  let media:MediaQueryList|undefined;
  function apply(){
    const metrics=displayMetrics(innerWidth,innerHeight);
    root.dataset.desktopScale=String(metrics.scale);
    Object.assign(root.style,{zoom:String(metrics.scale),width:`${metrics.width}px`,height:`${metrics.height}px`,containerType:'size',containerName:'desktop-viewport'});
    root.style.setProperty('--desktop-vw',`${metrics.width/100}px`);
    root.style.setProperty('--desktop-vh',`${metrics.height/100}px`);
    root.style.setProperty('--desktop-vmin',`${Math.min(metrics.width,metrics.height)/100}px`);
    root.style.setProperty('--desktop-vmax',`${Math.max(metrics.width,metrics.height)/100}px`);
    window.dispatchEvent(new Event(DISPLAY_CHANGE));
  }
  // DPR changes only invalidate canvas density; they never change the layout scale.
  function trackDpr(){media?.removeEventListener('change',trackDpr);apply();media=matchMedia(`(resolution: ${devicePixelRatio}dppx)`);media.addEventListener('change',trackDpr);}
  trackDpr();window.addEventListener('resize',apply);
  return ()=>{window.removeEventListener('resize',apply);media?.removeEventListener('change',trackDpr);delete root.dataset.desktopScale;if(previous===null)root.removeAttribute('style');else root.setAttribute('style',previous);};
}
