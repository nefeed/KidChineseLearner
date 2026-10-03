import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {createProfile,initialProgress,STORAGE_KEY} from '../src/store';
import type {Hanzi,LessonProgress,Poem,SaveData,StrokeData} from '../src/types';
import {Touch,tracePoints,drag} from './helpers/pointer-input';

const origin=process.env.PROFILE_SYNC_TEST_URL??'http://127.0.0.1:5173';
const engine=process.env.PROFILE_SYNC_TEST_ENGINE??'chromium';
if(!['chromium','webkit'].includes(engine))throw Error('PROFILE_SYNC_TEST_ENGINE must be chromium or webkit');
const requested=process.env.PLAYWRIGHT_CHANNEL;
const channel=requested==='chromium'?undefined:requested??(process.platform==='darwin'&&existsSync('/Applications/Google Chrome.app')?'chrome':undefined);
test.use({browserName:engine as 'chromium'|'webkit',channel:engine==='chromium'?channel:undefined,
  viewport:{width:1180,height:720},isMobile:true,hasTouch:true,reducedMotion:'reduce'});

const word=(JSON.parse(readFileSync(new URL('../src/data/hanzi.json',import.meta.url),'utf8')) as Hanzi[]).find(item=>item.id==='hz-001')!;
const poem=(JSON.parse(readFileSync(new URL('../src/data/poems.json',import.meta.url),'utf8')) as Poem[]).find(item=>item.id==='poem-001')!;
const longPoem=(JSON.parse(readFileSync(new URL('../src/data/poems.json',import.meta.url),'utf8')) as Poem[]).find(item=>item.id==='poem-029')!;
const strokes=JSON.parse(readFileSync(new URL(`../public/data/strokes/${word.char}.json`,import.meta.url),'utf8')) as StrokeData;
const catalog=JSON.parse(readFileSync(new URL('../public/audio/manifest.json',import.meta.url),'utf8')).files as Record<string,string>;
const poemStory=`${poem.dynasty}代的${poem.author}，写下了《${poem.title}》。`;
for(const text of [word.sentence,...poem.lines,poemStory,poem.question.prompt]){
  if(!catalog[text]?.endsWith('.m4a')||!existsSync(new URL(`../public${catalog[text]}`,import.meta.url)))throw Error(`Missing native AAC fixture: ${text}`);
}
type MediaEvent={kind:string;id:number;path:string;time:number;trusted:boolean;currentTime:number;duration:number};
type PointerEvidence={type:string;time:number;trusted:boolean;pointerId:number;primary:boolean;captured:boolean};
type SyncMedia={audios:HTMLAudioElement[];paths:string[];events:MediaEvent[];fallback:string[];pointers:PointerEvidence[];storage:{trusted:boolean;activeId:string;url:string;data:SaveData}[]};
declare global{interface Window{__profileSyncMedia:SyncMedia}}

