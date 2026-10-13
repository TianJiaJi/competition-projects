import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {openDatabase} from '../src/postgres.ts';
const [platformPath,qaPath,reportPath]=process.argv.slice(2);
if(!platformPath||!qaPath||!reportPath)throw Error('Usage: import-sqlite.ts PLATFORM_BACKUP QA_BACKUP REPORT.json');
const digest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const normalize=(v:any):any=>Array.isArray(v)?v.map(normalize):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,normalize(v[k])])):v;
const jsonFields:Record<string,string[]>={documents:['data'],commands:['result'],journal:['payload'],messages:['sources'],scenic_states:['data']};
const keys:Record<string,string[]>={accounts:['id'],auth_sessions:['token'],documents:['collection','id','run_id'],commands:['scope','key'],journal:['seq'],sessions:['id'],conversations:['id'],messages:['id'],attempts:['scope','request_key'],scenic_states:['run_id']};
const report:any={startedAt:new Date().toISOString(),sources:[],tables:{},status:'started'};
const datasets:Record<string,any[]>={};let db:ReturnType<typeof openDatabase>|undefined;
try{
 for(const [path,tables] of [[platformPath,['accounts','auth_sessions','documents','commands','journal']],[qaPath,['sessions','conversations','messages','attempts','scenic_states']]] as const){
  const source=new DatabaseSync(path,{readOnly:true});try{
   if(source.prepare('PRAGMA integrity_check').get()?.integrity_check!=='ok')throw Error('SQLITE_INTEGRITY');
   if(source.prepare('PRAGMA foreign_key_check').all().length)throw Error('SQLITE_FOREIGN_KEY');
   report.sources.push({path,size:statSync(path).size,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')});
   for(const table of tables){const exists=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);const rows=exists?source.prepare(`SELECT ${table==='messages'?'rowid AS seq,*':'*'} FROM ${table}`).all():[];
    datasets[table]=rows.map((row:any)=>{for(const field of jsonFields[table]||[]){if(row[field]!==null){try{row[field]=normalize(JSON.parse(row[field]));}catch{throw Error('INVALID_JSON '+table+'.'+field);}}}if(table==='accounts')for(const f of ['disabled','simulated']){if(![0,1].includes(row[f]))throw Error('INVALID_BOOLEAN '+f);row[f]=Boolean(row[f]);}return normalize(row);});
   }
  }finally{source.close();}
 }
 const ids=new Set(datasets.accounts.map(r=>r.id));if(datasets.auth_sessions.some(r=>!ids.has(r.user_id)))throw Error('ORPHAN_AUTH_SESSION');
 const convIds=new Set(datasets.conversations.map(r=>r.id)),messageIds=new Set(datasets.messages.map(r=>r.id));
 if(datasets.messages.some(r=>!convIds.has(r.conversation_id)||(r.parent_id&&!messageIds.has(r.parent_id))))throw Error('ORPHAN_QA_MESSAGE');
 if(datasets.attempts.some(r=>!convIds.has(r.message_id)&&!messageIds.has(r.message_id)))throw Error('ORPHAN_ATTEMPT');
 const sort=(table:string,rows:any[])=>rows.sort((a,b)=>JSON.stringify(keys[table].map(k=>a[k])).localeCompare(JSON.stringify(keys[table].map(k=>b[k]))));
 const importId=digest(Object.entries(datasets).map(([table,rows])=>[table,digest(sort(table,rows))]));report.importId=importId;
 db=openDatabase();const target=db;
 await target.transaction(async()=>{
  await target.ready();
  const prior=(await target.query('SELECT id FROM data_migrations WHERE id=$1',[importId])).rows[0];if(prior){report.status='already-imported';return;}
  // A different import may not overwrite live business writes.
  for(const table of Object.keys(keys))if(Number((await target.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n))throw Error('TARGET_NOT_EMPTY '+table);
  for(const [table,rows] of Object.entries(datasets)){
   for(const row of rows){const cols=Object.keys(row),values=cols.map(c=>(jsonFields[table]||[]).includes(c)&&row[c]!==null?JSON.stringify(row[c]):row[c]);await target.query(`INSERT INTO ${table}(${cols.map(c=>'"'+c+'"').join(',')}) VALUES(${cols.map((_,i)=>'$'+(i+1)).join(',')})`,values);}
   const copied=(await target.query(`SELECT * FROM ${table}`)).rows.map((r:any)=>{for(const f of jsonFields[table]||[])if(r[f]!==null)r[f]=JSON.parse(r[f]);return normalize(r);});
   const sourceChecksum=digest(sort(table,rows)),targetChecksum=digest(sort(table,copied));
   if(sourceChecksum!==targetChecksum)throw Error('CHECKSUM_MISMATCH '+table);
   report.tables[table]={count:rows.length,sourceChecksum,targetChecksum,verified:true};
  }
  for(const table of ['journal','messages'])await target.query(`SELECT setval(pg_get_serial_sequence('${table}','seq'),COALESCE((SELECT max(seq) FROM ${table}),1),EXISTS(SELECT 1 FROM ${table}))`);
  report.collections=(await target.query('SELECT collection,count(*) AS count FROM documents GROUP BY collection ORDER BY collection')).rows;
  report.selectedRunId=datasets.documents.find(r=>r.collection==='settings'&&r.id==='selected')?.data.id;
  report.checkpointsCleaned=(await target.query('SELECT migrate_checkpoints_v2() AS n')).rows[0].n;
  report.interruptedMessages=(await target.query("UPDATE messages SET status='interrupted',error_code='GENERATION_INTERRUPTED' WHERE status='generating' RETURNING id")).rowCount;
  report.staticSources=['../../../packages/scenic/generated/mobile.json','../src/knowledge.ts'].map(p=>({file:p,sha256:createHash('sha256').update(readFileSync(new URL(p,import.meta.url))).digest('hex')}));
  report.targetVersion=(await target.query('SHOW server_version')).rows[0].server_version;report.status='verified';
  await target.query('INSERT INTO data_migrations(id,report) VALUES($1,$2)',[importId,JSON.stringify(report)]);
 });
}catch(error){report.status='failed';report.error=error instanceof Error?error.message:'IMPORT_FAILED';process.exitCode=1;}
finally{if(db)await db.close();report.finishedAt=new Date().toISOString();writeFileSync(reportPath,JSON.stringify(report,null,2),{mode:0o600});console.log('Import',report.status);}
