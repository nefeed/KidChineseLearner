#!/usr/bin/env node
// Serve a built release to Safari/iPad and other devices on the local network.
import http from 'node:http';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {resolve,extname,sep,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {networkInterfaces} from 'node:os';

const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.m4a':'audio/mp4','.mp3':'audio/mpeg','.wav':'audio/wav','.woff2':'font/woff2','.txt':'text/plain; charset=utf-8','.md':'text/plain; charset=utf-8','.pdf':'application/pdf'};
export function parseRange(value,size){
  if(!value)return null;
  const match=/^bytes=(\d*)-(\d*)$/.exec(value);
  if(!match || (!match[1]&&!match[2]) || size===0)return false;
  let start,end;
  if(!match[1]){const suffix=Number(match[2]);if(!Number.isSafeInteger(suffix)||suffix<=0)return false;start=Math.max(0,size-suffix);end=size-1;}
  else{start=Number(match[1]);end=match[2]?Number(match[2]):size-1;}
  if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return false;
  return {start,end:Math.min(end,size-1)};
}
export function createLanServer(directory){
  const root=resolve(directory);
  return http.createServer((req,res)=>{
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    let pathname;
    try{pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400).end();return;}
    // Deny dotfiles, traversal and escape through a malformed URL before reading.
    if(pathname.includes('\0')||pathname.includes('\\')||pathname.split('/').some(part=>part==='..'||part.startsWith('.'))){res.writeHead(403).end();return;}
    let file=resolve(root,'.'+pathname);
    if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
    try{
      if(existsSync(file)&&statSync(file).isDirectory())file=resolve(file,'index.html');
      if(!existsSync(file)&&!extname(pathname))file=resolve(root,'index.html');
      const stat=statSync(file);
      if(!stat.isFile()){res.writeHead(404).end();return;}
      const tag=`"${stat.size.toString(16)}-${Math.trunc(stat.mtimeMs).toString(16)}"`;
      const immutable=/\/assets\//.test(pathname)||/\/audio\/kokoro-[a-f0-9]{20}\.m4a$/.test(pathname);
      const headers={'Content-Type':(basename(file)==='LICENSE'?'text/plain; charset=utf-8':MIME[extname(file)])||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':immutable?'public, max-age=31536000, immutable':'no-cache','X-Content-Type-Options':'nosniff',ETag:tag};
      if(req.headers['if-none-match']===tag&&!req.headers.range){res.writeHead(304,headers).end();return;}
      const range=req.headers['if-range']&&req.headers['if-range']!==tag?null:parseRange(req.headers.range,stat.size);
      if(range===false){res.writeHead(416,{...headers,'Content-Range':`bytes */${stat.size}`}).end();return;}
      const start=range?.start??0,end=range?.end??stat.size-1;
      const length=range?end-start+1:stat.size;
      if(range)headers['Content-Range']=`bytes ${start}-${end}/${stat.size}`;
      res.writeHead(range?206:200,{...headers,'Content-Length':length});
      if(req.method==='HEAD'||stat.size===0){res.end();return;}
      const stream=createReadStream(file,{start,end});
      stream.on('error',()=>res.destroy());res.on('close',()=>stream.destroy());stream.pipe(res);
    }catch{res.writeHead(404,{'Cache-Control':'no-cache'}).end();}
  });
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const args=process.argv.slice(2),portArg=args.indexOf('--port'),dirArg=args.indexOf('--dir');
  const port=Number(portArg<0?5173:args[portArg+1]);
  const directory=resolve(dirArg<0?fileURLToPath(new URL('../dist/',import.meta.url)):args[dirArg+1]);
  if(!Number.isInteger(port)||port<1||port>65535||!existsSync(resolve(directory,'index.html')))throw Error('Build the release first; provide a valid port and dist directory.');
  const server=createLanServer(directory);
  server.on('error',error=>{console.error(error.message);process.exitCode=1;});
  server.listen(port,'0.0.0.0',()=>{
    const addresses=Object.values(networkInterfaces()).flat().filter(a=>a&&!a.internal&&a.family==='IPv4').map(a=>`http://${a.address}:${port}/`);
    console.log(JSON.stringify({service:'KidChineseLearner',directory,local:`http://localhost:${port}/`,lan:addresses}));
  });
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>process.exit(0)));
}