async function boot(context:BrowserContext,page:Page,kind:'hanzi'|'poems',fixture:{poem?:Poem;progress?:Partial<LessonProgress>;sound?:boolean}={}){
  const lessonPoem=fixture.poem??poem;
  const profiles=['同步儿童甲','同步儿童乙'].map(name=>{
    const profile=createProfile(name);profile.settings.sound=fixture.sound??true;profile.settings.music=false;return profile;
  });
  if(kind==='hanzi')profiles[0].hanzi[word.id]={...initialProgress(),stage:4,...fixture.progress};
  else profiles[0].poems[lessonPoem.id]={...initialProgress(),stage:0,...fixture.progress};
  profiles[0].lastActivity={kind,id:kind==='hanzi'?word.id:lessonPoem.id};
  const data:SaveData={version:1,activeId:profiles[0].id,profiles,savedAt:Date.now()};
  await context.addInitScript(({data,key})=>{
    // The only direct storage write is this initial isolated fixture. All later
    // changes come from actual App controls and native browser storage events.
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));
    const evidence:SyncMedia={audios:[],paths:[],events:[],fallback:[],pointers:[],storage:[]};
    window.__profileSyncMedia=evidence;
    const NativeAudio=window.Audio;
    Object.defineProperty(window,'Audio',{configurable:true,value:new Proxy(NativeAudio,{
      construct(target,args){
        const audio=Reflect.construct(target,args) as HTMLAudioElement;
        const id=evidence.audios.length,path=String(args[0]??'');
        evidence.audios.push(audio);evidence.paths.push(path);
        for(const kind of ['play','playing','timeupdate','ended','pause','emptied','error'])audio.addEventListener(kind,event=>{
          evidence.events.push({kind,id,path,time:performance.now(),trusted:event.isTrusted,currentTime:audio.currentTime,duration:audio.duration});
        });
        return audio;
      },
    })});
    if('speechSynthesis'in window){
      const synthesis=window.speechSynthesis,nativeSpeak=synthesis.speak;
      Object.defineProperty(synthesis,'speak',{configurable:true,value(utterance:SpeechSynthesisUtterance){
        evidence.fallback.push(utterance.text);return nativeSpeak.call(synthesis,utterance);
      }});
    }
    window.addEventListener('storage',event=>{
      if(event.key===key&&event.newValue){const data=JSON.parse(event.newValue) as SaveData;evidence.storage.push({trusted:event.isTrusted,activeId:data.activeId,url:event.url,data});}
    });
    for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])document.addEventListener(type,event=>{
      const grid=event.target instanceof Element?event.target.closest('.trace-grid'):null;
      if(!(grid instanceof SVGSVGElement))return;
      const pointer=event as PointerEvent,entry:PointerEvidence={type,time:performance.now(),trusted:event.isTrusted,
        pointerId:pointer.pointerId,primary:pointer.isPrimary,captured:grid.hasPointerCapture(pointer.pointerId)};
      evidence.pointers.push(entry);queueMicrotask(()=>{entry.captured=grid.hasPointerCapture(pointer.pointerId);});
    },{capture:true,passive:true});
  },{data,key:STORAGE_KEY});
  const actor=await context.newPage();
  await page.goto(origin);await actor.goto(origin);
  for(const current of [page,actor])await expect(current.locator('.profile-switch b')).toHaveText(profiles[0].name);
  await visible(page,actor);
  return {actor,profiles};
}
async function visible(...pages:Page[]){
  for(const page of pages)expect(await page.evaluate(()=>document.visibilityState)).toBe('visible');
}
async function saved(page:Page):Promise<SaveData>{return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!),STORAGE_KEY);}
async function snapshot(page:Page){
  return page.evaluate(key=>{const grid=document.querySelector<SVGSVGElement>('.trace-grid');return {visibility:document.visibilityState,child:document.querySelector('.profile-switch b')?.textContent,
    lesson:document.querySelector('.lesson-content')?.className??null,data:JSON.parse(localStorage.getItem(key)!),
    stroke:{toolbar:document.querySelector('.stroke-toolbar>span')?.textContent??null,hint:document.querySelector('.stroke-practice .gentle-hint')?.textContent??null,
      drawing:[...document.querySelectorAll('.trace-grid path[stroke-linejoin="round"]')].map(path=>path.getAttribute('d')),
      guide:document.querySelector('.trace-guide')?.getAttribute('data-guide-state')??null,transform:document.querySelector('.trace-guide')?.getAttribute('transform')??null,
      capture:[...new Set(window.__profileSyncMedia.pointers.map(event=>event.pointerId))].map(id=>({id,captured:grid?.hasPointerCapture(id)??false})),
      pointers:window.__profileSyncMedia.pointers},
    quiz:{round:document.querySelector('.quiz-heading .mini-label')?.textContent??null,prompt:document.querySelector('.quiz-heading h2')?.textContent??null,
      options:[...document.querySelectorAll('.answer-card')].map(card=>({text:card.textContent,correct:card.classList.contains('correct')})),
      feedback:document.querySelector('.quiz-feedback')?.textContent??null,next:document.querySelector('.quiz > .primary-button')?.textContent??null},
    recitation:{group:document.querySelector('.line-order > p')?.textContent??null,selected:[...document.querySelectorAll('.ordered-line')].map(line=>line.textContent),
      question:document.querySelector('.recitation-cloze .quiz-heading h2')?.textContent??null,round:document.querySelector('.recitation-cloze .quiz-heading .mini-label')?.textContent??null,
      hint:document.querySelector('.hidden-poem')?.className??null,lines:[...document.querySelectorAll('.hidden-poem p')].map(line=>line.textContent),
      page:document.querySelector('.recitation-page-controls [role="status"]')?.textContent??null,parent:document.querySelector('.recitation-parent-confirm')?.textContent??null},
    media:{events:window.__profileSyncMedia.events,fallback:window.__profileSyncMedia.fallback,storage:window.__profileSyncMedia.storage,
      audios:window.__profileSyncMedia.audios.map((audio,id)=>({id,path:window.__profileSyncMedia.paths[id],native:audio instanceof HTMLAudioElement,
        src:audio.getAttribute('src'),paused:audio.paused,ended:audio.ended,currentTime:audio.currentTime,duration:audio.duration}))}};},STORAGE_KEY);
}
async function playing(page:Page,path:string){
  await page.waitForFunction(path=>window.__profileSyncMedia.audios.some((audio,id)=>window.__profileSyncMedia.paths[id]===path&&
    !audio.paused&&audio.currentTime>.08&&(audio.duration-audio.currentTime)/audio.playbackRate>.65),path);
  const audio=await page.evaluate(path=>{
    const id=window.__profileSyncMedia.audios.findIndex((audio,id)=>window.__profileSyncMedia.paths[id]===path&&!audio.paused);
    const audio=window.__profileSyncMedia.audios[id];
    return {id,native:audio instanceof HTMLAudioElement,paused:audio.paused,ended:audio.ended,currentTime:audio.currentTime,duration:audio.duration};
  },path);
  expect(audio.native).toBe(true);expect(audio.paused).toBe(false);expect(audio.ended).toBe(false);
  expect(audio.currentTime).toBeGreaterThan(.08);expect(audio.duration).toBeGreaterThan(audio.currentTime+.65);
  expect(await page.evaluate(()=>window.__profileSyncMedia.fallback)).toEqual([]);
  return audio.id;
}
async function stopped(page:Page,id:number){
  await expect.poll(()=>page.evaluate(id=>{
    const audio=window.__profileSyncMedia.audios[id];return {paused:audio.paused,src:audio.getAttribute('src')};
  },id),{timeout:1500}).toEqual({paused:true,src:null});
  await expect(page.locator('.sound-toggle')).toHaveAttribute('data-speaking','false');
}
async function selectOther(actor:Page,name:string){
  await actor.locator('.profile-dropdown').getByRole('button',{name:new RegExp(name)}).click();
  await expect(actor.locator('.profile-switch b')).toHaveText(name);
}
async function openHanzi(page:Page){
  await page.getByRole('button',{name:'继续我的冒险',exact:true}).click();
  await expect(page.locator('.lesson-stage-4')).toBeVisible();
  await page.locator('.sentence-switch').getByRole('button',{name:'一句话',exact:true}).click();
}
async function openParents(page:Page){
  await page.getByRole('button',{name:'家长小屋',exact:true}).click();
  await page.getByRole('textbox',{name:'家长验证答案',exact:true}).fill('13');
  await page.getByRole('button',{name:'打开家长小屋',exact:true}).click();
  await expect(page.getByRole('textbox',{name:'当前儿童昵称',exact:true})).toBeVisible();
}
async function openListeningPoem(page:Page){
  await page.getByRole('button',{name:`继续《${poem.title}》`,exact:true}).click();
  await expect(page.locator('.poem-stage-0')).toBeVisible();
}
async function trustedPoemStage(page:Page,id:string,stage:number,name?:string){
  await page.waitForFunction(({id,poemId,stage,name})=>window.__profileSyncMedia.storage.some(event=>{
    const profile=event.data.profiles.find(profile=>profile.id===id);
    return event.trusted&&event.activeId===id&&profile?.poems[poemId]?.stage===stage&&(!name||profile.name===name);
  }),{id,poemId:poem.id,stage,name});
}
async function nativePoemPlayback(page:Page,id:number){
  const value=await page.evaluate(id=>{const audio=window.__profileSyncMedia.audios[id];return {time:performance.now(),id,native:audio instanceof HTMLAudioElement,
    paused:audio.paused,currentTime:audio.currentTime,duration:audio.duration,remaining:(audio.duration-audio.currentTime)/audio.playbackRate};},id);
  expect(value.native).toBe(true);expect(value.paused).toBe(false);expect(value.remaining).toBeGreaterThan(.65);
  return value;
}
async function finishStoryControl(actor:Page){
  await actor.locator('.poem-stage-1 .poem-story-card').click();
  const control=await playing(actor,catalog[poemStory]);
  await expect.poll(()=>actor.evaluate(id=>window.__profileSyncMedia.audios[id].ended,control),{timeout:10000}).toBe(true);
  await expect(actor.locator('.sound-toggle')).toHaveAttribute('data-speaking','false');
}
type RecitationCheckpoint=NonNullable<LessonProgress['recitation']>;
async function openLongPoem(page:Page){
  await page.getByRole('button',{name:`继续《${longPoem.title}》`,exact:true}).click();
  await expect(page.locator('.poem-stage-4')).toBeVisible();
}
async function metadataMarker(actor:Page,page:Page,name:string,kind:'hanzi'|'poems'='poems'){
  await actor.getByRole('button',{name:kind==='hanzi'?'关闭学习，保存进度':'关闭诗词学习，保存进度',exact:true}).click();
  await openParents(actor);
  await actor.getByRole('textbox',{name:'当前儿童昵称',exact:true}).fill(name);
  // A rendered nickname proves the App accepted the peer save, independently
  // of localStorage merely being shared between the two pages.
  await expect(page.locator('.profile-switch b')).toHaveText(name);await visible(page,actor);
}
async function trustedRecitation(page:Page,id:string,checkpoint:RecitationCheckpoint,name?:string){
  await page.waitForFunction(({id,poemId,checkpoint,name})=>window.__profileSyncMedia.storage.some(event=>{
    const profile=event.data.profiles.find(profile=>profile.id===id),saved=profile?.poems[poemId]?.recitation;
    return event.trusted&&(!name||profile?.name===name)&&saved&&saved.phase===checkpoint.phase&&saved.chunk===checkpoint.chunk&&
      saved.clozeRound===checkpoint.clozeRound&&JSON.stringify(saved.selected)===JSON.stringify(checkpoint.selected);
  }),{id,poemId:longPoem.id,checkpoint,name});
}
async function answerCloze(page:Page,line:string,advance=true){
  const prompt=await page.locator('.recitation-cloze .quiz-heading h2').innerText(),blank=prompt.indexOf('□');
  expect(blank).toBeGreaterThanOrEqual(0);
  // Infer the answer from the actual displayed blank and source poem text;
  // do not depend on option order or duplicate the question generator.
  expect(prompt.slice(0,blank)+line[blank]+prompt.slice(blank+1)).toBe(line);
  await page.locator('.recitation-cloze .answer-grid').getByRole('button',{name:line[blank],exact:true}).click();
  await expect(page.locator('.recitation-cloze .quiz-feedback')).toContainText(`找对啦！${line}`);
  await expect(page.getByRole('button',{name:'下一小题',exact:true})).toBeVisible();
  if(advance)await page.getByRole('button',{name:'下一小题',exact:true}).click();
}
async function openHanziQuiz(page:Page,stage:2|5){
  await page.getByRole('button',{name:'继续我的冒险',exact:true}).click();
  await expect(page.locator(`.lesson-stage-${stage}`)).toBeVisible();
  await expect(page.locator('.quiz-heading .mini-label')).toHaveText('小挑战 1 / 2');
}
async function trustedHanziRound(page:Page,id:string,stage:number,round:number,name:string){
  await page.waitForFunction(({id,wordId,stage,round,name})=>window.__profileSyncMedia.storage.some(event=>{
    const profile=event.data.profiles.find(profile=>profile.id===id),progress=profile?.hanzi[wordId];
    return event.trusted&&profile?.name===name&&progress?.stage===stage&&progress.quizRound===round;
  }),{id,wordId:word.id,stage,round,name});
}
async function correctHanziAnswer(page:Page,answer:string){
  await page.locator('.answer-grid').getByRole('button',{name:answer,exact:true}).click();
  await expect(page.locator('.answer-card.correct')).toHaveText(answer);
  await expect(page.locator('.quiz-feedback')).toContainText('找对啦！');
}
async function openStroke(page:Page,index:number){
  await page.getByRole('button',{name:'继续我的冒险',exact:true}).click();
  await expect(page.locator('.lesson-stage-3')).toBeVisible();
  await expect(page.locator('.stroke-toolbar>span')).toHaveText(index===strokes.strokes.length?'描写完成':`第 ${index+1} / ${strokes.strokes.length} 笔`);
}
async function trustedStroke(page:Page,id:string,index:number,name:string,after=0){
  await page.waitForFunction(({id,wordId,index,name,after})=>window.__profileSyncMedia.storage.slice(after).some(event=>{
    const profile=event.data.profiles.find(profile=>profile.id===id),progress=profile?.hanzi[wordId];
    return event.trusted&&profile?.name===name&&progress?.stage===3&&progress.strokeIndex===index;
  }),{id,wordId:word.id,index,name,after});
}
async function strokeInput(page:Page){
  const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
  let held=false;
  async function up(){if(held){if(touch)await touch.up(1);else await page.mouse.up();held=false;}}
  return {
    draw:async(median:number[][])=>{await drag(page,await tracePoints(page,median),touch);},
    hold:async(median:number[][])=>{
      const points=await tracePoints(page,median);
      if(touch)await touch.down(1,points[0]);else{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();}
      held=true;
      // Keep the native finger/button down. Move along every median segment
      // by at most 8 CSS pixels on each real browser frame, with no fake clock.
      for(let i=1;i<points.length;i++){
        const from=points[i-1],to=points[i],steps=Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/8);
        for(let step=1;step<=steps;step++){
          await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>resolve())));
          const point={x:from.x+(to.x-from.x)*step/steps,y:from.y+(to.y-from.y)*step/steps};
          if(touch)await touch.move(1,point);else await page.mouse.move(point.x,point.y);
        }
      }
    },up,close:async()=>{try{await up();}finally{await session?.detach();}},
  };
}
function halfStroke(){
  const median=strokes.medians[0],a=median[3],b=median[4],middle=[(a[0]+b[0])/2,(a[1]+b[1])/2];
  return {first:[...median.slice(0,4),middle],rest:[middle,...median.slice(4)]};
}

