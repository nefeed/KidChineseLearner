import {test as base,expect,chromium,webkit,type Browser,type Locator,type Page,type TestInfo} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {createProfile,initialProgress,STORAGE_KEY} from '../src/store';
import {ZOO_REGIONS} from '../src/data/zoo-regions';
import {REWARDS} from '../src/data/rewards';
import type {Hanzi,LessonProgress,Poem,Profile,SaveData} from '../src/types';

// Isolated desktop-engine layout simulations, not physical iPad acceptance.
// The layout checks run before transitions, so Playwright's automatic scrolling
// cannot make an inaccessible control appear to have fitted the viewport.
const origin=process.env.IPAD_LAYOUT_TEST_URL??'http://127.0.0.1:5173';
const engine=process.env.IPAD_LAYOUT_ENGINE??'webkit';
if(!['chromium','webkit'].includes(engine))throw Error('IPAD_LAYOUT_ENGINE must be chromium or webkit');
const safeInsets=Number(process.env.IPAD_LAYOUT_SAFE_INSETS??0);
if(!Number.isFinite(safeInsets)||safeInsets<0||safeInsets>100)throw Error('IPAD_LAYOUT_SAFE_INSETS must be between 0 and 100 CSS pixels');
if(safeInsets&&engine!=='chromium')throw Error('IPAD_LAYOUT_SAFE_INSETS requires Chromium CDP; WebKit does not support this emulation');
const words=JSON.parse(readFileSync(new URL('../src/data/hanzi.json',import.meta.url),'utf8')) as Hanzi[];
const poems=JSON.parse(readFileSync(new URL('../src/data/poems.json',import.meta.url),'utf8')) as Poem[];
const longPoem=[...poems].sort((a,b)=>b.lines.length-a.lines.length)[0];
const widePoem=[...poems].sort((a,b)=>Math.max(...b.lines.map(line=>[...line].length))-Math.max(...a.lines.map(line=>[...line].length)))[0];
const densePoem=[...poems].sort((a,b)=>b.interpretation.join(' ').length-a.interpretation.join(' ').length)[0];
const shortPoem=poems.find(poem=>poem.title==='静夜思')??poems.find(poem=>poem.lines.length===4)!;
const storyWord=[...words].sort((a,b)=>(b.meaning.length+b.sentence.length)-(a.meaning.length+a.sentence.length))[0];
const viewports=[
  {name:'Air 5 portrait',width:820,height:1180},
  {name:'Air 5 landscape',width:1180,height:820},
  {name:'Safari usable landscape',width:1180,height:720},
  {name:'Safari usable portrait',width:820,height:1080},
];
const test=base.extend<{page:Page},{browser:Browser}>({
  browser:[async({},use)=>{
    const requested=process.env.PLAYWRIGHT_CHANNEL;
    const channel=requested==='chromium'?undefined:requested??(process.platform==='darwin'&&existsSync('/Applications/Google Chrome.app')?'chrome':undefined);
    const browser=await (engine==='chromium'?chromium.launch({channel}):webkit.launch());
    try{await use(browser);}finally{await browser.close();}
  },{scope:'worker'}],
  page:async({browser,viewport},use,testInfo)=>{
    const context=await browser.newContext({viewport:viewport!,deviceScaleFactor:2,isMobile:true,hasTouch:true,
      userAgent:'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'});
    const page=await context.newPage(),errors:string[]=[];let crashed=false;
    const insetSession=safeInsets?await context.newCDPSession(page):null;
    if(insetSession)await insetSession.send('Emulation.setSafeAreaInsetsOverride',{insets:{top:safeInsets,bottom:safeInsets,left:0,right:0}});
    page.on('pageerror',error=>errors.push(error.message));
    page.on('crash',()=>crashed=true);
    try{await use(page);}finally{
      try{
        if(testInfo.status!==testInfo.expectedStatus&&!page.isClosed()){
          try{
            if(crashed)throw Error('Page crashed before the failure screenshot could be captured.');
            await testInfo.attach('viewport-failure',{body:await page.screenshot(),contentType:'image/png'});
          }catch(error){
            // A crashed renderer cannot provide pixels; retain the primary failure.
            await testInfo.attach('viewport-screenshot-error',{body:String(error),contentType:'text/plain'});
          }
        }
      }finally{
        try{await insetSession?.detach();}finally{await context.close();}
        expect(errors,'No application errors in the layout fixture').toEqual([]);
      }
    }
  },
});

