export type NarrationMethod = 'local-audio' | 'system-voice' | 'unavailable' | null;
export interface NarrationOptions { pauseAfterMs?: number }
export interface NarrationSnapshot {
  enabled: boolean; rate: number; catalog: Record<string,string>;
  voices: readonly SpeechSynthesisVoice[]; defaultPlaybackRate?: number; hidden?: boolean;
}
export interface NarrationState { speaking: boolean; method: NarrationMethod; notice: string }
interface NarrationTimers {
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(token: unknown): void;
}
interface PlayerDependencies {
  snapshot: () => NarrationSnapshot;
  createAudio?: (path: string) => HTMLAudioElement;
  createUtterance?: (text: string) => SpeechSynthesisUtterance;
  synthesis?: () => Pick<SpeechSynthesis,'speak'|'cancel'> | undefined;
  timers?: NarrationTimers;
  onState?: (state: NarrationState) => void;
}
interface Request {
  resolve: (completed: boolean) => void;
  phase: 'audio' | 'system' | 'tail';
  audio: HTMLAudioElement | null; path?: string;
  utterance: SpeechSynthesisUtterance | null;
  timers: Set<unknown>; started: boolean; fallbackStarted: boolean;
}
export const NARRATION_PRELOAD_COUNT = 12;
export const NARRATION_POOL_LIMIT = 16;
export const NARRATION_PAUSE_MS = 260;
export const NARRATION_FINISH_WINDOW_SECONDS = .65;
export const NARRATION_PACE = .96;

export function isMandarinVoice(voice: SpeechSynthesisVoice) {
  return /^zh[-_](CN|TW)(?:[-_]|$)|^zh[-_]Hans(?:[-_]|$)|^zh[-_]Hant(?:[-_]TW)?$|^cmn(?:[-_]|$)/i.test(voice.lang);
}

export function preferredNarrationVoice(voices: readonly SpeechSynthesisVoice[]) {
  const score = (voice: SpeechSynthesisVoice) => {
    const identity = `${voice.name} ${voice.voiceURI}`;
    const natural = /enhanced|premium|natural|neural|增强|自然/i.test(identity);
    if (/Linfei|Meijia|Xiao[ -]?xiao|晓晓/i.test(identity)) return 300 + Number(natural);
    if (natural) return 200;
    if (/Ting[ -]?ting|婷婷/i.test(identity)) return 100;
    return 0;
  };
  return voices.reduce<SpeechSynthesisVoice | undefined>((preferred,voice) =>
    !preferred || score(voice)>score(preferred) ? voice : preferred,undefined);
}

export function narrationPlaybackRate(rate: number, defaultPlaybackRate?: number) {
  const parentRate = Number.isFinite(rate) && rate > 0 ? rate : .8;
  const adjusted = Number.isFinite(defaultPlaybackRate) && defaultPlaybackRate! > 0
    ? parentRate/.8*defaultPlaybackRate! : parentRate;
  return Math.max(.5,Math.min(2,adjusted));
}
const browserTimers: NarrationTimers = {
  setTimeout: (callback,ms) => globalThis.setTimeout(callback,ms),
  clearTimeout: token => globalThis.clearTimeout(token as ReturnType<typeof setTimeout>),
};

