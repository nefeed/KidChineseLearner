import {test as base,expect,chromium,webkit,type Page} from '@playwright/test';
import {createProfile,initialProgress,STORAGE_KEY} from '../src/store';
import {ZOO_REGIONS} from '../src/data/zoo-regions';
import {readFileSync} from 'node:fs';
const origin=process.env.ZOO_TEST_URL??'http://127.0.0.1:5173';
const words=JSON.parse(readFileSync(new URL('../src/data/hanzi.json',import.meta.url),'utf8')) as {id:string}[];
const test=base.extend<{engine:'chromium'|'webkit';page:Page}>({
 engine:['chromium',{option:true}],
 page:async({engine,viewport},use)=>{const browser=await(engine==='webkit'?webkit.launch():chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL==='chromium'?undefined:process.env.PLAYWRIGHT_CHANNEL??'chrome'}));const context=await browser.newContext({viewport:viewport!,isMobile:true,hasTouch:true});try{await use(await context.newPage());}finally{await context.close();await browser.close();}},
});
async function seed(page:Page,completed=0){
 const profile=createProfile('园区探险员');profile.settings.sound=false;profile.settings.music=false;
 for(const word of words.slice(0,completed))profile.hanzi[word.id]={...initialProgress(),stage:6,completed:true};
 const data={version:1,activeId:profile.id,profiles:[profile],savedAt:Date.now()};
 await page.addInitScript(({key,value})=>{if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(value));},{key:STORAGE_KEY,value:data});
 await page.goto(origin);await page.getByRole('button',{name:'我的动物园',exact:true}).tap();return profile;
}
async function saved(page:Page){return page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).profiles[0],STORAGE_KEY);}
async function fits(page:Page){
 await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
 const errors=await page.evaluate(()=>{
  const failures:string[]=[];const doc=document.scrollingElement!;
  if(doc.scrollHeight>doc.clientHeight+2||doc.scrollWidth>doc.clientWidth+2)failures.push('document scroll');
  for(const e of document.querySelectorAll<HTMLElement>('.zoo-page button,.zoo-page select,.zoo-page h2,.zoo-page p')){
   const r=e.getBoundingClientRect();if(!r.width||!r.height)continue;
   if(r.top<0||r.bottom>innerHeight+2||r.left<0||r.right>innerWidth+2)failures.push(e.textContent??e.tagName);
   if(e.tagName==='BUTTON'&&!e.hasAttribute('disabled')){const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);if(!hit||!e.contains(hit))failures.push('blocked '+e.getAttribute('aria-label'));}
  }return failures;
 });expect(errors).toEqual([]);
}
for(const engine of ['chromium','webkit'] as const)for(const viewport of [{width:1180,height:720},{width:820,height:1080}])test.describe(`${engine} regions ${viewport.width}`,()=>{
 test.use({engine,viewport});
 test('entrance first, six distinct regions, empty-region goals and return preserve every saved field',async({page})=>{
  const profile=await seed(page);await expect(page.locator('.zoo-region-card')).toHaveCount(6);await expect(page.locator('.zoo-board')).toHaveCount(0);await fits(page);
  for(const region of ZOO_REGIONS){
   await page.getByRole('button',{name:`进入${region.name}`,exact:true}).tap();await expect(page.getByLabel(`${region.name}地图`,{exact:true})).toBeVisible();await fits(page);
   if(region.id==='meadow')await expect(page.getByRole('button',{name:'喂胡萝卜',exact:true})).toBeVisible();
   else{await expect(page.locator('.zoo-map-item--animal')).toHaveCount(0);await expect(page.getByRole('button',{name:'看看入园目标',exact:true})).toBeVisible();}
   await page.getByRole('button',{name:'返回园区',exact:true}).tap();await fits(page);
  }
  expect((await saved(page)).zoo).toEqual(profile.zoo);
  await page.getByRole('button',{name:'进入熊猫竹林',exact:true}).tap();await page.getByRole('button',{name:'看看入园目标',exact:true}).tap();
  await expect(page.locator('.zoo-reward-card').filter({has:page.getByRole('heading',{name:'熊猫',exact:true})}).getByRole('button',{name:'还差 10 字',exact:true})).toBeDisabled();await fits(page);
 });
 test('claim opens the right region and caring/rename/position persist through overview and reload',async({page})=>{
  await seed(page,10);await page.getByRole('button',{name:/小岛邀请函/}).tap();await page.getByRole('button',{name:'邀请入园',exact:true}).tap();
  await expect(page.getByLabel('熊猫竹林地图',{exact:true})).toBeVisible();await expect(page.locator('.zoo-map-item--animal')).toHaveCount(1);await expect(page.locator('.zoo-feedback')).toContainText('熊猫来到熊猫竹林');await fits(page);
  await page.getByRole('button',{name:'喂竹子',exact:true}).tap();await expect.poll(async()=>(await saved(page)).zoo.animals['hanzi-10'].fullness).toBe(82);
  await page.getByRole('button',{name:'给动物改名',exact:true}).tap();await page.getByLabel('朋友的新名字',{exact:true}).fill('竹叶小团子');await page.getByRole('button',{name:'记住名字',exact:true}).tap();
  const before=(await saved(page)).zoo;await page.getByRole('button',{name:'返回园区',exact:true}).tap();await page.reload();await page.getByRole('button',{name:'我的动物园',exact:true}).tap();await expect(page.locator('.zoo-region-card')).toHaveCount(6);
  await page.getByRole('button',{name:'进入熊猫竹林',exact:true}).tap();await expect(page.getByRole('heading',{name:'竹叶小团子',exact:true})).toBeVisible();expect((await saved(page)).zoo).toEqual(before);
 });
});
