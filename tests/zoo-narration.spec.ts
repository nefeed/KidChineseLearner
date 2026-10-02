import { test as base, expect, chromium, webkit, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { ANIMALS, FOODS } from '../src/data/rewards';
import { createProfile, STORAGE_KEY } from '../src/store';
import { zooNarration } from '../src/zoo-narration';

const origin = process.env.ZOO_NARRATION_TEST_URL ?? 'http://127.0.0.1:5173';
const manifestBytes = readFileSync(new URL('../public/audio/manifest.json', import.meta.url));
const manifest = JSON.parse(manifestBytes.toString()) as { files: Record<string, string>; planSHA256: string };
const rabbit = ANIMALS.find(animal => animal.id === 'rabbit')!;
const fish = FOODS.find(food => food.id === 'fish')!;
const carrot = FOODS.find(food => food.id === 'carrot')!;
const phrases = [zooNarration.nameSaved, zooNarration.feedWrong(rabbit, fish), zooNarration.feedCorrect(rabbit, carrot)];
const clips = phrases.map(text => {
  const path = manifest.files[text];
  if (!path?.endsWith('.m4a') || !existsSync(new URL(`../public${path}`, import.meta.url))) throw Error(`Missing actual AAC narration for ${text}`);
  return { text, path, sha256: createHash('sha256').update(readFileSync(new URL(`../public${path}`, import.meta.url))).digest('hex') };
});

type MediaEvent = { kind: string; id: number; path: string; time: number; currentTime: number; duration: number; rate: number; volume: number; preservesPitch: boolean; error: number | null };
type MediaEvidence = { events: MediaEvent[]; fallback: string[]; nativeAudio: boolean[] };
declare global { interface Window { __zooMedia: MediaEvidence } }

const test = base.extend<{ engine: 'chromium' | 'webkit'; page: Page }>({
  engine: ['chromium', { option: true }],
  page: async ({ engine }, use) => {
    const requested = process.env.PLAYWRIGHT_CHANNEL;
    const channel = requested === 'chromium' ? undefined : requested ?? (process.platform === 'darwin' && existsSync('/Applications/Google Chrome.app') ? 'chrome' : undefined);
    const browser = await (engine === 'webkit' ? webkit.launch() : chromium.launch({ channel }));
    const context = await browser.newContext({ viewport: { width: 1180, height: 720 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce' });
    try { await use(await context.newPage()); } finally { await context.close(); await browser.close(); }
  },
});

async function boot(page: Page) {
  // This isolated synthetic profile is only a zoo/audio fixture. No learning
  // completion records are inserted and no normal browser archive is touched.
  const profile = createProfile('真实动物园播报测试');
  profile.settings.sound = true;
  profile.settings.music = false;
  await page.addInitScript(({ key, profile }) => {
    localStorage.setItem(key, JSON.stringify({ version: 1, activeId: profile.id, profiles: [profile], savedAt: Date.now() }));
    const evidence: MediaEvidence = { events: [], fallback: [], nativeAudio: [] };
    window.__zooMedia = evidence;
    const NativeAudio = window.Audio;
    // Instrument native elements without replacing play(), events, timing,
    // decoded duration, audio bytes, volume or playback rate.
    Object.defineProperty(window, 'Audio', { configurable: true, value: new Proxy(NativeAudio, {
      construct(target, args) {
        const audio = Reflect.construct(target, args) as HTMLAudioElement;
        const id = evidence.nativeAudio.length, path = String(args[0] ?? '');
        evidence.nativeAudio.push(audio instanceof HTMLAudioElement);
        for (const kind of ['play', 'playing', 'timeupdate', 'ended', 'pause', 'error']) audio.addEventListener(kind, () => {
          evidence.events.push({ kind, id, path, time: performance.now(), currentTime: audio.currentTime, duration: audio.duration,
            rate: audio.playbackRate, volume: audio.volume, preservesPitch: audio.preservesPitch, error: audio.error?.code ?? null });
        });
        return audio;
      },
    }) });
    if ('speechSynthesis' in window) {
      const synthesis = window.speechSynthesis, nativeSpeak = synthesis.speak;
      Object.defineProperty(synthesis, 'speak', { configurable: true, value(utterance: SpeechSynthesisUtterance) {
        evidence.fallback.push(utterance.text);
        return nativeSpeak.call(synthesis, utterance);
      } });
    }
  }, { key: STORAGE_KEY, profile });
  const manifestResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/audio/manifest.json' && response.status() === 200);
  await page.goto(origin);
  const served = await (await manifestResponse).json();
  expect(served.planSHA256).toBe(manifest.planSHA256);
  for (const clip of clips) expect(served.files[clip.text]).toBe(clip.path);
  await page.getByRole('button', { name: '我的动物园', exact: true }).tap();
}

async function events(page: Page) { return page.evaluate(() => window.__zooMedia.events); }

async function playToEnd(page: Page, text: string, action: () => Promise<unknown>) {
  const path = manifest.files[text], before = (await events(page)).length;
  await action();
  const sound = page.locator('.sound-toggle');
  await expect(sound).toHaveAttribute('data-method', 'local-audio');
  await expect(sound).toHaveAttribute('data-speaking', 'true');
  await expect.poll(async () => (await events(page)).slice(before).some(event => event.path === path && event.kind === 'playing'), { timeout: 10000 }).toBe(true);
  await expect.poll(async () => (await events(page)).slice(before).some(event => event.path === path && event.kind === 'ended'), { timeout: 30000 }).toBe(true);
  await expect(sound).toHaveAttribute('data-speaking', 'false');
  const observed = (await events(page)).slice(before).filter(event => event.path === path);
  expect(observed.some(event => event.kind === 'timeupdate' && event.currentTime > .1)).toBe(true);
  const end = observed.find(event => event.kind === 'ended')!;
  expect(end.duration).toBeGreaterThan(.1);
  expect(Math.abs(end.currentTime - end.duration)).toBeLessThan(.06);
  expect(end.preservesPitch).toBe(true);
  expect(end.volume).toBe(1);
  expect(observed.filter(event => event.kind === 'error')).toEqual([]);
  expect(await page.evaluate(() => window.__zooMedia.fallback)).toEqual([]);
}

for (const engine of ['chromium', 'webkit'] as const) test.describe(`正式App动物园原生AAC播报 (${engine})`, () => {
  test.use({ engine });
  test('改名、重听、错误和正确喂食使用新manifest并真实播完，没有系统声音回退', async ({ page }, info) => {
    test.setTimeout(120000);
    const requests: string[] = [];
    page.on('request', request => { const path = new URL(request.url()).pathname; if (path.endsWith('.m4a')) requests.push(path); });
    try {
      await boot(page);
      await page.getByRole('button', { name: '给动物改名', exact: true }).tap();
      await page.getByRole('textbox', { name: '朋友的新名字', exact: true }).fill('云朵小兔');
      await playToEnd(page, zooNarration.nameSaved, () => page.getByRole('button', { name: '记住名字', exact: true }).tap());
      await expect(page.locator('.zoo-feedback')).toContainText('新名字是云朵小兔');
      await playToEnd(page, zooNarration.nameSaved, () => page.getByRole('button', { name: '再听一次提示', exact: true }).tap());

      await page.getByRole('button', { name: '下一页食物', exact: true }).tap();
      await playToEnd(page, zooNarration.feedWrong(rabbit, fish), () => page.getByRole('button', { name: '喂小鱼', exact: true }).tap());
      await expect(page.locator('.zoo-feedback')).toContainText('谢谢你照顾云朵小兔');
      await page.getByRole('button', { name: '上一页食物', exact: true }).tap();
      await playToEnd(page, zooNarration.feedCorrect(rabbit, carrot), () => page.getByRole('button', { name: '喂胡萝卜', exact: true }).tap());
      await expect(page.locator('.zoo-feedback')).toContainText('云朵小兔吃了一口胡萝卜');

      expect(clips.filter(clip => !requests.includes(clip.path))).toEqual([]);
      const evidence = await page.evaluate(() => window.__zooMedia);
      expect(evidence.nativeAudio.length).toBeGreaterThanOrEqual(3);
      expect(evidence.nativeAudio.every(Boolean)).toBe(true);
      expect(evidence.events.filter(event => event.kind === 'ended')).toHaveLength(4);
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)!), STORAGE_KEY);
      const animal = saved.profiles[0].zoo.animals['welcome-rabbit'];
      expect(animal.name).toBe('云朵小兔');
      expect(animal.fullness).toBe(87);
      expect(saved.profiles[0].hanzi).toEqual({});
    } finally {
      if (!page.isClosed()) await info.attach('zoo-native-media-evidence', { contentType: 'application/json', body: JSON.stringify({ engine, origin,
        boundary: 'Native AAC playback in the actual App and an isolated desktop browser; this verifies routing/completion, not a human listening review or physical iPad test.',
        manifestSHA256: createHash('sha256').update(manifestBytes).digest('hex'), planSHA256: manifest.planSHA256, clips, requests,
        ...await page.evaluate(() => window.__zooMedia) }, null, 2) });
    }
  });
});