test.afterEach(async({context},info)=>{
  const evidence=[];
  for(const page of context.pages())if(!page.isClosed()){
    try{evidence.push(await snapshot(page));}catch{evidence.push({url:page.url(),unavailable:true});}
  }
  await info.attach('profile-sync-native-evidence',{contentType:'application/json',body:JSON.stringify({engine,origin,
    boundary:'Two isolated actual App pages share native localStorage. AAC playback, events and clocks are native; only Audio construction is observed.',pages:evidence},null,2)});
});

test('a native cross-window child switch stops old Hanzi AAC, closes the old lesson and preserves both checkpoints',async({context,page})=>{
  const {actor,profiles}=await boot(context,page,'hanzi');await openHanzi(page);
  await actor.getByRole('button',{name:'切换儿童档案',exact:true}).click();
  await page.getByRole('button',{name:'听跟读示范',exact:true}).click();
  const id=await playing(page,catalog[word.sentence]);await visible(page,actor);
  await selectOther(actor,profiles[1].name);
  await expect(page.locator('.profile-switch b')).toHaveText(profiles[1].name);await visible(page,actor);
  expect(await page.evaluate(id=>window.__profileSyncMedia.storage.some(event=>event.trusted&&event.activeId===id),profiles[1].id)).toBe(true);
  await stopped(page,id);await expect(page.locator('.lesson-overlay')).toHaveCount(0);await expect(page.locator('.home-page')).toBeVisible();
  const data=await saved(page);expect(data.activeId).toBe(profiles[1].id);
  expect(data.profiles[0].hanzi[word.id]).toMatchObject({stage:4});expect(data.profiles[0].hanzi[word.id].heardSentence).toBeUndefined();
  expect(data.profiles[1].hanzi[word.id]).toBeUndefined();
});

