import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement, StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { useSpeech } from '../src/speech';
import {
  isMandarinVoice, narrationPlaybackRate, NarrationPlayer, NARRATION_PAUSE_MS,
  NARRATION_POOL_LIMIT, NARRATION_PRELOAD_COUNT, preferredNarrationVoice,
  type NarrationSnapshot, type NarrationState,
} from '../src/narration-player';

class FakeAudio {
  preload = '';
  currentTime = 8;
  playbackRate = 1;
  preservesPitch = false;
  volume = 1;
  onplay: (() => void) | null = null;
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  loads = 0;
  pauses = 0;
  plays = 0;
  removedAttributes: string[] = [];
  rejectPlay: ((reason?: unknown) => void) | null = null;
  constructor(public src: string) {}
  load() { this.loads++; }
  pause() { this.pauses++; }
  removeAttribute(name: string) {
    this.removedAttributes.push(name);
    if (name === 'src') this.src = '';
  }
  play() {
    this.plays++;
    return new Promise<void>((_resolve,reject) => { this.rejectPlay = reject; });
  }
  start() { this.onplay?.(); }
  end() { this.onended?.(); }
  fail() { this.onerror?.(); }
}

class FakeUtterance {
  lang = '';
  rate = 1;
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
  start() { this.onstart?.(); }
  end() { this.onend?.(); }
  fail() { this.onerror?.(); }
}

class FakeSynthesis {
  spoken: FakeUtterance[] = [];
  cancellations = 0;
  throwOnSpeak = false;
  speak(utterance: SpeechSynthesisUtterance) {
    if (this.throwOnSpeak) throw new Error('system voice failed');
    this.spoken.push(utterance as unknown as FakeUtterance);
  }
  cancel() { this.cancellations++; }
}

class FakeTimers {
  now = 0;
  private sequence = 0;
  tasks = new Map<number,{callback: () => void; at: number; delay: number}>();
  cleared: number[] = [];
  setTimeout = (callback: () => void,delay: number) => {
    const token = ++this.sequence;
    this.tasks.set(token,{callback,at:this.now+delay,delay});
    return token;
  };
  clearTimeout = (token: unknown) => {
    this.cleared.push(token as number);
    this.tasks.delete(token as number);
  };
  advance(milliseconds: number) {
    const target = this.now + milliseconds;
    while (true) {
      const next = [...this.tasks].filter(([,task]) => task.at <= target)
        .sort((left,right) => left[1].at-right[1].at)[0];
      if (!next) break;
      this.now = next[1].at;
      this.tasks.delete(next[0]);
      next[1].callback();
    }
    this.now = target;
  }
}

