import { test, expect, type Page } from '@playwright/test';
import { createProfile, initialProgress, STORAGE_KEY } from '../src/store';
import type { Profile, SaveData } from '../src/types';
import { ANIMALS, FOODS } from '../src/data/rewards';
import { zooNarration } from '../src/zoo-narration';

const origin = process.env.PROMPT_TEST_URL ?? 'http://127.0.0.1:5173';
const webkit = process.env.PROMPT_TEST_ENGINE === 'webkit';
const requestedChannel = process.env.PLAYWRIGHT_CHANNEL ?? 'chrome';
const channel = requestedChannel === 'chromium' ? undefined : requestedChannel;
test.use({ browserName: webkit ? 'webkit' : 'chromium', channel: webkit ? undefined : channel, viewport: { width: 1180, height: 720 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });

function save(characters = 0): SaveData {
  // Synthetic completion records exercise reward routing, not child mastery.
  const profile = createProfile('提示操作测试');
  profile.settings.sound = false;
  profile.settings.music = false;
  for (let index = 1; index <= characters; index++) profile.hanzi[`hz-${String(index).padStart(3, '0')}`] = { ...initialProgress(), stage: 6, completed: true, reviewAt: Date.now() + 86_400_000 };
  return { version: 1, activeId: profile.id, profiles: [profile], savedAt: Date.now() };
}

async function boot(page: Page, value = save()) {
  await page.addInitScript(({ key, data }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(data)); }, { key: STORAGE_KEY, data: value });
  await page.goto(origin);
  await expect(page.getByRole('button', { name: '我的小岛', exact: true })).toBeVisible();
}

async function saved(page: Page): Promise<SaveData> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
}

async function active(page: Page): Promise<Profile> {
  const value = await saved(page);
  return value.profiles.find(profile => profile.id === value.activeId)!;
}

async function openParents(page: Page, view?: string) {
  await page.getByRole('button', { name: '家长小屋', exact: true }).click();
  await page.getByRole('textbox', { name: '家长验证答案', exact: true }).fill('13');
  await page.getByRole('button', { name: '打开家长小屋', exact: true }).click();
  if (view) await page.getByRole('navigation', { name: '家长小屋分页', exact: true }).getByRole('button', { name: view, exact: true }).click();
}

async function fits(page: Page) {
  await page.evaluate(() => document.fonts.ready);
  const failures = await page.evaluate(() => {
    const scroll = document.scrollingElement!, problems: string[] = [];
    if (scroll.scrollHeight > scroll.clientHeight + 2) problems.push('document vertical overflow');
    if (scroll.scrollWidth > scroll.clientWidth + 2) problems.push('document horizontal overflow');
    for (const panel of document.querySelectorAll<HTMLElement>('.home-page,.zoo-page,.parents-page,.library-page')) {
      if (panel.scrollHeight > panel.clientHeight + 2) problems.push(`${panel.className}: vertical overflow`);
      for (const target of panel.querySelectorAll<HTMLElement>('button,input,select,p,h1,h2,h3')) {
        if (!target.getClientRects().length) continue;
        const rect = target.getBoundingClientRect();
        if (rect.top < -2 || rect.bottom > innerHeight + 2 || rect.left < -2 || rect.right > innerWidth + 2) problems.push(`${target.getAttribute('aria-label') ?? target.textContent}: outside viewport`);
      }
    }
    return problems;
  });
  expect(failures).toEqual([]);
}

test('首页“看看奖励”直接打开邀请函，不先停在照顾页', async ({ page }) => {
  await boot(page);
  const before = (await active(page)).zoo;
  await page.getByRole('button', { name: '看看奖励', exact: true }).click();
  await expect(page.locator('.zoo-rewards')).toBeVisible();
  await expect(page.locator('.zoo-world-layout')).toHaveCount(0);
  await expect(page.locator('.zoo-feedback')).toContainText('邀请入园');
  expect((await active(page)).zoo).toEqual(before);
  await fits(page);
});

