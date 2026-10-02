import { test as base, expect, chromium, webkit, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import { NARRATION_PACE, NARRATION_PAUSE_MS, type NarrationState } from '../src/narration-player';

const origin = process.env.NARRATION_TEST_URL ?? 'http://127.0.0.1:5174';
const manifest = JSON.parse(readFileSync(new URL('../public/audio/manifest.json', import.meta.url), 'utf8')) as { files: Record<string, string>; defaultPlaybackRate: number };
const phrases = ['这一笔画好啦！', '你说得真认真。'];
const catalog = Object.fromEntries(phrases.map(text => {
  const path = manifest.files[text];
  if (!path?.endsWith('.m4a') || !existsSync(new URL(`../public${path}`, import.meta.url))) throw Error(`Missing real AAC clip for ${text}`);
  return [text, path];
}));
type MediaEvent = { kind: string; id: number; path: string; time: number; currentTime: number; duration: number; rate: number; volume: number; preservesPitch: boolean; paused: boolean };
type MediaEvidence = { events: MediaEvent[]; results: Record<string, { completed: boolean; time: number }>; state: NarrationState; audios: HTMLAudioElement[] };
declare global { interface Window { __narrationFixture: MediaEvidence } }
const test = base.extend<{ engine: 'chromium' | 'webkit'; page: Page }>({
  engine: ['chromium', { option: true }],
  page: async ({ engine }, use) => {
    const requested = process.env.PLAYWRIGHT_CHANNEL;
    const channel = requested === 'chromium' ? undefined : requested ?? (process.platform === 'darwin' && existsSync('/Applications/Google Chrome.app') ? 'chrome' : undefined);
    // No autoplay-policy override: the first real media play follows a trusted
    // tap, then the real player schedules the subsequent clip itself.
    const browser = await (engine === 'chromium' ? chromium.launch({ channel }) : webkit.launch());
    const context = await browser.newContext({ viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true });
    try { await use(await context.newPage()); } finally { await context.close(); await browser.close(); }
  },
});

const fixture = buildSync({ stdin: {
  contents: `import {NarrationPlayer} from './src/narration-player';
const catalog=${JSON.stringify(catalog)},phrases=${JSON.stringify(phrases)};
const evidence={events:[],results:{},state:{speaking:false,method:null,notice:''},audios:[]};
window.__narrationFixture=evidence;
const flags={enabled:true,hidden:false};
const player=new NarrationPlayer({snapshot:()=>({...flags,rate:.8,defaultPlaybackRate:${manifest.defaultPlaybackRate},catalog,voices:[]}),onState:state=>{evidence.state={...state};},createAudio:path=>{
 const audio=new Audio(path),id=evidence.audios.length;evidence.audios.push(audio);
 // Observe native events on a genuine HTMLAudioElement. Do not replace its
 // play(), clock, duration, playbackRate, volume or ended behavior.
 for(const kind of ['play','playing','timeupdate','ratechange','volumechange','ended','pause','emptied','error'])audio.addEventListener(kind,()=>evidence.events.push({kind,id,path,time:performance.now(),currentTime:audio.currentTime,duration:audio.duration,rate:audio.playbackRate,volume:audio.volume,preservesPitch:audio.preservesPitch,paused:audio.paused}));
 return audio;
}});
const speak=(key,text)=>{void player.speak(text).then(completed=>{evidence.results[key]={completed,time:performance.now()};});};
document.getElementById('first').onclick=()=>speak('first',phrases[0]);
document.getElementById('next').onclick=()=>speak('next',phrases[1]);
document.getElementById('latest').onclick=()=>speak('latest',phrases[1]);
document.getElementById('stop').onclick=()=>player.stop();
document.getElementById('mute').onclick=()=>{flags.enabled=false;player.stop();};
document.getElementById('background').onclick=()=>{flags.hidden=true;player.stop();};
window.addEventListener('pagehide',()=>player.dispose());`,
  resolveDir: fileURLToPath(new URL('..', import.meta.url)), loader: 'ts',
}, bundle: true, write: false, format: 'iife', logLevel: 'silent' }).outputFiles[0].text;

async function openFixture(page: Page) {
  // Preserve the real LAN response's address space. route.fulfill() alone gives
  // a synthetic main document a public client address space and Chromium blocks
  // its local AAC fetches. An inert same-origin JSON document executes no app
  // music/timers; setContent retains the correctly established real origin.
  const bootstrap = await page.goto(new URL('/data/strokes/一.json', origin).href);
  expect(bootstrap?.ok()).toBe(true);
  await page.setContent(`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>button{min-width:64px;min-height:44px;margin:8px}</style><button id="first">First</button><button id="next">Next</button><button id="latest">Latest</button><button id="stop">Stop</button><button id="mute">Mute</button><button id="background">Background</button><script>${fixture.replace(/<\/script/gi, '<\\/script')}</script>`);
  await page.getByRole('button', { name: 'First', exact: true }).tap();
  await page.waitForFunction(() => {
    const audio = window.__narrationFixture.audios[0];
    const remaining = audio ? (audio.duration - audio.currentTime) / audio.playbackRate : Infinity;
    return audio && !audio.paused && audio.currentTime > .25 && remaining > .08 && remaining <= .42;
  }, undefined, { polling: 'raf' });
}
async function evidence(page: Page) {
  return page.evaluate(() => ({ events: window.__narrationFixture.events, results: window.__narrationFixture.results, state: window.__narrationFixture.state,
    audios: window.__narrationFixture.audios.map(audio => ({ currentTime: audio.currentTime, duration: audio.duration, paused: audio.paused, src: audio.getAttribute('src'), rate: audio.playbackRate, volume: audio.volume, preservesPitch: audio.preservesPitch })) }));
}

for (const engine of ['chromium', 'webkit'] as const) test.describe(`real AAC narration cadence (${engine})`, () => {
  test.use({ engine });
  test.afterEach(async ({ page }, info) => {
    if (!page.isClosed()) await info.attach('native-media-events', { body: JSON.stringify({ engine, origin, boundary: 'Native AAC playback in isolated desktop browser; mute/background drive controlled snapshot flags plus player.stop(), matching the useSpeech cancellation chain, not an actual iPad background transition or listening review.', clips: phrases.map(text => ({ text, path: catalog[text], sha256: createHash('sha256').update(readFileSync(new URL(`../public${catalog[text]}`, import.meta.url))).digest('hex') })), ...await evidence(page) }, null, 2), contentType: 'application/json' });
  });

  test('near-end taps finish the real clip at a fixed pitch-preserving rate and play only the latest after the pause', async ({ page }) => {
    expect(NARRATION_PACE).toBe(.96);
    await openFixture(page);
    const before = await evidence(page);
    expect(before.events.some(event => event.kind === 'timeupdate' && event.currentTime > .25)).toBe(true);
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await page.getByRole('button', { name: 'Latest', exact: true }).tap();
    await expect.poll(async () => (await evidence(page)).results.next?.completed).toBe(false);
    expect((await evidence(page)).results.first).toBeUndefined();
    await expect.poll(async () => (await evidence(page)).results.latest?.completed, { timeout: 10000 }).toBe(true);
    const actual = await evidence(page);
    expect(actual.results.first.completed).toBe(true);expect(actual.results.next.completed).toBe(false);
    expect(actual.events.filter(event => event.kind === 'error')).toEqual([]);
    expect(actual.audios).toHaveLength(2);
    const firstEnd = actual.events.find(event => event.id === 0 && event.kind === 'ended')!;
    const nextPlay = actual.events.find(event => event.id === 1 && event.kind === 'play')!;
    expect(firstEnd).toBeTruthy();expect(nextPlay).toBeTruthy();
    expect(Math.abs(firstEnd.currentTime - firstEnd.duration)).toBeLessThan(.06);
    expect(nextPlay.time - firstEnd.time).toBeGreaterThanOrEqual(NARRATION_PAUSE_MS - 10);
    expect(nextPlay.time - firstEnd.time).toBeLessThan(1500);
    expect(actual.results.first.time).toBeGreaterThanOrEqual(firstEnd.time + NARRATION_PAUSE_MS - 10);
    for (const id of [0, 1]) {
      const samples = actual.events.filter(event => event.id === id && ['play', 'playing', 'timeupdate', 'ratechange', 'ended'].includes(event.kind));
      expect(samples.some(event => event.currentTime > .25 && event.currentTime < event.duration)).toBe(true);
      expect(samples.some(event => event.kind === 'ratechange' && event.rate === NARRATION_PACE)).toBe(true);
      expect(samples.every(event => event.preservesPitch && Math.abs(event.rate - NARRATION_PACE) < .00001)).toBe(true);
      expect(samples.filter(event => event.currentTime > .05).every(event => event.volume === 1)).toBe(true);
      const end = samples.find(event => event.kind === 'ended')!;
      expect(end.volume).toBe(1);expect(end.rate).toBeCloseTo(NARRATION_PACE, 5);
      const clock = samples.filter(event => ['timeupdate', 'ended'].includes(event.kind));
      // Native AAC clocks can differ by one decoded frame at ended. This 20ms
      // tolerance rejects the 176ms reversals seen with repeated WebKit rate
      // changes while allowing that final frame timestamp rounding.
      expect(clock.every((event, index) => !index || event.currentTime >= clock[index - 1].currentTime - .02)).toBe(true);
      const playing = samples.find(event => event.kind === 'playing')!;
      expect(end.time - playing.time).toBeLessThan((end.duration / NARRATION_PACE + 1) * 1000);
    }
    expect(actual.state).toMatchObject({ speaking: false, method: 'local-audio', notice: '' });
  });

  for (const cancel of ['Stop', 'Mute', 'Background']) test(`${cancel} cancels the real current clip and its pending next sentence`, async ({ page }) => {
    await openFixture(page);
    await page.getByRole('button', { name: 'Next', exact: true }).tap();
    await page.getByRole('button', { name: cancel, exact: true }).tap();
    await expect.poll(async () => (await evidence(page)).results.first?.completed).toBe(false);
    await expect.poll(async () => (await evidence(page)).results.next?.completed).toBe(false);
    await page.waitForTimeout(1050);
    const actual = await evidence(page);
    expect(actual.audios).toHaveLength(1);expect(actual.audios[0].paused).toBe(true);expect(actual.audios[0].src).toBeNull();
    // load() releases the src and can discard the already queued pause event.
    // Native time had advanced; actual paused/empty state and no next play are
    // the observable cancellation contract, rather than one event ordering.
    expect(actual.events.some(event => event.kind === 'timeupdate' && event.currentTime > .25)).toBe(true);
    expect(actual.events.some(event => event.kind === 'emptied' && event.time >= actual.results.first.time - 10 && event.currentTime === 0 && event.paused)).toBe(true);
    expect(actual.events.filter(event => event.kind === 'ended')).toEqual([]);
    expect(actual.state.speaking).toBe(false);
  });
});