test('a native cross-window child switch closes the poem and cancels its remaining read-all lines',async({context,page})=>{
  const {actor,profiles}=await boot(context,page,'poems');
  await page.getByRole('button',{name:`继续《${poem.title}》`,exact:true}).click();
  await actor.getByRole('button',{name:'切换儿童档案',exact:true}).click();
  await page.getByRole('button',{name:'慢慢听整首',exact:true}).click();
  const id=await playing(page,catalog[poem.lines[0]]);await visible(page,actor);
  await selectOther(actor,profiles[1].name);
  await expect(page.locator('.profile-switch b')).toHaveText(profiles[1].name);await visible(page,actor);
  await stopped(page,id);await expect(page.locator('.lesson-overlay')).toHaveCount(0);
  let data=await saved(page);expect(data.profiles[0].poems[poem.id].listenedLines??[]).toEqual([]);expect(data.profiles[1].poems[poem.id]).toBeUndefined();
  const plays=await page.evaluate(()=>window.__profileSyncMedia.events.filter(event=>event.kind==='play').length);
  // A genuine independent clip in page B provides a completion boundary for
  // checking that page A's pending poem lines never resume after cancellation.
  await actor.getByRole('button',{name:'诗词花园',exact:true}).click();
  await actor.locator('.poem-card').filter({has:actor.getByRole('heading',{name:poem.title,exact:true})}).click();
  await actor.locator('.poem-line').first().click();
  const control=await playing(actor,catalog[poem.lines[0]]);
  await expect.poll(()=>actor.evaluate(id=>window.__profileSyncMedia.audios[id].ended,control),{timeout:10000}).toBe(true);
  await expect(actor.locator('.sound-toggle')).toHaveAttribute('data-speaking','false');
  await visible(page,actor);await stopped(page,id);
  expect(await page.evaluate(()=>window.__profileSyncMedia.events.filter(event=>event.kind==='play').length)).toBe(plays);
  data=await saved(page);expect(data.profiles[0].poems[poem.id].listenedLines??[]).toEqual([]);expect(data.profiles[1].poems[poem.id].listenedLines).toEqual([0]);
});

