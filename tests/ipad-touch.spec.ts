import {test as base,expect,chromium,webkit,type Page,type CDPSession} from '@playwright/test';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {createProfile,initialProgress,STORAGE_KEY} from '../src/store';
import type {Hanzi,Profile,SaveData,StrokeData} from '../src/types';

const url=process.env.IPAD_TEST_URL??'http://127.0.0.1:5173';
const words=JSON.parse(readFileSync(new URL('../src/data/hanzi.json',import.meta.url),'utf8')) as Hanzi[];
type Position={x:number;y:number};
function recordTouchEvents(){
  type Entry={time:number;type:string;target:string;path:string[];x:number|null;y:number|null;pointerId:number|null;primary:boolean|null;defaultPrevented:boolean;activeTouches:number|null};
  const diagnostics=window as unknown as {__touchEvents:Entry[]};
  diagnostics.__touchEvents=[];
  const describe=(target:EventTarget|null)=>target instanceof Element?`${target.tagName.toLowerCase()}${target.id?`#${target.id}`:''}${target.getAttribute('class')?`.${target.getAttribute('class')!.trim().replace(/\s+/g,'.')}`:''}${target.getAttribute('aria-label')?`[${target.getAttribute('aria-label')}]`:''}`:String(target);
  for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture','touchstart','touchmove','touchend','touchcancel','click']){
    window.addEventListener(type,event=>{
      const pointer=event as PointerEvent,touch=event as TouchEvent,point=touch.changedTouches?.[0]??pointer;
      const entry:Entry={time:performance.now(),type,target:describe(event.target),path:event.composedPath().slice(0,8).map(describe),x:point.clientX??null,y:point.clientY??null,pointerId:pointer.pointerId??null,primary:pointer.isPrimary??null,defaultPrevented:event.defaultPrevented,activeTouches:touch.touches?.length??null};
      diagnostics.__touchEvents.push(entry);
      if(diagnostics.__touchEvents.length>3000)diagnostics.__touchEvents.shift();
      queueMicrotask(()=>{entry.defaultPrevented=event.defaultPrevented;});
    },{capture:true,passive:true});
  }
}
const test=base.extend<{engine:'chromium'|'webkit';page:Page}>({
  engine:['chromium',{option:true}],
  page:async({engine},use,testInfo)=>{
    // These launches are isolated from the user's Chrome and in-app browser.
    const requested=process.env.PLAYWRIGHT_CHANNEL;
    // Linux CI uses installed Playwright Chromium; an explicit "chromium"
    // also requests that bundled engine on a Mac with Google Chrome installed.
    const channel=requested==='chromium'?undefined:requested??(process.platform==='darwin'&&existsSync('/Applications/Google Chrome.app')?'chrome':undefined);
    const browser=await (engine==='chromium'?chromium.launch({channel}):webkit.launch());
    const context=await browser.newContext({viewport:{width:820,height:1180},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await context.addInitScript(recordTouchEvents);
    const page=await context.newPage();await page.evaluate(recordTouchEvents);
    const inputTrace:unknown[]=[];
    const tracing=engine==='chromium'&&process.env.TOUCH_DIAGNOSTICS==='1'?await context.newCDPSession(page):null;
    if(tracing){
      tracing.on('Tracing.dataCollected',event=>inputTrace.push(...event.value));
      await tracing.send('Tracing.start',{categories:'input,disabled-by-default-input',options:'record-as-much-as-possible',transferMode:'ReportEvents'});
    }
    try{await use(page);}finally{
      if(tracing){
        const complete=new Promise<void>(resolve=>tracing.once('Tracing.tracingComplete',()=>resolve()));
        await tracing.send('Tracing.end');await complete;
      }
      if(testInfo.status!==testInfo.expectedStatus||process.env.TOUCH_DIAGNOSTICS==='1'){
        const events=await page.evaluate(()=>({events:(window as unknown as {__touchEvents:unknown[]}).__touchEvents,timeOrigin:performance.timeOrigin,viewport:{innerWidth,innerHeight,scrollX,scrollY,visualScale:visualViewport?.scale},userAgent:navigator.userAgent}));
        if(tracing&&process.env.TOUCH_DIAGNOSTICS==='1'){
          const trace=inputTrace as {name?:string;args?:{type?:string}}[];
          console.info(JSON.stringify({touchDiagnostics:{test:testInfo.title,gestureFlingStart:trace.some(event=>event.args?.type==='GestureFlingStart'),filterTapSuppression:trace.filter(event=>event.name==='FilterTapSuppression').length,recordedClicks:(events.events as {type?:string}[]).filter(event=>event.type==='click').length}}));
        }
        mkdirSync(testInfo.outputDir,{recursive:true});
        const eventsPath=testInfo.outputPath('touch-events.json');writeFileSync(eventsPath,JSON.stringify(events,null,2));
        await testInfo.attach('touch-events',{path:eventsPath,contentType:'application/json'});
        if(tracing){
          const tracePath=testInfo.outputPath('chromium-input-trace.json');writeFileSync(tracePath,JSON.stringify({traceEvents:inputTrace}));
          await testInfo.attach('chromium-input-trace',{path:tracePath,contentType:'application/json'});
        }
      }
      await context.close();await browser.close();
    }
  },
});

// All profiles and checkpoints here are isolated test fixtures, not evidence of
// a child's learning. Chromium CDP touches target only Playwright's own browser.
async function seed(page:Page,char?:string,stage=0,strokeIndex=0){
  const profile=createProfile('触控测试员');profile.settings.sound=false;profile.settings.music=false;
  const word=char?words.find(item=>item.char===char)!:undefined;
  if(char&&!word)throw Error(`Missing test character ${char}`);
  if(word)profile.hanzi[word.id]={...initialProgress(),stage,strokeIndex};
  const data:SaveData={version:1,activeId:profile.id,profiles:[profile],savedAt:Date.now()};
  await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:STORAGE_KEY,value:data});
  await page.goto(url);
  if(word){
    await page.getByRole('button',{name:'汉字冒险',exact:true}).tap();
    await page.getByLabel('搜索汉字',{exact:true}).fill(char!);
    await page.getByRole('button',{name:`学习${char}字`,exact:true}).tap();
  }
  return word;
}
async function saved(page:Page):Promise<Profile>{
  return page.evaluate(key=>{const data=JSON.parse(localStorage.getItem(key)!);return data.profiles.find((profile:Profile)=>profile.id===data.activeId);},STORAGE_KEY);
}
async function center(page:Page,selector:string):Promise<Position>{
  await page.locator(selector).scrollIntoViewIfNeeded();
  const box=await page.locator(selector).boundingBox();if(!box)throw Error(`Missing ${selector}`);
  return{x:box.x+box.width/2,y:box.y+box.height/2};
}
class Touch {
  private points=new Map<number,Position>();
  constructor(private session:CDPSession){}
  private dispatch(type:'touchStart'|'touchMove'|'touchEnd'|'touchCancel'){
    return this.session.send('Input.dispatchTouchEvent',{type,touchPoints:[...this.points].map(([id,point])=>({...point,id,radiusX:8,radiusY:8,force:1}))});
  }
  async down(id:number,point:Position){this.points.set(id,point);await this.dispatch('touchStart');}
  async move(id:number,point:Position){this.points.set(id,point);await this.dispatch('touchMove');}
  async up(id:number){
    const point=this.points.get(id);if(!point)throw Error(`Touch ${id} is not active`);
    this.points.delete(id);
    // End the whole gesture with CDP's documented empty point list so the
    // browser's touch device is ready for Playwright's next native tap. Only
    // selective multi-finger release needs the legacy released-point form;
    // sending the remaining primary here would release the wrong finger.
    await this.session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:this.points.size?[{...point,id}]:[]});
  }
  async cancel(){this.points.clear();await this.dispatch('touchCancel');}
}
async function tracePoints(page:Page,median:number[][]):Promise<Position[]>{
  await page.locator('.trace-grid').scrollIntoViewIfNeeded();
  return page.locator('.trace-grid').evaluate((element,points)=>{
    const svg=element as SVGSVGElement,matrix=svg.getScreenCTM()!;
    return points.map(([x,y])=>{const point=svg.createSVGPoint();point.x=x;point.y=900-y;const screen=point.matrixTransform(matrix);return{x:screen.x,y:screen.y};});
  },median);
}
async function drag(page:Page,points:Position[],touch:Touch|null,steps=4){
  // A one-step edge probe deliberately jumps between waypoints instead of
  // brushing the newly entered surface. Match mouse.move({steps:1}) exactly.
  if(touch&&steps===1){await touch.down(1,points[0]);for(const point of points.slice(1))await touch.move(1,point);await touch.up(1);}
  else if(touch){
    const lengths=[0];
    for(let i=1;i<points.length;i++)lengths.push(lengths.at(-1)!+Math.hypot(points[i].x-points[i-1].x,points[i].y-points[i-1].y));
    const length=lengths.at(-1)!;
    // Sample a held finger on real browser frames and ease to a stop before
    // lifting. The final 100ms travels at most 1 CSS pixel, preventing an
    // unrealistically fast injected stroke from becoming a touchscreen fling.
    const duration=Math.max(600,100*Math.cbrt(length));
    const frame=()=>page.evaluate(()=>new Promise<number>(resolve=>requestAnimationFrame(resolve)));
    await touch.down(1,points[0]);
    const started=await frame();let nextVertex=1,travelled=0;
    while(travelled<length){
      const elapsed=Math.min(1,((await frame())-started)/duration);
      travelled=length*(1-(1-elapsed)**3);
      // Preserve every original turn and out-of-bounds waypoint even when a
      // frame crosses it, keeping cancellation and trace scoring unchanged.
      while(nextVertex<points.length&&lengths[nextVertex]<=travelled){await touch.move(1,points[nextVertex]);nextVertex++;}
      if(nextVertex<points.length){
        const from=points[nextVertex-1],to=points[nextVertex],span=lengths[nextVertex]-lengths[nextVertex-1];
        const fraction=span?(travelled-lengths[nextVertex-1])/span:0;
        await touch.move(1,{x:from.x+(to.x-from.x)*fraction,y:from.y+(to.y-from.y)*fraction});
      }
    }
    await touch.up(1);
  }
  else{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();for(const point of points.slice(1))await page.mouse.move(point.x,point.y,{steps});await page.mouse.up();}
}

