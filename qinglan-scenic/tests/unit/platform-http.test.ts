import {it,expect} from 'vitest';
import {createServer} from 'node:http';
function nextMessage(socket:WebSocket){return new Promise<any>((resolve,reject)=>{
 const timer=setTimeout(()=>{cleanup();reject(Error('WebSocket message timed out'));},5000);
 const cleanup=()=>{clearTimeout(timer);socket.removeEventListener('message',message);socket.removeEventListener('error',error);};
 const message=(event:MessageEvent)=>{cleanup();resolve(JSON.parse(String(event.data)));};
 const error=()=>{cleanup();reject(Error('WebSocket failed'));};
 socket.addEventListener('message',message);socket.addEventListener('error',error);
});}
import {testStore} from '../helpers/postgres';
import {createPlatform} from '../../apps/server/src/platform/service';
import {platformHttp} from '../../apps/server/src/platform/http';
it('切换运行后的广播与心跳使用同一运行ID',async()=>{
 const fixture=await testStore(),platform=createPlatform(fixture.store),http=platformHttp(platform);
 const server=createServer((req,res)=>{void http.route(req,res);});
 const detach=http.attach(server);
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const socket=new WebSocket('ws://127.0.0.1:'+(server.address() as {port:number}).port+'/ws?app=demo');
 try{
  const initial=await nextMessage(socket),old=initial.runId;
  const next=await platform.createRun('replay','weekday');
  await fixture.store.put('settings','selected',{id:next.id});
  const changed=nextMessage(socket);await http.broadcast();
  expect(await changed).toMatchObject({type:'invalidate',runId:next.id});
  const heartbeat=nextMessage(socket);socket.send('ping');
  expect(await heartbeat).toMatchObject({type:'pong',runId:next.id});
  expect(next.id).not.toBe(old);
 }finally{socket.close();await detach();await new Promise<void>(resolve=>server.close(()=>resolve()));await fixture.close();}
});
it('非法请求返回4xx；写事务运行时HTTP快照读取保持可用',async()=>{
 const fixture=await testStore(),platform=createPlatform(fixture.store),http=platformHttp(platform);
 const server=createServer((req,res)=>{void http.route(req,res);});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+(server.address() as {port:number}).port+'/api/v1';
 try{
  for(const [body,status] of [['{',400],['null',400],['[]',400],['x'.repeat(81000),413], [JSON.stringify({username:'a'.repeat(33),password:'123456'}),400], [JSON.stringify({username:'admin01',password:'x'.repeat(129)}),400], [JSON.stringify({username:'admin01\u0000',password:'123456'}),400]] as const){
   const r=await fetch(base+'/auth/login',{method:'POST',body,headers:{'Content-Type':'application/json'}});
   expect(r.status).toBe(status);
  }
  for(const query of ['?page=0', '?page=-1', '?pageSize=0', '?pageSize=-1', '?pageSize=201', '?pageSize=abc']) {
   const r=await fetch(base+'/articles'+query);
   expect(r.status).toBe(400);
  }
  expect((await fetch(base+'/articles?pageSize=200')).status).toBe(200);
  const write=fixture.store.db.transaction(()=>fixture.store.db.query('SELECT pg_sleep(1.5)'));
  await new Promise(resolve=>setTimeout(resolve,100));
  const start=Date.now(),response=await fetch(base+'/public/snapshot'),snapshot=(await response.json()).data;
  expect(response.status).toBe(200);expect(Date.now()-start).toBeLessThan(1200);
  expect(snapshot.points['aed-entry'].availability).toBe('open');
  expect(snapshot.visitorFlow.some((p:any)=>p.trajectory?.length===7)).toBe(true);
  await write;
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await fixture.close();}
});
