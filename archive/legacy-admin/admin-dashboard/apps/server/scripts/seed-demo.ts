import {seedDemoOrders} from '../src/platform/demo-orders.ts';
import {db} from '../src/database.ts';
import {openStore,passwordHash} from '../src/platform/store.ts';
import {createPlatform} from '../src/platform/service.ts';
import {seedContent} from '../src/platform/seed.ts';
if(process.env.NODE_ENV==='production'||process.env.SCENIC_SEED_DEMO!=='1')throw Error('Demo seed requires SCENIC_SEED_DEMO=1 outside production');
try{const store=openStore();await db.ready();await store.transaction(async()=>{
 const names=['陈明远','林静怡','周志强','刘佳宁','赵文博','王雨晴','李浩然','张悦','吴思远','郑欣'];let i=0;
 for(const [role,count] of [['admin',2],['staff',3],['visitor',5]] as const)for(let n=1;n<=count;n++){const id=role+String(n).padStart(2,'0');await db.query('INSERT INTO accounts(id,username,name,role,password) VALUES($1,$1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,names[i++],role,passwordHash('123456')]);}
 await seedContent(store);if(!await store.get('settings','selected')){const run=await createPlatform(store).createRun('replay','weekday');await store.put('settings','selected',{id:run.id});}
const selected=await store.get<{id:string}>('settings','selected');const run=await createPlatform(store).run(selected!.id);await seedDemoOrders(store,run.id,run.simulation.time);
});console.log('Missing demo seed added');}finally{await db.close();}