type Fixture={kind?:'hanzi'|'poems';id?:string;progress?:Partial<LessonProgress>;profiles?:number;rest?:boolean;due?:boolean;matureZoo?:boolean;longNames?:boolean};
const longNickname=(index:number)=>{
  const digits='零一二三四五六七八九';
  const suffix=index<10?`${digits[index]}号`:index===10?'十号':index<20?`十${digits[index-10]}`:'二十';
  return `喜欢探索汉字诗词世界的小朋友${suffix}`;
};
function fixture(options:Fixture={}):SaveData{
  const profile=createProfile(options.longNames?longNickname(1):'布局测试员');profile.settings.sound=false;profile.settings.music=false;
  if(options.rest)profile.settings.sessionMinutes=5;
  if(options.due)for(const word of words.slice(0,12))profile.hanzi[word.id]={...initialProgress(),stage:6,completed:true,firstCompletedAt:Date.now()-2*86400000,reviewAt:Date.now()-86400000};
  if(options.matureZoo){
    for(const word of words)profile.hanzi[word.id]={...initialProgress(),stage:6,completed:true,reviewAt:Date.now()+86400000};
    for(const poem of poems)profile.poems[poem.id]={...initialProgress(),stage:6,completed:true,reviewAt:Date.now()+86400000};
    const items=[{x:profile.zoo.animals['welcome-rabbit'].x,y:profile.zoo.animals['welcome-rabbit'].y}];
    for(const [index,reward]of REWARDS.entries()){
      const total=index+1,slots=Array.from({length:12},(_,i)=>({x:18+i%4*21,y:35+Math.floor(i/4)*21}));
      const preferred=slots[total%12],currentPageItems=items.slice(Math.floor(total/12)*12);
      const location=[preferred,...slots].find(slot=>currentPageItems.every(item=>Math.abs(item.x-slot.x)>16||Math.abs(item.y-slot.y)>16))??preferred;
      items.push(location);
      if(reward.kind==='animal')profile.zoo.animals[reward.id]={id:reward.species,name:`${reward.title} ${index+1}`,fullness:60,cleanliness:40,affection:10,...location};
      else profile.zoo.buildings[reward.id]={id:reward.species,...location};
    }profile.zoo.claimed=REWARDS.map(reward=>reward.id);
  }
  if(options.kind&&options.id){profile[options.kind][options.id]={...initialProgress(),...options.progress};profile.lastActivity={kind:options.kind,id:options.id};}
  const profiles=[profile,...Array.from({length:(options.profiles??1)-1},(_,i)=>createProfile(options.longNames?longNickname(i+2):`独立档案 ${i+2}`))];
  return{version:1,activeId:profile.id,profiles,savedAt:Date.now()};
}
async function boot(page:Page,options:Fixture={}){
  await page.addInitScript(({key,data})=>{
    localStorage.setItem(key,JSON.stringify(data));
    // Reproducible quiz distractors, never a real child's profile/checkpoint.
    let random=731;Math.random=()=>((random=(random*16807)%2147483647)/2147483647);
  },{key:STORAGE_KEY,data:fixture(options)});
  await page.goto(origin);
  await expect(page.getByRole('button',{name:'汉字冒险',exact:true})).toBeVisible();
}
async function openWord(page:Page,char:string,stage=0,progress:Partial<LessonProgress>={}){
  const word=words.find(item=>item.char===char);if(!word)throw Error(`Missing course character ${char}`);
  await boot(page,{kind:'hanzi',id:word.id,progress:{stage,...progress}});
  await page.getByRole('button',{name:'继续我的冒险',exact:true}).click();
  await expect(page.getByRole('dialog',{name:`${char}字学习`,exact:true})).toBeVisible();
  return word;
}
async function openPoem(page:Page,poem:Poem,stage=0,progress:Partial<LessonProgress>={}){
  await boot(page,{kind:'poems',id:poem.id,progress:{stage,...progress}});
  await page.getByRole('button',{name:`继续《${poem.title}》`,exact:true}).click();
  await expect(page.getByRole('dialog',{name:`${poem.title}诗词学习`,exact:true})).toBeVisible();
}
async function parents(page:Page,profiles=1,longNames=false){
  await boot(page,{profiles,longNames});await page.getByRole('button',{name:'家长小屋',exact:true}).click();
  await page.getByLabel('家长验证答案',{exact:true}).fill('13');
  await page.getByRole('button',{name:'打开家长小屋',exact:true}).click();
  await expect(page.locator('.parents-page')).toBeVisible();
}
async function parentView(page:Page,name:string){
  const navigation=page.getByRole('navigation',{name:'家长小屋分页',exact:true});
  if(await navigation.count())await navigation.getByRole('button',{name,exact:true}).click();
}

