import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {createProfile,initialProgress,STORAGE_KEY} from '../src/store';
import type {Hanzi,LessonProgress,Poem,SaveData} from '../src/types';

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
const catalog=JSON.parse(readFileSync(new URL('../public/audio/manifest.json',import.meta.url),'utf8')).files as Record<string,string>;
for(const text of [word.sentence,...poem.lines]){
  if(!catalog[text]?.endsWith('.m4a')||!existsSync(new URL(`../public${catalog[text]}`,import.meta.url)))throw Error(`Missing native AAC fixture: ${text}`);
}
type MediaEvent={kind:string;id:number;path:string;time:number;currentTime:number;duration:number};
type SyncMedia={audios:HTMLAudioElement[];paths:string[];events:MediaEvent[];fallback:string[];storage:{trusted:boolean;activeId:string;url:string;data:SaveData}[]};
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
    const evidence:SyncMedia={audios:[],paths:[],events:[],fallback:[],storage:[]};
    window.__profileSyncMedia=evidence;
    const NativeAudio=window.Audio;
    Object.defineProperty(window,'Audio',{configurable:true,value:new Proxy(NativeAudio,{
      construct(target,args){
        const audio=Reflect.construct(target,args) as HTMLAudioElement;
        const id=evidence.audios.length,path=String(args[0]??'');
        evidence.audios.push(audio);evidence.paths.push(path);
        for(const kind of ['play','playing','timeupdate','ended','pause','emptied','error'])audio.addEventListener(kind,()=>{
          evidence.events.push({kind,id,path,time:performance.now(),currentTime:audio.currentTime,duration:audio.duration});
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
  return page.evaluate(key=>({visibility:document.visibilityState,child:document.querySelector('.profile-switch b')?.textContent,
    lesson:document.querySelector('.lesson-content')?.className??null,data:JSON.parse(localStorage.getItem(key)!),
    quiz:{round:document.querySelector('.quiz-heading .mini-label')?.textContent??null,prompt:document.querySelector('.quiz-heading h2')?.textContent??null,
      options:[...document.querySelectorAll('.answer-card')].map(card=>({text:card.textContent,correct:card.classList.contains('correct')})),
      feedback:document.querySelector('.quiz-feedback')?.textContent??null,next:document.querySelector('.quiz > .primary-button')?.textContent??null},
    recitation:{group:document.querySelector('.line-order > p')?.textContent??null,selected:[...document.querySelectorAll('.ordered-line')].map(line=>line.textContent),
      question:document.querySelector('.recitation-cloze .quiz-heading h2')?.textContent??null,round:document.querySelector('.recitation-cloze .quiz-heading .mini-label')?.textContent??null,
      hint:document.querySelector('.hidden-poem')?.className??null,lines:[...document.querySelectorAll('.hidden-poem p')].map(line=>line.textContent),
      page:document.querySelector('.recitation-page-controls [role="status"]')?.textContent??null,parent:document.querySelector('.recitation-parent-confirm')?.textContent??null},
    media:{events:window.__profileSyncMedia.events,fallback:window.__profileSyncMedia.fallback,storage:window.__profileSyncMedia.storage,
      audios:window.__profileSyncMedia.audios.map((audio,id)=>({id,path:window.__profileSyncMedia.paths[id],native:audio instanceof HTMLAudioElement,
        src:audio.getAttribute('src'),paused:audio.paused,ended:audio.ended,currentTime:audio.currentTime,duration:audio.duration}))}}),STORAGE_KEY);
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