test('a native same-child poem peer stage update cancels read-all and its remaining queue',async({context,page},info)=>{
  const heard=poem.lines.map((_,index)=>index);
  const {actor,profiles}=await boot(context,page,'poems',{progress:{stage:0,listenedLines:heard}});
  await openListeningPoem(page);await openListeningPoem(actor);
  await expect(actor.getByRole('button',{name:'去听诗里的故事',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'慢慢听整首',exact:true}).click();
  const id=await playing(page,catalog[poem.lines[0]]),before=await nativePoemPlayback(page,id);
  await actor.getByRole('button',{name:'去听诗里的故事',exact:true}).click();
  await expect(page.locator('.poem-stage-1 .poem-story')).toBeVisible();await trustedPoemStage(page,profiles[0].id,1);
  await info.attach('poem-peer-stage-playback-boundary',{contentType:'application/json',body:JSON.stringify({before,after:await snapshot(page)},null,2)});
  await visible(page,actor);await stopped(page,id);
  const raw=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
  const plays=await page.evaluate(()=>window.__profileSyncMedia.events.filter(event=>event.kind==='play').length);
  // A genuine independent story AAC supplies a completion boundary beyond the
  // cancelled first line; no sleep or synthetic media completion is used.
  await finishStoryControl(actor);await visible(page,actor);await stopped(page,id);
  expect(await page.evaluate(()=>window.__profileSyncMedia.events.filter(event=>event.kind==='play').length)).toBe(plays);
  expect(await page.evaluate(path=>window.__profileSyncMedia.events.some(event=>event.kind==='play'&&event.path===path),catalog[poem.lines[1]])).toBe(false);
  expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(raw);
  expect((await saved(page)).profiles[0].poems[poem.id]).toMatchObject({stage:1,listenedLines:heard});
  await page.locator('.poem-stage-1 .poem-story-card').click();
  const story=await playing(page,catalog[poemStory]);expect(story).not.toBe(id);
  await expect(page.locator('.poem-stage-1 .poem-story')).toBeVisible();await visible(page,actor);
});

test('a native same-child poem peer stage update cancels a single line and local next cancels fresh story audio',async({context,page},info)=>{
  const heard=poem.lines.map((_,index)=>index);
  const {actor,profiles}=await boot(context,page,'poems',{progress:{stage:0,listenedLines:heard}});
  await openListeningPoem(page);await openListeningPoem(actor);
  await expect(actor.getByRole('button',{name:'去听诗里的故事',exact:true})).toBeEnabled();
  await page.locator('.poem-line').first().click();
  const id=await playing(page,catalog[poem.lines[0]]),before=await nativePoemPlayback(page,id);
  await actor.getByRole('button',{name:'去听诗里的故事',exact:true}).click();
  await expect(page.locator('.poem-stage-1 .poem-story')).toBeVisible();await trustedPoemStage(page,profiles[0].id,1);
  await info.attach('poem-peer-stage-playback-boundary',{contentType:'application/json',body:JSON.stringify({before,after:await snapshot(page)},null,2)});
  await visible(page,actor);await stopped(page,id);
  const raw=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
  await finishStoryControl(actor);await stopped(page,id);
  expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(raw);
  await page.locator('.poem-stage-1 .poem-story-card').click();
  const story=await playing(page,catalog[poemStory]);await nativePoemPlayback(page,story);
  await page.getByRole('button',{name:'走进这幅诗的画',exact:true}).click();
  await expect(page.locator('.poem-stage-2')).toBeVisible();await stopped(page,story);
  const plays=await page.evaluate(()=>window.__profileSyncMedia.events.filter(event=>event.kind==='play').length);
  await expect(actor.locator('.poem-stage-2')).toBeVisible();
  await actor.getByRole('button',{name:'听一听题目',exact:true}).click();
  const control=await playing(actor,catalog[poem.question.prompt]);
  await expect.poll(()=>actor.evaluate(id=>window.__profileSyncMedia.audios[id].ended,control),{timeout:10000}).toBe(true);
  await visible(page,actor);await stopped(page,story);
  expect(await page.evaluate(()=>window.__profileSyncMedia.events.filter(event=>event.kind==='play').length)).toBe(plays);
  expect((await saved(page)).profiles[0].poems[poem.id]).toMatchObject({stage:2,listenedLines:heard});
});

test('a native same-child poem same-stage metadata update preserves read-all and its listening checkpoint echo',async({context,page})=>{
  const {actor,profiles}=await boot(context,page,'poems',{progress:{stage:0,listenedLines:[]}});
  await openParents(actor);await openListeningPoem(page);
  await page.getByRole('button',{name:'慢慢听整首',exact:true}).click();
  const id=await playing(page,catalog[poem.lines[0]]);await nativePoemPlayback(page,id);
  const name='同步诗词朗读儿童改名';await actor.getByRole('textbox',{name:'当前儿童昵称',exact:true}).fill(name);
  await expect(page.locator('.profile-switch b')).toHaveText(name);await trustedPoemStage(page,profiles[0].id,0,name);
  await expect(page.locator('.poem-stage-0')).toBeVisible();await visible(page,actor);
  expect(await page.evaluate(id=>{const audio=window.__profileSyncMedia.audios[id];return {paused:audio.paused,ended:audio.ended,src:audio.getAttribute('src')};},id)).toEqual({paused:false,ended:false,src:catalog[poem.lines[0]]});
  const beforeTime=await page.evaluate(id=>window.__profileSyncMedia.audios[id].currentTime,id);
  await page.waitForFunction(({id,beforeTime})=>{const audio=window.__profileSyncMedia.audios[id];return !audio.paused&&!audio.ended&&audio.currentTime>beforeTime+.15;},{id,beforeTime});
  const second=await playing(page,catalog[poem.lines[1]]);expect(second).not.toBe(id);
  await actor.waitForFunction(({id,poemId,name})=>window.__profileSyncMedia.storage.some(event=>{
    const profile=event.data.profiles.find(profile=>profile.id===id);
    return event.trusted&&profile?.name===name&&profile.poems[poemId]?.stage===0&&JSON.stringify(profile.poems[poemId].listenedLines)==='[0]';
  }),{id:profiles[0].id,poemId:poem.id,name});
  await expect(page.getByRole('button',{name:'暂停',exact:true})).toBeVisible();
  expect(await page.locator('.poem-line.reading ruby').evaluateAll(rubies=>rubies.map(ruby=>ruby.childNodes[0]?.textContent).join(''))).toBe(poem.lines[1].replace(/\P{Script=Han}/gu,''));
  expect(await page.evaluate(path=>window.__profileSyncMedia.events.some(event=>event.kind==='play'&&event.path===path&&event.trusted),catalog[poem.lines[1]])).toBe(true);
  expect((await saved(page)).profiles[0].poems[poem.id]).toMatchObject({stage:0,listenedLines:[0]});await visible(page,actor);
});

test('a native same-child nickname update preserves the open lesson and its advancing original AAC',async({context,page})=>{
  const {actor,profiles}=await boot(context,page,'hanzi');await openParents(actor);await openHanzi(page);
  await page.getByRole('button',{name:'听跟读示范',exact:true}).click();
  const id=await playing(page,catalog[word.sentence]);await visible(page,actor);
  await actor.getByRole('textbox',{name:'当前儿童昵称',exact:true}).fill('同步儿童甲改名');
  await expect(page.locator('.profile-switch b')).toHaveText('同步儿童甲改名');await visible(page,actor);
  await expect(page.locator('.lesson-stage-4')).toBeVisible();
  const current=await page.evaluate(id=>{
    const audio=window.__profileSyncMedia.audios[id];return {paused:audio.paused,ended:audio.ended,src:audio.getAttribute('src')};
  },id);
  expect(current).toEqual({paused:false,ended:false,src:catalog[word.sentence]});
  const beforeTime=await page.evaluate(id=>window.__profileSyncMedia.audios[id].currentTime,id);
  await page.waitForFunction(({id,beforeTime})=>{
    const audio=window.__profileSyncMedia.audios[id];return !audio.paused&&!audio.ended&&audio.currentTime>beforeTime+.15;
  },{id,beforeTime});
  await expect(page.locator('.lesson-stage-4')).toBeVisible();
  const data=await saved(page);expect(data.activeId).toBe(profiles[0].id);expect(data.profiles[0].name).toBe('同步儿童甲改名');expect(data.profiles[1].hanzi[word.id]).toBeUndefined();
  expect(await page.evaluate(()=>window.__profileSyncMedia.events.filter(event=>event.kind==='play').length)).toBe(1);
});

test('a native same-child recitation group update preserves peer progress before continuing',async({context,page})=>{
  const initial:RecitationCheckpoint={phase:0,chunk:0,selected:[],clozeRound:0};
  const {actor,profiles}=await boot(context,page,'poems',{poem:longPoem,progress:{stage:4,recitation:initial},sound:false});
  await openLongPoem(page);await openLongPoem(actor);
  for(const line of longPoem.lines.slice(0,4))await actor.locator('.line-options').getByRole('button',{name:line,exact:true}).click();
  await actor.getByRole('button',{name:'下一组诗句',exact:true}).click();
  const advanced:RecitationCheckpoint={...initial,chunk:1};
  expect((await saved(actor)).profiles[0].poems[longPoem.id].recitation).toEqual(advanced);
  const name='同步背诵分组已更新';await metadataMarker(actor,page,name);
  await trustedRecitation(page,profiles[0].id,advanced,name);
  await expect(page.locator('.line-order > p').first()).toContainText('第 2 组 / 2 组');
  for(const [index,line] of longPoem.lines.slice(4,6).entries()){
    await page.locator('.line-options').getByRole('button',{name:line,exact:true}).click();
    await expect(page.locator('.ordered-line')).toHaveText(longPoem.lines.slice(4,5+index));
    await expect(page.locator('.gentle-hint')).toHaveText('接对啦！');
  }
  const continued={...advanced,selected:[0,1]};
  const data=await saved(page);expect(data.profiles[0].name).toBe(name);
  expect(data.profiles[0].poems[longPoem.id]).toMatchObject({stage:4,recitation:continued});
  await trustedRecitation(actor,profiles[0].id,continued,name);await visible(page,actor);
});

test('a native same-child recitation cloze update adopts the peer question before continuing',async({context,page})=>{
  const initial:RecitationCheckpoint={phase:1,chunk:1,selected:[0,1,2,3],clozeRound:0};
  const {actor,profiles}=await boot(context,page,'poems',{poem:longPoem,progress:{stage:4,recitation:initial},sound:false});
  await openLongPoem(page);await openLongPoem(actor);
  await answerCloze(page,longPoem.lines[0],false);
  await answerCloze(actor,longPoem.lines[0]);
  const advanced={...initial,clozeRound:1};
  expect((await saved(actor)).profiles[0].poems[longPoem.id].recitation).toEqual(advanced);
  const name='同步填空题目已更新';await metadataMarker(actor,page,name);
  await trustedRecitation(page,profiles[0].id,advanced,name);
  await expect(page.locator('.recitation-cloze .quiz-heading .mini-label')).toHaveText('小挑战 2 / 8');
  await expect(page.locator('.recitation-cloze .quiz-feedback')).toHaveText('不用着急，想好了再点。');
  await expect(page.locator('.recitation-cloze .answer-card.correct')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'下一小题',exact:true})).toHaveCount(0);
  await answerCloze(page,longPoem.lines[1]);
  await expect(page.locator('.recitation-cloze .quiz-heading .mini-label')).toHaveText('小挑战 3 / 8');
  const continued={...initial,clozeRound:2};
  const data=await saved(page);expect(data.profiles[0].name).toBe(name);
  expect(data.profiles[0].poems[longPoem.id]).toMatchObject({stage:4,recitation:continued});
  await trustedRecitation(actor,profiles[0].id,continued,name);await visible(page,actor);
});