function voice(name: string,lang = 'zh-CN',voiceURI = name): SpeechSynthesisVoice {
  return {name,lang,voiceURI,default:false,localService:true};
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const watch = (promise: Promise<boolean>) => {
  const results: boolean[] = [];
  void promise.then(result => results.push(result));
  return results;
};

function setup(overrides: Partial<NarrationSnapshot> = {},systemAvailable = true) {
  const snapshot: NarrationSnapshot = {
    enabled:true,rate:.8,catalog:{'你好':'/audio/hello.m4a'},voices:[voice('Linfei')],...overrides,
  };
  const audios: FakeAudio[] = [],utterances: FakeUtterance[] = [],states: NarrationState[] = [];
  const timers = new FakeTimers(),synthesis = new FakeSynthesis();
  let throwOnAudioCreation = false;
  const player = new NarrationPlayer({
    snapshot:() => snapshot,
    createAudio:path => {
      if (throwOnAudioCreation) throw new Error('media unsupported');
      const audio = new FakeAudio(path);audios.push(audio);
      return audio as unknown as HTMLAudioElement;
    },
    createUtterance:text => {
      const utterance = new FakeUtterance(text);utterances.push(utterance);
      return utterance as unknown as SpeechSynthesisUtterance;
    },
    synthesis:() => systemAvailable ? synthesis : undefined,
    timers,onState:state => states.push(state),
  });
  return {
    player,snapshot,audios,utterances,states,timers,synthesis,
    state:() => states.at(-1)!,failAudioCreation:() => { throwOnAudioCreation = true; },
  };
}

test('local narration completes only after playback starts, ends and its quiet tail passes',async () => {
  const {player,audios,timers,state} = setup();
  const promise = player.speak('你好'),results = watch(promise),audio = audios[0];
  assert.equal(state().speaking,true);
  assert.equal(audio.currentTime,0);
  audio.end();timers.advance(1000);await settle();
  assert.deepEqual(results,[],'an end without an actual start is not successful playback');
  audio.start();
  assert.equal(state().method,'local-audio');
  assert.equal(audio.volume,.88);
  timers.advance(4);assert.equal(audio.volume,.94);
  timers.advance(6);assert.equal(audio.volume,1);
  audio.end();
  assert.equal(state().speaking,true,'keep background music ducked during the quiet tail');
  timers.advance(NARRATION_PAUSE_MS-1);await settle();assert.deepEqual(results,[]);
  timers.advance(1);assert.equal(await promise,true);
  assert.equal(state().speaking,false);
  assert.equal(timers.tasks.size,0);
  assert.equal(player.cachedAudioCount,1,'a completed clip remains reusable');
  player.dispose();
});

test('natural end cancels the startup fade and respects a requested 240ms pause',async () => {
  const {player,audios,timers,state} = setup();
  const promise = player.speak('你好',undefined,undefined,{pauseAfterMs:240});
  audios[0].start();
  const startupTimers = [...timers.tasks.keys()];
  audios[0].end();
  assert.ok(startupTimers.every(token => timers.cleared.includes(token)));
  assert.deepEqual([...timers.tasks.values()].map(task => task.delay),[240]);
  timers.advance(239);assert.equal(state().speaking,true);
  timers.advance(1);assert.equal(await promise,true);
  player.dispose();
});

test('tail pause supports immediate completion and bounds invalid or excessive values',async t => {
  for (const [pause,expected] of [[0,0],[-20,0],[4000,3000],[NaN,NARRATION_PAUSE_MS]] as const) {
    await t.test(String(pause),async () => {
      const {player,audios,timers,state} = setup();
      const promise = player.speak('你好',undefined,undefined,{pauseAfterMs:pause});
      audios[0].start();audios[0].end();
      if (expected) {
        assert.equal(state().speaking,true);
        assert.deepEqual([...timers.tasks.values()].map(task => task.delay),[expected]);
        timers.advance(expected);
      }
      assert.equal(await promise,true);player.dispose();
    });
  }
});

test('stop, mute, hidden and dispose interrupt playback and resolve false',async t => {
  for (const reason of ['stop','mute','hidden','dispose'] as const) {
    await t.test(reason,async () => {
      const {player,audios,snapshot,timers,state} = setup();
      const promise = player.speak('你好');audios[0].start();
      if (reason==='mute') { snapshot.enabled = false;audios[0].end(); }
      else if (reason==='hidden') { snapshot.hidden = true;audios[0].end(); }
      else if (reason==='dispose') player.dispose();
      else player.stop();
      assert.equal(await promise,false);
      assert.equal(state().speaking,false);assert.equal(timers.tasks.size,0);
      assert.equal(audios[0].src,'');assert.ok(audios[0].pauses>0);
      assert.equal(audios[0].onplay,null);assert.equal(audios[0].onended,null);assert.equal(audios[0].onerror,null);
      player.dispose();
    });
  }
});

test('cancelling the quiet tail clears its timer and a queued stale timer cannot complete later speech',async () => {
  const {player,audios,timers,state} = setup();
  const first = player.speak('你好');audios[0].start();audios[0].end();
  const oldTail = [...timers.tasks.values()][0].callback;
  const second = player.speak('你好'),secondResults = watch(second);
  assert.equal(await first,false);assert.equal(timers.tasks.size,0);
  oldTail();await settle();
  assert.deepEqual(secondResults,[]);assert.equal(state().speaking,true);
  audios[1].start();audios[1].end();timers.advance(NARRATION_PAUSE_MS);
  assert.equal(await second,true);player.dispose();
});

test('rapid replay isolates late start, end, error and play rejection callbacks from the previous clip',async () => {
  const {player,audios,utterances,timers,state} = setup();
  const first = player.speak('你好'),old = audios[0];
  const callbacks = [old.onplay!,old.onended!,old.onerror!];
  const second = player.speak('你好'),results = watch(second);
  assert.notEqual(audios[1],old,'a cancelled element must not carry media events into replay');
  assert.equal(await first,false);
  callbacks.forEach(callback => callback());old.rejectPlay?.(new Error('late rejection'));
  await settle();
  assert.deepEqual(results,[]);assert.equal(utterances.length,0);
  assert.equal(state().speaking,true);assert.equal(timers.tasks.size,0);
  audios[1].start();audios[1].end();timers.advance(NARRATION_PAUSE_MS);
  assert.equal(await second,true);player.dispose();
});

test('muted, hidden, blank and disposed requests never construct or start audio',async t => {
  for (const reason of ['muted','hidden','blank','disposed'] as const) {
    await t.test(reason,async () => {
      const {player,snapshot,audios,synthesis} = setup();
      if (reason==='muted') snapshot.enabled = false;
      if (reason==='hidden') snapshot.hidden = true;
      if (reason==='disposed') player.dispose();
      assert.equal(await player.speak(reason==='blank' ? '   ' : '你好'),false);
      player.preload(['你好']);
      if (reason!=='blank') assert.equal(audios.length,0);
      assert.equal(synthesis.spoken.length,0);player.dispose();
    });
  }
});

test('a missing local clip uses system voice and requires its start, end and quiet tail',async () => {
  const {player,synthesis,timers,state} = setup({rate:.7});
  const promise = player.speak('月亮'),results = watch(promise),utterance = synthesis.spoken[0];
  assert.equal(utterance.text,'月亮');assert.equal(utterance.lang,'zh-CN');assert.equal(utterance.rate,.7);
  assert.equal(state().method,'system-voice');assert.equal(state().speaking,true);
  utterance.end();timers.advance(1000);await settle();assert.deepEqual(results,[]);
  utterance.start();utterance.end();timers.advance(NARRATION_PAUSE_MS-1);
  await settle();assert.deepEqual(results,[]);assert.equal(state().speaking,true);
  timers.advance(1);assert.equal(await promise,true);assert.equal(utterance.onend,null);
  player.dispose();
});

test('media error plus play rejection and stale events fall back only once',async () => {
  const {player,audios,synthesis,timers,state} = setup();
  const promise = player.speak('你好',undefined,'完整的你好'),results = watch(promise),audio = audios[0];
  audio.start();const oldEnd = audio.onended!,oldError = audio.onerror!;
  audio.fail();audio.rejectPlay?.(new Error('decode failed'));oldError();oldEnd();await settle();
  assert.equal(synthesis.spoken.length,1);assert.equal(synthesis.spoken[0].text,'完整的你好');
  assert.equal(audio.src,'');assert.equal(timers.tasks.size,0);
  assert.deepEqual(results,[]);assert.equal(state().speaking,true);
  synthesis.spoken[0].start();synthesis.spoken[0].end();timers.advance(NARRATION_PAUSE_MS);
  assert.equal(await promise,true);player.dispose();
});

test('an asynchronous play rejection and synchronous audio construction error each invoke fallback',async t => {
  for (const reason of ['rejection','construction'] as const) {
    await t.test(reason,async () => {
      const {player,audios,synthesis,timers,failAudioCreation} = setup();
      if (reason==='construction') failAudioCreation();
      const promise = player.speak('你好');
      if (reason==='rejection') audios[0].rejectPlay?.(new Error('autoplay unavailable'));
      await settle();assert.equal(synthesis.spoken.length,1);
      synthesis.spoken[0].start();synthesis.spoken[0].end();timers.advance(NARRATION_PAUSE_MS);
      assert.equal(await promise,true);player.dispose();
    });
  }
});

test('missing system support, missing voices, system failure and throwing synthesis resolve false',async t => {
  for (const reason of ['no-synthesis','no-voices','voice-error','speak-throws'] as const) {
    await t.test(reason,async () => {
      const {player,synthesis,state,timers} = setup(reason==='no-voices' ? {voices:[]} : {},reason!=='no-synthesis');
      if (reason==='speak-throws') synthesis.throwOnSpeak = true;
      const promise = player.speak('没有录音');
      if (reason==='voice-error') { synthesis.spoken[0].start();synthesis.spoken[0].fail(); }
      assert.equal(await promise,false);assert.equal(state().speaking,false);
      assert.ok(state().notice.length>0);assert.equal(timers.tasks.size,0);
      if (reason.startsWith('no-')) assert.equal(state().method,'unavailable');
      player.clearNotice();assert.equal(state().notice,'');player.dispose();
    });
  }
});

test('late callbacks from a cancelled system voice cannot finish or fail the next request',async () => {
  const {player,synthesis,audios,timers,state} = setup();
  const first = player.speak('月亮'),old = synthesis.spoken[0];old.start();
  const stale = [old.onstart!,old.onend!,old.onerror!];
  const second = player.speak('你好'),results = watch(second);
  assert.equal(await first,false);stale.forEach(callback => callback());await settle();
  assert.deepEqual(results,[]);assert.equal(state().speaking,true);assert.equal(state().notice,'');
  assert.equal(old.onstart,null);assert.equal(old.onend,null);assert.equal(old.onerror,null);
  audios[0].start();audios[0].end();timers.advance(NARRATION_PAUSE_MS);
  assert.equal(await second,true);player.dispose();
});

test('local playback preserves pitch and maps the parent rate relative to the manifest default',async () => {
  assert.equal(narrationPlaybackRate(.8),.8);
  assert.equal(narrationPlaybackRate(.8,.86),.86);
  assert.ok(Math.abs(narrationPlaybackRate(.6,.86)-.645)<1e-12);
  assert.equal(narrationPlaybackRate(.8,NaN),.8);
  assert.equal(narrationPlaybackRate(.8,-1),.8);
  assert.equal(narrationPlaybackRate(NaN),.8);
  assert.equal(narrationPlaybackRate(-1,.86),.86);
  assert.equal(narrationPlaybackRate(.1,.86),.5);
  assert.equal(narrationPlaybackRate(10,.86),2);
  const {player,audios} = setup({rate:.6,defaultPlaybackRate:.86});
  const promise = player.speak('你好');
  assert.ok(Math.abs(audios[0].playbackRate-.645)<1e-12);
  assert.equal(audios[0].preservesPitch,true);
  player.stop();assert.equal(await promise,false);player.dispose();
});

test('phrase fallback text selects a complete clip while an explicit path takes precedence',async () => {
  const {player,audios} = setup({catalog:{'日':'/short.m4a','太阳的日':'/complete.m4a'}});
  const first = player.speak('日',undefined,'太阳的日');
  assert.equal(audios[0].src,'/complete.m4a');player.stop();assert.equal(await first,false);
  const second = player.speak('日','/explicit.m4a','太阳的日');
  assert.equal(audios[1].src,'/explicit.m4a');player.stop();assert.equal(await second,false);
  player.dispose();
});

test('preload is limited to 12 clips, the LRU pool to 16 and eviction releases the media source',() => {
  const texts = Array.from({length:30},(_,index) => `字${index}`);
  const catalog = Object.fromEntries(texts.map((text,index) => [text,`/clip-${index}.m4a`]));
  const {player,audios} = setup({catalog});
  player.preload(texts);
  assert.equal(audios.length,NARRATION_PRELOAD_COUNT);assert.equal(player.cachedAudioCount,NARRATION_PRELOAD_COUNT);
  assert.ok(audios.every(audio => audio.preload==='auto' && audio.loads===1 && audio.plays===0));
  player.preload(texts.slice(0,12));assert.equal(audios.length,12,'preload reuses cached audio');
  player.preload(texts.slice(12));
  assert.equal(audios.length,24);assert.equal(player.cachedAudioCount,NARRATION_POOL_LIMIT);
  assert.ok(audios.slice(0,8).every(audio => audio.src==='' && audio.loads===2 && audio.pauses===1));
  assert.ok(audios.slice(8).every(audio => audio.src!==''));
  player.dispose();assert.equal(player.cachedAudioCount,0);
  assert.ok(audios.every(audio => audio.src===''));
  assert.doesNotThrow(() => player.dispose());
});

test('preloading while a clip plays never evicts the active clip even when it is least recently used',async () => {
  const texts = Array.from({length:25},(_,index) => `字${index}`);
  const catalog = Object.fromEntries(texts.map((text,index) => [text,`/clip-${index}.m4a`]));
  const {player,audios,timers} = setup({catalog});
  const promise = player.speak(texts[0]),active = audios[0];active.start();
  player.preload(texts.slice(1,13));player.preload(texts.slice(13));
  assert.equal(player.cachedAudioCount,NARRATION_POOL_LIMIT);assert.equal(active.src,'/clip-0.m4a');
  assert.equal(active.pauses,0);assert.ok(audios.slice(1,10).every(audio => audio.src===''));
  active.end();timers.advance(NARRATION_PAUSE_MS);assert.equal(await promise,true);
  player.dispose();
});

test('preload skips absent catalog entries and duplicate paths',() => {
  const {player,audios} = setup({catalog:{'你好':'/hello.m4a','您好':'/hello.m4a'}});
  player.preload(['没有','你好','您好']);assert.equal(audios.length,1);assert.equal(audios[0].plays,0);
  player.dispose();
});

test('fallback prefers Linfei, Meijia, Xiaoxiao and enhanced voices before plain Tingting',async t => {
  for (const preferred of [voice('Linfei'),voice('Meijia','zh-TW'),voice('Microsoft Xiaoxiao Online'),
    voice('晓晓'),voice('中文增强','zh-CN','com.apple.voice.enhanced.zh-CN.Unknown')]) {
    await t.test(preferred.name,async () => {
      const {player,synthesis} = setup({voices:[voice('Other Mandarin'),voice('Tingting'),preferred]});
      const promise = player.speak('没有录音');
      assert.equal(synthesis.spoken[0].voice,preferred);player.stop();assert.equal(await promise,false);player.dispose();
    });
  }
  const tingting = voice('Tingting'),other = voice('Mandarin');
  assert.equal(preferredNarrationVoice([other,tingting]),tingting);
  assert.equal(preferredNarrationVoice([other]),other);
  assert.equal(preferredNarrationVoice([]),undefined);
  assert.equal(preferredNarrationVoice([voice('Linfei'),voice('Linfei','zh-CN','enhanced.Linfei')])?.voiceURI,'enhanced.Linfei');
});

test('Mandarin voice filtering includes Taiwan Mandarin and excludes Cantonese and other languages',() => {
  for (const lang of ['zh-CN','zh_CN','zh-Hans','zh-Hans-CN','zh-TW','zh-Hant','zh-Hant-TW','cmn','cmn-CN']) {
    assert.equal(isMandarinVoice(voice('Voice',lang)),true,lang);
  }
  for (const lang of ['zh-HK','zh-Hant-HK','yue-CN','en-US','ja-JP','zh-CNonsense']) {
    assert.equal(isMandarinVoice(voice('Voice',lang)),false,lang);
  }
});

class TrackedTarget extends EventTarget {
  live = new Map<string,Set<EventListenerOrEventListenerObject>>();
  added = new Map<string,number>();
  removed = new Map<string,number>();
  override addEventListener(type: string,listener: EventListenerOrEventListenerObject | null,options?: AddEventListenerOptions | boolean) {
    if (listener) {
      this.added.set(type,(this.added.get(type)??0)+1);
      if (!this.live.has(type)) this.live.set(type,new Set());
      this.live.get(type)!.add(listener);
    }
    super.addEventListener(type,listener,options);
  }
  override removeEventListener(type: string,listener: EventListenerOrEventListenerObject | null,options?: EventListenerOptions | boolean) {
    if (listener) {
      this.removed.set(type,(this.removed.get(type)??0)+1);
      this.live.get(type)?.delete(listener);
    }
    super.removeEventListener(type,listener,options);
  }
}

test('StrictMode recreates the hook player and unmount cancels playback, fetches and listeners',async () => {
  // The component renders no elements, so the React root needs only event targets
  // and the container's identity. This runs actual effects without a browser.
  const globalNames = ['window','document','Audio','fetch','IS_REACT_ACT_ENVIRONMENT'];
  const previous = globalNames.map(name => Object.getOwnPropertyDescriptor(globalThis,name));
  const doc = Object.assign(new TrackedTarget(),{
    nodeType:9,hidden:false,activeElement:null,body:null,defaultView:null as unknown,
  });
  const synthesis = Object.assign(new TrackedTarget(),{getVoices:() => [],cancel() {},speak() {}});
  const win = Object.assign(new TrackedTarget(),{document:doc,HTMLIFrameElement:class {},speechSynthesis:synthesis});
  doc.defaultView = win;
  const container = Object.assign(new TrackedTarget(),{
    nodeType:1,tagName:'DIV',nodeName:'DIV',namespaceURI:'http://www.w3.org/1999/xhtml',ownerDocument:doc,textContent:'',
  });
  const signals: AbortSignal[] = [],clips: FakeAudio[] = [];
  class HookAudio extends FakeAudio {
    constructor(path: string) { super(path);clips.push(this); }
    override play() { const promise = super.play();this.start();return promise; }
  }
  Object.assign(globalThis,{
    document:doc,window:win,Audio:HookAudio,IS_REACT_ACT_ENVIRONMENT:true,
    fetch:(_url: unknown,options: {signal: AbortSignal}) => {
      signals.push(options.signal);
      return Promise.resolve({ok:true,json:async () => ({files:{'日':'/audio/day.m4a'},defaultPlaybackRate:.86})});
    },
  });
  let api: ReturnType<typeof useSpeech> | undefined;
  let setups = 0,cleanups = 0;
  function Harness({enabled = true}: {enabled?: boolean}) {
    api = useSpeech(enabled,.8);
    useEffect(() => { setups++;return () => { cleanups++; }; },[]);
    return null;
  }
  const root = createRoot(container as unknown as Element);
  try {
    await act(async () => { root.render(createElement(StrictMode,null,createElement(Harness))); });
    assert.equal(setups,2);assert.equal(cleanups,1);
    assert.equal(signals.length,2);assert.equal(signals[0].aborted,true);assert.equal(signals[1].aborted,false);
    for (const [target,type] of [[doc,'visibilitychange'],[win,'pagehide'],[synthesis,'voiceschanged']] as const) {
      assert.equal(target.added.get(type),2);assert.equal(target.removed.get(type),1);
      assert.equal(target.live.get(type)?.size,1);
    }
    let first!: Promise<boolean>;
    await act(async () => { first = api!.speak('日',undefined,'日',{pauseAfterMs:0}); });
    assert.equal(clips.length,1);assert.equal(clips[0].plays,1);assert.equal(clips[0].playbackRate,.86);
    assert.equal(api!.speaking,true);
    await act(async () => { clips[0].end(); });
    assert.equal(await first,true);assert.equal(api!.speaking,false);
    let pending!: Promise<boolean>;
    await act(async () => { pending = api!.speak('日'); });
    assert.equal(clips[0].plays,2);
    await act(async () => { root.render(createElement(StrictMode,null,createElement(Harness,{enabled:false}))); });
    assert.equal(await pending,false);assert.equal(api!.speaking,false);
    await act(async () => { root.render(createElement(StrictMode,null,createElement(Harness))); });
    await act(async () => { pending = api!.speak('日'); });
    await act(async () => { doc.hidden = true;doc.dispatchEvent(new Event('visibilitychange')); });
    assert.equal(await pending,false);assert.equal(api!.speaking,false);
    doc.hidden = false;
    await act(async () => { pending = api!.speak('日'); });
    await act(async () => { win.dispatchEvent(new Event('pagehide')); });
    assert.equal(await pending,false);assert.equal(api!.speaking,false);
    await act(async () => { pending = api!.speak('日'); });
    const clip = clips.at(-1)!,pausesBeforeUnmount = clip.pauses;
    await act(async () => { root.unmount(); });
    assert.equal(await pending,false);assert.ok(clip.pauses>pausesBeforeUnmount);
    assert.equal(clip.src,'');assert.equal(clip.onplay,null);assert.equal(clip.onended,null);assert.equal(clip.onerror,null);
    assert.equal(cleanups,2);assert.equal(signals[1].aborted,true);
    for (const [target,type] of [[doc,'visibilitychange'],[win,'pagehide'],[synthesis,'voiceschanged']] as const) {
      assert.equal(target.removed.get(type),2);assert.equal(target.live.get(type)?.size,0);
    }
    assert.equal(await api!.speak('日'),false);
  } finally {
    await act(async () => { root.unmount(); });
    globalNames.forEach((name,index) => {
      if (previous[index]) Object.defineProperty(globalThis,name,previous[index]!);
      else delete (globalThis as unknown as Record<string,unknown>)[name];
    });
  }
});
