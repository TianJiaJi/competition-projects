import { computed, onBeforeUnmount, ref, watch, type Ref } from 'vue';
export interface ScenicAnchor { x:number;y:number;visible:boolean }
/** Coordinates are local to the containing map, including when embedded in a card. */
export function useScenicPopup(element:Ref<HTMLElement|undefined>,anchor:Readonly<Ref<ScenicAnchor>>,active:Readonly<Ref<boolean>>,insets:{top:number;bottom:number;right:number;left?:number}={top:16,bottom:16,right:16}){
  const bounds=ref({width:0,height:0}),size=ref({width:420,height:440});
  let observer:ResizeObserver|undefined;
  watch(element,el=>{
    observer?.disconnect();
    if(!el)return;
    const parent=el.offsetParent as HTMLElement|null;
    const measure=()=>{
      bounds.value={width:parent?.clientWidth??window.innerWidth,height:parent?.clientHeight??window.innerHeight};
      size.value={width:el.offsetWidth,height:el.offsetHeight};
    };
    observer=new ResizeObserver(measure);observer.observe(el);if(parent)observer.observe(parent);measure();
  },{flush:'post'});
  onBeforeUnmount(()=>observer?.disconnect());
  const position=computed(()=>{
    const {width:w,height:h}=bounds.value,width=Math.min(size.value.width,Math.max(0,w-32)),height=size.value.height;
    const p=anchor.value,gap=48,minY=h<700?Math.min(insets.top,90):insets.top,maxY=Math.max(minY,h-insets.bottom-height);
    const minX=insets.left??16;
    const right=p.x+gap,left=p.x-gap-width;
    const x=right+width<w-insets.right?right:left>=minX?left:Math.max(minX,Math.min(w-width-insets.right,p.x-width/2));
    let y=Math.max(minY,Math.min(maxY,p.y-height*.4));
    if(x<p.x+35&&x+width>p.x-35)y=p.y+gap+height<h-insets.bottom?p.y+gap:Math.max(minY,p.y-gap-height);
    return {x,y,width,height};
  });
  const popupStyle=computed(()=>active.value?{left:position.value.x+'px',top:position.value.y+'px'}:{});
  const leader=computed(()=>{
    const p=anchor.value,b=position.value;
    return {x1:p.x,y1:p.y,x2:Math.max(b.x,Math.min(p.x,b.x+b.width)),y2:Math.max(b.y,Math.min(p.y,b.y+b.height))};
  });
  return {popupStyle,leader};
}