let snowBundle:string|undefined;
async function snowFixture(page:Page){
  // Snow is a supported component but currently absent from the 1,000-word
  // course. Exercise its hold lifecycle without altering real course content.
  if(!snowBundle){
    const word={...words[0],id:'test-snow',char:'雪'};
    snowBundle=buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import WordPlay from './src/components/WordPlay';createRoot(document.getElementById('root')).render(React.createElement(WordPlay,{word:${JSON.stringify(word)},onSpeak:()=>{},onComplete:()=>{}}));`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'}).outputFiles[0].text;
  }
  // Inline an ephemeral test bundle, so this fixture works with both Vite dev
  // and a static dist server. No production route or resource is created.
  const style=readFileSync(new URL('../src/word-play.css',import.meta.url),'utf8');
  await page.route('**/touch-component-fixture',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>${style}</style><div id="root"></div><script>${snowBundle.replace(/<\/script/gi,'<\\/script')}</script>`}));
  await page.goto(`${url}/touch-component-fixture`);
}

let strokeBundle:string|undefined;
async function strokeFixture(page:Page){
  // StrictMode and a same-instance character switch expose stale completion,
  // demo timers and paths that the lesson's own React key would otherwise hide.
  if(!strokeBundle)strokeBundle=buildSync({stdin:{contents:`import React from 'react';import {createRoot} from 'react-dom/client';import StrokePractice from './src/components/StrokePractice';function Fixture(){const [char,setChar]=React.useState('一');return React.createElement(React.Fragment,null,React.createElement('button',{id:'switch-character',onClick:()=>setChar(c=>c==='一'?'二':'一')},'Switch character'),React.createElement(StrokePractice,{char,savedIndex:0,onSpeak:()=>{document.body.dataset.spoken=String(Number(document.body.dataset.spoken||0)+1);},onStroke:index=>{document.body.dataset.strokeIndex=String(index);},onComplete:()=>{document.body.dataset.completions=String(Number(document.body.dataset.completions||0)+1);}}));}createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(Fixture)));`,resolveDir:fileURLToPath(new URL('..',import.meta.url)),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'}).outputFiles[0].text;
  const style=readFileSync(new URL('../src/stroke-practice.css',import.meta.url),'utf8');
  // An intercepted LAN main document lacks the real response's local address
  // space. Chromium then blocks even same-origin stroke fetches as more-private
  // network access. Bootstrap through a real inert JSON response, retaining
  // normal browser security and avoiding any live application's timers/music.
  const bootstrap=await page.goto(new URL('/data/strokes/一.json',url).href);
  expect(bootstrap?.ok()).toBe(true);
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>.stroke-practice{width:310px;margin:auto}.trace-grid{width:100%;touch-action:none}.stroke-toolbar{display:flex;justify-content:space-between}.stroke-toolbar button{min-height:44px}${style}</style><div id="root"></div><script>${strokeBundle.replace(/<\/script/gi,'<\\/script')}</script>`);
  await page.evaluate(recordTouchEvents);
}

for(const engine of ['chromium','webkit'] as const){
  test.describe(`iPad layout and pointer regression (${engine})`,()=>{
    test.use({engine});

    test('finger taps work and tracing follows SVG coordinates after scaling and rotation',async({page})=>{
      const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
      const word=(await seed(page,'一',3))!;
      const data=JSON.parse(readFileSync(new URL('../public/data/strokes/一.json',import.meta.url),'utf8')) as StrokeData;
      await expect(page.locator('.trace-grid')).toBeVisible();
      await expect(page.locator('.trace-guide-star')).toBeVisible();
      await page.setViewportSize({width:1180,height:820});
      await page.locator('.trace-grid').evaluate(element=>{const svg=element as SVGSVGElement;svg.style.width='80%';svg.style.height='240px';svg.style.transform='scale(.85)';});
      const session=engine==='chromium'?await page.context().newCDPSession(page):null;
      const touch=session?new Touch(session):null;
      await drag(page,await tracePoints(page,data.medians[0]),touch);
      await expect.poll(async()=>(await saved(page)).hanzi[word.id].strokeIndex).toBe(1);
      await expect(page.getByRole('button',{name:'我的字写好啦',exact:true})).toBeVisible();
      await expect(page.locator('.trace-guide')).toHaveCount(0);
      expect(errors).toEqual([]);await session?.detach();
      await page.reload();
      await page.getByRole('button',{name:'汉字冒险',exact:true}).tap();
      await page.getByLabel('搜索汉字',{exact:true}).fill('一');
      await page.getByRole('button',{name:'学习一字',exact:true}).tap();
      await expect(page.getByRole('button',{name:'我的字写好啦',exact:true})).toBeVisible();
    });

    test('a cancelled or out-of-bounds stroke cannot reuse an old partial path',async({page})=>{
      const word=(await seed(page,'一',3))!;
      const data=JSON.parse(readFileSync(new URL('../public/data/strokes/一.json',import.meta.url),'utf8')) as StrokeData;
      const points=await tracePoints(page,data.medians[0]),start=points[0],end=points.at(-1)!;
      const middle={x:(start.x+end.x)/2,y:(start.y+end.y)/2};
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      if(touch){await touch.down(1,start);await touch.move(1,middle);await touch.cancel();}
      else{
        await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(middle.x,middle.y);
        await page.locator('.trace-grid').evaluate(element=>element.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1,pointerType:'mouse',isPrimary:true})));
        await page.mouse.up();
      }
      await drag(page,[middle,end],touch);
      expect((await saved(page)).hanzi[word.id].strokeIndex).toBe(0);
      await expect(page.locator('.trace-guide')).toHaveAttribute('data-guide-state','preview');
      const box=(await page.locator('.trace-grid').boundingBox())!;
      await drag(page,[start,{x:box.x-12,y:start.y},end],touch);
      expect((await saved(page)).hanzi[word.id].strokeIndex).toBe(0);
      await drag(page,await tracePoints(page,data.medians[0]),touch);
      await expect.poll(async()=>(await saved(page)).hanzi[word.id].strokeIndex).toBe(1);
      await session?.detach();
    });

    test('a visible star follows the stroke, pauses with a partial trace and lets a finger finish',async({page})=>{
      await page.setViewportSize({width:1180,height:720});
      const word=(await seed(page,'一',3))!;
      const data=JSON.parse(readFileSync(new URL('../public/data/strokes/一.json',import.meta.url),'utf8')) as StrokeData;
      const guide=page.locator('.trace-guide'),star=page.locator('.trace-guide-star');
      await expect(star).toBeVisible();await expect(page.locator('.trace-start')).toBeVisible();
      expect(await star.evaluate(element=>getComputedStyle(element).pointerEvents)).toBe('none');
      const starBox=(await star.boundingBox())!;
      expect(starBox.width).toBeGreaterThan(20);expect(starBox.height).toBeGreaterThan(20);
      const begin=(await tracePoints(page,[data.medians[0][0]]))[0];
      await expect.poll(async()=>Number(await guide.getAttribute('data-progress'))).toBeGreaterThan(.12);
      const moved=(await star.boundingBox())!;expect(moved.x+moved.width/2).toBeGreaterThan(begin.x+15);
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      const points=await tracePoints(page,data.medians[0]),cut=1;
      await drag(page,points.slice(0,cut+1),touch);
      await expect(guide).toHaveAttribute('data-guide-state','paused');
      const stopped=await guide.getAttribute('transform');await page.waitForTimeout(650);
      await expect(guide).toHaveAttribute('transform',stopped!);
      expect((await saved(page)).hanzi[word.id].strokeIndex).toBe(0);
      await drag(page,points.slice(cut),touch);
      await expect.poll(async()=>(await saved(page)).hanzi[word.id].strokeIndex).toBe(1);
      await expect(guide).toHaveCount(0);await expect(page.getByRole('button',{name:'我的字写好啦',exact:true})).toBeVisible();
      await page.getByRole('button',{name:'重新描写',exact:true}).tap();
      await expect(guide).toHaveAttribute('data-guide-state','preview');
      await expect(page.getByRole('button',{name:'我的字写好啦',exact:true})).toHaveCount(0);
      for(const button of await page.locator('.stroke-toolbar button').all()){
        // Keep a full 44px target after a real tap, with no relaxed tolerance.
        await expect.poll(async()=>{const box=await button.boundingBox();return box?Math.min(box.width,box.height):0;}).toBeGreaterThanOrEqual(44);
        const box=(await button.boundingBox())!;expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(44);
      }
      expect(await page.evaluate(()=>document.scrollingElement!.scrollHeight-document.scrollingElement!.clientHeight)).toBeLessThanOrEqual(2);
      await session?.detach();
    });

    test('demonstration, reset and orientation changes restore the current stroke guide',async({page})=>{
      const word=(await seed(page,'二',3))!;
      const data=JSON.parse(readFileSync(new URL('../public/data/strokes/二.json',import.meta.url),'utf8')) as StrokeData;
      const guide=page.locator('.trace-guide');await expect(guide).toBeVisible();
      await page.getByRole('button',{name:'看笔顺',exact:true}).tap();
      await expect(guide).toHaveAttribute('data-guide-state','demo');
      await expect(page.locator('.stroke-practice .gentle-hint')).toHaveText('先看小星星示范，结束后再动手描写。');
      await expect.poll(async()=>Number(await guide.getAttribute('data-progress'))).toBeGreaterThan(.15);
      await page.getByRole('button',{name:'重新描写',exact:true}).tap();
      await expect(guide).toHaveAttribute('data-guide-state','preview');
      await expect(page.getByRole('button',{name:'看笔顺',exact:true})).toBeVisible();
      await page.waitForTimeout(1050);await expect(guide).toHaveAttribute('data-guide-state','preview');
      await page.getByRole('button',{name:'看笔顺',exact:true}).tap();
      await expect(guide).toHaveAttribute('data-guide-state','demo');
      await expect(guide).toHaveAttribute('data-guide-state','preview',{timeout:3500});
      await expect(page.locator('.stroke-practice .gentle-hint')).toHaveText('从第一笔，再走一遍。');
      expect((await saved(page)).hanzi[word.id].strokeIndex).toBe(0);
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      const [a,b]=data.medians[0].slice(1,3),middle=[(a[0]+b[0])/2,(a[1]+b[1])/2];
      const median=[...data.medians[0].slice(0,2),middle,...data.medians[0].slice(2)],cut=2;
      const points=await tracePoints(page,median);
      await drag(page,points.slice(0,cut+1),touch);await expect(guide).toHaveAttribute('data-guide-state','paused');
      await page.getByRole('button',{name:'看笔顺',exact:true}).tap();await expect(guide).toHaveAttribute('data-guide-state','demo');
      await page.getByRole('button',{name:'停止示范',exact:true}).tap();await expect(guide).toHaveAttribute('data-guide-state','preview');
      await expect(page.locator('.stroke-practice .gentle-hint')).toHaveText('跟着小星星，画好这一笔。');
      await drag(page,points.slice(0,cut+1),touch);await expect(guide).toHaveAttribute('data-guide-state','paused');
      await page.setViewportSize({width:1180,height:720});await expect(guide).toHaveAttribute('data-guide-state','preview');
      await expect(page.locator('.stroke-practice .gentle-hint')).toHaveText('跟着小星星，画好这一笔。');
      const rotated=await tracePoints(page,median);
      await drag(page,rotated.slice(cut),touch);
      expect((await saved(page)).hanzi[word.id].strokeIndex).toBe(0);
      await drag(page,rotated,touch);
      await expect.poll(async()=>(await saved(page)).hanzi[word.id].strokeIndex).toBe(1);
      await expect(page.locator('.stroke-toolbar>span')).toHaveText('第 2 / 2 笔');
      await expect(guide).toHaveAttribute('data-guide-state','preview');
      const secondStart=(await tracePoints(page,[data.medians[1][0]]))[0],star=(await page.locator('.trace-guide-star').boundingBox())!;
      expect(Math.hypot(star.x+star.width/2-secondStart.x,star.y+star.height/2-secondStart.y)).toBeLessThan(10);
      await session?.detach();
    });

    test('a reduced-motion guide stays visible and character changes discard old state',async({page})=>{
      await page.emulateMedia({reducedMotion:'reduce'});await strokeFixture(page);
      const guide=page.locator('.trace-guide');await expect(page.locator('.trace-guide-star')).toBeVisible();
      const transform=await guide.getAttribute('transform');await page.waitForTimeout(800);
      await expect(guide).toHaveAttribute('transform',transform!);
      const data=JSON.parse(readFileSync(new URL('../public/data/strokes/一.json',import.meta.url),'utf8')) as StrokeData;
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      await drag(page,await tracePoints(page,data.medians[0]),touch);
      await expect(page.locator('body')).toHaveAttribute('data-completions','1');await expect(guide).toHaveCount(0);
      await page.locator('#switch-character').tap();await expect(page.locator('.trace-grid')).toHaveAttribute('aria-label',/^二字/);
      await expect(page.locator('.stroke-toolbar>span')).toHaveText('第 1 / 2 笔');await expect(guide).toBeVisible();
      await page.getByRole('button',{name:'看笔顺',exact:true}).tap();await expect(guide).toHaveAttribute('data-guide-state','demo');
      await page.getByRole('button',{name:'停止示范',exact:true}).tap();
      await expect(guide).toHaveAttribute('data-guide-state','preview');await expect(page.locator('body')).toHaveAttribute('data-spoken','1');
      await expect(page.locator('.stroke-practice .gentle-hint')).toHaveText('跟着小星星，画好这一笔。');
      await page.getByRole('button',{name:'看笔顺',exact:true}).tap();await expect(page.locator('body')).toHaveAttribute('data-spoken','2');
      await page.locator('#switch-character').tap();await expect(page.locator('.trace-grid')).toHaveAttribute('aria-label',/^一字/);
      await expect(page.locator('.stroke-toolbar>span')).toHaveText('第 1 / 1 笔');
      await page.waitForTimeout(1050);await expect(guide).toHaveAttribute('data-guide-state','preview');
      await expect(page.locator('body')).toHaveAttribute('data-completions','1');
      await drag(page,await tracePoints(page,data.medians[0]),touch);
      await expect(page.locator('body')).toHaveAttribute('data-completions','2');await session?.detach();
    });

    for(const {char,index} of [{char:'口',index:1},{char:'派',index:8}])test(`the ${char} guide follows a turn or edge without clipping or taking pointer capture`,async({page})=>{
      await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1180,height:720});
      const word=(await seed(page,char,3,index))!;
      const data=JSON.parse(readFileSync(new URL(`../public/data/strokes/${char}.json`,import.meta.url),'utf8')) as StrokeData;
      const guide=page.locator('.trace-guide'),grid=page.locator('.trace-grid');
      const points=await tracePoints(page,data.medians[index]);
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      if(touch)await touch.down(1,points[0]);else{await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();}
      for(const point of points.slice(1)){
        if(touch)await touch.move(1,point);else await page.mouse.move(point.x,point.y,{steps:3});
        await expect(guide).toHaveAttribute('data-guide-state','following');
        // CDP dispatch resolves before the browser's next Pointer/React paint.
        // Await the actual shape reaching this point, not the previous frame.
        await expect.poll(async()=>{const star=(await page.locator('.trace-guide-star').boundingBox())!;return Math.hypot(star.x+star.width/2-point.x,star.y+star.height/2-point.y);}).toBeLessThan(16);
        const star=(await page.locator('.trace-guide-star').boundingBox())!,canvas=(await grid.boundingBox())!;
        expect(star.x).toBeGreaterThanOrEqual(canvas.x);expect(star.y).toBeGreaterThanOrEqual(canvas.y);
        expect(star.x+star.width).toBeLessThanOrEqual(canvas.x+canvas.width);expect(star.y+star.height).toBeLessThanOrEqual(canvas.y+canvas.height);
        expect(Math.hypot(star.x+star.width/2-point.x,star.y+star.height/2-point.y)).toBeLessThan(16);
        expect(await page.evaluate(point=>!!document.elementFromPoint(point.x,point.y)?.closest('.trace-grid'),point)).toBe(true);
      }
      await expect.poll(async()=>Number(await guide.getAttribute('data-progress'))).toBeGreaterThan(.99);
      if(touch)await touch.up(1);else await page.mouse.up();
      await expect.poll(async()=>(await saved(page)).hanzi[word.id].strokeIndex).toBe(index+1);await session?.detach();
    });

    test('dragging an umbrella uses capture scoped to its own scene',async({page})=>{
      await seed(page,'雨');
      const start=await center(page,'.wp-drag-prop'),target=await center(page,'.wp-drop-target');
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      expect(await page.locator('.wp-drag-prop').evaluate(element=>getComputedStyle(element).touchAction)).toBe('none');
      expect(await page.locator('.lesson-overlay').evaluate(element=>getComputedStyle(element).touchAction)).not.toBe('none');
      await drag(page,[start,{x:(start.x+target.x)/2,y:(start.y+target.y)/2},target],touch);
      await expect(page.getByRole('button',{name:'认识这个字',exact:true})).toBeVisible();
      await expect(page.locator('.semantic-play')).toHaveClass(/is-complete/);
      await expect(page.locator('.wp-game-content')).toHaveCount(0);await session?.detach();
    });

    test('holding warmth stops on release or cancel',async({page})=>{
      await snowFixture(page);const point=await center(page,'.wp-hold-action');
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      if(touch){await touch.down(1,point);await page.waitForTimeout(180);await touch.cancel();}
      else{await page.mouse.move(point.x,point.y);await page.mouse.down();await page.waitForTimeout(180);await page.mouse.up();}
      const heat=await page.locator('.wp-step-counter').textContent();
      expect(heat).not.toBe('融化 0%');await page.waitForTimeout(220);
      await expect(page.locator('.wp-step-counter')).toHaveText(heat!);await session?.detach();
    });

    test('a finger tap can uncover a covered character tile',async({page})=>{
      await seed(page,'龙');
      await page.getByRole('button',{name:'擦开第1块字卡盖子',exact:true}).tap();
      await expect(page.locator('.wp-step-counter')).toHaveText('先打开字卡 1 / 8');
    });

    test('the native horizontal slider responds while preserving vertical page gestures',async({page})=>{
      await seed(page,'日');
      const slider=page.getByRole('slider',{name:'太阳升起高度',exact:true});await slider.scrollIntoViewIfNeeded();
      expect(await slider.evaluate(element=>getComputedStyle(element).touchAction)).toBe('pan-y');
      // The compact completed view removes the native input. Capture its real
      // input event value before React replaces the gameplay with discovery.
      await slider.evaluate(element=>element.addEventListener('input',()=>{
        document.body.dataset.touchSliderValue=(element as HTMLInputElement).value;
      }));
      const box=(await slider.boundingBox())!,points=Array.from({length:7},(_,step)=>({x:box.x+8+(box.width-16)*step/6,y:box.y+box.height/2}));
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      await drag(page,points,touch);
      await expect.poll(async()=>Number(await page.locator('body').getAttribute('data-touch-slider-value'))).toBeGreaterThanOrEqual(95);
      await expect(page.getByRole('button',{name:'认识这个字',exact:true})).toBeVisible();await session?.detach();
    });

    test('washing needs movement and does not connect a brush path across the surface edge',async({page})=>{
      await seed(page,'手');
      expect(await page.locator('.wp-rub-surface').evaluate(element=>getComputedStyle(element).touchAction)).toBe('pan-y');
      await page.getByRole('button',{name:'加一点肥皂',exact:true}).tap();
      const surface=page.locator('.wp-rub-surface');await surface.scrollIntoViewIfNeeded();
      expect(await surface.evaluate(element=>getComputedStyle(element).touchAction)).toBe('none');
      const box=(await surface.boundingBox())!,mark={x:box.x+box.width*.39,y:box.y+box.height*.36};
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      await page.touchscreen.tap(mark.x,mark.y);
      await expect(page.locator('.wp-step-counter')).toHaveText('洗净 0 / 4 块');
      const start={x:mark.x-box.width*.07,y:mark.y},end={x:mark.x+box.width*.07,y:mark.y};
      await drag(page,[start,{x:box.x-12,y:mark.y},end],touch,1);
      await expect(page.locator('.wp-step-counter')).toHaveText('洗净 0 / 4 块');
      await drag(page,[start,end],touch);
      await expect(page.locator('.wp-step-counter')).toHaveText('洗净 1 / 4 块');
      await expect(page.locator('.wp-scrub-bubbles')).toHaveCount(0);await session?.detach();
    });

    test('animal drag and bathing persist; empty grass retains native pan behavior',async({page})=>{
      await seed(page);await page.getByRole('button',{name:'我的动物园',exact:true}).tap();
      await page.getByRole('button',{name:'布置动物园',exact:true}).tap();
      const start=await center(page,'.zoo-map-item--animal');
      const board=(await page.locator('.zoo-board').boundingBox())!;
      const target={x:board.x+board.width*.7,y:board.y+board.height*.58};
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      expect(await page.locator('.zoo-board').evaluate(element=>getComputedStyle(element).touchAction)).toBe('pan-y');
      await drag(page,[start,target],touch);
      await expect.poll(async()=>(await saved(page)).zoo.animals['welcome-rabbit'].x).toBeGreaterThan(65);
      await page.getByRole('button',{name:'摆放完成',exact:true}).tap();
      await page.getByRole('button',{name:'洗澡',exact:true}).tap();
      await page.locator('.zoo-bath-surface').scrollIntoViewIfNeeded();
      const mark=(await page.locator('.zoo-dirt').first().boundingBox())!;
      await drag(page,[{x:mark.x-5,y:mark.y+mark.height/2},{x:mark.x+mark.width+10,y:mark.y+mark.height/2}],touch);
      await expect.poll(async()=>(await saved(page)).zoo.animals['welcome-rabbit'].cleanliness).toBe(90);
      await session?.detach();await page.reload();
      await page.getByRole('button',{name:'我的动物园',exact:true}).tap();
      expect((await saved(page)).zoo.animals['welcome-rabbit'].cleanliness).toBe(90);
      expect((await saved(page)).zoo.animals['welcome-rabbit'].x).toBeGreaterThan(65);
    });
  });
}

test.describe('isolated Chromium Touch → Pointer multi-finger regressions',()=>{
  test.use({engine:'chromium'});
  test('releasing the last injected finger leaves native taps usable',async({page})=>{
    // Keep this independent of React and the writing component: the driver
    // must release each finger correctly before a native Playwright tap.
    await page.setContent('<meta name="viewport" content="width=device-width,initial-scale=1"><div id="touch-surface" style="width:260px;height:260px;touch-action:none"></div><button id="next-tap" style="height:44px">Next tap</button>');
    await page.evaluate(()=>{
      const surface=document.querySelector<HTMLElement>('#touch-surface')!;
      const events:{type:string;primary:boolean}[]=[];
      for(const type of ['pointerdown','pointerup','pointercancel'])surface.addEventListener(type,event=>{
        const pointer=event as PointerEvent;
        events.push({type,primary:pointer.isPrimary});document.body.dataset.pointers=JSON.stringify(events);
        if(type==='pointerdown'){event.preventDefault();surface.setPointerCapture(pointer.pointerId);}
        else if(surface.hasPointerCapture(pointer.pointerId))surface.releasePointerCapture(pointer.pointerId);
      });
      surface.addEventListener('touchend',event=>{document.body.dataset.activeTouches=String(event.touches.length);});
      document.querySelector('#next-tap')!.addEventListener('click',()=>{document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1);});
    });
    const session=await page.context().newCDPSession(page),touch=new Touch(session);
    await touch.down(1,{x:60,y:60});await touch.down(2,{x:160,y:60});await touch.up(2);
    await expect(page.locator('body')).toHaveAttribute('data-active-touches','1');
    await expect(page.locator('body')).toHaveAttribute('data-pointers',JSON.stringify([
      {type:'pointerdown',primary:true},{type:'pointerdown',primary:false},{type:'pointerup',primary:false},
    ]));
    await touch.move(1,{x:90,y:60});await touch.up(1);
    await expect(page.locator('body')).toHaveAttribute('data-active-touches','0');
    await expect(page.locator('body')).toHaveAttribute('data-pointers',JSON.stringify([
      {type:'pointerdown',primary:true},{type:'pointerdown',primary:false},{type:'pointerup',primary:false},{type:'pointerup',primary:true},
    ]));
    await page.locator('#next-tap').tap();
    await expect(page.locator('body')).toHaveAttribute('data-clicks','1');await session.detach();
  });
  test('swiping empty grass keeps the tablet page and selected animal stationary',async({page})=>{
    await seed(page);await page.getByRole('button',{name:'我的动物园',exact:true}).tap();
    await page.getByRole('button',{name:'布置动物园',exact:true}).tap();
    const board=page.locator('.zoo-board');await board.scrollIntoViewIfNeeded();
    expect(await board.evaluate(element=>getComputedStyle(element).touchAction)).toBe('pan-y');
    const box=(await board.boundingBox())!,start={x:box.x+box.width*.85,y:box.y+box.height*.65};
    expect(await page.evaluate(point=>document.elementFromPoint(point.x,point.y)?.classList.contains('zoo-board'),start)).toBe(true);
    const before=(await saved(page)).zoo.animals['welcome-rabbit'],scroll=await page.evaluate(()=>scrollY);
    const session=await page.context().newCDPSession(page),touch=new Touch(session);
    await touch.down(1,start);
    for(let step=1;step<=6;step++){await touch.move(1,{x:start.x,y:start.y-step*25});await page.waitForTimeout(30);}
    await touch.up(1);
    expect(await page.evaluate(()=>scrollY)).toBe(scroll);
    expect(await page.evaluate(()=>document.scrollingElement!.scrollHeight-document.scrollingElement!.clientHeight)).toBeLessThanOrEqual(2);
    const after=(await saved(page)).zoo.animals['welcome-rabbit'];expect({x:after.x,y:after.y}).toEqual({x:before.x,y:before.y});await session.detach();
  });
  test('a secondary finger cannot finish or interrupt the primary writing stroke',async({page})=>{
    const word=(await seed(page,'一',3))!;
    const data=JSON.parse(readFileSync(new URL('../public/data/strokes/一.json',import.meta.url),'utf8')) as StrokeData;
    const points=await tracePoints(page,data.medians[0]),session=await page.context().newCDPSession(page),touch=new Touch(session);
    await touch.down(1,points[0]);await touch.down(2,points.at(-1)!);await touch.move(2,points[0]);await touch.up(2);
    expect((await saved(page)).hanzi[word.id].strokeIndex).toBe(0);
    for(const point of points.slice(1))await touch.move(1,point);await touch.up(1);
    await expect.poll(async()=>(await saved(page)).hanzi[word.id].strokeIndex).toBe(1);await session.detach();
  });
  test('secondary scrub touches are ignored and cancellation stops the brush',async({page})=>{
    await seed(page);await page.getByRole('button',{name:'我的动物园',exact:true}).tap();await page.getByRole('button',{name:'洗澡',exact:true}).tap();
    await page.locator('.zoo-bath-surface').scrollIntoViewIfNeeded();
    const mark=(await page.locator('.zoo-dirt').first().boundingBox())!,session=await page.context().newCDPSession(page),touch=new Touch(session);
    const start={x:mark.x-8,y:mark.y+mark.height/2},end={x:mark.x+mark.width+10,y:start.y};
    await touch.down(1,start);await touch.down(2,end);await touch.move(2,start);await touch.up(2);
    expect((await saved(page)).zoo.animals['welcome-rabbit'].cleanliness).toBe(70);
    await touch.move(1,end);await expect.poll(async()=>(await saved(page)).zoo.animals['welcome-rabbit'].cleanliness).toBe(90);
    await touch.cancel();await expect(page.locator('.zoo-bubble-brush')).toHaveCount(0);
    expect((await saved(page)).zoo.animals['welcome-rabbit'].cleanliness).toBe(90);await session.detach();
  });
});
