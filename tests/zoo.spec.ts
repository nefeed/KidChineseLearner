import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ANIMALS, BUILDINGS, FOODS, REWARDS } from '../src/data/rewards';
import { createProfile, STORAGE_KEY, validateSave } from '../src/store';
import type { Profile, SaveData } from '../src/types';

// These are isolated synthetic fixtures for reward/state tests. They do not
// establish that a child completed or mastered any of the learning content.
const url = process.env.ZOO_TEST_URL ?? 'http://127.0.0.1:5173';
const hanziJSON = JSON.parse(readFileSync(new URL('../src/data/hanzi.json', import.meta.url), 'utf8')) as { id: string }[];
const poemsJSON = JSON.parse(readFileSync(new URL('../src/data/poems.json', import.meta.url), 'utf8')) as { id: string }[];
test.use({ channel: process.env.PLAYWRIGHT_CHANNEL ?? 'chrome', viewport: { width: 1440, height: 1100 } });

function fixture(characters = 0, poems = 0, fullZoo = false): SaveData {
  const profile = createProfile('动物园测试员');
  profile.settings.sound = false;
  const completed = { stage: 6, completed: true, attempts: 1, reviewAt: Date.now() + 86_400_000, reviewCount: 0, updatedAt: Date.now() };
  hanziJSON.slice(0, characters).forEach((word) => { profile.hanzi[word.id] = { ...completed }; });
  poemsJSON.slice(0, poems).forEach((poem) => { profile.poems[poem.id] = { ...completed }; });
  if (fullZoo) REWARDS.forEach((reward, index) => {
    const position = { x: 18 + (index + 1) % 4 * 21, y: 35 + Math.floor((index + 1) % 12 / 4) * 21 };
    profile.zoo.claimed.push(reward.id);
    if (reward.kind === 'animal') profile.zoo.animals[reward.id] = { id: reward.species, name: `${reward.title}${index + 1}`, fullness: 60, cleanliness: 40, affection: 10, ...position };
    else profile.zoo.buildings[reward.id] = { id: reward.species, ...position };
  });
  return { version: 1, activeId: profile.id, profiles: [profile], savedAt: Date.now() };
}

async function seed(page: Page, data: SaveData) {
  expect(validateSave(data)).toBe(true);
  // The fixture is only initialized once. Reload must read the app's actual save.
  await page.addInitScript(({ key, value }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(value)); }, { key: STORAGE_KEY, value: data });
  await page.goto(url);
  await openZoo(page);
}

async function openZoo(page: Page) {
  await page.getByRole('button', { name: '我的动物园', exact: true }).click();
  await expect(page.locator('.zoo-heading h1')).toContainText('我的小小动物园');
}

async function profileSave(page: Page): Promise<Profile> {
  return page.evaluate((key) => {
    const data = JSON.parse(localStorage.getItem(key)!);
    return data.profiles.find((profile: { id: string }) => profile.id === data.activeId);
  }, STORAGE_KEY);
}

async function scrubFirstMark(page: Page) {
  const dirt = await page.locator('.zoo-dirt').first().boundingBox();
  if (!dirt) throw new Error('Expected a visible dirt mark');
  const x = dirt.x + dirt.width / 2;
  const y = dirt.y + dirt.height / 2;
  await page.mouse.move(x - 8, y);
  await page.mouse.down();
  await page.mouse.move(x + 20, y + 2, { steps: 10 });
  await page.mouse.up();
}

test('静态奖励数据覆盖全部 1000 字和 300 首，物种及食物引用完整', () => {
  expect(ANIMALS).toHaveLength(24);
  expect(BUILDINGS).toHaveLength(12);
  expect(REWARDS).toHaveLength(160);
  expect(new Set(REWARDS.map((reward) => reward.id)).size).toBe(160);
  expect(REWARDS.filter((reward) => reward.source === 'hanzi').map((reward) => reward.threshold)).toEqual(Array.from({ length: 100 }, (_, index) => (index + 1) * 10));
  expect(REWARDS.filter((reward) => reward.source === 'poems').map((reward) => reward.threshold)).toEqual(Array.from({ length: 60 }, (_, index) => (index + 1) * 5));
  for (const reward of REWARDS) expect((reward.kind === 'animal' ? ANIMALS : BUILDINGS).some((item) => item.id === reward.species)).toBe(true);
  for (const animal of ANIMALS) {
    expect(animal.foods.length).toBeGreaterThan(0);
    expect(animal.foods.every((id) => FOODS.some((food) => food.id === id))).toBe(true);
    expect(animal.habitat.length).toBeGreaterThan(0);
    expect(animal.foodHint.length).toBeGreaterThan(0);
  }
});

