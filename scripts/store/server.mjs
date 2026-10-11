import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {browserEnvironment} from '../ci/browser-suite.mjs';

const backendRequire=createRequire(resolve('functions/package.json'));
const sharp=backendRequire('sharp');
const env=browserEnvironment(process.env);
const backend=spawn(process.execPath,['functions/scripts/preview-server.mjs'],{env,stdio:'inherit'});
let command={},state={};
const server=createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://127.0.0.1:4174');
    const body=async()=>{const parts=[];for await(const part of req)parts.push(part);return Buffer.concat(parts);};
    if(req.method==='GET' && url.pathname==='/command') res.end(JSON.stringify(command));
    else if(req.method==='GET' && url.pathname==='/state') res.end(JSON.stringify(state));
    else if(req.method==='POST' && url.pathname==='/command'){
      const next=JSON.parse((await body()).toString());
      if(!/^(iphone|iphone-duo-outer|iphone-duo-inner|ipad)$/.test(next.device) || !/^\d{2}-[a-z-]+$/.test(next.name) || !Number.isInteger(next.width) || !Number.isInteger(next.height)) throw Error('Invalid capture command');
      command=next;state={};res.end('{}');
    } else if(req.method==='POST' && url.pathname==='/failure'){
      state=JSON.parse((await body()).toString());res.end('{}');
    } else if(req.method==='POST' && url.pathname==='/image' && url.searchParams.get('id')===command.id){
      const raw=await body(),metadata=await sharp(raw).metadata();
      if(metadata.width!==command.width || metadata.height!==command.height) throw Error('Capture dimensions do not match viewport');
      const folder=resolve('output/app-store-screenshots',command.device);
      await mkdir(folder,{recursive:true});
      await sharp(raw).removeAlpha().withIccProfile('srgb').png().toFile(resolve(folder,command.name+'.png'));
      state={id:command.id,ok:true,width:metadata.width,height:metadata.height};
      res.end(JSON.stringify(state));
    } else {res.statusCode=404;res.end('{}');}
  } catch(error){res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
}).listen(4174,'127.0.0.1');
const stop=()=>{backend.kill();server.close();process.exit(0);};
process.once('SIGTERM',stop);process.once('SIGINT',stop);
let ready=false;
for(let i=0;i<60;i++){
  try{const response=await fetch('http://127.0.0.1:4173/__deployment');const data=await response.json();if(data.projectId==='demo-pluto-ticketing'){ready=true;break;}}catch{}
  await new Promise(done=>setTimeout(done,500));
}
if(!ready)throw Error('Isolated backend did not start');
const seed=spawn(process.execPath,['scripts/store/seed.cjs'],{env,stdio:'inherit'});
await new Promise((done,reject)=>seed.once('exit',code=>code===0?done():reject(Error('Screenshot seed failed'))));
await writeFile('tmp/store-capture-ready','ready');
console.log('Native screenshot backend is ready.');