test('a native same-child metadata update preserves recitation hints, page and parent confirmation',async({context,page})=>{
  const checkpoint:RecitationCheckpoint={phase:2,chunk:1,selected:[0,1,2,3],clozeRound:7};
  const {actor,profiles}=await boot(context,page,'poems',{poem:longPoem,progress:{stage:4,recitation:checkpoint},sound:false});
  await openParents(actor);await openLongPoem(page);
  await page.getByRole('button',{name:'看看提示',exact:true}).click();
  await page.getByRole('button',{name:'下一页背诵诗句',exact:true}).click();
  await page.getByRole('button',{name:'家长确认：孩子已尝试完整背诵',exact:true}).click();
  const visibleLines=await page.locator('.hidden-poem p').allTextContents();
  const pageLabel=await page.locator('.recitation-page-controls [role="status"]').innerText();
  expect(visibleLines.length).toBeGreaterThan(0);expect(visibleLines.every(line=>longPoem.lines.includes(line))).toBe(true);
  expect(visibleLines).not.toContain(longPoem.lines[0]);expect(pageLabel).toContain('第 2 /');
  const name='同步背诵提示仍保留';
  await actor.getByRole('textbox',{name:'当前儿童昵称',exact:true}).fill(name);
  await expect(page.locator('.profile-switch b')).toHaveText(name);
  await trustedRecitation(page,profiles[0].id,checkpoint,name);await visible(page,actor);
  await expect(page.locator('.hidden-poem')).toHaveClass('hidden-poem visible');
  await expect(page.getByRole('button',{name:'收起提示',exact:true})).toBeVisible();
  await expect(page.locator('.hidden-poem p')).toHaveText(visibleLines);
  await expect(page.locator('.recitation-page-controls [role="status"]')).toHaveText(pageLabel);
  await expect(page.getByRole('button',{name:'家长已确认背诵练习',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'记忆小桥走完啦',exact:true})).toBeVisible();
  expect((await saved(page)).profiles[0].poems[longPoem.id]).toMatchObject({stage:4,recitation:checkpoint});
});

for(const stage of [2,5] as const)test(`a native same-child Hanzi quiz stage ${stage} update adopts the peer question and clears old feedback`,async({context,page})=>{
  const {actor,profiles}=await boot(context,page,'hanzi',{progress:{stage,quizRound:0},sound:false});
  await openHanziQuiz(page,stage);await openHanziQuiz(actor,stage);
  await correctHanziAnswer(page,word.char);
  await expect(page.getByRole('button',{name:'下一小题',exact:true})).toBeVisible();
  await correctHanziAnswer(actor,word.char);
  await actor.getByRole('button',{name:'下一小题',exact:true}).click();
  expect((await saved(actor)).profiles[0].hanzi[word.id]).toMatchObject({stage,quizRound:1});
  const name=`同步汉字第${stage}关已更新`;await metadataMarker(actor,page,name,'hanzi');
  await trustedHanziRound(page,profiles[0].id,stage,1,name);
  await expect(page.locator('.quiz-heading .mini-label')).toHaveText('小挑战 2 / 2');
  await expect(page.locator('.quiz-heading h2')).toHaveText(stage===2?`“${word.char}”是什么意思？`:`哪个词里有“${word.char}”？`);
  await expect(page.locator('.quiz-feedback')).toHaveText('不用着急，想好了再点。');
  await expect(page.locator('.answer-card.correct')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'下一小题',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'挑战完成',exact:true})).toHaveCount(0);
  await correctHanziAnswer(page,stage===2?word.meaning:word.words[0]);
  await page.getByRole('button',{name:'挑战完成',exact:true}).click();
  await expect(page.locator(`.lesson-stage-${stage===2?3:6}`)).toBeVisible();
  const data=await saved(page);expect(data.profiles[0].name).toBe(name);
  expect(data.profiles[0].hanzi[word.id]).toMatchObject({stage:stage===2?3:6,completed:stage===5});
  expect(data.profiles[0].stars).toBe(stage===5?3:0);
  await trustedHanziRound(actor,profiles[0].id,stage===2?3:6,stage===2?0:1,name);await visible(page,actor);
});