type LayoutReport={label:string;viewport:{width:number;height:number};safeAreaInsets:{top:number;right:number;bottom:number;left:number};document:{height:number;clientHeight:number;width:number;clientWidth:number};failures:string[];containers:{name:string;overflowY:string;excess:number}[];controlCount:number};
async function measure(page:Page,label:string,scope?:string):Promise<LayoutReport>{
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  return page.evaluate(({label,requestedScope})=>{
    const tolerance=2,failures:string[]=[],containers:{name:string;overflowY:string;excess:number}[]=[];
    const visible=(element:Element)=>{const s=getComputedStyle(element),r=element.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity)>.04&&r.width>0&&r.height>0&&!element.closest('[inert],[aria-hidden="true"]');};
    const dialogs=[...document.querySelectorAll<HTMLElement>('[role="dialog"]')].filter(visible);
    const root=requestedScope?document.querySelector<HTMLElement>(requestedScope):dialogs.at(-1)??document.querySelector<HTMLElement>('.app-frame');
    if(!root)throw Error(`Missing active layout scope ${requestedScope??'application'}`);
    const viewport={width:innerWidth,height:innerHeight},scroll=document.scrollingElement!;
    const insetProbe=document.createElement('div');
    insetProbe.style.cssText='position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';document.body.append(insetProbe);
    const insetStyle=getComputedStyle(insetProbe),safeAreaInsets={top:parseFloat(insetStyle.paddingTop),right:parseFloat(insetStyle.paddingRight),bottom:parseFloat(insetStyle.paddingBottom),left:parseFloat(insetStyle.paddingLeft)};insetProbe.remove();
    const name=(element:Element)=>(element.getAttribute('aria-label')||element.getAttribute('data-testid')||`${element.tagName.toLowerCase()}.${[...element.classList].slice(0,2).join('.')}: ${(element.textContent??'').replace(/\s+/g,' ').trim().slice(0,45)}`);
    const rounded=(value:number)=>Math.round(value*10)/10;
    if(scroll.scrollHeight>scroll.clientHeight+tolerance)failures.push(`document vertical overflow ${scroll.scrollHeight-scroll.clientHeight}px`);
    if(scroll.scrollWidth>scroll.clientWidth+tolerance)failures.push(`document horizontal overflow ${scroll.scrollWidth-scroll.clientWidth}px`);
    // Functional panels must fit even when overflow:hidden is used. Decorative
    // SVG/scenery clipping is intentional and is not itself a functional panel;
    // every interactive target inside those scenes is checked separately below.
    const panelSelector='.main-content,.main-frame,.home-page,.library-page,.hanzi-course,.poem-card-grid,.parents-page,.parent-columns,.profile-list,.profile-dropdown,.modal,.pwa-guide,.lesson-overlay,.lesson-shell,.lesson-content,.word-play,.wp-game-content,.poem-reading,.poem-paper,.poem-lines,.story-pages,.poem-today,.line-order,.ordered-lines,.line-options,.recite-final,.hidden-poem,.zoo-page,.zoo-world-layout,.zoo-care-panel,.zoo-collection,.zoo-rewards,.zoo-reward-grid';
    const panels=[...(root.matches(panelSelector)?[root]:[]),...root.querySelectorAll<HTMLElement>(panelSelector)].filter(visible);
    for(const panel of panels){const excess=panel.scrollHeight-panel.clientHeight;if(excess>tolerance){const item={name:name(panel),overflowY:getComputedStyle(panel).overflowY,excess};containers.push(item);failures.push(`${item.name}: vertical content exceeds panel by ${excess}px (${item.overflowY})`);}}
    // Catch additional named scroll containers introduced by a future layout.
    for(const element of [...root.querySelectorAll<HTMLElement>('*')].filter(visible)){
      const s=getComputedStyle(element);
      if(['auto','scroll','overlay'].includes(s.overflowY)&&element.scrollHeight>element.clientHeight+tolerance&&!panels.includes(element))failures.push(`${name(element)}: vertical scroll container ${element.scrollHeight-element.clientHeight}px`);
    }
    const clipCheck=(element:Element,rect=element.getBoundingClientRect(),includeSelf=false)=>{
      if(rect.top<-tolerance||rect.bottom>viewport.height+tolerance||rect.left<-tolerance||rect.right>viewport.width+tolerance)failures.push(`${name(element)}: outside viewport [${[rect.left,rect.top,rect.right,rect.bottom].map(rounded).join(',')}]`);
      let ancestor=includeSelf?element as HTMLElement:element.parentElement;
      while(ancestor&&ancestor!==document.body){
        const s=getComputedStyle(ancestor),clip=ancestor.getBoundingClientRect();
        if(['hidden','clip','auto','scroll'].includes(s.overflowY)&&(rect.top<clip.top-tolerance||rect.bottom>clip.bottom+tolerance))failures.push(`${name(element)}: vertically clipped by ${name(ancestor)}`);
        if(['hidden','clip','auto','scroll'].includes(s.overflowX)&&(rect.left<clip.left-tolerance||rect.right>clip.right+tolerance))failures.push(`${name(element)}: horizontally clipped by ${name(ancestor)}`);
        ancestor=ancestor.parentElement;
      }
    };
    const selector='button,input,select,textarea,a[href],[role="button"],label.file-input-label,.trace-grid,.wp-rub-surface,.wp-fallback-card,.zoo-bath-surface';
    const controls=[...root.querySelectorAll<HTMLElement>(selector)].filter(visible);
    for(const element of controls){
      clipCheck(element);
      const rect=element.getBoundingClientRect(),s=getComputedStyle(element);
      if(element instanceof HTMLButtonElement||element instanceof HTMLInputElement||element instanceof HTMLSelectElement||element.tagName==='A'){
        if(s.pointerEvents!=='none'&&!(element instanceof HTMLButtonElement&&element.disabled)){
          const hit=document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2);
          if(hit&&!element.contains(hit)&&!hit.contains(element)&&rect.top>=0&&rect.bottom<=viewport.height&&rect.left>=0&&rect.right<=viewport.width)failures.push(`${name(element)}: center is covered by ${name(hit)}`);
        }
      }
      // Explore cards contain rotated decorative pictures that may extend
      // outside their mask. Their title, description and progress text are
      // measured individually below rather than treating artwork as content.
      if(!element.matches('.explore-card')&&['hidden','clip'].includes(s.overflowY)&&element.scrollHeight>element.clientHeight+tolerance)failures.push(`${name(element)}: its content is vertically clipped`);
    }
    const textSelector='h1,h2,h3,h4,p,.example-sentence,.quiz-feedback,.gentle-hint,.poem-line,.poem-ruby,.explore-progress,.stage-node b,.parent-view-tabs button,.profile-row small,.profile-row b,.profile-dropdown button';
    for(const element of [...root.querySelectorAll<HTMLElement>(textSelector)].filter(visible)){
      clipCheck(element);
      const range=document.createRange();range.selectNodeContents(element);
      for(const rect of [...range.getClientRects()])if(rect.width&&rect.height)clipCheck(element,rect,true);
      const s=getComputedStyle(element);
      if(['hidden','clip','auto','scroll'].includes(s.overflowY)&&element.scrollHeight>element.clientHeight+tolerance)failures.push(`${name(element)}: meaningful text is vertically clipped`);
      if(['hidden','clip','auto','scroll'].includes(s.overflowX)&&element.scrollWidth>element.clientWidth+tolerance)failures.push(`${name(element)}: meaningful text is horizontally clipped`);
    }
    return{label,viewport,safeAreaInsets,document:{height:scroll.scrollHeight,clientHeight:scroll.clientHeight,width:scroll.scrollWidth,clientWidth:scroll.clientWidth},failures:[...new Set(failures)],containers,controlCount:controls.length};
  },{label,requestedScope:scope});
}
async function fits(page:Page,testInfo:TestInfo,label:string,scope?:string){
  const report=await measure(page,label,scope);
  await testInfo.attach(`layout-${label.replace(/[^\w-]+/g,'-')}`,{body:JSON.stringify(report,null,2),contentType:'application/json'});
  if(process.env.IPAD_LAYOUT_DIAGNOSTICS==='1')console.log(`LAYOUT ${JSON.stringify({label,viewport:report.viewport,safeAreaInsets:report.safeAreaInsets,document:report.document,containers:report.containers.slice(0,3),failures:report.failures.slice(0,5),failureCount:report.failures.length,controlCount:report.controlCount})}`);
  if(safeInsets){expect.soft(report.safeAreaInsets.top,`${label}: top inset emulation reached CSS env`).toBe(safeInsets);expect.soft(report.safeAreaInsets.bottom,`${label}: bottom inset emulation reached CSS env`).toBe(safeInsets);}
  expect.soft(report.controlCount,`${label}: real operations must be rendered`).toBeGreaterThan(0);
  expect.soft(report.failures,`${label}: no scrolling, clipping or inaccessible operation`).toEqual([]);
}

// Twenty course-backed scene variants plus the generic vocabulary game.
// Sunrise and night share one implementation. Snow adds the twentieth unique
// semantic implementation through a clearly separate component fixture: it
// is currently absent from the 1,000-character course.
// Nature variants share handlers but exercise different art and filter states.
const games=[['日','sunrise'],['月','night'],['水','water'],['雨','drag umbrella'],['风','wind'],['木','plant'],['猫','feed'],['鸟','travel'],['大','compare'],['上','direction'],['一','count'],['手','wash'],['耳','hearing'],['目','eyes'],['头','body'],['门','opening'],['米','bowl'],['瓜','peel'],['红','color'],['山','nature'],['火','nature'],['云','nature'],['叶','nature'],['虫','nature'],['龙','generic reveal']] as const;

