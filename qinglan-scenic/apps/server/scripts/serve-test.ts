import {spawn} from 'node:child_process';
import {testStore} from '../../../tests/helpers/postgres.ts';
const fixture=await testStore();
const child=spawn(process.execPath,['apps/server/src/index.ts'],{stdio:'inherit',env:{...process.env,DATABASE_URL:fixture.url}});
let stopping=false;for(const signal of ['SIGTERM','SIGINT'] as const)process.on(signal,()=>{if(!stopping){stopping=true;child.kill(signal);}});
child.on('exit',async code=>{await fixture.close();process.exit(code||0);});