test('a native same-child Hanzi quiz metadata update preserves the current answer, feedback and option order',async({context,page})=>{
  const {actor,profiles}=await boot(context,page,'hanzi',{progress:{stage:2,quizRound:0},sound:false});
  await openParents(actor);await openHanziQuiz(page,2);
  await correctHanziAnswer(page,word.char);
  const options=await page.locator('.answer-card').allTextContents();
  const feedback=await page.locator('.quiz-feedback').innerText();
  const name='同步汉字答案仍保留';await actor.getByRole('textbox',{name:'当前儿童昵称',exact:true}).fill(name);
  await expect(page.locator('.profile-switch b')).toHaveText(name);
  await trustedHanziRound(page,profiles[0].id,2,0,name);await visible(page,actor);
  await expect(page.locator('.quiz-heading .mini-label')).toHaveText('小挑战 1 / 2');
  await expect(page.locator('.answer-card')).toHaveText(options);
  await expect(page.locator('.answer-card.correct')).toHaveText(word.char);
  await expect(page.locator('.quiz-feedback')).toHaveText(feedback);
  await page.getByRole('button',{name:'下一小题',exact:true}).click();
  // A local advance must retain its newly selected question when its own
  // checkpoint returns through App props, and save exactly the next round.
  await expect(page.locator('.quiz-heading .mini-label')).toHaveText('小挑战 2 / 2');
  await expect(page.locator('.quiz-heading h2')).toHaveText(`“${word.char}”是什么意思？`);
  expect((await saved(page)).profiles[0].hanzi[word.id]).toMatchObject({stage:2,quizRound:1});
  await correctHanziAnswer(page,word.meaning);
  const secondOptions=await page.locator('.answer-card').allTextContents();
  const secondFeedback=await page.locator('.quiz-feedback').innerText();
  const secondName='同步汉字第二题仍保留';await actor.getByRole('textbox',{name:'当前儿童昵称',exact:true}).fill(secondName);
  await expect(page.locator('.profile-switch b')).toHaveText(secondName);
  await trustedHanziRound(page,profiles[0].id,2,1,secondName);await visible(page,actor);
  await expect(page.locator('.answer-card')).toHaveText(secondOptions);
  await expect(page.locator('.answer-card.correct')).toHaveText(word.meaning);
  await expect(page.locator('.quiz-feedback')).toHaveText(secondFeedback);
  await expect(page.getByRole('button',{name:'挑战完成',exact:true})).toBeVisible();
  expect((await saved(page)).profiles[0].hanzi[word.id]).toMatchObject({stage:2,quizRound:1});
});

test('a native same-child stroke update adopts peer progress before drawing the next stroke',async({context,page})=>{
  const {actor,profiles}=await boot(context,page,'hanzi',{progress:{stage:3,strokeIndex:0},sound:false});
  await openStroke(page,0);await openStroke(actor,0);
  const input=await strokeInput(page),peer=await strokeInput(actor);
  try{
    for(const median of strokes.medians.slice(0,2))await peer.draw(median);
    expect((await saved(actor)).profiles[0].hanzi[word.id]).toMatchObject({stage:3,strokeIndex:2});
    const name='同步描写两笔已保存';await metadataMarker(actor,page,name,'hanzi');await trustedStroke(page,profiles[0].id,2,name);
    await expect(page.locator('.stroke-toolbar>span')).toHaveText('第 3 / 4 笔');
    await expect(page.locator('.trace-grid path[stroke-linejoin="round"]')).toHaveCount(0);
    await expect(page.locator('.trace-guide')).toHaveAttribute('data-guide-state','preview');
    await input.draw(strokes.medians[2]);
    await expect(page.locator('.stroke-toolbar>span')).toHaveText('第 4 / 4 笔');
    expect((await saved(page)).profiles[0].hanzi[word.id]).toMatchObject({stage:3,strokeIndex:3});
    await trustedStroke(actor,profiles[0].id,3,name);await visible(page,actor);
  }finally{await input.close();await peer.close();}
});

test('a native same-child stroke update releases a held half-stroke without letting its old pointerup save',async({context,page},info)=>{
  const {actor,profiles}=await boot(context,page,'hanzi',{progress:{stage:3,strokeIndex:0},sound:false});
  await openStroke(page,0);await openStroke(actor,0);
  const input=await strokeInput(page),peer=await strokeInput(actor);
  try{
    await input.hold(halfStroke().first);
    await expect(page.locator('.trace-guide')).toHaveAttribute('data-guide-state','following');
    const pointerId=await page.evaluate(()=>window.__profileSyncMedia.pointers.findLast(event=>event.type==='pointerdown'&&event.trusted)!.pointerId);
    expect(await page.locator('.trace-grid').evaluate((grid,id)=>(grid as SVGSVGElement).hasPointerCapture(id),pointerId)).toBe(true);
    await info.attach('stroke-held-before-peer',{contentType:'application/json',body:JSON.stringify(await snapshot(page))});
    for(const median of strokes.medians.slice(0,2))await peer.draw(median);
    const name='同步描写旧手势已撤销';await metadataMarker(actor,page,name,'hanzi');await trustedStroke(page,profiles[0].id,2,name);
    await info.attach('stroke-peer-update-before-release',{contentType:'application/json',body:JSON.stringify(await snapshot(page))});
    await expect(page.locator('.stroke-toolbar>span')).toHaveText('第 3 / 4 笔');
    expect(await page.locator('.trace-grid').evaluate((grid,id)=>(grid as SVGSVGElement).hasPointerCapture(id),pointerId)).toBe(false);
    await expect(page.locator('.trace-grid path[stroke-linejoin="round"]')).toHaveCount(0);
    await expect(page.locator('.trace-guide')).toHaveAttribute('data-guide-state','preview');
    const before=await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);
    await input.up();
    // The browser may defer lostpointercapture until this native pointerup.
    await page.waitForFunction(id=>['lostpointercapture','pointerup'].every(type=>window.__profileSyncMedia.pointers.some(event=>event.trusted&&event.pointerId===id&&event.type===type)),pointerId);
    expect(await page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY)).toBe(before);
    expect((await saved(page)).profiles[0].hanzi[word.id]).toMatchObject({stage:3,strokeIndex:2});
    await input.draw(strokes.medians[2]);
    await expect(page.locator('.stroke-toolbar>span')).toHaveText('第 4 / 4 笔');
    expect((await saved(page)).profiles[0].hanzi[word.id]).toMatchObject({stage:3,strokeIndex:3});
    await trustedStroke(actor,profiles[0].id,3,name);await visible(page,actor);
  }finally{await input.close();await peer.close();}
});