let snowBundle:string|undefined;
async function snowLayoutFixture(page:Page){
  if(!snowBundle){
    const word={...words[0],id:'layout-fixture-snow',char:'雪',pinyin:'xuě'};
    snowBundle=buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import WordPlay from './src/components/WordPlay';createRoot(document.getElementById('snow-root')).render(React.createElement(WordPlay,{word:${JSON.stringify(word)},onSpeak:()=>{},onComplete:()=>{}}));`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'}).outputFiles[0].text;
  }
  const style=['styles.css','word-play.css','ipad-layout.css'].map(file=>readFileSync(new URL(`../src/${file}`,import.meta.url),'utf8')).join('\n');
  const body=`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${style}</style><div class="lesson-overlay" role="dialog" aria-label="Snow component layout fixture"><div class="lesson-shell"><header class="lesson-header"><button class="text-button">回汉字冒险</button><div class="lesson-title">雪</div><button class="icon-button">×</button></header><div class="stage-track">${['玩字','认字','练习','写字','朗读','过关'].map((label,index)=>`<div class="stage-node ${index===0?'current':''}"><span>${index+1}</span><b>${label}</b></div>`).join('')}</div><main class="lesson-content lesson-stage-0" id="snow-root"></main><footer class="lesson-footer"><span>动动小手，慢慢发现</span></footer></div></div><script>${snowBundle.replace(/<\/script/gi,'<\\/script')}</script>`;
  await page.route('**/__ipad-layout-snow',route=>route.fulfill({contentType:'text/html',body}));await page.goto(`${origin}/__ipad-layout-snow`);
}

async function completeGame(page:Page,char:string,info:TestInfo){
  const click=async(name:string)=>page.getByRole('button',{name,exact:true}).click();
  switch(char){
    case '日':case '门':case '瓜':await page.getByRole('slider').press('End');break;
    case '月':for(let i=1;i<=3;i++)await click(`点亮第${i}颗星星`);break;
    case '水':for(let i=0;i<3;i++)await click('浇一点水');break;
    case '雨':await click('拿起雨伞');await click('把伞撑在小朋友头顶');break;
    case '风':for(let i=0;i<3;i++)await click('呼——吹一阵风');break;
    case '木':await click('第1个土坑种种子');await click('给种子浇水');break;
    case '猫':for(let i=0;i<2;i++){await click('选小鱼');await click('把食物送给小猫');}break;
    case '鸟':for(let i=1;i<=3;i++)await click(`第${i}个飞行圈`);break;
    case '大':await click('右边的皮球');break;
    case '上':await click('向上移动');break;
    case '一':await click('第1颗星星');break;
    case '手':{
      await click('加一点肥皂');
      const surface=page.locator('.wp-rub-surface'),box=(await surface.boundingBox())!;
      // This matrix exercises layout and completion. Native multi-touch and
      // cancellation are tested separately in ipad-touch.spec.ts.
      for(const [x,y]of [[39,36],[59,39],[48,57],[61,67]]){
        await page.mouse.move(box.x+box.width*(x-10)/100,box.y+box.height*y/100);
        await page.mouse.down();await page.mouse.move(box.x+box.width*(x+10)/100,box.y+box.height*y/100,{steps:8});await page.mouse.up();
      }break;
    }
    case '耳':await click('看本轮提示');await click('选择铃铛');await click('看本轮提示');await click('选择小鼓');break;
    case '目':await click('观察第2幅小图');await click('观察第5幅小图');break;
    case '头':for(let i=0;i<3;i++)await click('点点头');break;
    case '米':for(const i of [1,3,5])await click(`第${i}份食物或物品`);break;
    case '红':await click('选择红色');for(let i=1;i<=3;i++)await click(`涂第${i}片花瓣`);break;
    case '山':for(let i=1;i<=3;i++)await click(`第${i}座山峰`);break;
    case '火':for(let i=1;i<=3;i++)await click(`点亮第${i}束画里的火光`);break;
    case '云':for(let i=1;i<=3;i++)await click(`第${i}朵白云`);break;
    case '叶':for(let i=1;i<=3;i++)await click(`第${i}片落叶`);break;
    case '虫':for(let i=1;i<=3;i++)await click(`第${i}只小虫`);break;
    case '龙':{
      const word=words.find(item=>item.char===char)!;
      const cover=page.locator('.wp-fallback-card');
      if(await cover.count()){
        const box=(await cover.boundingBox())!;
        await page.mouse.move(box.x+box.width/8,box.y+box.height/6);await page.mouse.down();
        for(let i=0;i<8;i++)await page.mouse.move(box.x+box.width*(i%4+.5)/4,box.y+box.height*(Math.floor(i/4)+.5)/3,{steps:3});
        await page.mouse.up();await expect(cover).toHaveCount(0);
      }
      await fits(page,info,'generic-vocabulary-phase');await page.locator('.wp-sentence-card').click();await click(word.words[0]);
      await fits(page,info,'generic-meaning-phase');await click(word.meaning);break;
    }
    default:throw Error(`Missing actual completion actions for ${char}`);
  }
  await expect(page.getByRole('button',{name:'认识这个字',exact:true})).toBeVisible();
}

async function remainingPages(page:Page,info:TestInfo,buttonName:string,label:string,scope?:string){
  const next=page.getByRole('button',{name:buttonName,exact:true});let count=0;
  while(await next.count()&&await next.isEnabled()){
    if(++count>60)throw Error(`Pagination did not finish: ${buttonName}`);
    await next.click();await fits(page,info,`${label}-page-${count+1}`,scope);
  }
}

test('layout checker rejects hidden overflow, offscreen controls and covered actions',async({page})=>{
  await page.setContent('<style>body{margin:0}.app-frame{width:300px}.main-content{height:80px;overflow:hidden}button{height:44px;margin-top:100px}</style><div class="app-frame"><main class="main-content"><button>Hidden primary action</button></main></div>');
  const clipped=await measure(page,'checker-clipped');
  expect(clipped.failures.some(message=>message.includes('vertical content exceeds panel'))).toBe(true);
  expect(clipped.failures.some(message=>message.includes('vertically clipped'))).toBe(true);
  await page.setContent('<style>body{margin:0}.app-frame{position:fixed;inset:0}button{position:absolute;top:calc(100vh + 20px);height:44px}</style><div class="app-frame"><button>Offscreen primary action</button></div>');
  expect((await measure(page,'checker-offscreen')).failures.some(message=>message.includes('outside viewport'))).toBe(true);
  await page.setContent('<style>body{margin:0}button{position:absolute;left:20px;top:20px;width:100px;height:44px}.cover{position:absolute;left:20px;top:20px;width:100px;height:44px;background:black}</style><div class="app-frame"><button>Covered primary action</button><div class="cover"></div></div>');
  expect((await measure(page,'checker-covered')).failures.some(message=>message.includes('center is covered'))).toBe(true);
});

type CatalogKind='hanzi'|'poems';
async function catalogGeometry(page:Page,kind:CatalogKind){
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
  return page.evaluate(kind=>{
    const rect=(element:Element)=>{const r=element.getBoundingClientRect();return{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
    const name=(element:Element|null)=>element?`${element.tagName.toLowerCase()}.${element.getAttribute('class')??''}: ${(element.getAttribute('aria-label')??element.textContent??'').replace(/\s+/g,' ').trim().slice(0,80)}`:null;
    const controls=[...document.querySelectorAll<HTMLElement>(`${kind==='hanzi'?'.word-tile':'.poem-card'},.pagination button`)].map(element=>{
      const bounds=rect(element),x=bounds.left+bounds.width/2,y=bounds.top+bounds.height/2,hit=document.elementFromPoint(x,y);
      return{name:name(element),rect:bounds,clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,overflowY:getComputedStyle(element).overflowY,
        disabled:element instanceof HTMLButtonElement&&element.disabled,
        center:{x,y,inViewport:x>=0&&y>=0&&x<innerWidth&&y<innerHeight,receivesEvents:Boolean(hit&&element.contains(hit)),hit:name(hit)}};
    });
    const panels=[...document.querySelectorAll<HTMLElement>('.library-page,.hanzi-course,.poem-card-grid,.pagination')].map(element=>({
      name:name(element),rect:rect(element),clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,overflowY:getComputedStyle(element).overflowY}));
    return{viewport:{width:innerWidth,height:innerHeight},controls,panels};
  },kind);
}
async function firstCatalogCourse(page:Page,kind:CatalogKind):Promise<{id:string;button:Locator;dialog:string}>{
  if(kind==='hanzi'){
    const char=await page.locator('.word-tile b').first().innerText(),word=words.find(word=>word.char===char)!;
    return{id:word.id,button:page.getByRole('button',{name:`学习${char}字`,exact:true}),dialog:`${char}字学习`};
  }
  const first=page.locator('.poem-card').first(),title=await first.locator('h2').innerText(),author=await first.locator('.poem-author').innerText(),line=await first.locator('p').innerText();
  const poem=poems.find(poem=>poem.title===title&&`${poem.dynasty} · ${poem.author}`===author&&poem.lines[0]===line)!;
  return{id:poem.id,button:page.locator('.poem-card').filter({has:page.getByRole('heading',{name:title,exact:true})})
    .filter({has:page.getByText(author,{exact:true})}).filter({has:page.getByText(line,{exact:true})}),dialog:`${title}诗词学习`};
}

// These two semantic navigation checks sit outside the fixed-size layout
// matrix. They drive actual pagination and browser resize, not device rotation.
for(const kind of ['hanzi','poems'] as const)test(`${kind} catalog browsing position survives native resize`,async({page},info)=>{
  test.setTimeout(60000);
  const wide={width:1440,height:1000},tablet={width:1180,height:820},phone={width:390,height:844},landscape={width:844,height:390};
  await page.setViewportSize(wide);
  await page.addInitScript(({key,data})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));},{key:STORAGE_KEY,data:fixture()});
  await page.goto(origin);await page.getByRole('button',{name:kind==='hanzi'?'汉字冒险':'诗词花园',exact:true}).click();
  const cards=page.locator(kind==='hanzi'?'.word-tile':'.poem-card'),next=page.getByRole('button',{name:kind==='hanzi'?'下一片小岛':'下一页',exact:true});
  const wideCount=kind==='hanzi'?50:12,tabletCount=kind==='hanzi'?10:4;
  await expect(cards).toHaveCount(wideCount);await next.click();
  const anchor=await firstCatalogCourse(page,kind);
  const preserve=async(target:{width:number;height:number},count:number,course:typeof anchor,label:string,allControls=false)=>{
    await test.step(`${label}: preserve ${course.id}`,async()=>{
      await page.setViewportSize(target);await expect(cards).toHaveCount(count);
      await info.attach(`catalog-${label}`,{contentType:'application/json',body:JSON.stringify({engine,kind,anchor:course.id,
        geometry:await catalogGeometry(page,kind),pagination:await page.locator('.pagination span').innerText(),
        rendered:await cards.allTextContents()})});
      await expect(course.button).toBeVisible();await course.button.click({trial:true});
      // A short window may scroll; each course and both pagination actions
      // must remain reachable through normal browser actionability checks.
      if(allControls){
        for(const card of await cards.all()){
          await card.click({trial:true});
          if(kind==='poems'){
            const clipped=await card.evaluate(element=>{
              const card=element.getBoundingClientRect();
              return [...element.querySelectorAll<HTMLElement>('h2,.poem-author,p,.poem-card-bottom')].map(text=>{
                const bounds=text.getBoundingClientRect();
                return{text:text.innerText,top:bounds.top,bottom:bounds.bottom,cardTop:card.top,cardBottom:card.bottom};
              }).filter(text=>text.top<text.cardTop-2||text.bottom>text.cardBottom+2);
            });
            expect(clipped,'Poem title, author, first line and footer fit vertically inside their card').toEqual([]);
          }
        }
        for(const button of await page.locator('.pagination button:enabled').all())await button.click({trial:true});
      }
    });
  };
  await preserve(tablet,tabletCount,anchor,'wide-to-tablet');
  await preserve({width:1366,height:820},tabletCount,anchor,'tablet-upper-boundary');
  await preserve({width:1367,height:1000},wideCount,anchor,'outside-upper-boundary');
  await preserve(wide,wideCount,anchor,'return-wide');
  await preserve(phone,wideCount,anchor,'phone-portrait');
  await preserve({width:700,height:844},wideCount,anchor,'outside-lower-boundary');
  await preserve({width:701,height:820},tabletCount,anchor,'tablet-lower-boundary');
  await preserve(landscape,tabletCount,anchor,'phone-landscape-width',true);
  await preserve({width:844,height:700},tabletCount,anchor,'short-window-700',true);
  await preserve({width:844,height:701},tabletCount,anchor,'short-window-701',true);
  await preserve({width:701,height:720},tabletCount,anchor,'narrow-short-window',true);
  await preserve(phone,wideCount,anchor,'return-phone');
  await page.setViewportSize(tablet);await expect(cards).toHaveCount(tabletCount);
  await page.locator('.filter-tabs').getByRole('button',{name:'全部',exact:true}).click();
  // Native deep paging exceeds the old wide-screen page range, exposing an
  // incorrect clamp to the last page without injecting any library state.
  for(let index=0;index<(kind==='hanzi'?20:27);index++)await next.click();
  const deep=await firstCatalogCourse(page,kind);
  await preserve(wide,wideCount,deep,'deep-tablet-to-wide');await expect(next).toBeEnabled();
  await preserve(tablet,tabletCount,deep,'return-deep-tablet');
  await deep.button.click();await expect(page.getByRole('dialog',{name:deep.dialog,exact:true})).toBeVisible();
});

test('desktop application window sidebar navigation remains reachable after native resize',async({browser},info)=>{
  test.setTimeout(60000);
  // A regular desktop context supports native wheel input in both engines.
  // These are browser window sizes, not physical tablet/phone acceptance.
  const context=await browser.newContext({viewport:{width:1180,height:720},isMobile:false}),errors:string[]=[];let crashed=false;
  type WheelRecord={trusted:boolean;deltaY:number;inSidebar:boolean};
  await context.addInitScript(({key,data})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));
    const events:{trusted:boolean;deltaY:number;inSidebar:boolean}[]=[];
    Object.defineProperty(window,'__sidebarWheelEvents',{value:events});
    document.addEventListener('wheel',event=>events.push({trusted:event.isTrusted,deltaY:event.deltaY,
      inSidebar:event.target instanceof Element&&Boolean(event.target.closest('.sidebar'))}),{capture:true,passive:true});
  },{key:STORAGE_KEY,data:fixture()});
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));page.on('crash',()=>crashed=true);
  const sidebar=page.locator('.sidebar');
  const geometry=async()=>{
    await page.evaluate(()=>document.fonts.ready);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    return page.evaluate(()=>{
      const measure=(element:HTMLElement)=>{
        const r=element.getBoundingClientRect(),s=getComputedStyle(element),x=r.left+r.width/2,y=r.top+r.height/2,hit=document.elementFromPoint(x,y);
        return{name:element.getAttribute('aria-label')??element.className,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
          clientHeight:element.clientHeight,scrollHeight:element.scrollHeight,scrollTop:element.scrollTop,position:s.position,overflowY:s.overflowY,
          center:{x,y,inViewport:x>=0&&y>=0&&x<innerWidth&&y<innerHeight,receivesEvents:Boolean(hit&&element.contains(hit)),hit:hit?.getAttribute('aria-label')??hit?.tagName??null}};
      };
      return{viewport:{width:innerWidth,height:innerHeight},windowScrollY:scrollY,sidebar:measure(document.querySelector<HTMLElement>('.sidebar')!),
        controls:[...document.querySelectorAll<HTMLElement>('.sidebar button')].map(measure),
        wheels:(window as unknown as {__sidebarWheelEvents:WheelRecord[]}).__sidebarWheelEvents};
    });
  };
  const attach=async(label:string)=>info.attach(`sidebar-${label}`,{contentType:'application/json',body:JSON.stringify({engine,...await geometry()})});
  const wheel=async(delta:number,label:string)=>{
    const from=await page.evaluate(()=>(window as unknown as {__sidebarWheelEvents:WheelRecord[]}).__sidebarWheelEvents.length),bounds=(await sidebar.boundingBox())!;
    await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.wheel(0,delta);
    await page.waitForFunction(({from,direction})=>(window as unknown as {__sidebarWheelEvents:WheelRecord[]}).__sidebarWheelEvents.slice(from)
      .some(event=>event.trusted&&event.inSidebar&&Math.sign(event.deltaY)===direction),{from,direction:Math.sign(delta)},{timeout:1500});
    await attach(label);
  };
  try{
    await page.goto(origin);
    for(const target of [
      {label:'standard-control',width:1180,height:720},
      {label:'short-compact',width:844,height:390},
      {label:'taller-compact-control',width:844,height:500},
      {label:'short-wide',width:1440,height:500},
      {label:'return-standard',width:1180,height:720},
    ])await test.step(target.label,async()=>{
      await page.setViewportSize({width:target.width,height:target.height});await attach(`${target.label}-before`);
      const needsScroll=await sidebar.evaluate(element=>element.scrollHeight>element.clientHeight+2);
      if(needsScroll){
        await wheel(await sidebar.evaluate(element=>element.scrollHeight),`${target.label}-wheel-down`);
        await page.waitForFunction(()=>document.querySelector<HTMLElement>('.sidebar')!.scrollTop>0,undefined,{timeout:1500});
      }
      const ready=await geometry(),parent=ready.controls.find(control=>control.name==='家长小屋')!;
      expect(parent.center.inViewport,'The Parents entry is inside the window before clicking').toBe(true);
      expect(parent.center.receivesEvents,'The Parents entry receives native input before clicking').toBe(true);
      expect(parent.rect.top).toBeGreaterThanOrEqual(0);expect(parent.rect.bottom).toBeLessThanOrEqual(ready.viewport.height);
      await sidebar.getByRole('button',{name:'家长小屋',exact:true}).click();
      await expect(page.getByLabel('家长验证答案',{exact:true})).toBeVisible();
      await page.keyboard.press('Escape');await expect(page.getByLabel('家长验证答案',{exact:true})).not.toBeVisible();
      if(needsScroll){
        await wheel(-await sidebar.evaluate(element=>element.scrollHeight),`${target.label}-wheel-up`);
        await page.waitForFunction(()=>document.querySelector<HTMLElement>('.sidebar')!.scrollTop===0,undefined,{timeout:1500});
      }
      const top=await geometry(),brand=top.controls.find(control=>control.name==='回到字游小岛')!;
      expect(brand.center.inViewport,'The home brand is inside the window before clicking').toBe(true);
      expect(brand.center.receivesEvents,'The home brand receives native input before clicking').toBe(true);
      expect(brand.rect.top).toBeGreaterThanOrEqual(0);expect(brand.rect.bottom).toBeLessThanOrEqual(top.viewport.height);
      await sidebar.getByRole('button',{name:'回到字游小岛',exact:true}).click();await expect(page.locator('.home-page')).toBeVisible();
      for(const [name,content] of [['我的小岛','.home-page'],['汉字冒险','.library-page:not(.poetry-library)'],['诗词花园','.poetry-library'],['我的动物园','.zoo-page']]){
        const button=sidebar.getByRole('button',{name,exact:true});await button.click();await expect(button).toHaveClass(/active/);
        await expect(page.locator(content)).toBeVisible();
      }
      await attach(`${target.label}-all-actions-complete`);
    });
  }catch(error){
    try{
      if(crashed)throw Error('Page crashed before sidebar failure diagnostics could be captured.');
      await attach('failure');await info.attach('desktop-sidebar-failure',{body:await page.screenshot(),contentType:'image/png'});
    }catch(diagnosticError){await info.attach('desktop-sidebar-diagnostic-error',{body:String(diagnosticError),contentType:'text/plain'});}
    throw error;
  }finally{
    await context.close();expect(errors,'No application errors during native sidebar navigation').toEqual([]);
    expect(crashed,'The native sidebar browser page did not crash').toBe(false);
  }
});

for(const viewport of viewports){
  test.describe(`${engine} ${viewport.name} ${viewport.width}x${viewport.height}`,()=>{
    test.use({viewport:{width:viewport.width,height:viewport.height}});

    test('home overview and profile menu',async({page},info)=>{
      await boot(page,{profiles:20,due:true,longNames:true});await fits(page,info,'home-due-reviews');
      await page.getByRole('button',{name:'切换儿童档案',exact:true}).click();await fits(page,info,'profile-menu','.profile-dropdown');
      await remainingPages(page,info,'下一页儿童档案','profile-menu','.profile-dropdown');
      await page.locator('.profile-dropdown').getByRole('button',{name:new RegExp(longNickname(20))}).click();
      await expect(page.getByRole('button',{name:'切换儿童档案',exact:true})).toContainText(longNickname(20));await fits(page,info,'home-switched-profile');
    });
    test('hanzi catalog, next page and filtered result',async({page},info)=>{
      await boot(page);await page.getByRole('button',{name:'汉字冒险',exact:true}).click();await fits(page,info,'hanzi-catalog');
      await page.getByRole('button',{name:'下一片小岛',exact:true}).click();await fits(page,info,'hanzi-next-page');
      await page.getByLabel('搜索汉字',{exact:true}).fill('亡');await fits(page,info,'hanzi-search');
      await expect(page.getByRole('button',{name:'学习亡字',exact:true})).toBeVisible();
    });
    test('poem catalog, next page and difficulty filter',async({page},info)=>{
      await boot(page);await page.getByRole('button',{name:'诗词花园',exact:true}).click();await fits(page,info,'poem-catalog');
      await page.getByRole('button',{name:'下一页',exact:true}).click();await fits(page,info,'poem-next-page');
      await page.getByLabel('诗词难度',{exact:true}).selectOption('亲子进阶');await fits(page,info,'poem-filter');
    });
    test('parent gate and installation guide modal',async({page},info)=>{
      await boot(page);await page.getByRole('button',{name:'家长小屋',exact:true}).click();await fits(page,info,'parent-gate');
      await page.getByRole('button',{name:'关闭家长验证',exact:true}).click();
      await page.getByRole('button',{name:'添加到主屏幕',exact:true}).click();await fits(page,info,'installation-guide');
    });
    test('parents every settings, profile, backup and disclosure page',async({page},info)=>{
      await parents(page,20,true);
      for(const view of ['学习节奏','声音与音乐','儿童档案','备份与恢复','课程说明']){await parentView(page,view);await fits(page,info,`parents-${view}`);}
      await parentView(page,'儿童档案');
      await remainingPages(page,info,'下一页档案','parents-profiles');
    });
    test('backup restore confirmation stays operable',async({page},info)=>{
      await parents(page,20,true);await parentView(page,'备份与恢复');
      const imported=fixture({profiles:20,longNames:true});expect(imported.profiles.every(profile=>profile.name.length===16)).toBe(true);
      await page.locator('input[type="file"]').setInputFiles({name:'isolated-fixture.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
      await expect(page.getByRole('button',{name:'确认恢复这份备份',exact:true})).toBeVisible();await fits(page,info,'backup-confirmation');
      await expect(page.locator('.import-confirm')).toContainText('将恢复 20 个儿童档案');
      for(let index=0;index<10;index++){
        await expect(page.locator('.import-profile-names')).toContainText(longNickname(index*2+1));
        await expect(page.locator('.import-profile-names')).toContainText(longNickname(index*2+2));
        if(index<9){await page.getByRole('button',{name:'下一页备份档案',exact:true}).click();await fits(page,info,`backup-confirmation-page-${index+2}`);}
      }
    });
    test('rest reminder dialog',async({page},info)=>{
      await page.clock.install();await boot(page,{rest:true});await page.clock.fastForward(5*60*1000+16000);
      await expect(page.getByRole('dialog',{name:'休息提醒',exact:true})).toBeVisible();await fits(page,info,'rest-reminder');
    });
    test('zoo feed, bathing, placement and name editing',async({page},info)=>{
      await boot(page);await page.getByRole('button',{name:'我的动物园',exact:true}).click();await fits(page,info,'zoo-entrance');await page.getByRole('button',{name:'进入小动物乐园',exact:true}).click();await fits(page,info,'zoo-feed');
      await remainingPages(page,info,'下一页食物','zoo-foods');
      await page.getByRole('button',{name:'洗澡',exact:true}).click();await fits(page,info,'zoo-bath');
      await page.getByRole('button',{name:'布置动物园',exact:true}).click();await fits(page,info,'zoo-placement');
      await page.getByRole('button',{name:'给动物园改名',exact:true}).click();await fits(page,info,'zoo-name');
    });
    test('all reward invitation pages',async({page},info)=>{
      await boot(page);await page.getByRole('button',{name:'我的动物园',exact:true}).click();
      await page.getByRole('button',{name:/小岛邀请函/}).click();
      await page.getByRole('button',{name:'查看全部 160 份奖励',exact:true}).click();await fits(page,info,'zoo-all-rewards');
      await remainingPages(page,info,'奖励下一页','zoo-rewards');
    });
    test('mature zoo all region pages and building details',async({page},info)=>{
      await boot(page,{matureZoo:true});await page.getByRole('button',{name:'我的动物园',exact:true}).click();await fits(page,info,'mature-zoo-entrance');
      for(const region of ZOO_REGIONS){
        await page.getByRole('button',{name:`进入${region.name}`,exact:true}).click();await fits(page,info,`region-${region.id}`);
        await remainingPages(page,info,'园区场地下一页',`mature-${region.id}`);
        const building=page.locator('.zoo-map-item--building').first();
        if(await building.count()){
          await building.click();await expect(page.getByRole('button',{name:'安排位置',exact:true})).toBeVisible();await fits(page,info,`building-${region.id}`);
          await page.getByRole('button',{name:'安排位置',exact:true}).click();await fits(page,info,`placement-${region.id}`);
        }
        await page.getByRole('button',{name:'返回园区',exact:true}).click();await fits(page,info,'return-regions');
      }
      await page.getByRole('button',{name:/小岛邀请函/}).click();await fits(page,info,'mature-zoo-earned-all');
    });

    for(const [char,game]of games)test(`WordPlay ${game} ${char}`,async({page},info)=>{
      await openWord(page,char);await expect(page.locator('.semantic-play')).toBeVisible();await fits(page,info,`wordplay-${game}`);
      await completeGame(page,char,info);await fits(page,info,`wordplay-${game}-complete`);
    });
    test('Snow component fixture initial and completed layouts',async({page},info)=>{
      await snowLayoutFixture(page);await expect(page.locator('.semantic-play')).toBeVisible();await fits(page,info,'snow-component-initial');
      const box=(await page.getByRole('button',{name:'按住送温暖',exact:true}).boundingBox())!;
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
      await expect(page.getByRole('button',{name:'认识这个字',exact:true})).toBeVisible();await page.mouse.up();await fits(page,info,'snow-component-complete');
    });
    test('hanzi stage 1 recognition with the longest course story',async({page},info)=>{
      await openWord(page,storyWord.char,1);await fits(page,info,'hanzi-recognition-muted');
      await expect(page.getByRole('button',{name:'静音学习：去找字朋友',exact:true})).toBeVisible();
      await expect(page.getByRole('button',{name:`听${storyWord.char}字读音`,exact:true})).toBeDisabled();
    });
    test('hanzi stage 2 practice feedback and continue',async({page},info)=>{
      await openWord(page,storyWord.char,2,{quizRound:1});await page.getByRole('button',{name:storyWord.meaning,exact:true}).click();await fits(page,info,'hanzi-practice-correct');
      await expect(page.getByRole('button',{name:'挑战完成',exact:true})).toBeVisible();
    });
    test('hanzi stage 3 completed writing canvas and continue',async({page},info)=>{
      const data=JSON.parse(readFileSync(new URL('../public/data/strokes/一.json',import.meta.url),'utf8'));
      await openWord(page,'一',3,{strokeIndex:data.strokes.length});await expect(page.getByRole('button',{name:'我的字写好啦',exact:true})).toBeVisible();await fits(page,info,'hanzi-writing-complete');
    });
    test('active writing lesson fits after orientation changes without losing progress',async({page},info)=>{
      const data=JSON.parse(readFileSync(new URL('../public/data/strokes/一.json',import.meta.url),'utf8'));
      await openWord(page,'一',3,{strokeIndex:data.strokes.length});await fits(page,info,'writing-before-rotation');
      const target=viewport.width<viewport.height?{width:1180,height:720}:{width:820,height:1080};
      await page.setViewportSize(target);await fits(page,info,'writing-after-rotation');
      await expect(page.getByRole('button',{name:'我的字写好啦',exact:true})).toBeVisible();
      await page.setViewportSize({width:viewport.width,height:viewport.height});await fits(page,info,'writing-after-return');
    });
    test('hanzi stage 4 sentence and parent confirmation',async({page},info)=>{
      await openWord(page,storyWord.char,4,{heardWord:true,heardSentence:true});await page.getByRole('button',{name:'一句话',exact:true}).click();
      await page.getByRole('button',{name:'家长确认：孩子已尝试读词语和句子',exact:true}).click();await fits(page,info,'hanzi-speaking-confirmed');
      await expect(page.getByRole('button',{name:'去过关',exact:true})).toBeVisible();
    });
    test('hanzi stage 5 final quiz feedback and continue',async({page},info)=>{
      await openWord(page,storyWord.char,5,{quizRound:1});await page.getByRole('button',{name:storyWord.words[0],exact:true}).click();await fits(page,info,'hanzi-final-correct');
    });
    test('hanzi stage 6 completion navigation',async({page},info)=>{await openWord(page,storyWord.char,6);await fits(page,info,'hanzi-completion');});

    test('short poem stage 0 listen and ready-to-continue',async({page},info)=>{
      await openPoem(page,shortPoem,0,{listenedLines:shortPoem.lines.map((_,i)=>i)});await fits(page,info,'short-poem-listen');
      await expect(page.getByRole('button',{name:'静音阅读：去看诗里的故事',exact:true})).toBeVisible();
    });
    test(`widest poem lines ${widePoem.title}`,async({page},info)=>{
      await openPoem(page,widePoem,0,{listenedLines:widePoem.lines.map((_,i)=>i)});await fits(page,info,'wide-poem-pinyin');
      await remainingPages(page,info,'下一页诗句','wide-poem-pinyin');
      await page.getByRole('button',{name:'收起拼音',exact:true}).click();await fits(page,info,'wide-poem-without-pinyin');
    });
    test(`longest interpretation story ${densePoem.title}`,async({page},info)=>{
      await openPoem(page,densePoem,1);
      await page.getByRole('button',{name:'诗里看见了什么？',exact:true}).click();await fits(page,info,'dense-poem-story');
      await remainingPages(page,info,'下一页故事','dense-poem-story');
    });
    for(let stage=0;stage<=6;stage++)test(`long poem stage ${stage} ${longPoem.title}`,async({page},info)=>{
      const progress:Partial<LessonProgress>={listenedLines:longPoem.lines.map((_,i)=>i),activityDone:true};
      if(stage===4)progress.recitation={phase:0,chunk:0,selected:[0,1,2,3],clozeRound:0};
      await openPoem(page,longPoem,stage,progress);
      if(stage===2||stage===5)await page.getByRole('button',{name:longPoem.question.options[longPoem.question.answer],exact:true}).click();
      await fits(page,info,`long-poem-stage-${stage}`);
      if(stage===0)await remainingPages(page,info,'下一页诗句','long-poem-listen');
      if(stage===1)for(const title of ['诗人是谁？','那时发生了什么？','诗里看见了什么？']){
        await page.getByRole('button',{name:title,exact:true}).click();await fits(page,info,`long-poem-story-${title}`);
        await remainingPages(page,info,'下一页故事',`long-poem-story-${title}`);
      }
      if(stage===3){await page.getByRole('button',{name:'今天的小发现',exact:true}).click();await fits(page,info,'long-poem-today-discovery');}
    });
    test('long poem recitation cloze phase',async({page},info)=>{
      await openPoem(page,longPoem,4,{recitation:{phase:1,chunk:0,selected:[],clozeRound:0}});await fits(page,info,'long-poem-recite-cloze');
    });
    test('long poem recitation hint and final parent-confirmed action',async({page},info)=>{
      await openPoem(page,longPoem,4,{recitation:{phase:2,chunk:0,selected:[],clozeRound:0}});
      await page.getByRole('button',{name:'看看提示',exact:true}).click();
      await page.getByRole('button',{name:'家长确认：孩子已尝试完整背诵',exact:true}).click();await fits(page,info,'long-poem-recite-confirmed');
      await expect(page.getByRole('button',{name:'记忆小桥走完啦',exact:true})).toBeVisible();
      await remainingPages(page,info,'下一页背诵诗句','long-poem-recite-confirmed');
    });
  });
}
