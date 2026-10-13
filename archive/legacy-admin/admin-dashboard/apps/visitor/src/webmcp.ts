import type { ScenicViewMode } from '@scenic/contracts';
import { pointById, pointInView, viewForPoint, viewLabels } from '@scenic/scenic';
interface ModelTool {
  name:string;title:string;description:string;inputSchema:object;
  annotations:{readOnlyHint:boolean;untrustedContentHint:boolean};
  execute:(input:unknown)=>Promise<unknown>;
}
interface ModelContext {registerTool:(tool:ModelTool,options:{signal:AbortSignal})=>void|Promise<void>}
export function registerViewTool(select:(point:string)=>void,setView:(value:ScenicViewMode)=>void,validIds:string[],afterUpdate:()=>Promise<void>,currentTerminalId?:string):()=>void{
  const context=(document as Document & {modelContext?:ModelContext}).modelContext;
  if(!context?.registerTool)return ()=>{};
  const lifecycle=new AbortController();
  try{
    void Promise.resolve(context.registerTool({
      name:'configure_scenic_view',title:'查看景区位置与视图',
      description:'切换默认、人流、卫生间或安全设施视图，也可选择该视图内的公开点位查看详情。',
      inputSchema:{type:'object',properties:{pointId:{type:'string',enum:validIds},viewMode:{type:'string',enum:Object.keys(viewLabels)},heat:{type:'boolean',description:'兼容旧参数；true 表示人流，false 表示默认。与 viewMode 不能同时传入。'}},additionalProperties:false},
      annotations:{readOnlyHint:false,untrustedContentHint:false},
      async execute(input){
        if(!input||typeof input!=='object')throw new Error('需要有效点位或视图');
        const v=input as Record<string,unknown>;
        if(Object.keys(v).some(k=>!['pointId','viewMode','heat'].includes(k))||
          (v.pointId!==undefined&&(typeof v.pointId!=='string'||!validIds.includes(v.pointId)))||
          (v.viewMode!==undefined&&(typeof v.viewMode!=='string'||!Object.hasOwn(viewLabels,v.viewMode)))||
          (v.heat!==undefined&&typeof v.heat!=='boolean')||(v.heat!==undefined&&v.viewMode!==undefined)||
          Object.keys(v).length===0)throw new Error('点位或视图参数无效');
        const point=typeof v.pointId==='string'?pointById[v.pointId]:undefined;
        const view=(v.viewMode??(typeof v.heat==='boolean'?(v.heat?'crowd':'default'):point?viewForPoint(point):'default')) as ScenicViewMode;
        if(point&&!pointInView(point,view,currentTerminalId))throw new Error('该点位不属于所选视图');
        setView(view);
        if(point)select(point.id);
        await afterUpdate();
        return {pointId:point?.id??null,viewMode:view,heat:view==='crowd',panel:point?'detail':null};
      },
    },{signal:lifecycle.signal})).catch(()=>{});
  }catch{/* Experimental registry must not block the guide. */}
  return ()=>lifecycle.abort();
}
