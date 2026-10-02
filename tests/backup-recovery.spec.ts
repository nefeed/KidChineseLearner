import {test,expect,type Download,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {BACKUP_KEY,STORAGE_KEY,createProfile,initialProgress,validateSave} from '../src/store';
import type {SaveData} from '../src/types';

const origin=process.env.BACKUP_TEST_URL??'http://127.0.0.1:5173';
const engine=process.env.BACKUP_TEST_ENGINE??'chromium';
if(!['chromium','webkit'].includes(engine))throw Error('BACKUP_TEST_ENGINE must be chromium or webkit');
test.use({browserName:engine as 'chromium'|'webkit',channel:engine==='chromium'?(process.env.PLAYWRIGHT_CHANNEL??'chrome'):undefined,
  viewport:{width:820,height:1180},hasTouch:true});

const rawCorrupt='{"version":1,"profiles":[{"name":"未读完的原始存档"';
function backup(names:string[]):SaveData{
  const profiles=names.map(name=>{const profile=createProfile(name);profile.settings.sound=false;profile.settings.music=false;return profile;});
  profiles[0].hanzi['hz-001']={...initialProgress(),stage:3,strokeIndex:2};
  return {version:1,activeId:profiles[0].id,profiles,savedAt:Date.now()};
}
async function boot(page:Page,data:SaveData,corrupt=false){
  await page.addInitScript(({key,backupKey,primary,recovery})=>{
    localStorage.setItem(key,primary);
    if(recovery)localStorage.setItem(backupKey,recovery);
  },{key:STORAGE_KEY,backupKey:BACKUP_KEY,primary:corrupt?rawCorrupt:JSON.stringify(data),recovery:corrupt?JSON.stringify(data):null});
  await page.goto(origin);
  await expect(page.getByRole('button',{name:'我的小岛',exact:true})).toBeVisible();
  if(corrupt)await expect(page.locator('.save-banner')).toContainText('旧档案已保护');
  await page.getByRole('button',{name:'家长小屋',exact:true}).click();
  await page.getByRole('textbox',{name:'家长验证答案',exact:true}).fill('13');
  await page.getByRole('button',{name:'打开家长小屋',exact:true}).click();
  await expect(page.getByRole('heading',{name:'家长小屋',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'备份与恢复',exact:true}).click();
}
async function selectBackup(page:Page,data:SaveData,name='backup.json'){
  await page.locator('input[type=file]').setInputFiles({name,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(data))});
}
async function stored(page:Page){return page.evaluate(key=>localStorage.getItem(key),STORAGE_KEY);}
function downloads(page:Page){const items:Download[]=[];page.on('download',item=>items.push(item));return items;}
async function contents(item:Download){const path=await item.path();expect(path).not.toBeNull();return readFileSync(path!,'utf8');}
async function protectedOriginal(page:Page,items:Download[]){
  expect(await stored(page)).toBe(rawCorrupt);
  await expect(page.locator('.save-banner')).toContainText('旧档案已保护');
  expect(items).toHaveLength(0);
}

test('an invalid later file clears the earlier valid preview without restoring anything',async({page})=>{
  const current=backup(['原有儿童']),items=downloads(page);
  await boot(page,current);await selectBackup(page,backup(['先前备份']));
  await expect(page.locator('.import-confirm')).toContainText('先前备份');
  await page.locator('input[type=file]').setInputFiles({name:'invalid.json',mimeType:'application/json',buffer:Buffer.from('{"version":1}')});
  await expect(page.getByRole('status')).toContainText('文件格式不完整');
  await expect(page.locator('.import-confirm')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'确认恢复这份备份',exact:true})).toHaveCount(0);
  expect(JSON.parse((await stored(page))!).activeId).toBe(current.activeId);expect(items).toHaveLength(0);
});

test('an oversized later file clears the earlier valid preview before reading it',async({page})=>{
  const current=backup(['原有儿童']),items=downloads(page);
  await boot(page,current);await selectBackup(page,backup(['先前备份']));
  await expect(page.locator('.import-confirm')).toContainText('先前备份');
  await page.locator('input[type=file]').setInputFiles({name:'oversized.json',mimeType:'application/json',buffer:Buffer.alloc(10_000_001,32)});
  await expect(page.getByRole('status')).toContainText('文件太大');
  await expect(page.locator('.import-confirm')).toHaveCount(0);
  expect(JSON.parse((await stored(page))!).activeId).toBe(current.activeId);expect(items).toHaveLength(0);
});

test('a delayed native file read cannot replace the latest selected backup preview',async({page})=>{
  await boot(page,backup(['原有儿童']));
  await page.evaluate(()=>{
    const nativeText=File.prototype.text;
    File.prototype.text=async function(){
      const text=await nativeText.call(this);
      if(this.name!=='older.json')return text;
      return new Promise<string>(resolve=>{
        (window as Window & {releaseOlderBackup?:()=>void}).releaseOlderBackup=()=>resolve(text);
        document.documentElement.setAttribute('data-older-backup-read','pending');
      });
    };
  });
  await selectBackup(page,backup(['较早备份']),'older.json');
  await expect(page.locator('html')).toHaveAttribute('data-older-backup-read','pending');
  await selectBackup(page,backup(['最新备份']),'latest.json');
  await expect(page.locator('.import-confirm')).toContainText('最新备份');
  await page.evaluate(async()=>{
    (window as Window & {releaseOlderBackup?:()=>void}).releaseOlderBackup!();
    // Let the resolved native read and React's resulting render reach a paint.
    await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
  });
  await expect(page.locator('.import-confirm')).toContainText('最新备份');
  await expect(page.locator('.import-confirm')).not.toContainText('较早备份');
});

