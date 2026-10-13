import {it,expect,vi,afterEach} from 'vitest';
import {createPlatformClient} from '../../packages/client/src/platform';
class Socket {
 static instances:Socket[]=[];
 static OPEN=1;readyState=1;
 onmessage?: (event:{data:string})=>void;onopen?:()=>void;onclose?:()=>void;
 constructor(public url:string){Socket.instances.push(this);}
 send(){} close(){}
 message(value:unknown){this.onmessage?.({data:JSON.stringify(value)});}
}
afterEach(()=>{vi.unstubAllGlobals();vi.useRealTimers();Socket.instances=[];});
it.each(['','?runId=pinned'])('心跳不改变控制目标，重连可刷新且固定链接保留 %s',search=>{
 vi.useFakeTimers();
 vi.stubGlobal('sessionStorage',{getItem:()=>null});
 vi.stubGlobal('location',{search,protocol:'http:',host:'localhost'});
 const dispatchEvent=vi.fn();vi.stubGlobal('window',{dispatchEvent});
 vi.stubGlobal('WebSocket',Socket);
 const client=createPlatformClient('demo'),refresh=vi.fn(),stop=client.subscribe(refresh);
 try{
  const socket=Socket.instances[0];
  socket.message({type:'invalidate',runId:'old'});
  socket.message({type:'invalidate',runId:'new'});
  socket.message({type:'pong',runId:'old'});
  expect(client.runId).toBe(search?'pinned':'new');expect(refresh).toHaveBeenCalledTimes(2);
  expect(dispatchEvent).toHaveBeenCalledTimes(search?0:2);
  socket.onclose?.();vi.advanceTimersByTime(2000);
  const reconnected=Socket.instances[1];expect(reconnected).toBeDefined();
  reconnected.message({type:'invalidate',runId:'latest'});
  expect(client.runId).toBe(search?'pinned':'latest');expect(refresh).toHaveBeenCalledTimes(3);
 }finally{stop();}
});
