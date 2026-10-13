import {spawn} from 'node:child_process';
import {createConnection} from 'node:net';
const services=[['server',8787],['visitor',5173],['ops',5175],['mobile',5176],['gate',5177],['demo',5178],['admin',5179]];
const running=port=>new Promise(resolve=>{const c=createConnection({host:'127.0.0.1',port});c.once('connect',()=>{c.destroy();resolve(true);});c.once('error',()=>resolve(false));});
const children=[];
for(const [app,port] of services){if(await running(port)){console.log(app+' already listening: http://localhost:'+port);continue;}const child=spawn('pnpm',['--filter','@scenic/'+app,'dev'],{stdio:'inherit',env:process.env});children.push(child);child.on('exit',code=>{if(code)console.error(app+' exited: '+code);});}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{for(const child of children)child.kill(signal);});
