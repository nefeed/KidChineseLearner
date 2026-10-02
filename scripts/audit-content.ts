import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import type {Hanzi,Poem,StrokeData} from '../src/types';
import {ANIMALS,BUILDINGS,REWARDS} from '../src/data/rewards';
const words=JSON.parse(readFileSync('src/data/hanzi.json','utf8')) as Hanzi[];
const poems=JSON.parse(readFileSync('src/data/poems.json','utf8')) as Poem[];
const issues:string[]=[];
if(words.length!==1000)issues.push(`hanzi count ${words.length}`);
if(poems.length!==300)issues.push(`poem count ${poems.length}`);
for(const [kind,items]of [['hanzi',words],['poems',poems]]as const){const ids=items.map(i=>i.id);if(new Set(ids).size!==ids.length)issues.push(`${kind} duplicate IDs`);}
if(new Set(words.map(w=>w.char)).size!==1000)issues.push('duplicate characters');
let strokes=0;
for(const w of words){
  if(!/^[\u4e00-\u9fff]$/u.test(w.char))issues.push(`invalid glyph ${w.id}`);
  if(!w.pinyin||!w.meaning||!w.words.length||!w.sentence||!w.prompt||!w.icon)issues.push(`incomplete character ${w.id}`);
  if(!w.sentence.includes(w.char)||!w.words.every(t=>t.includes(w.char)))issues.push(`word/sentence association ${w.char}`);
  const path=`public/data/strokes/${w.char}.json`;
  if(!existsSync(path)){issues.push(`missing strokes ${w.char}`);continue;}
  const d=JSON.parse(readFileSync(path,'utf8')) as StrokeData;
  if(!d.strokes.length||d.strokes.length!==d.medians.length||d.medians.some(m=>m.length<2||m.some(p=>p.length!==2||p.some(n=>!Number.isFinite(n)))))issues.push(`invalid stroke geometry ${w.char}`);
  strokes+=d.strokes.length;
}
const uniquePoems=new Set();let syllables=0;
for(const p of poems){
  const key=p.lines.join('').replace(/[\p{P}\p{Z}]/gu,'');
  if(uniquePoems.has(key))issues.push(`duplicate poem ${p.title}`);uniquePoems.add(key);
  if(!['唐','宋'].includes(p.dynasty)||!p.lines.length||p.lines.length!==p.pinyin.length||!p.background||!p.backgroundSource||!p.activity||!p.interpretation.length)issues.push(`incomplete poem ${p.id}`);
  if(p.reviewStatus==='edited'&&/构成本课|故事解释依据原文/.test(p.background))issues.push(`edited background still uses generic template ${p.id}`);
  if(p.question.options.length<2||p.question.answer<0||p.question.answer>=p.question.options.length||!p.question.explanation)issues.push(`invalid poem quiz ${p.id}`);
  p.lines.forEach((line,i)=>{const chars=[...line].filter(c=>/\p{Script=Han}/u.test(c));if(chars.length!==p.pinyin[i]?.length)issues.push(`pinyin alignment ${p.id}:${i}`);syllables+=chars.length;});
}
if(new Set(REWARDS.map(r=>r.id)).size!==REWARDS.length)issues.push('duplicate reward receipts');
for(const r of REWARDS)if(!(r.kind==='animal'?ANIMALS:BUILDINGS).some(s=>s.id===r.species))issues.push(`missing reward art ${r.id}`);
if(!REWARDS.some(r=>r.source==='hanzi'&&r.threshold===1000)||!REWARDS.some(r=>r.source==='poems'&&r.threshold===300))issues.push('incomplete reward coverage');
const manifestPath='public/audio/manifest.json';
const audio=existsSync(manifestPath)?JSON.parse(readFileSync(manifestPath,'utf8')):{files:{}};
const missingAudio=Object.values(audio.files).filter(path=>!existsSync('public'+path)).length;
if(missingAudio)issues.push(`manifest missing ${missingAudio} audio files`);
console.log(JSON.stringify({characters:words.length,strokePaths:strokes,poems:poems.length,tang:poems.filter(p=>p.dynasty==='唐').length,song:poems.filter(p=>p.dynasty==='宋').length,poetryEdited:poems.filter(p=>p.reviewStatus==='edited').length,poetryDraft:poems.filter(p=>p.reviewStatus==='draft').length,poemSyllables:syllables,animals:ANIMALS.length,buildings:BUILDINGS.length,rewards:REWARDS.length,localAudioClips:Object.keys(audio.files).length,missingAudio,contentSHA256:createHash('sha256').update(JSON.stringify([words,poems])).digest('hex'),issues},null,2));
if(issues.length)process.exitCode=1;
// Structural coverage proves availability only; editorial and auditory accuracy need separate audits.