test('静态 24 种动物及四种动作均生成原创 SVG，图形各不相同', () => {
  // Playwright's JSX serializer is intended for browser component fixtures.
  // Use the app's normal tsx/React runtime for this entirely static render audit.
  const rendered = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `
    import {createElement} from 'react';
    import {renderToStaticMarkup} from 'react-dom/server';
    import Animal from './src/components/Animal.tsx';
    import {ANIMALS} from './src/data/rewards.ts';
    const moods=['idle','eat','bath','happy'];
    console.log(JSON.stringify(ANIMALS.flatMap(animal=>moods.map(mood=>({species:animal.id,mood,html:renderToStaticMarkup(createElement(Animal,{species:animal.id,mood}))})))));
  `], { cwd: fileURLToPath(new URL('..', import.meta.url)), encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  expect(rendered.status, rendered.stderr).toBe(0);
  const entries = JSON.parse(rendered.stdout) as { species: string; mood: string; html: string }[];
  expect(entries).toHaveLength(96);
  const drawings = entries.filter((entry) => entry.mood === 'idle').map(({ html }) => {
    expect(html).toContain('<svg');
    expect(html).toContain('zoo-animal-eyes');
    return html.replace(/id="[^"]*"/g, 'id="unique"').replace(/url\(#[^)]*\)/g, 'url(#unique)');
  });
  expect(new Set(drawings).size).toBe(24);
  for (const entry of entries) expect(entry.html).toContain(`zoo-animal--${entry.mood}`);
});

test('错误食物不增加状态，合适食物即时保存，刷新恢复', async ({ page }) => {
  await seed(page, fixture());
  const before = await profileSave(page);
  await page.getByRole('button', { name: '喂小鱼', exact: true }).click();
  await expect(page.locator('.zoo-feedback')).toContainText('不适合');
  expect((await profileSave(page)).zoo.animals['welcome-rabbit']).toEqual(before.zoo.animals['welcome-rabbit']);
  expect((await profileSave(page)).stars).toBe(before.stars);
  await page.getByRole('button', { name: '喂青草绿叶', exact: true }).click();
  await expect.poll(async () => (await profileSave(page)).zoo.animals['welcome-rabbit'].fullness).toBe(87);
  expect((await profileSave(page)).zoo.animals['welcome-rabbit'].affection).toBe(5);
  await page.reload();
  await openZoo(page);
  expect((await profileSave(page)).zoo.animals['welcome-rabbit'].fullness).toBe(87);
  await expect(page.locator('.zoo-meter').filter({ hasText: '小肚子' })).toContainText('87 / 100');
});

test('单点不能洗澡，真实拖动逐块清洁，半途刷新及洗完恢复', async ({ page }) => {
  await seed(page, fixture());
  await page.getByRole('button', { name: '洗澡', exact: true }).click();
  await expect(page.locator('.zoo-dirt')).toHaveCount(2);
  const spot = await page.locator('.zoo-dirt').first().boundingBox();
  if (!spot) throw new Error('Expected a visible dirt mark');
  await page.mouse.click(spot.x + spot.width / 2, spot.y + spot.height / 2);
  expect((await profileSave(page)).zoo.animals['welcome-rabbit'].cleanliness).toBe(70);
  await scrubFirstMark(page);
  await expect.poll(async () => (await profileSave(page)).zoo.animals['welcome-rabbit'].cleanliness).toBe(90);
  await expect(page.locator('.zoo-dirt')).toHaveCount(1);
  await page.reload();
  await openZoo(page);
  await page.getByRole('button', { name: '洗澡', exact: true }).click();
  await expect(page.locator('.zoo-dirt')).toHaveCount(1);
  await scrubFirstMark(page);
  await expect.poll(async () => (await profileSave(page)).zoo.animals['welcome-rabbit'].cleanliness).toBe(100);
  await expect(page.locator('.zoo-dirt')).toHaveCount(0);
  await page.reload();
  await openZoo(page);
  expect((await profileSave(page)).zoo.animals['welcome-rabbit'].cleanliness).toBe(100);
});

