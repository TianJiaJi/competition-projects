import {it,expect} from 'vitest';
import {createServer} from 'node:http';
import {testStore} from '../helpers/postgres';
import {createPlatform} from '../../apps/server/src/platform/service';
import {platformHttp} from '../../apps/server/src/platform/http';
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
