/** Preserve the original 1920-wide desktop composition; DPR is not a layout input. */
export const DESKTOP_DESIGN_WIDTH=1920;
export function displayMetrics(width:number,height:number){
  const scale=Math.max(1,width)/DESKTOP_DESIGN_WIDTH;
  return {scale,width:DESKTOP_DESIGN_WIDTH,height:Math.max(1,height)/scale};
}
export function unscaleRect(rect:{left:number;top:number;width:number;height:number},scale:number){
  const left=rect.left/scale,top=rect.top/scale,width=rect.width/scale,height=rect.height/scale;
  return {left,top,width,height,right:left+width,bottom:top+height};
}