test('移动、动物园及动物命名均保存并可恢复', async ({ page }) => {
  await seed(page, fixture());
  await page.getByRole('button', { name: '布置动物园', exact: true }).click();
  const rabbit = page.locator('.zoo-map-item--animal').first();
  await rabbit.focus();
  await rabbit.press('ArrowRight');
  await rabbit.press('ArrowUp');
  await expect.poll(async () => (await profileSave(page)).zoo.animals['welcome-rabbit'].x).toBe(32);
  expect((await profileSave(page)).zoo.animals['welcome-rabbit'].y).toBe(55);
  await page.getByRole('button', { name: '摆放完成', exact: true }).click();
  await page.getByRole('button', { name: '给动物园改名', exact: true }).click();
  await page.getByLabel('动物园的名字', { exact: true }).fill('风吹叶子岛');
  await page.getByRole('button', { name: '记住名字', exact: true }).click();
  await page.getByRole('button', { name: '给动物改名', exact: true }).click();
  await page.getByLabel('朋友的新名字', { exact: true }).fill('小棉球');
  await page.getByRole('button', { name: '记住名字', exact: true }).click();
  await page.reload();
  await page.getByRole('button', { name: '我的动物园', exact: true }).click();
  await expect(page.locator('.zoo-heading h1')).toContainText('风吹叶子岛');
  await expect(page.getByRole('heading', { name: '小棉球', exact: true })).toBeVisible();
  const animal = (await profileSave(page)).zoo.animals['welcome-rabbit'];
  expect({ x: animal.x, y: animal.y }).toEqual({ x: 32, y: 55 });
});

test('10 字及 5 首诗的奖励可领取，双击幂等，刷新后仍已领取', async ({ page }) => {
  await seed(page, fixture(10, 5));
  const characterGift = page.locator('.zoo-reward-card').filter({ hasText: '学会 10 个字' });
  await characterGift.getByRole('button', { name: '邀请入园', exact: true }).dblclick();
  await expect.poll(async () => (await profileSave(page)).zoo.claimed.filter((id) => id === 'hanzi-10').length).toBe(1);
  expect(Object.keys((await profileSave(page)).zoo.animals)).toHaveLength(2);
  const poetryGift = page.locator('.zoo-reward-card').filter({ hasText: '学会 5 首诗词' });
  await poetryGift.getByRole('button', { name: '邀请入园', exact: true }).dblclick();
  expect((await profileSave(page)).zoo.claimed.filter((id) => id === 'poems-5')).toHaveLength(1);
  expect(Object.keys((await profileSave(page)).zoo.buildings)).toHaveLength(1);
  await page.reload();
  await openZoo(page);
  await page.getByRole('button', { name: '查看全部 160 份奖励', exact: true }).click();
  await expect(page.locator('.zoo-reward-card').filter({ hasText: '学会 10 个字' }).getByRole('button', { name: '已来到', exact: true })).toBeDisabled();
  expect((await profileSave(page)).zoo.claimed.sort()).toEqual(['hanzi-10', 'poems-5']);
});

test('领取全部 160 份后按 12 个分区，名册可以选中最后奖励，手机无横向溢出', async ({ page }) => {
  await seed(page, fixture(1000, 300, true));
  await expect(page.locator('.zoo-map-item')).toHaveCount(12);
  await expect(page.getByLabel('动物园草地区域')).toContainText('共 14 片');
  const last = REWARDS.at(-1)!;
  await page.getByLabel('动物园完整名册', { exact: true }).selectOption(`${last.kind}:${last.id}`);
  await expect(page.getByLabel('动物园草地区域')).toContainText('第 14 片');
  await expect(page.locator('.zoo-map-item.is-selected')).toHaveCount(1);
  await expect(page.locator('.zoo-map-item')).toHaveCount(5);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
