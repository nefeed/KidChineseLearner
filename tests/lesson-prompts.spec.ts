import {test as base,expect,chromium,webkit,type Browser,type Page} from '@playwright/test';
import {buildSync} from 'esbuild';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import type {Hanzi,Poem} from '../src/types';

// Actual production components; disposable profiles and controlled narration
// promises. These checks prove UI contracts, not audio or physical iPad quality.
const origin=process.env.LESSON_PROMPT_TEST_URL??'http://127.0.0.1:5174';
const engine=process.env.LESSON_PROMPT_ENGINE??'chromium';
if(!['chromium','webkit'].includes(engine))throw Error('LESSON_PROMPT_ENGINE must be chromium or webkit');
const root=fileURLToPath(new URL('..',import.meta.url));
const words=JSON.parse(readFileSync(new URL('../src/data/hanzi.json',import.meta.url),'utf8')) as Hanzi[];
const poems=JSON.parse(readFileSync(new URL('../src/data/poems.json',import.meta.url),'utf8')) as Poem[];
const poem=poems.find(item=>item.title==='静夜思')!;
const word=(char:string)=>words.find(item=>item.char===char)!;
const css=['styles.css','ipad-layout.css','word-play.css','poem-viewport.css'].map(name=>readFileSync(root+'/src/'+name,'utf8')).join('\n');
const bundle=buildSync({stdin:{resolveDir:root,loader:'tsx',contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import HanziLesson from './src/components/HanziLesson';
import PoemLesson from './src/components/PoemLesson';
import {createProfile,initialProgress} from './src/store';
import words from './src/data/hanzi.json';
import poems from './src/data/poems.json';
const root=createRoot(document.getElementById('root'));let sequence=0;
window.calls=[];window.pending=[];window.profileUpdates=0;window.stopCalls=0;
function speak(text){if(!window.latestProfile.settings.sound)return Promise.resolve(false);window.calls.push(text);return new Promise(resolve=>window.pending.push(resolve));}
function updateActive(updater){window.profileUpdates++;window.applyProfileUpdate(updater);}
function stop(){window.stopCalls++;for(const resolve of window.pending.splice(0))resolve(false);}
window.resolveSpeech=value=>{const resolve=window.pending.shift();if(!resolve)throw Error('No pending narration');resolve(value);};
window.resolveAllSpeech=value=>{for(const resolve of window.pending.splice(0))resolve(value);};
function Harness({options}){
 const item=options.kind==='poems'?poems.find(p=>p.id===options.id):words.find(w=>w.char===options.char);
 const [profile,update]=useState(()=>{const p=createProfile('提示回归测试');p.settings.sound=options.sound??true;p.settings.music=false;p[options.kind??'hanzi'][item.id]={...initialProgress(),stage:options.stage??0,...options.progress};return p;});
 window.latestProfile=profile;window.applyProfileUpdate=update;
 if(options.kind==='poems')return <PoemLesson poem={item} profile={profile} onUpdate={updateActive} onSpeak={speak} onPrepare={()=>{}} onStop={stop} onClose={()=>root.render(null)} onZoo={()=>{}}/>;
 return <HanziLesson word={item} words={words} profile={profile} onUpdate={updateActive} onSpeak={speak} onClose={()=>root.render(null)} onNext={()=>{}} onZoo={()=>{}}/>;
}
window.mountFixture=options=>flushSync(()=>root.render(<Harness key={++sequence} options={options}/>));
window.setSound=sound=>flushSync(()=>window.applyProfileUpdate(p=>({...p,settings:{...p.settings,sound}})));
`},bundle:true,write:false,format:'iife',target:'es2020',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'}).outputFiles[0].text;
const html='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><div id="root"></div><script>'+bundle.replace(/<\/script/gi,'<\\/script')+'</script>';
const test=base.extend<{}, {browser:Browser}>({browser:[async({},use)=>{
 const requested=process.env.PLAYWRIGHT_CHANNEL;
 const channel=requested==='chromium'?undefined:requested??(process.platform==='darwin'?'chrome':undefined);
 const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel}));
 try{await use(browser);}finally{await browser.close();}
},{scope:'worker'}]});
test.use({viewport:{width:1180,height:720},hasTouch:true,isMobile:true,deviceScaleFactor:2});
const runtimeErrors=new WeakMap<Page,string[]>();
test.beforeEach(async({page})=>{
 const errors:string[]=[];runtimeErrors.set(page,errors);page.on('pageerror',error=>errors.push(error.message));
 await page.clock.setFixedTime(new Date('2026-10-02T12:00:00+08:00'));
 await page.route('**/lesson-prompt-fixture',route=>route.fulfill({contentType:'text/html',body:html}));
 await page.goto(origin+'/lesson-prompt-fixture');
 await page.waitForFunction(()=>typeof(window as any).mountFixture==='function');
});
test.afterEach(async({page})=>{expect(runtimeErrors.get(page)).toEqual([]);});
async function settle(page:Page){await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));}
async function mount(page:Page,options:Record<string,unknown>){await page.evaluate(options=>(window as any).mountFixture(options),options);await settle(page);}
async function resolve(page:Page,value:boolean){await page.evaluate(value=>(window as any).resolveSpeech(value),value);await settle(page);}
async function saved(page:Page,kind:string,id:string){return page.evaluate(({kind,id})=>(window as any).latestProfile[kind][id],{kind,id});}
async function fits(page:Page){
 await settle(page);
 const problems=await page.evaluate(()=>{
  const failures:string[]=[];const visible=(element:Element)=>{const s=getComputedStyle(element),r=element.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0;};
  if(document.documentElement.scrollHeight>innerHeight+2)failures.push('document scroll');
  for(const element of [...document.querySelectorAll('.lesson-content,.word-play,.wp-game-content,.poem-today,.line-order,.recite-final')].filter(visible))if(element.scrollHeight>element.clientHeight+2)failures.push(element.className+' overflows');
  for(const element of [...document.querySelectorAll('.lesson-overlay button,.lesson-overlay input,.lesson-overlay select')].filter(visible)){const r=element.getBoundingClientRect();if(r.top< -2||r.bottom>innerHeight+2||r.left< -2||r.right>innerWidth+2)failures.push(element.textContent+' outside');}
  return failures;
 });
 expect(problems,'Controls and functional panels fit without scrolling').toEqual([]);
}
async function uncover(page:Page){for(let index=1;index<=8;index++)await page.getByRole('button',{name:`擦开第${index}块字卡盖子`,exact:true}).click();await expect(page.locator('.wp-fallback-card')).toHaveCount(0);}

test('reveal instructions expose a cover before any sentence speaker',async({page})=>{
 await mount(page,{char:'龙'});await expect(page.locator('.play-instruction')).toContainText('擦开字卡');
 await expect(page.locator('.wp-game-note')).toContainText('先打开八块盖板');await expect(page.locator('.wp-sentence-card')).toHaveCount(0);await fits(page);
 await uncover(page);await expect(page.getByRole('button',{name:'听生活句子',exact:true})).toBeVisible();await fits(page);
});
test('generic sentence choices unlock only after successful playback',async({page})=>{
 await mount(page,{char:'龙'});await uncover(page);const target=word('龙').words[0];
 await page.getByRole('button',{name:'听生活句子',exact:true}).click();await expect(page.getByRole('button',{name:target,exact:true})).toBeDisabled();
 await resolve(page,false);await page.getByRole('button',{name:target,exact:true}).click();await expect(page.locator('.wp-definition-scene')).toHaveCount(0);
 await page.evaluate(()=>(window as any).resolveAllSpeech(false));await page.getByRole('button',{name:'听生活句子',exact:true}).click();await resolve(page,true);
 await page.getByRole('button',{name:target,exact:true}).click();await expect(page.locator('.wp-definition-scene')).toBeVisible();await fits(page);
});
test('muted generic game explicitly uses viewing and retains both choices',async({page})=>{
 await mount(page,{char:'龙',sound:false});await uncover(page);await expect(page.locator('.play-instruction')).toContainText('当前已静音');
 await page.getByRole('button',{name:'看生活句子',exact:true}).click();await page.getByRole('button',{name:word('龙').words[0],exact:true}).click();
 await expect(page.getByRole('button',{name:'静音：生活句子已看过',exact:true})).toBeDisabled();await fits(page);
 await page.getByRole('button',{name:word('龙').meaning,exact:true}).click();await expect(page.getByRole('button',{name:'认识这个字',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>(window as any).calls)).toEqual([]);await fits(page);
});
test('window completion describes opening curtains, not opening the window',async({page})=>{
 await mount(page,{char:'窗'});await expect(page.locator('.play-instruction')).toContainText('窗帘');
 const range=page.getByRole('slider',{name:'窗帘打开程度',exact:true});await range.focus();await range.press('End');
 await expect(page.getByRole('button',{name:'认识这个字',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).calls)).toEqual(['窗帘拉开了，阳光照进来。']);await fits(page);
});
test('watermelon instructions match the two visible pieces and separation',async({page})=>{
 await mount(page,{char:'瓜'});await expect(page.locator('.wp-melon-halves .wp-art--melon')).toHaveCount(2);await expect(page.locator('.play-instruction')).toContainText('两块西瓜');
 const range=page.getByRole('slider',{name:'西瓜分开程度',exact:true});await range.focus();await range.press('End');
 await expect(page.getByRole('button',{name:'认识这个字',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).calls)).toEqual(['两块西瓜分开了，里面有果肉和瓜子。']);await fits(page);
});
test('worm and soil instructions name the actual targets and planting action',async({page})=>{
 await mount(page,{char:'虫'});await expect(page.locator('.play-instruction')).toContainText('点一点，找到三只小虫');await expect(page.locator('.wp-nature-items .wp-art--worm')).toHaveCount(3);await expect(page.locator('.wp-art--leaf')).toHaveCount(0);await fits(page);
 await mount(page,{char:'土'});await expect(page.locator('.play-instruction')).toContainText('把种子种进松软的泥土');await page.getByRole('button',{name:'第1个土坑种种子',exact:true}).click();await expect(page.getByRole('button',{name:'给种子浇水',exact:true})).toBeEnabled();await fits(page);
});
test('hearing waits for completion and does not accept canceled narration',async({page})=>{
 await mount(page,{char:'耳'});await page.getByRole('button',{name:'听一听',exact:true}).click();await expect(page.getByRole('button',{name:'选择铃铛',exact:true})).toBeDisabled();
 await resolve(page,false);await page.getByRole('button',{name:'选择铃铛',exact:true}).click();await expect(page.locator('.wp-step-counter')).toContainText('0 / 2');
 await page.evaluate(()=>(window as any).resolveAllSpeech(false));await page.getByRole('button',{name:'听一听',exact:true}).click();await resolve(page,true);
 await page.getByRole('button',{name:'选择铃铛',exact:true}).click();await expect(page.locator('.wp-step-counter')).toContainText('1 / 2');await fits(page);
});
test('muted hearing provides explicit object clues instead of pretending sound',async({page})=>{
 await mount(page,{char:'耳',sound:false});await expect(page.locator('.play-instruction')).toContainText('当前已静音');
 await page.getByRole('button',{name:'看本轮提示',exact:true}).click();await expect(page.locator('.wp-game-note')).toContainText('找铃铛');await page.getByRole('button',{name:'选择铃铛',exact:true}).click();
 await expect(page.locator('.wp-step-counter')).toContainText('已找到 1 / 2');await page.getByRole('button',{name:'看本轮提示',exact:true}).click();await expect(page.locator('.wp-game-note')).toContainText('找小鼓');
 await page.getByRole('button',{name:'选择小鼓',exact:true}).click();await expect(page.getByRole('button',{name:'认识这个字',exact:true})).toBeVisible();expect(await page.evaluate(()=>(window as any).calls)).toEqual([]);await fits(page);
});
test('recognition listens to completion before enabling progression',async({page})=>{
 await mount(page,{char:'水',stage:1});await page.getByRole('button',{name:'先听听这个字',exact:true}).click();await expect(page.getByRole('button',{name:'正在听这个字',exact:true})).toBeDisabled();
 await resolve(page,false);await expect(page.getByRole('button',{name:'先听听这个字',exact:true})).toBeEnabled();expect((await saved(page,'hanzi',word('水').id)).stage).toBe(1);
 await page.getByRole('button',{name:'先听听这个字',exact:true}).click();await resolve(page,true);await page.getByRole('button',{name:'去找字朋友',exact:true}).click();
 expect((await saved(page,'hanzi',word('水').id)).stage).toBe(2);await fits(page);
});
test('follow-reading marks only fully played word and sentence demonstrations',async({page})=>{
 await mount(page,{char:'水',stage:4});await page.getByRole('button',{name:'先听词语',exact:true}).click();await expect(page.getByRole('button',{name:'正在听示范',exact:true})).toBeDisabled();
 expect((await saved(page,'hanzi',word('水').id)).heardWord).not.toBe(true);await resolve(page,true);expect((await saved(page,'hanzi',word('水').id)).heardWord).toBe(true);
 await page.getByRole('button',{name:'再听一句话',exact:true}).click();await resolve(page,false);expect((await saved(page,'hanzi',word('水').id)).heardSentence).not.toBe(true);
 await page.getByRole('button',{name:'再听一句话',exact:true}).click();await resolve(page,true);await page.getByRole('button',{name:'家长确认：孩子已跟读词语和句子',exact:true}).click();
 await expect(page.getByRole('button',{name:'去过关',exact:true})).toBeVisible();await fits(page);
});
test('old playback cannot update a newly active lesson or a muted state',async({page})=>{
 await mount(page,{char:'水',stage:4});await page.getByRole('button',{name:'先听词语',exact:true}).click();await mount(page,{char:'火',stage:4});await resolve(page,true);
 expect((await saved(page,'hanzi',word('火').id)).heardWord).not.toBe(true);await expect(page.getByRole('button',{name:'先听词语',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'先听词语',exact:true}).click();await page.evaluate(()=>(window as any).setSound(false));await resolve(page,true);
 expect((await saved(page,'hanzi',word('火').id)).heardWord).not.toBe(true);await expect(page.getByRole('button',{name:'家长确认：孩子已尝试读词语和句子',exact:true})).toBeEnabled();
});
test('muted recognition and follow-reading remain operable without fake heard flags',async({page})=>{
 await mount(page,{char:'水',stage:1,sound:false});await page.getByRole('button',{name:'静音学习：去找字朋友',exact:true}).click();expect((await saved(page,'hanzi',word('水').id)).stage).toBe(2);
 await expect(page.locator('.quiz-heading')).toContainText('找出刚才认识的字');await fits(page);
 await mount(page,{char:'水',stage:4,sound:false});await page.getByRole('button',{name:'一句话',exact:true}).click();await page.getByRole('button',{name:'家长确认：孩子已尝试读词语和句子',exact:true}).click();await fits(page);
 await page.getByRole('button',{name:'去过关',exact:true}).click();const progress=await saved(page,'hanzi',word('水').id);expect(progress.stage).toBe(5);expect(progress.heardWord).not.toBe(true);expect(progress.heardSentence).not.toBe(true);
 await expect(page.locator('.quiz-heading')).toContainText('哪个字在刚才的词语里');expect(await page.evaluate(()=>(window as any).calls)).toEqual([]);
});
test('poem busy button is a status, with a separate functional pause action',async({page})=>{
 await mount(page,{kind:'poems',id:poem.id});await page.getByRole('button',{name:'慢慢听整首',exact:true}).click();await expect(page.getByRole('button',{name:'正在听诗',exact:true})).toBeDisabled();await fits(page);
 await page.getByRole('button',{name:'暂停',exact:true}).click();await expect(page.getByRole('button',{name:'先听完这首诗',exact:true})).toBeEnabled();expect((await saved(page,'poems',poem.id)).listenedLines??[]).toEqual([]);
});
test('imagery listening credits the exact line only after it finishes',async({page})=>{
 const keyword=poem.keywords.find(keyword=>poem.lines.some(line=>line.includes(keyword)))!;const index=poem.lines.findIndex(line=>line.includes(keyword));
 await mount(page,{kind:'poems',id:poem.id});await page.getByRole('button',{name:`诗中的${keyword}`,exact:true}).click();expect((await saved(page,'poems',poem.id)).listenedLines??[]).toEqual([]);
 expect(await page.evaluate(()=>(window as any).calls)).toEqual([poem.lines[index]]);await resolve(page,true);expect((await saved(page,'poems',poem.id)).listenedLines).toEqual([index]);await expect(page.getByRole('button',{name:'继续听剩下的诗句',exact:true})).toBeVisible();await fits(page);
});
test('muted poem progresses by reading and restores completed practice indicators',async({page})=>{
 await mount(page,{kind:'poems',id:poem.id,sound:false});await page.getByRole('button',{name:'静音阅读：去看诗里的故事',exact:true}).click();const progress=await saved(page,'poems',poem.id);expect(progress.stage).toBe(1);expect(progress.listenedLines??[]).toEqual([]);
 await mount(page,{kind:'poems',id:poem.id,stage:3,progress:{activityDone:true}});const steps=page.locator('.today-steps button');await expect(steps.nth(0)).toHaveClass('done');await expect(steps.nth(1)).toHaveClass('done');await expect(steps.nth(1)).toBeEnabled();
 await steps.nth(1).click();expect(await page.evaluate(()=>(window as any).calls)).toEqual(['你们尝试过，也分享了发现。']);await fits(page);
});
test('ordering retry describes the next required line and plays exactly that line',async({page})=>{
 await mount(page,{kind:'poems',id:poem.id,stage:4,progress:{recitation:{phase:0,chunk:0,selected:[],clozeRound:0}}});
 await page.getByRole('button',{name:poem.lines[2],exact:true}).click();await expect(page.locator('.gentle-hint')).toContainText('接下来该接的诗句');expect(await page.evaluate(()=>(window as any).calls)).toEqual([poem.lines[0]]);await fits(page);
});
test('today card pagination retains sources while narration explicitly covers the card',async({page})=>{
 const cards=JSON.parse(readFileSync(root+'/src/data/today-connections.json','utf8'));const card=cards.find((item:any)=>item.id==='mid-autumn-2026');
 await mount(page,{kind:'poems',id:poem.id,stage:3});await page.getByRole('button',{name:'今天的小发现',exact:true}).click();await expect(page.locator('.today-connection-page')).toContainText(card.fact);
 await page.getByRole('button',{name:'下一页生活资料',exact:true}).click();await expect(page.locator('.today-connection-page')).toContainText(card.connection);
 await page.getByRole('button',{name:'听今天的小发现',exact:true}).click();expect(await page.evaluate(()=>(window as any).calls)).toEqual([card.fact+card.connection+card.activity]);
 await page.getByRole('button',{name:'下一页生活资料',exact:true}).click();await expect(page.locator('.today-connection-page')).toContainText(card.activity);
 await page.getByRole('button',{name:'下一页生活资料',exact:true}).click();await expect(page.locator('.today-connection-page a')).toHaveAttribute('href',card.source);await fits(page);
});
