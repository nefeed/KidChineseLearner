import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {createProfile,initialProgress,STORAGE_KEY} from '../src/store';
import type {Hanzi,Poem,SaveData} from '../src/types';

const origin=process.env.PROFILE_SYNC_TEST_URL??'http://127.0.0.1:5173';
const engine=process.env.PROFILE_SYNC_TEST_ENGINE??'chromium';
if(!['chromium','webkit'].includes(engine))throw Error('PROFILE_SYNC_TEST_ENGINE must be chromium or webkit');
const requested=process.env.PLAYWRIGHT_CHANNEL;
const channel=requested==='chromium'?undefined:requested??(process.platform==='darwin'&&existsSync('/Applications/Google Chrome.app')?'chrome':undefined);
test.use({browserName:engine as 'chromium'|'webkit',channel:engine==='chromium'?channel:undefined,
  viewport:{width:1180,height:720},isMobile:true,hasTouch:true,reducedMotion:'reduce'});

const word=(JSON.parse(readFileSync(new URL('../src/data/hanzi.json',import.meta.url),'utf8')) as Hanzi[]).find(item=>item.id==='hz-001')!;
const poem=(JSON.parse(readFileSync(new URL('../src/data/poems.json',import.meta.url),'utf8')) as Poem[]).find(item=>item.id==='poem-001')!;
const catalog=JSON.parse(readFileSync(new URL('../public/audio/manifest.json',import.meta.url),'utf8')).files as Record<string,string>;
for(const text of [word.sentence,...poem.lines]){
  if(!catalog[text]?.endsWith('.m4a')||!existsSync(new URL(`../public${catalog[text]}`,import.meta.url)))throw Error(`Missing native AAC fixture: ${text}`);
}
type MediaEvent={kind:string;id:number;path:string;time:number;currentTime:number;duration:number};
type SyncMedia={audios:HTMLAudioElement[];paths:string[];events:MediaEvent[];fallback:string[];storage:{trusted:boolean;activeId:string;url:string}[]};
declare global{interface Window{__profileSyncMedia:SyncMedia}}

async function boot(context:BrowserContext,page:Page,kind:'hanzi'|'poems'){
  const profiles=['同步儿童甲','同步儿童乙'].map(name=>{
    const profile=createProfile(name);profile.settings.sound=true;profile.settings.music=false;return profile;
  });
  if(kind==='hanzi')profiles[0].hanzi[word.id]={...initialProgress(),stage:4};
  else profiles[0].poems[poem.id]={...initialProgress(),stage:0};
  profiles[0].lastActivity={kind,id:kind==='hanzi'?word.id:poem.id};
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
      if(event.key===key&&event.newValue)evidence.storage.push({trusted:event.isTrusted,activeId:JSON.parse(event.newValue).activeId,url:event.url});
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
