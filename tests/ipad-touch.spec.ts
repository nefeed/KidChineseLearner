import {test as base,expect,chromium,webkit,type Page,type CDPSession} from '@playwright/test';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {buildSync} from 'esbuild';
import {createProfile,initialProgress,STORAGE_KEY} from '../src/store';
import type {Hanzi,Profile,SaveData,StrokeData} from '../src/types';

const url=process.env.IPAD_TEST_URL??'http://127.0.0.1:5173';
const words=JSON.parse(readFileSync(new URL('../src/data/hanzi.json',import.meta.url),'utf8')) as Hanzi[];
type Position={x:number;y:number};
const test=base.extend<{engine:'chromium'|'webkit';page:Page}>({
  engine:['chromium',{option:true}],
  page:async({engine},use)=>{
    // These launches are isolated from the user's Chrome and in-app browser.
    const requested=process.env.PLAYWRIGHT_CHANNEL;
    // Linux CI uses installed Playwright Chromium; an explicit "chromium"
    // also requests that bundled engine on a Mac with Google Chrome installed.
    const channel=requested==='chromium'?undefined:requested??(process.platform==='darwin'&&existsSync('/Applications/Google Chrome.app')?'chrome':undefined);
    const browser=await (engine==='chromium'?chromium.launch({channel}):webkit.launch());
    const context=await browser.newContext({viewport:{width:820,height:1180},deviceScaleFactor:2,isMobile:true,hasTouch:true});
    try{await use(await context.newPage());}finally{await context.close();await browser.close();}
  },
});

// All profiles and checkpoints here are isolated test fixtures, not evidence of
// a child's learning. Chromium CDP touches target only Playwright's own browser.
async function seed(page:Page,char?:string,stage=0){
  const profile=createProfile('触控测试员');profile.settings.sound=false;profile.settings.music=false;
  const word=char?words.find(item=>item.char===char)!:undefined;
  if(char&&!word)throw Error(`Missing test character ${char}`);
  if(word)profile.hanzi[word.id]={...initialProgress(),stage,strokeIndex:0};
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
    // CDP touchEnd lists released points, whereas touchStart/Move list active
    // points. Sending the remaining primary here would end the wrong finger.
    await this.session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[{...point,id}]});
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
  if(touch){await touch.down(1,points[0]);for(const point of points.slice(1))await touch.move(1,point);await touch.up(1);}
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

for(const engine of ['chromium','webkit'] as const){
  test.describe(`iPad layout and pointer regression (${engine})`,()=>{
    test.use({engine});

    test('finger taps work and tracing follows SVG coordinates after scaling and rotation',async({page})=>{
      const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
      const word=(await seed(page,'一',3))!;
      const data=JSON.parse(readFileSync(new URL('../public/data/strokes/一.json',import.meta.url),'utf8')) as StrokeData;
      await expect(page.locator('.trace-grid')).toBeVisible();
      await page.setViewportSize({width:1180,height:820});
      await page.locator('.trace-grid').evaluate(element=>{const svg=element as SVGSVGElement;svg.style.width='80%';svg.style.height='240px';svg.style.transform='scale(.85)';});
      const session=engine==='chromium'?await page.context().newCDPSession(page):null;
      const touch=session?new Touch(session):null;
      await drag(page,await tracePoints(page,data.medians[0]),touch);
      await expect.poll(async()=>(await saved(page)).hanzi[word.id].strokeIndex).toBe(1);
      await expect(page.getByRole('button',{name:'我的字写好啦',exact:true})).toBeVisible();
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
      const box=(await page.locator('.trace-grid').boundingBox())!;
      await drag(page,[start,{x:box.x-12,y:start.y},end],touch);
      expect((await saved(page)).hanzi[word.id].strokeIndex).toBe(0);
      await drag(page,await tracePoints(page,data.medians[0]),touch);
      await expect.poll(async()=>(await saved(page)).hanzi[word.id].strokeIndex).toBe(1);
      await session?.detach();
    });

    test('dragging an umbrella uses capture while the surrounding lesson stays scrollable',async({page})=>{
      await seed(page,'雨');
      const start=await center(page,'.wp-drag-prop'),target=await center(page,'.wp-drop-target');
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      expect(await page.locator('.wp-drag-prop').evaluate(element=>getComputedStyle(element).touchAction)).toBe('none');
      expect(await page.locator('.lesson-overlay').evaluate(element=>getComputedStyle(element).touchAction)).not.toBe('none');
      await drag(page,[start,{x:(start.x+target.x)/2,y:(start.y+target.y)/2},target],touch);
      await expect(page.getByRole('button',{name:'认识这个字',exact:true})).toBeVisible();
      await expect(page.locator('.wp-step-counter')).toHaveText('1 / 1');await session?.detach();
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
      const box=(await slider.boundingBox())!,points=Array.from({length:7},(_,step)=>({x:box.x+8+(box.width-16)*step/6,y:box.y+box.height/2}));
      const session=engine==='chromium'?await page.context().newCDPSession(page):null,touch=session?new Touch(session):null;
      await drag(page,points,touch);
      await expect.poll(async()=>Number(await slider.inputValue())).toBeGreaterThanOrEqual(95);
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

    test('animal drag and bathing persist; an empty moving grassland permits scrolling',async({page})=>{
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
  test('swiping empty grass scrolls without moving the selected animal',async({page})=>{
    await seed(page);await page.getByRole('button',{name:'我的动物园',exact:true}).tap();
    await page.getByRole('button',{name:'布置动物园',exact:true}).tap();
    const board=page.locator('.zoo-board');await board.scrollIntoViewIfNeeded();
    const box=(await board.boundingBox())!,start={x:box.x+box.width*.85,y:box.y+box.height*.65};
    expect(await page.evaluate(point=>document.elementFromPoint(point.x,point.y)?.classList.contains('zoo-board'),start)).toBe(true);
    const before=(await saved(page)).zoo.animals['welcome-rabbit'],scroll=await page.evaluate(()=>scrollY);
    const session=await page.context().newCDPSession(page),touch=new Touch(session);
    await touch.down(1,start);
    for(let step=1;step<=6;step++){await touch.move(1,{x:start.x,y:start.y-step*25});await page.waitForTimeout(30);}
    await touch.up(1);
    await expect.poll(()=>page.evaluate(()=>scrollY)).toBeGreaterThan(scroll+50);
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
