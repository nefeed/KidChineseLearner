import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,mkdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {AddressInfo} from 'node:net';
// @ts-expect-error The local Node server is an executable JavaScript module.
import {createLanServer,parseRange} from '../scripts/serve-lan.mjs';

test('LAN media ranges cover Safari requests and reject malformed intervals',()=>{
  assert.deepEqual(parseRange('bytes=0-3',10),{start:0,end:3});
  assert.deepEqual(parseRange('bytes=4-',10),{start:4,end:9});
  assert.deepEqual(parseRange('bytes=-3',10),{start:7,end:9});
  assert.deepEqual(parseRange('bytes=0-999',10),{start:0,end:9});
  for(const range of ['bytes=10-','bytes=3-2','bytes=-0','bytes=0-1,4-5','bytes=9007199254740993-','junk'])assert.equal(parseRange(range,10),false);
});
test('LAN release server streams media ranges, handles HEAD and cache validation, and hides dotfiles',async()=>{
  const root=mkdtempSync(join(tmpdir(),'kidchinese-lan-'));
  mkdirSync(join(root,'audio'));writeFileSync(join(root,'index.html'),'<h1>小岛</h1>');
  writeFileSync(join(root,'audio','test.m4a'),Buffer.from('0123456789'));
  writeFileSync(join(root,'audio','qwen3-1234567890abcdef1234.m4a'),Buffer.from('0123456789'));
  writeFileSync(join(root,'.env'),'private');
  const server=createLanServer(root);
  try{
    await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
    const url=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const home=await fetch(url);assert.equal(home.status,200);assert.match(await home.text(),/小岛/);
    const media=await fetch(url+'/audio/test.m4a',{headers:{Range:'bytes=2-5'}});
    assert.equal(media.status,206);assert.equal(media.headers.get('content-range'),'bytes 2-5/10');assert.equal(media.headers.get('content-type'),'audio/mp4');assert.equal(await media.text(),'2345');
    const head=await fetch(url+'/audio/test.m4a',{method:'HEAD'});assert.equal(head.headers.get('content-length'),'10');assert.equal(await head.text(),'');
    const cached=await fetch(url+'/audio/test.m4a',{headers:{'If-None-Match':head.headers.get('etag')!}});assert.equal(cached.status,304);
    const qwen=await fetch(url+'/audio/qwen3-1234567890abcdef1234.m4a',{method:'HEAD'});
    assert.equal(qwen.headers.get('cache-control'),'public, max-age=31536000, immutable');
    assert.equal(head.headers.get('cache-control'),'no-cache');
    const invalid=await fetch(url+'/audio/test.m4a',{headers:{Range:'bytes=20-'}});assert.equal(invalid.status,416);
    assert.equal((await fetch(url+'/%2eenv')).status,403);
    assert.equal((await fetch(url+'/audio/missing.m4a')).status,404);
    assert.equal((await fetch(url,{method:'POST'})).status,405);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(root,{recursive:true,force:true});}
});
