import {it,expect} from 'vitest';
import {testStore} from '../helpers/postgres';
it('排队写事务不占满连接池，读取继续可用且失败后队列可恢复',async()=>{
 const fixture=await testStore();const db=fixture.store.db;
 try{
  const writes=Array.from({length:20},()=>db.transaction(async()=>{await db.query('SELECT pg_sleep(0.3)');}));
  await new Promise(resolve=>setTimeout(resolve,100));
  const start=Date.now();await db.readTransaction(()=>db.query('SELECT 1'));expect(Date.now()-start).toBeLessThan(2000);
  await Promise.all(writes);
  await expect(db.transaction(async()=>{throw Error('intentional rollback');})).rejects.toThrow('intentional rollback');
  await expect(db.transaction(async()=>(await db.query('SELECT 1 AS value')).rows[0].value)).resolves.toBe(1);
 }finally{await fixture.close();}
});
