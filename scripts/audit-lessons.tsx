/** Full-course React SSR contract audit; does not execute browser events or effects.
 * Run: npx tsx scripts/audit-lessons.tsx
 * The sole component adaptation seeds StrokePractice's private cache from real local
 * assets so its drawing controls can be inspected without a browser/fetch/effect.
 */
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import * as nodeModule from 'node:module';
import ts from 'typescript';
import {createProfile,initialProgress,validateProgress,validateSave} from '../src/store';
import type {Hanzi,Poem,Profile,LessonProgress,StrokeData} from '../src/types';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const startedAt=new Date().toISOString();
const now=Date.now();
const sha=(text:string|Buffer)=>createHash('sha256').update(text).digest('hex');
const read=(relative:string)=>readFileSync(path.join(root,relative),'utf8');
const words=JSON.parse(read('src/data/hanzi.json')) as Hanzi[];
const poems=JSON.parse(read('src/data/poems.json')) as Poem[];
const sourcePaths=['src/data/hanzi.json','src/data/poems.json','src/data/today-connections.json','src/store.ts','src/types.ts','src/pronunciation.ts',...readdirSync(path.join(root,'src/components')).filter(p=>p.endsWith('.tsx')).map(p=>'src/components/'+p)];
const inputHashes=Object.fromEntries(sourcePaths.map(p=>[p,sha(read(p))]));
const assetHashes:Record<string,string>={};
const strokeEntries:[string,StrokeData][]=words.map(word=>{
  const text=read(`public/data/strokes/${word.char}.json`),data=JSON.parse(text) as StrokeData;
  if(!data.strokes?.length||data.strokes.length!==data.medians?.length)throw new Error(`Invalid stroke fixture: ${word.id}`);
  assetHashes[word.char]=sha(text);
  return [word.char,data];
});
const strokes=new Map(strokeEntries);
const fixtureKey='__lessonRenderAuditStrokeFixtures';
(globalThis as unknown as Record<string,unknown>)[fixtureKey]=strokeEntries;
let strokeCacheAdaptations=0;
const ignoredStyles=new Set<string>();
const registerHooks=(nodeModule as unknown as {registerHooks:(hooks:{load:(url:string,context:unknown,nextLoad:(url:string,context:unknown)=>unknown)=>unknown})=>unknown}).registerHooks;
if(typeof registerHooks!=='function')throw new Error('This audit requires Node.js registerHooks (Node 22.15+).');
registerHooks({load(url,context,nextLoad){
  if(url.endsWith('.css')){ignoredStyles.add(path.relative(root,fileURLToPath(url)));return {format:'module',source:'export {};',shortCircuit:true};}
  if(url.endsWith('/src/components/StrokePractice.tsx')){
    const original=read('src/components/StrokePractice.tsx');
    const marker='const cache = new Map<string, StrokeData>();';
    if(!original.includes(marker))throw new Error('StrokePractice cache signature changed; audit adapter requires review.');
    const adapted=original.replace(marker,`const cache = new Map<string, StrokeData>((globalThis as any).${fixtureKey});`);
    strokeCacheAdaptations++;
    return {format:'module',source:ts.transpileModule(adapted,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,shortCircuit:true};
  }
  return nextLoad(url,context);
}});
const {default:HanziLesson}=await import('../src/components/HanziLesson');
const {default:PoemLesson}=await import('../src/components/PoemLesson');
delete (globalThis as unknown as Record<string,unknown>)[fixtureKey];

const decode=(s:string)=>s.replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&quot;/g,'"').replace(/&#x27;|&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&');
const plain=(s:string)=>decode(s.replace(/<rt\b[^>]*>[\s\S]*?<\/rt>/g,'').replace(/<svg\b[\s\S]*?<\/svg>/g,'').replace(/<[^>]*>/g,'')).replace(/\s+/g,' ').trim();
type Button={label:string;disabled:boolean;className:string};
const buttons=(html:string):Button[]=>[...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(m=>({label:decode(m[1].match(/aria-label="([^"]*)"/)?.[1]??plain(m[2])),disabled:/\bdisabled(?:=|\s|$)/.test(m[1]),className:m[1].match(/class="([^"]*)"/)?.[1]??''}));
const includesText=(text:string,expected:string)=>text.includes(expected.replace(/\s+/g,' ').trim());
type Variant={name:string;patch:Partial<LessonProgress>;expected?:string};
type CaseResult={stage:number;variant:string;checkpoint:Partial<LessonProgress>;passed:boolean;checks:number;htmlSha256?:string;renderedBytes?:number;operationLabels:string[];errors:string[]};
type LessonResult={id:string;name:string;passed:boolean;coveredStages:number[];cases:CaseResult[]};
const hanziResults:LessonResult[]=[],poemResults:LessonResult[]=[];
const warnings=new Map<string,{message:string;count:number;firstCase:string}>();
const originalRandom=Math.random,originalError=console.error,originalWarn=console.warn;
let activeCase='',renders=0,checksTotal=0,callbackCalls=0;
const noop=()=>{callbackCalls++;};
const asyncNoop=async()=>{callbackCalls++;};
const onUpdate=(_updater:(profile:Profile)=>Profile)=>{callbackCalls++;};
const capture=(...args:unknown[])=>{const message=args.map(a=>String(a)).join(' ');const old=warnings.get(message);if(old)old.count++;else warnings.set(message,{message,count:1,firstCase:activeCase});};
console.error=capture;console.warn=capture;
const randomSeed=(key:string)=>{let seed=parseInt(sha(key).slice(0,8),16)>>>0;Math.random=()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};};
function fixture(kind:'hanzi'|'poems',id:string,stage:number,patch:Partial<LessonProgress>):Profile{
  const progress={...initialProgress(now),stage,...patch};
  if(stage===6)Object.assign(progress,{completed:true,attempts:1,firstCompletedAt:now,reviewAt:now+86_400_000});
  if(!validateProgress(progress))throw new Error(`Invalid progress fixture: ${kind}:${id}:${stage}`);
  const profile={...createProfile('SSR验收','🐰',now),id:'ssr-lesson-audit',[kind]:{[id]:progress}};
  if(!validateSave({version:1,activeId:profile.id,profiles:[profile],savedAt:now}))throw new Error(`Profile fixture violates the actual save schema: ${kind}:${id}:${stage}`);
  return profile;
}
function renderCase(kind:'hanzi'|'poems',item:Hanzi|Poem,stage:number,variant:Variant):CaseResult{
  const errors:string[]=[];let checks=0,html='';
  const assert=(condition:unknown,message:string)=>{checks++;if(!condition)errors.push(message);};
  const name=kind==='hanzi'?(item as Hanzi).char:(item as Poem).title;
  activeCase=`${kind}:${item.id}:stage${stage}:${variant.name}`;randomSeed(activeCase);
  try{
    const profile=fixture(kind,item.id,stage,variant.patch);
    html=kind==='hanzi'?renderToStaticMarkup(React.createElement(HanziLesson,{word:item as Hanzi,words,profile,onUpdate,onSpeak:noop,onClose:noop,onNext:noop,onZoo:noop})):renderToStaticMarkup(React.createElement(PoemLesson,{poem:item as Poem,profile,onUpdate,onSpeak:asyncNoop,onStop:noop,onClose:noop,onZoo:noop}));
    renders++;
    const main=html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1]??'';
    const header=html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1]??'';
    const text=plain(main),controls=buttons(main),allButtons=buttons(html);
    const has=(label:string,enabled=true)=>controls.some(b=>b.label.includes(label)&&(!enabled||!b.disabled));
    assert(html.includes('role="dialog"')&&html.includes('aria-modal="true"'),'Accessible lesson dialog is absent');
    assert(includesText(plain(header),kind==='hanzi'?`汉字小冒险 · ${name}`:name),'Header does not identify the exact course');
    assert(html.includes(`aria-label="${name}${kind==='hanzi'?'字学习':'诗词学习'}"`),'Dialog course name is incorrect');
    assert(html.includes(`${kind==='hanzi'?'lesson':'poem'}-stage-${stage}`)&&main.length>0,'Expected stage/main container is absent');
    assert(allButtons.some(b=>b.label.includes(kind==='hanzi'?'关闭学习，保存进度':'关闭诗词学习，保存进度')&&!b.disabled),'Save-and-close entry is absent');
    assert(includesText(plain(html),kind==='hanzi'?'每一步都会保存':'跟着节奏读'),'Lesson footer is absent');
    if(kind==='hanzi'){
      const word=item as Hanzi,data=strokes.get(word.char)!;
      if(stage===0){assert(main.includes('semantic-play'),'Actual WordPlay subtree is absent');assert(controls.some(b=>!b.disabled)||/<input\b/.test(main),'No game interaction entry is rendered');}
      if(stage===1){assert(includesText(text,word.meaning)&&includesText(text,word.sentence),'Meaning/sentence is missing');assert(includesText(text,word.pinyin),'Pinyin is missing');assert(has(`听${word.char}字读音`)&&has('听这句话'),'Word/sentence listen entries are missing');assert(word.words.every(w=>has(w)),'Some example-word listen buttons are missing');assert(includesText(text,'拼音小老师')&&includesText(text,'韵母')&&includesText(text,'声调'),'Pronunciation teaching entries are missing');assert(has('先听听这个字'),'Initial recognition gate is missing');}
      if(stage===2||stage===5){const round=variant.patch.quizRound??0;assert(main.includes('class="quiz"'),'Quiz subtree is absent');assert(includesText(text,`小挑战 ${round+1} / 2`),'Quiz checkpoint round was not resumed');assert(controls.filter(b=>b.className.includes('answer-card')).length>=2,'Quiz has fewer than two answer entries');assert(has(round===0?'点我听一听':'听一听题目'),'Question audio entry is absent');assert(has(stage===2?(round===0?word.char:word.meaning):(round===0?word.char:word.words[0])),'Correct data-bound answer is not an entry');}
      if(stage===3){const index=variant.patch.strokeIndex??0;assert(main.includes('class="stroke-practice"'),'Real StrokePractice subtree is absent');assert(has('看笔顺')&&has('重新描写'),'Stroke demonstration/restart entries are absent');assert(main.includes(`aria-label="${word.char}字描写区`),'Named drawing SVG is absent');assert((main.match(/<clipPath\b/g)||[]).length===data.strokes.length,'Drawing paths do not cover the complete real asset');assert(includesText(text,index>=data.strokes.length?'描写完成':`第 ${index+1} / ${data.strokes.length} 笔`),'Stroke checkpoint/index was not resumed');}
      if(stage===4){assert(has('听跟读示范')&&has('词语')&&has('一句话'),'Speaking demonstration/switch entries are absent');assert(has(variant.expected!),'Speaking checkpoint gate is incorrect');assert(includesText(text,'不进行自动语音评分'),'Parent-confirmation boundary text is absent');}
      if(stage===6){assert(includesText(text,`${word.char} · ${word.pinyin}`),'Completion identity is absent');assert(has('看看我的动物园')&&has('下一个字'),'Completion operations are absent');assert(includesText(text,(variant.patch.reviewCount??0)>0?'复习完成':'首次过关奖励 3 颗星星'),'First/review completion label is incorrect');}
    }else{
      const poem=item as Poem;
      if(stage===0){const lineButtons=controls.filter(b=>b.className.split(' ').includes('poem-line'));assert(lineButtons.length===poem.lines.length,'Not all poem-line audio buttons are rendered');assert(poem.lines.every((line,i)=>includesText(lineButtons[i]?.label??'',line)),'Poem line order/content is not complete');assert((main.match(/<rt\b/g)||[]).length===poem.pinyin.reduce((n,line)=>n+line.length,0),'Pinyin ruby coverage differs from current poem data');assert(has('收起拼音')&&has(variant.expected!),'Listen checkpoint/pinyin operations are absent');assert(has((variant.patch.listenedLines?.length??0)>=poem.lines.length?'去听诗里的故事':'先听完这首诗'),'Listening completion gate is incorrect');}
      if(stage===1){assert(includesText(text,poem.author)&&includesText(text,poem.background),'Author/background data is absent');assert(poem.interpretation.every(t=>includesText(text,t)),'Some interpretation data is absent');assert(has('诗人是谁')&&has('那时发生了什么')&&has('诗里看见了什么'),'Story audio card entries are missing');assert(decode(main).includes(`href="${poem.backgroundSource}"`),'Actual background-source link is missing');assert(has('走进这幅诗的画'),'Story continuation entry is missing');}
      if(stage===2||stage===5){const round=variant.patch.quizRound??0,total=stage===2?1:2;assert(main.includes('class="quiz"'),'Quiz subtree is absent');assert(includesText(text,`小挑战 ${round+1} / ${total}`),'Quiz checkpoint round was not resumed');assert(controls.filter(b=>b.className.includes('answer-card')).length>=2,'Quiz has fewer than two answer entries');assert(has('听一听题目'),'Quiz question audio entry is absent');assert(has(stage===5&&round===1?poem.author:poem.question.options[poem.question.answer]),'Correct data-bound answer is not an entry');}
      if(stage===3){assert(includesText(text,poem.activity),'Current poem activity is absent');assert(has('听生活小任务')&&has('我和家长商量好了'),'Activity audio/planning entries are absent');assert(controls.some(b=>b.label.includes('我们尝试过，分享了发现')),'Family-share entry is absent');assert(Boolean(variant.patch.activityDone)===has('去走记忆小桥'),'Persisted activity completion gate is incorrect');}
      if(stage===4){const state=variant.patch.recitation!;
        if(state.phase===0){const chunk=poem.lines.slice(state.chunk*4,state.chunk*4+4);assert(includesText(text,`第 ${state.chunk+1} 组 / ${Math.ceil(poem.lines.length/4)} 组`),'Ordering chunk checkpoint is incorrect');assert(chunk.every(line=>has(line,false)),'Ordering chunk omits a poem-line entry');assert(has('重新排队'),'Ordering reset entry is absent');assert(controls.filter(b=>b.className.includes('line-option')&&b.disabled).length===state.selected.length,'Saved ordered-prefix selection was not resumed');if(state.selected.length===chunk.length)assert(has(state.chunk===Math.ceil(poem.lines.length/4)-1?'去填一填':'下一组诗句'),'Completed ordering-chunk continuation is absent');}
        if(state.phase===1){assert(includesText(text,'记忆小桥 · 填一填')&&text.includes('□'),'Cloze phase is absent');assert(includesText(text,`小挑战 ${state.clozeRound+1} / ${poem.lines.length}`),'Cloze line checkpoint is incorrect');assert(has('点我听一听'),'Cloze example-line audio entry is absent');assert(controls.filter(b=>b.className.includes('answer-card')).length>=2,'Cloze choice entries are insufficient');}
        if(state.phase===2){assert(has('看看提示')&&has('再听一次')&&has('家长确认：孩子已尝试完整背诵'),'Hint/replay/parent recitation entries are absent');assert(includesText(text,'当前没有自动评测背诵'),'Manual recitation boundary text is absent');assert((main.match(/●  ●  ●  ●  ●/g)||[]).length===poem.lines.length,'Hidden recall display does not cover every poem line');}
      }
      if(stage===6){assert(includesText(text,`《${poem.title}》的小旅程完成啦`)&&includesText(text,poem.lines[0]),'Completion poem identity is absent');assert(has('回诗词花园')&&has('去动物园'),'Completion operations are absent');assert(includesText(text,(variant.patch.reviewCount??0)>0?'复习完成':'首次过关奖励 8 颗星星'),'First/review completion label is incorrect');}
    }
    checksTotal+=checks;
    return {stage,variant:variant.name,checkpoint:variant.patch,passed:errors.length===0,checks,htmlSha256:sha(html),renderedBytes:Buffer.byteLength(html),operationLabels:controls.filter(b=>!b.disabled).map(b=>b.label),errors};
  }catch(error){checksTotal+=checks;return {stage,variant:variant.name,checkpoint:variant.patch,passed:false,checks,operationLabels:[],errors:[...errors,error instanceof Error?`${error.name}: ${error.message}`:String(error)]};}
}
function characterVariants(word:Hanzi,stage:number):Variant[]{
  if(stage===2||stage===5)return [0,1].map(quizRound=>({name:`quiz-round-${quizRound}`,patch:{quizRound}}));
  if(stage===3){const count=strokes.get(word.char)!.strokes.length;return [...new Set([0,Math.floor(count/2),count-1,count])].map(strokeIndex=>({name:`stroke-index-${strokeIndex}`,patch:{strokeIndex}}));}
  if(stage===4)return [{name:'before-listening',patch:{heardWord:false,heardSentence:false},expected:'先听词语'},{name:'word-heard',patch:{heardWord:true,heardSentence:false},expected:'再听一句话'},{name:'word-and-sentence-heard',patch:{heardWord:true,heardSentence:true},expected:'家长确认：孩子已跟读词语和句子'}];
  if(stage===6)return [{name:'first-completion',patch:{reviewCount:0}},{name:'review-completion',patch:{reviewCount:1}}];
  return [{name:'entry',patch:{}}];
}
function poetryVariants(poem:Poem,stage:number):Variant[]{
  const all=poem.lines.map((_,i)=>i);
  if(stage===0)return [{name:'not-listened',patch:{listenedLines:[]},expected:'慢慢听整首'},{name:'partially-listened',patch:{listenedLines:all.slice(0,-1)},expected:all.length>1?'继续听剩下的诗句':'慢慢听整首'},{name:'fully-listened',patch:{listenedLines:all},expected:'慢慢听整首'}];
  if(stage===3)return [{name:'activity-not-completed',patch:{activityDone:false}},{name:'activity-completed',patch:{activityDone:true}}];
  if(stage===4){const variants:Variant[]=[];
    for(let chunk=0;chunk<Math.ceil(poem.lines.length/4);chunk++)for(const completed of [false,true]){const count=poem.lines.slice(chunk*4,chunk*4+4).length;variants.push({name:`ordering-chunk-${chunk}-${completed?'complete':'entry'}`,patch:{recitation:{phase:0,chunk,selected:completed?Array.from({length:count},(_,i)=>i):[],clozeRound:0}}});}
    for(let clozeRound=0;clozeRound<poem.lines.length;clozeRound++)variants.push({name:`cloze-line-${clozeRound}`,patch:{recitation:{phase:1,chunk:0,selected:[],clozeRound}}});
    variants.push({name:'recall-parent-confirmation',patch:{recitation:{phase:2,chunk:0,selected:[],clozeRound:0}}});return variants;
  }
  if(stage===5)return [0,1].map(quizRound=>({name:`quiz-round-${quizRound}`,patch:{quizRound}}));
  if(stage===6)return [{name:'first-completion',patch:{reviewCount:0}},{name:'review-completion',patch:{reviewCount:1}}];
  return [{name:'entry',patch:{quizRound:0}}];
}
try{
  for(const [kind,items] of [['hanzi',words],['poems',poems]] as const){
    for(const [index,item] of items.entries()){
      const cases:CaseResult[]=[];
      for(let stage=0;stage<=6;stage++)for(const variant of kind==='hanzi'?characterVariants(item as Hanzi,stage):poetryVariants(item as Poem,stage))cases.push(renderCase(kind,item,stage,variant));
      const result={id:item.id,name:kind==='hanzi'?(item as Hanzi).char:(item as Poem).title,passed:cases.every(c=>c.passed),coveredStages:[...new Set(cases.map(c=>c.stage))],cases};
      (kind==='hanzi'?hanziResults:poemResults).push(result);
      if((index+1)%100===0)console.log(`${kind}: ${index+1}/${items.length} complete (${renders} SSR renders)`);
    }
  }
}finally{Math.random=originalRandom;console.error=originalError;console.warn=originalWarn;}
const changedInputs=sourcePaths.filter(p=>sha(read(p))!==inputHashes[p]);
const failures=[...hanziResults.map(x=>({kind:'hanzi',...x})),...poemResults.map(x=>({kind:'poems',...x}))].flatMap(lesson=>lesson.cases.filter(c=>!c.passed).map(c=>({kind:lesson.kind,id:lesson.id,name:lesson.name,stage:c.stage,variant:c.variant,errors:c.errors})));
const coveragePassed=words.length===1000&&poems.length===300&&hanziResults.length===1000&&poemResults.length===300&&[...hanziResults,...poemResults].every(x=>x.coveredStages.join(',')==='0,1,2,3,4,5,6');
const report={audit:'React server-side static lesson rendering contract',startedAt,finishedAt:new Date().toISOString(),command:'npx tsx scripts/audit-lessons.tsx',environment:{node:process.version,react:React.version,windowAvailable:typeof window!=='undefined',documentAvailable:typeof document!=='undefined'},scope:{hanziCourses:1000,poemCourses:300,stages:[0,1,2,3,4,5,6],baseCourseStageCombinations:9100,actualSsrRenders:renders,assertions:checksTotal,checkpointSchemasValidated:true,allPoemOrderingChunksAndClozeLinesCovered:true},adapters:{cssImportsIgnored:[...ignoredStyles],strokeCacheSeededWithRealLocalAssets:strokeCacheAdaptations===1,strokeAssetCount:strokeEntries.length,strokeAssetAggregateSha256:sha(JSON.stringify(assetHashes)),componentSourceFilesModified:false,description:'In-memory loader replaces only StrokePractice cache initialization with real local fixtures. No component JSX, interaction logic, hooks, store code, or course content is replaced. CSS imports are ignored because this audit does not inspect layout.'},inputs:inputHashes,inputsStableDuringAudit:changedInputs.length===0,changedInputs,coveragePassed,unexpectedCallbackCalls:callbackCalls,consoleWarnings:[...warnings.values()],failures,passed:coveragePassed&&failures.length===0&&changedInputs.length===0&&warnings.size===0&&callbackCalls===0&&strokeCacheAdaptations===1,proves:['Every current course has been rendered with the actual HanziLesson or PoemLesson component at each stage 0–6.','Saved checkpoints satisfy the current store schema and expose the expected static content and operation entries.','Every poem ordering chunk and cloze-line checkpoint renders, and real character geometry appears in the SSR stroke subtree.'],doesNotProve:['Browser hydration, effect execution, audio playback or pronunciation, pointer/drag/tracing interactions, click handlers, successful stage transitions, or persistence under real interaction.','Timers, pause/replay behavior, CSS/mobile layout, offline caching, human recitation, educational suitability, or official normative stroke-by-stroke certification.','This is not a claim that all 1300 courses have been played by a person. Existing representative browser/UI evidence is separate.'],hanzi:hanziResults,poems:poemResults};
mkdirSync(path.join(root,'scripts/verification'),{recursive:true});
writeFileSync(path.join(root,'scripts/verification/lesson-render-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,hanzi:hanziResults.length,poems:poemResults.length,baseCourseStageCombinations:9100,ssrRenders:renders,assertions:checksTotal,failures:failures.length,warnings:warnings.size,changedInputs,unexpectedCallbackCalls:callbackCalls,report:'scripts/verification/lesson-render-audit.json'},null,2));
if(!report.passed){console.error(JSON.stringify(failures.slice(0,20),null,2));process.exitCode=1;}