/** A completed request means the actual voice finished, including its quiet tail. */
export class NarrationPlayer {
  private request: Request | null = null;
  private pending: {start: () => void; cancel: () => void} | null = null;
  private pool = new Map<string,HTMLAudioElement>();
  private state: NarrationState = {speaking:false,method:null,notice:''};
  private disposed = false;
  private readonly dependencies: PlayerDependencies;
  private readonly timers: NarrationTimers;
  constructor(dependencies: PlayerDependencies) {
    this.dependencies = dependencies;
    this.timers = dependencies.timers ?? browserTimers;
  }
  get cachedAudioCount() { return this.pool.size; }
  private publish(patch: Partial<NarrationState>) {
    this.state = {...this.state,...patch};
    this.dependencies.onState?.(this.state);
  }
  clearNotice() { this.publish({notice:''}); }
  private canPlay() {
    const snapshot = this.dependencies.snapshot();
    return !this.disposed && snapshot.enabled && !snapshot.hidden;
  }
  private current(request: Request) {
    if (this.request !== request || this.disposed) return false;
    if (!this.canPlay()) {this.stop();return false;}
    return true;
  }
  private synthesis() {
    return this.dependencies.synthesis?.() ?? (typeof window !== 'undefined' ? window.speechSynthesis : undefined);
  }
  private releaseAudio(audio: HTMLAudioElement) {
    audio.onplay = null; audio.onended = null; audio.onerror = null;
    audio.pause();
    // Release decoded media as well as the reference when evicting a clip.
    audio.removeAttribute('src');audio.load();
  }
  private clip(path: string) {
    const cached = this.pool.get(path);
    if (cached) {this.pool.delete(path);this.pool.set(path,cached);return cached;}
    const audio = (this.dependencies.createAudio ?? (source => new Audio(source)))(path);
    audio.preload = 'auto';audio.load();this.pool.set(path,audio);
    while (this.pool.size > NARRATION_POOL_LIMIT) {
      const candidate = [...this.pool].find(([,entry]) => entry !== this.request?.audio);
      if (!candidate) break;
      this.pool.delete(candidate[0]);this.releaseAudio(candidate[1]);
    }
    return audio;
  }
  preload(texts: readonly string[]) {
    if (!this.canPlay()) return;
    const {catalog} = this.dependencies.snapshot();
    const paths = new Set(texts.slice(0,NARRATION_PRELOAD_COUNT).map(text => catalog[text]).filter(Boolean));
    for (const path of paths) {try {this.clip(path);} catch { /* playback can use the system voice */ }}
  }
  private later(request: Request, callback: () => void, ms: number) {
    const token = this.timers.setTimeout(() => {
      request.timers.delete(token);
      if (this.current(request)) callback();
    },ms);
    request.timers.add(token);
  }
  private clearTimers(request: Request) {
    for (const token of request.timers) this.timers.clearTimeout(token);
    request.timers.clear();
  }
  private detach(request: Request, canceled: boolean) {
    this.clearTimers(request);
    if (request.audio) {
      const audio = request.audio;
      audio.onplay = null;audio.onended = null;audio.onerror = null;
      audio.pause();audio.volume = 1;
      if (canceled) {
        if (request.path && this.pool.get(request.path)===audio) this.pool.delete(request.path);
        this.releaseAudio(audio);
      }
      request.audio = null;
    }
    if (request.utterance) {
      request.utterance.onstart = null;request.utterance.onend = null;request.utterance.onerror = null;
      request.utterance = null;
    }
  }
  stop() {
    const pending = this.pending;this.pending = null;pending?.cancel();
    const request = this.request;this.request = null;
    if (request) {this.detach(request,true);request.resolve(false);}
    this.synthesis()?.cancel();this.publish({speaking:false});
  }
  private finish(request: Request, completed: boolean) {
    if (this.request !== request) return;
    this.request = null;this.detach(request,!completed);
    const pending = this.pending;this.pending = null;
    if (!pending) this.publish({speaking:false});
    request.resolve(completed);pending?.start();
  }
  private naturalEnd(request: Request, options: NarrationOptions) {
    if (!this.current(request) || !request.started || request.phase==='tail') return;
    request.phase = 'tail';this.clearTimers(request);
    const pause = Number.isFinite(options.pauseAfterMs) ? Math.max(0,Math.min(3000,options.pauseAfterMs!)) : NARRATION_PAUSE_MS;
    if (!pause) this.finish(request,true);
    else this.later(request,() => this.finish(request,true),pause);
  }
  speak(text: string,audioPath?: string,fallbackText = text,options: NarrationOptions = {}): Promise<boolean> {
    const request = this.request;
    const audio = request?.audio;
    const remaining = audio ? (audio.duration-audio.currentTime)/audio.playbackRate : Infinity;
    // Let an almost finished word land before the next tap's narration. Keep
    // only the latest pending tap; navigation/mute/stop still cancel immediately.
    if (this.canPlay() && text.trim() && request?.started &&
      (request.phase==='tail' || (request.phase==='audio' && remaining>0 && remaining<=NARRATION_FINISH_WINDOW_SECONDS))) {
      this.pending?.cancel();
      return new Promise<boolean>(resolve => {
        this.pending = {start:() => {void this.begin(text,audioPath,fallbackText,options).then(resolve);},cancel:() => resolve(false)};
      });
    }
    return this.begin(text,audioPath,fallbackText,options);
  }
  private begin(text: string,audioPath: string|undefined,fallbackText: string,options: NarrationOptions): Promise<boolean> {
    this.stop();
    if (!this.canPlay() || !text.trim()) return Promise.resolve(false);
    return new Promise<boolean>(resolve => {
      const request: Request = {resolve,phase:'audio',audio:null,utterance:null,timers:new Set(),started:false,fallbackStarted:false};
      this.request = request;
      // Include loading and the natural tail so music stays below the whole sentence.
      this.publish({speaking:true,notice:''});
      const snapshot = this.dependencies.snapshot();
      const path = audioPath ?? (fallbackText!==text ? snapshot.catalog[fallbackText]??snapshot.catalog[text] : snapshot.catalog[text]);
      if (!path) {this.fallback(request,fallbackText,options);return;}
      try {
        const audio = this.clip(path);request.audio = audio;request.path = path;
        audio.currentTime = 0;
        // Set one steady pace before playback. Mid-syllable rate changes make
        // WebKit restart its media pipeline and can repeat or stall the ending.
        audio.playbackRate = Math.max(.5,narrationPlaybackRate(snapshot.rate,snapshot.defaultPlaybackRate)*NARRATION_PACE);
        audio.preservesPitch = true;
        // Only 10ms, already audible at 88%: do not swallow initial consonants.
        audio.volume = .88;
        audio.onplay = () => {
          if (!this.current(request) || request.phase!=='audio' || request.audio!==audio) return;
          request.started = true;this.publish({method:'local-audio',notice:''});
          this.later(request,() => {if(request.phase==='audio')audio.volume=.94;},4);
          this.later(request,() => {if(request.phase==='audio')audio.volume=1;},10);
        };
        audio.onended = () => {if(this.current(request) && request.phase==='audio')this.naturalEnd(request,options);};
        const failed = () => {if(this.current(request) && request.phase==='audio')this.fallback(request,fallbackText,options);};
        audio.onerror = failed;this.publish({method:'local-audio'});
        void audio.play().catch(failed);
      } catch {this.fallback(request,fallbackText,options);}
    });
  }
  private fallback(request: Request,text: string,options: NarrationOptions) {
    if (!this.current(request) || request.fallbackStarted) return;
    request.fallbackStarted = true;this.detach(request,true);
    request.phase = 'system';request.started = false;
    const {voices,rate} = this.dependencies.snapshot();
    const synthesis = this.synthesis();
    if (!synthesis || !voices.length) {
      this.publish({method:'unavailable',notice:'这段本地音频尚未准备好，设备也暂未提供普通话声音。请在系统设置中添加中文语音；现可继续看图学习。'});
      this.finish(request,false);return;
    }
    try {
      const utterance = (this.dependencies.createUtterance ?? (content => new SpeechSynthesisUtterance(content)))(text);
      request.utterance = utterance;utterance.lang = 'zh-CN';utterance.rate = rate;
      utterance.voice = preferredNarrationVoice(voices) ?? null;
      utterance.onstart = () => {
        if (!this.current(request) || request.phase!=='system' || request.utterance!==utterance) return;
        request.started = true;this.publish({method:'system-voice',notice:''});
      };
      utterance.onend = () => {if(this.current(request) && request.phase==='system')this.naturalEnd(request,options);};
      utterance.onerror = () => {
        if (!this.current(request) || request.phase!=='system') return;
        this.publish({notice:'语音暂时没有播放成功，请点小喇叭重试。'});this.finish(request,false);
      };
      this.publish({method:'system-voice'});synthesis.speak(utterance);
    } catch {
      this.publish({notice:'语音暂时没有播放成功，请点小喇叭重试。'});this.finish(request,false);
    }
  }
  dispose() {
    if (this.disposed) return;
    this.stop();this.disposed = true;
    for (const audio of this.pool.values()) this.releaseAudio(audio);
    this.pool.clear();
  }
}
