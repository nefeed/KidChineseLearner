// Legacy macOS synthesis for personal use only. Never writes published assets.
import {readFileSync,writeFileSync,mkdirSync,existsSync,unlinkSync,mkdtempSync,rmSync,renameSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {plan} from './audio-plan.mjs';
import {inspectAAC} from './audio-integrity.mjs';
import {createHash} from 'node:crypto';
const out=new URL('../.audio-cache/legacy-macos-audio/',import.meta.url);
mkdirSync(out,{recursive:true});
const tempDirectory=mkdtempSync(join(tmpdir(),'ziyou-audio-'));
const manifestPath=new URL('manifest.json',out);
let existingFiles={};
try{existingFiles=JSON.parse(readFileSync(manifestPath,'utf8')).files??{};}catch{}
const manifest={version:1,voice:'Tingting',lang:'zh-CN',rate:140,format:'aac-m4a',generatedAt:new Date().toISOString(),complete:false,total:plan.size,planSHA256:createHash('sha256').update(JSON.stringify([...plan.values()])).digest('hex'),files:existingFiles,pronunciationReview:'System voice synthesis; polyphonic context needs auditory review.'};
function isValid(path){try{inspectAAC(readFileSync(path));return true;}catch{return false;}}
// Restore every already-generated label immediately, including poetry near the
// end of the queue, so resumable generation never hides playable recordings.
for(const entry of plan.values()){
  const path=new URL(entry.file,out);
  if(existsSync(path)&&isValid(path))manifest.files[entry.text]=`/audio/${entry.file}`;
}
writeFileSync(manifestPath,JSON.stringify(manifest));
function run(cmd,args){return new Promise((resolve,reject)=>{const p=spawn(cmd,args,{stdio:['ignore','ignore','pipe']});let error='';p.stderr.on('data',d=>error+=d);p.on('close',code=>code===0?resolve():reject(Error(`${cmd}: ${error}`)));p.on('error',reject);});}
// Several original labels can use the same spoken context. Generate a hash once,
// then map all its labels, avoiding concurrent encoders writing the same file.
const grouped=new Map();
for(const entry of plan.values()){
  if(!grouped.has(entry.file))grouped.set(entry.file,{...entry,texts:[]});
  grouped.get(entry.file).texts.push(entry.text);
}
const tasks=[...grouped.values()];
let cursor=0,finished=0;
const limit=Number(process.env.ZIYOU_AUDIO_LIMIT||tasks.length);
async function worker(){while(cursor<Math.min(tasks.length,limit)){
  const i=cursor++,t=tasks[i],path=new URL(t.file,out),temp={pathname:join(tempDirectory,`${i}-${t.file}.wav`)},encoded=join(tempDirectory,`${i}-${t.file}`);
  if(!existsSync(path)||!isValid(path)){
    for(let attempt=0;attempt<3;attempt++){
      try{
        rmSync(temp.pathname,{force:true});rmSync(encoded,{force:true});
        await run('/usr/bin/say',['-v','Tingting','-r','140','-o',temp.pathname,'--file-format=WAVE','--data-format=LEI16@22050',t.spoken]);
        await run('/usr/bin/afconvert',['-f','m4af','-d','aac','-b','48000',temp.pathname,encoded]);
        inspectAAC(readFileSync(encoded));renameSync(encoded,path);unlinkSync(temp.pathname);break;
      }catch(error){if(attempt===2)throw Error(`Audio ${t.file} failed validation after 3 attempts: ${error.message}`);}
    }
  }
  for(const text of t.texts)manifest.files[text]=`/audio/${t.file}`;
  finished++;
  if(finished%100===0){writeFileSync(new URL('manifest.json',out),JSON.stringify(manifest));process.stdout.write(`Narration ${finished}/${Math.min(tasks.length,limit)}\n`);}
}}
await Promise.all(Array.from({length:Number(process.env.ZIYOU_AUDIO_WORKERS||4)},worker));
manifest.complete=finished===tasks.length;
manifest.uniqueRequiredFiles=tasks.length;
if(manifest.complete)manifest.completedAt=new Date().toISOString();
writeFileSync(new URL('manifest.json',out),JSON.stringify(manifest));
rmSync(tempDirectory,{recursive:true,force:true});
process.stdout.write(`Saved ${finished} personal-use macOS clips to the ignored .audio-cache/legacy-macos-audio directory.\n`);