test('a native same-child stroke reset clears old completion and allows every real stroke again',async({context,page})=>{
  const {actor,profiles}=await boot(context,page,'hanzi',{progress:{stage:3,strokeIndex:4},sound:false});
  await openStroke(page,4);await openStroke(actor,4);
  for(const current of [page,actor])await expect(current.getByRole('button',{name:'我的字写好啦',exact:true})).toBeVisible();
  const input=await strokeInput(page);
  try{
    await actor.getByRole('button',{name:'重新描写',exact:true}).click();
    const name='同步描写重新开始';await metadataMarker(actor,page,name,'hanzi');await trustedStroke(page,profiles[0].id,0,name);
    await expect(page.locator('.stroke-toolbar>span')).toHaveText('第 1 / 4 笔');
    await expect(page.getByRole('button',{name:'我的字写好啦',exact:true})).toHaveCount(0);
    for(const [index,median] of strokes.medians.entries()){
      await input.draw(median);
      expect((await saved(page)).profiles[0].hanzi[word.id]).toMatchObject({stage:3,strokeIndex:index+1});
    }
    await expect(page.locator('.stroke-toolbar>span')).toHaveText('描写完成');
    await expect(page.getByRole('button',{name:'我的字写好啦',exact:true})).toBeVisible();
    await trustedStroke(actor,profiles[0].id,4,name);await visible(page,actor);
    // Prepare the peer first, so the external reset occurs near the start of
    // the real four-stroke demonstration rather than its natural completion.
    await actor.getByRole('button',{name:'回到字游小岛',exact:true}).click();await openStroke(actor,4);
    await page.getByRole('button',{name:'看笔顺',exact:true}).click();
    await expect(page.locator('.trace-guide')).toHaveAttribute('data-guide-state','demo');
    const beforeReset=await page.evaluate(()=>window.__profileSyncMedia.storage.length);
    await actor.getByRole('button',{name:'重新描写',exact:true}).click();await trustedStroke(page,profiles[0].id,0,name,beforeReset);
    await expect(page.locator('.stroke-toolbar>span')).toHaveText('第 1 / 4 笔');
    await expect(page.getByRole('button',{name:'停止示范',exact:true})).toHaveCount(0,{timeout:750});
    await expect(page.locator('.trace-guide')).toHaveAttribute('data-guide-state','preview');
    await expect(page.getByRole('button',{name:'我的字写好啦',exact:true})).toHaveCount(0);
    expect((await saved(page)).profiles[0].hanzi[word.id]).toMatchObject({stage:3,strokeIndex:0});
  }finally{await input.close();}
});

test('a native same-child stroke metadata update preserves a paused half-stroke, feedback and demonstration',async({context,page})=>{
  const {actor,profiles}=await boot(context,page,'hanzi',{progress:{stage:3,strokeIndex:0},sound:false});
  await openParents(actor);await openStroke(page,0);
  const input=await strokeInput(page),half=halfStroke();
  try{
    await input.draw(half.first);
    await expect(page.locator('.trace-guide')).toHaveAttribute('data-guide-state','paused');
    const path=await page.locator('.trace-grid path[stroke-linejoin="round"]').getAttribute('d');
    const guide=await page.locator('.trace-guide').getAttribute('transform');
    const hint=await page.locator('.stroke-practice .gentle-hint').innerText();
    const name='同步描写半笔仍保留';await actor.getByRole('textbox',{name:'当前儿童昵称',exact:true}).fill(name);
    await expect(page.locator('.profile-switch b')).toHaveText(name);await trustedStroke(page,profiles[0].id,0,name);
    await expect(page.locator('.trace-guide')).toHaveAttribute('data-guide-state','paused');
    await expect(page.locator('.trace-guide')).toHaveAttribute('transform',guide!);
    await expect(page.locator('.trace-grid path[stroke-linejoin="round"]')).toHaveAttribute('d',path!);
    await expect(page.locator('.stroke-practice .gentle-hint')).toHaveText(hint);
    await input.draw(half.rest);
    await expect(page.locator('.stroke-toolbar>span')).toHaveText('第 2 / 4 笔');
    await expect(page.locator('.stroke-practice .gentle-hint')).toHaveText('这一笔画好啦！');
    await expect(page.locator('.trace-guide')).toHaveAttribute('data-guide-state','preview');
    await expect(page.locator('.trace-start')).toHaveAttribute('cx',String(strokes.medians[1][0][0]));
    expect((await saved(page)).profiles[0].hanzi[word.id]).toMatchObject({stage:3,strokeIndex:1});
    await trustedStroke(actor,profiles[0].id,1,name);
    await page.getByRole('button',{name:'看笔顺',exact:true}).click();
    await expect(page.getByRole('button',{name:'停止示范',exact:true})).toBeVisible();
    const demoName='同步描写示范仍保留';await actor.getByRole('textbox',{name:'当前儿童昵称',exact:true}).fill(demoName);
    await expect(page.locator('.profile-switch b')).toHaveText(demoName);await trustedStroke(page,profiles[0].id,1,demoName);
    await expect(page.getByRole('button',{name:'停止示范',exact:true})).toBeVisible();
    await expect(page.locator('.trace-guide')).toHaveAttribute('data-guide-state','demo');await visible(page,actor);
  }finally{await input.close();}
});
