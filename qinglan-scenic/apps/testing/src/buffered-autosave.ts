/** Bounded checkpoint interval, not trailing-only debounce: continuous updates
 * still save every interval. Finish/pagehide can synchronously save the latest state. */
export function createBufferedAutosave(save:()=>void, intervalMs=200){
  let timer:ReturnType<typeof setTimeout>|undefined,dirty=false,disposed=false;
  function flush(){
    if(timer!==undefined){clearTimeout(timer);timer=undefined;}
    if(!dirty || disposed)return;
    dirty=false;save();
  }
  function schedule(){
    if(disposed)return;
    dirty=true;
    timer ??= setTimeout(flush,intervalMs);
  }
  function saveNow(){if(disposed)return;dirty=true;flush();}
  function dispose(){flush();disposed=true;}
  return {schedule,flush,saveNow,dispose};
}
