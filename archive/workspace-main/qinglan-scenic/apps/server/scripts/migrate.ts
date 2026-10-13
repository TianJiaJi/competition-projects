import {readdirSync,readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {openDatabase} from '../src/postgres.ts';
const db=openDatabase();
try{await db.transaction(async()=>{
 await db.query('CREATE TABLE IF NOT EXISTS schema_migrations(version integer PRIMARY KEY,name text NOT NULL,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
  const version=Number(file.split('_')[0]),sql=readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
  const old=(await db.query('SELECT checksum FROM schema_migrations WHERE version=$1',[version])).rows[0];
  if(old){if(old.checksum!==checksum)throw Error('MIGRATION_CHECKSUM_MISMATCH '+version);continue;}
  await db.query(sql);await db.query('INSERT INTO schema_migrations(version,name,checksum) VALUES($1,$2,$3)',[version,file,checksum]);console.log('Applied schema',version);
 }
 const role=process.env.PG_APP_ROLE;
 if(role){if(!/^[a-z][a-z0-9_]*$/.test(role))throw Error('INVALID_APP_ROLE');await db.query(`GRANT USAGE ON SCHEMA public TO ${role}; GRANT SELECT ON schema_migrations TO ${role}; GRANT SELECT,INSERT,UPDATE,DELETE ON accounts,auth_sessions,documents,commands,journal,sessions,conversations,messages,attempts,scenic_states TO ${role}; GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role}`);}
});}finally{await db.close();}