test('switching children in Parents preserves a corrupt original and recovery protection',async({page})=>{
  const recovery=backup(['恢复甲','恢复乙']),items=downloads(page);
  await boot(page,recovery,true);await protectedOriginal(page,items);
  await page.getByRole('button',{name:'儿童档案',exact:true}).click();
  await page.locator('.profile-row').filter({has:page.getByText('恢复乙',{exact:true})}).click();
  await expect(page.locator('.profile-switch b')).toHaveText('恢复乙');
  await protectedOriginal(page,items);
});

test('creating a child while protected leaves the raw original untouched and reports temporary progress',async({page})=>{
  const recovery=backup(['恢复甲','恢复乙']),items=downloads(page);
  await boot(page,recovery,true);
  await page.getByRole('button',{name:'儿童档案',exact:true}).click();
  await page.getByRole('textbox',{name:'新儿童昵称',exact:true}).fill('暂存新儿童');
  await page.getByRole('button',{name:'创建小岛',exact:true}).click();
  await expect(page.locator('.profile-switch b')).toHaveText('暂存新儿童');
  await expect(page.getByRole('status')).toContainText('尚未写入本机');
  await page.getByRole('button',{name:'关闭小岛音乐',exact:true}).click();
  await page.getByRole('button',{name:'关闭声音',exact:true}).click();
  await protectedOriginal(page,items);
  await page.getByRole('button',{name:'备份与恢复',exact:true}).click();
  await page.getByRole('button',{name:'恢复保存当前档案',exact:true}).click();
  await expect.poll(()=>items.length).toBe(1);expect(await contents(items[0])).toBe(rawCorrupt);
  const saved=JSON.parse((await stored(page))!);expect(validateSave(saved)).toBe(true);
  expect(saved.profiles.find((profile:{id:string})=>profile.id===saved.activeId)).toMatchObject({name:'暂存新儿童',settings:{sound:false,music:false}});
  await page.getByRole('button',{name:'儿童档案',exact:true}).click();
  await expect(page.locator('.parents-page .page-heading p')).not.toContainText('尚未写入本机');
});

test('explicit resume exports the raw original before saving the current recovered progress',async({page})=>{
  const recovery=backup(['恢复甲','恢复乙']),items=downloads(page);
  await boot(page,recovery,true);
  await page.getByRole('button',{name:'学习节奏',exact:true}).click();
  await page.getByRole('textbox',{name:'当前儿童昵称',exact:true}).fill('恢复后修改');
  await protectedOriginal(page,items);
  await page.getByRole('button',{name:'备份与恢复',exact:true}).click();
  await page.getByRole('button',{name:'恢复保存当前档案',exact:true}).click();
  await expect.poll(()=>items.length).toBe(1);
  expect(items[0].suggestedFilename()).toBe('字游小岛-恢复前原始存档.json');
  expect(await contents(items[0])).toBe(rawCorrupt);
  await expect(page.locator('.save-banner')).toHaveCount(0);
  const saved=JSON.parse((await stored(page))!);expect(validateSave(saved)).toBe(true);expect(saved.profiles[0].name).toBe('恢复后修改');
});

test('validated restore while protected exports both the raw original and recovered data before replacement',async({page})=>{
  const recovery=backup(['恢复甲','恢复乙']),replacement=backup(['明确恢复']),items=downloads(page);
  await boot(page,recovery,true);await selectBackup(page,replacement);
  await page.getByRole('button',{name:'确认恢复这份备份',exact:true}).click();
  await expect.poll(()=>items.length).toBe(2);
  const files=await Promise.all(items.map(async item=>({name:item.suggestedFilename(),text:await contents(item)})));
  const raw=files.find(file=>file.name==='字游小岛-导入前原始存档.json');expect(raw).toBeDefined();
  expect(raw!.text).toBe(rawCorrupt);
  const previous=files.find(file=>file.name==='字游小岛-导入前备份.json');expect(previous).toBeDefined();
  expect(JSON.parse(previous!.text).profiles.map((profile:{name:string})=>profile.name)).toEqual(['恢复甲','恢复乙']);
  expect(validateSave(JSON.parse(previous!.text))).toBe(true);
  await expect(page.locator('.save-banner')).toHaveCount(0);
  expect(JSON.parse((await stored(page))!).activeId).toBe(replacement.activeId);
});

test('ordinary validated restore exports one current backup and persists the imported checkpoint',async({page})=>{
  const current=backup(['原有儿童']),replacement=backup(['导入儿童']),items=downloads(page);
  await boot(page,current);await selectBackup(page,replacement);
  await page.getByRole('button',{name:'确认恢复这份备份',exact:true}).click();
  await expect.poll(()=>items.length).toBe(1);
  expect(items[0].suggestedFilename()).toBe('字游小岛-导入前备份.json');
  expect(JSON.parse(await contents(items[0])).activeId).toBe(current.activeId);
  const saved=JSON.parse((await stored(page))!);expect(validateSave(saved)).toBe(true);expect(saved.activeId).toBe(replacement.activeId);
  expect(saved.profiles[0].hanzi['hz-001']).toMatchObject({stage:3,strokeIndex:2});
});