test('领取后的提示写实际视图和按钮名称，按提示可摆放并恢复位置', async ({ page }) => {
  await boot(page, save(10));
  await page.getByRole('button', { name: '看看奖励', exact: true }).click();
  await page.getByRole('button', { name: '邀请入园', exact: true }).click();
  await expect(page.locator('.zoo-feedback')).toContainText('点“照顾朋友”，再点“布置动物园”');
  await expect(page.locator('.zoo-feedback')).not.toContainText('点移动');
  await page.getByRole('button', { name: '照顾朋友', exact: true }).click();
  await page.getByRole('button', { name: '布置动物园', exact: true }).click();
  const before = (await active(page)).zoo.animals['hanzi-10'];
  const board = page.locator('.zoo-board'), rect = await board.boundingBox();
  if (!rect) throw Error('Expected a visible grassland');
  await board.click({ position: { x: rect.width * .7, y: rect.height * .65 } });
  await expect.poll(async () => (await active(page)).zoo.animals['hanzi-10'].x).toBeGreaterThan(before.x);
  const positioned = (await active(page)).zoo.animals['hanzi-10'];
  await fits(page);
  await page.reload();
  await page.getByRole('button', { name: '我的动物园', exact: true }).click();
  expect((await active(page)).zoo.animals['hanzi-10']).toEqual(positioned);
  expect((await active(page)).zoo.claimed).toEqual(['hanzi-10']);
});

test('“管理儿童档案”验证后直达档案页，当前已在家长小屋时也正确', async ({ page }) => {
  await boot(page);
  const before = await saved(page);
  await openParents(page, '声音与音乐');
  await page.getByRole('button', { name: '切换儿童档案', exact: true }).click();
  await page.getByRole('button', { name: '管理儿童档案', exact: true }).click();
  await page.getByRole('textbox', { name: '家长验证答案', exact: true }).fill('13');
  await page.getByRole('button', { name: '打开家长小屋', exact: true }).click();
  await expect(page.locator('.parent-profiles-panel')).toBeVisible();
  await expect(page.locator('.parent-settings-panel')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '儿童档案', exact: true })).toHaveAttribute('aria-current', 'page');
  expect(await saved(page)).toEqual(before);
  await fits(page);
});

test('拼音搜索提示可用：无调、大小写和ü键盘写法找到对应字', async ({ page }) => {
  await boot(page);
  await page.getByRole('button', { name: '汉字冒险', exact: true }).click();
  const search = page.getByRole('textbox', { name: '搜索汉字', exact: true });
  for (const query of ['shan', 'SHAN', 'shān']) {
    await search.fill(query);
    await expect(page.getByRole('button', { name: '学习山字', exact: true })).toBeVisible();
  }
  for (const query of ['nv', 'NÜ', 'nǚ']) {
    await search.fill(query);
    await expect(page.getByRole('button', { name: '学习女字', exact: true })).toBeVisible();
  }
  await search.fill('高山');
  await expect(page.getByRole('button', { name: '学习山字', exact: true })).toBeVisible();
  await fits(page);
});

test('“保留现有档案”移除恢复承诺，旧档案保持不变且可重新选备份', async ({ page }) => {
  await boot(page);
  await openParents(page, '备份与恢复');
  const before = await saved(page), backup = save(10);
  const file = { name: 'isolated-backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) };
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.locator('.backup-message')).toContainText('确认后将恢复备份中的进度');
  await page.getByRole('button', { name: '保留现有档案', exact: true }).click();
  await expect(page.getByRole('button', { name: '确认恢复这份备份', exact: true })).toHaveCount(0);
  await expect(page.locator('.backup-message')).toHaveText('已保留现有档案，未恢复备份。');
  expect(await saved(page)).toEqual(before);
  await fits(page);
  await page.locator('input[type=file]').setInputFiles(file);
  await expect(page.getByRole('button', { name: '确认恢复这份备份', exact: true })).toBeVisible();
});

test('创建档案的成功提示在当前页，进入备份页不会显示创建提示', async ({ page }) => {
  await boot(page, save(3));
  await openParents(page, '儿童档案');
  const previous = await active(page);
  await page.getByRole('textbox', { name: '新儿童昵称', exact: true }).fill('小树朋友');
  await page.getByRole('button', { name: '创建小岛', exact: true }).click();
  await expect(page.locator('.parents-page .page-heading [role=status]')).toHaveText('小树朋友的小岛创建好了，进度独立保存。');
  const value = await saved(page), current = await active(page);
  expect(value.profiles).toHaveLength(2);
  expect(current.name).toBe('小树朋友');
  expect(current.hanzi).toEqual({});
  expect(value.profiles.find(profile => profile.id === previous.id)).toEqual(previous);
  await fits(page);
  await page.getByRole('button', { name: '备份与恢复', exact: true }).click();
  await expect(page.locator('.backup-message')).toHaveCount(0);
  await expect(page.locator('.parents-page .page-heading p')).toHaveText('按孩子的兴趣安排节奏，保存每一次小小的成长。');
  await fits(page);
});

