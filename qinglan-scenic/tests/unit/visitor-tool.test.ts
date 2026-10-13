import {it,expect,vi} from 'vitest';
import {registerViewTool} from '../../apps/visitor/src/webmcp';
import {points} from '@scenic/scenic';
it('routes browser tool requests through the same mutually exclusive modes',async()=>{
  let execute:(input:unknown)=>Promise<unknown>=async()=>{};
  let signal:AbortSignal|undefined;
  vi.stubGlobal('document',{modelContext:{registerTool:(tool:{execute:typeof execute},options:{signal:AbortSignal})=>{execute=tool.execute;signal=options.signal;}}});
  try{
    const select=vi.fn(),view=vi.fn();
    const stop=registerViewTool(select,view,points.map(p=>p.id),async()=>{},'terminal-entry');
    await expect(execute({heat:true})).resolves.toMatchObject({viewMode:'crowd',panel:null});
    expect(view).toHaveBeenLastCalledWith('crowd');expect(select).not.toHaveBeenCalled();
    await expect(execute({pointId:'t1'})).resolves.toMatchObject({viewMode:'toilet',pointId:'t1'});
    expect(view).toHaveBeenLastCalledWith('toilet');expect(select).toHaveBeenLastCalledWith('t1');
    await expect(execute({viewMode:'crowd',pointId:'terminal-entry'})).resolves.toMatchObject({viewMode:'crowd'});
    await expect(execute({viewMode:'crowd',pointId:'summit'})).rejects.toThrow('该点位不属于所选视图');
    await expect(execute({viewMode:'safety',heat:false})).rejects.toThrow();
    await expect(execute({pointId:'missing'})).rejects.toThrow();
    stop();expect(signal?.aborted).toBe(true);
  }finally{vi.unstubAllGlobals();}
});
