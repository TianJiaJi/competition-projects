import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {openDatabase} from '../../apps/server/src/postgres.ts';
import {openStore,passwordHash} from '../../apps/server/src/platform/store.ts';
import {createPlatform} from '../../apps/server/src/platform/service.ts';
export async function testStore(){
 const url=new URL(process.env.TEST_DATABASE_URL||'postgresql://aiden@127.0.0.1/scenic_test');
 const schema='test_'+randomUUID().replaceAll('-','');const admin=openDatabase(url.href);await admin.query(`CREATE SCHEMA ${schema}`);
 url.searchParams.set('options','-c search_path='+schema);const db=openDatabase(url.href);
 await db.query('CREATE TABLE schema_migrations(version integer PRIMARY KEY)');await db.query('INSERT INTO schema_migrations VALUES(1),(2)');
 for(const f of ['001_initial.sql','002_checkpoint_cleanup.sql'])await db.query(readFileSync(new URL('../../apps/server/migrations/'+f,import.meta.url),'utf8'));
 const store=openStore(db);await store.transaction(async()=>{const names=['陈明远','林静怡','周志强','刘佳宁','赵文博','王雨晴','李浩然','张悦','吴思远','郑欣'];let i=0;
 for(const [role,count] of [['admin',2],['staff',3],['visitor',5]] as const)for(let n=1;n<=count;n++){const id=role+String(n).padStart(2,'0');await db.query('INSERT INTO accounts(id,username,name,role,password) VALUES($1,$1,$2,$3,$4)',[id,names[i++],role,passwordHash('123456')]);}
 const run=await createPlatform(store).createRun('replay','weekday');await store.put('settings','selected',{id:run.id});});
 return {store,url:url.href,close:async()=>{await db.close();await admin.query(`DROP SCHEMA ${schema} CASCADE`);await admin.close();}};
}