test('自定义名字保留在反馈中，喂食、改名和重听都使用有限播报文本', async ({ page }) => {
  // Capture the component's requested narration. This is a controlled speech
  // mock, not a listening review or evidence of native audio playback quality.
  await page.route('**/audio/manifest.json', route => route.fulfill({ json: { files: {} } }));
  await page.addInitScript(() => {
    const target = window as Window & { __zooSpoken: string[] };
    target.__zooSpoken = [];
    Object.defineProperty(window, 'SpeechSynthesisUtterance', { configurable: true, value: class {
      constructor(public text: string) {}
      onstart: (() => void) | null = null;
      onend: (() => void) | null = null;
    } });
    const pending = new Set<number>();
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ name: 'Controlled Mandarin enhanced', lang: 'zh-CN', localService: true, default: true }],
      addEventListener() {}, removeEventListener() {},
      speak(utterance: { text: string; onstart?: () => void; onend?: () => void }) {
        target.__zooSpoken.push(utterance.text);
        utterance.onstart?.();
        const timer = window.setTimeout(() => { pending.delete(timer); utterance.onend?.(); }, 20);
        pending.add(timer);
      },
      cancel() { for (const timer of pending) clearTimeout(timer); pending.clear(); },
    } });
  });
  const data = save(), rabbit = data.profiles[0].zoo.animals['welcome-rabbit'];
  rabbit.name = '蓝莓小兔';
  data.profiles[0].settings.sound = true;
  await boot(page, data);
  await page.getByRole('button', { name: '我的动物园', exact: true }).click();
  const feedback = page.locator('.zoo-feedback'), species = ANIMALS.find(animal => animal.id === 'rabbit')!;
  const lastSpoken = () => page.evaluate(() => (window as Window & { __zooSpoken: string[] }).__zooSpoken.at(-1));
  const speechCount = () => page.evaluate(() => (window as Window & { __zooSpoken: string[] }).__zooSpoken.length);
  const replay = async (text: string) => {
    const before = await speechCount();
    await page.getByRole('button', { name: '再听一次提示', exact: true }).click();
    await expect.poll(speechCount).toBeGreaterThan(before);
    await expect.poll(lastSpoken).toBe(text);
  };
  await page.getByRole('button', { name: '喂食', exact: true }).click();
  await expect.poll(lastSpoken).toBe(zooNarration.feedChoice(species));

  await page.getByRole('button', { name: '下一页食物', exact: true }).click();
  const fish = FOODS.find(food => food.id === 'fish')!;
  const before = (await active(page)).zoo.animals['welcome-rabbit'];
  await page.getByRole('button', { name: '喂小鱼', exact: true }).click();
  await expect(feedback).toContainText('谢谢你照顾蓝莓小兔');
  await expect.poll(lastSpoken).toBe(zooNarration.feedWrong(species, fish));
  expect((await active(page)).zoo.animals['welcome-rabbit']).toEqual(before);
  await replay(zooNarration.feedWrong(species, fish));

  await page.getByRole('button', { name: '上一页食物', exact: true }).click();
  const carrot = FOODS.find(food => food.id === 'carrot')!;
  await page.getByRole('button', { name: '喂胡萝卜', exact: true }).click();
  await expect(feedback).toContainText('蓝莓小兔吃了一口胡萝卜');
  await expect.poll(lastSpoken).toBe(zooNarration.feedCorrect(species, carrot));
  expect((await active(page)).zoo.animals['welcome-rabbit'].fullness).toBe(before.fullness + 22);

  await page.getByRole('button', { name: '给动物改名', exact: true }).click();
  await page.getByRole('textbox', { name: '朋友的新名字', exact: true }).fill('云朵朋友');
  await page.getByRole('button', { name: '记住名字', exact: true }).click();
  await expect(feedback).toContainText('新名字是云朵朋友');
  await expect.poll(lastSpoken).toBe(zooNarration.nameSaved);
  await replay(zooNarration.nameSaved);
  expect((await active(page)).zoo.animals['welcome-rabbit'].name).toBe('云朵朋友');
  expect(await page.evaluate(() => (window as Window & { __zooSpoken: string[] }).__zooSpoken.some(text => /蓝莓小兔|云朵朋友/.test(text)))).toBe(false);
  await fits(page);
});
