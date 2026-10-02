/** Original composition: 小岛微光, 16 bars in 3/4, C major, 72 quarter notes/minute.
 * Written for this project; synthesized instruments contain no sampled recordings.
 */
export const MUSIC_TITLE = '小岛微光';
export const MUSIC_TEMPO = 72;
export const MUSIC_LOOP_BEATS = 48;
export const MUSIC_DEFAULT_VOLUME = .22;
export const MUSIC_DUCK_RATIO = .07;
const MAX_GAIN = .16;
const SECONDS_PER_BEAT = 60 / MUSIC_TEMPO;

export type MusicStatus = 'off' | 'waiting' | 'playing' | 'paused' | 'unavailable';
export interface MusicOptions { enabled: boolean; volume: number; speaking: boolean; paused?: boolean }
export interface MusicNote { beat: number; duration: number; midi: number; velocity: number; part: 'melody' | 'harmony' | 'bass' }
type PhraseNote = readonly [number | null, number];

// Each bar has its own rhythm. The closing rest leaves room before the loop repeats.
const MELODY: readonly (readonly PhraseNote[])[] = [
  [[64,1],[67,1],[69,1]], [[67,1.5],[64,.5],[62,1]],
  [[72,1.5],[69,.5],[67,1]], [[69,1],[64,1],[62,1]],
  [[65,1],[69,1],[72,1]], [[71,1.5],[67,.5],[64,1]],
  [[74,1],[72,1],[71,1]], [[67,2],[null,1]],
  [[64,.5],[67,.5],[69,1],[72,1]], [[71,1],[67,1],[64,1]],
  [[69,1.5],[65,.5],[64,1]], [[62,1],[64,1],[67,1]],
  [[65,1],[69,1],[72,1]], [[71,1],[74,1],[72,1]],
  [[69,1],[67,1],[62,1]], [[64,1],[60,1.5],[null,.5]],
];
const HARMONY = [
  [48,55,64], [52,59,67], [45,57,64], [52,59,67],
  [53,60,69], [48,55,64], [43,59,62], [43,59,62],
  [48,55,64], [52,59,67], [53,60,69], [48,55,64],
  [50,57,65], [43,59,62], [43,59,62], [48,55,64],
] as const;

export function createMusicScore(): MusicNote[] {
  const notes: MusicNote[] = [];
  MELODY.forEach((bar, index) => {
    let beat = index * 3;
    bar.forEach(([midi,duration]) => {
      if (midi !== null) notes.push({beat,duration,midi,velocity:.46,part:'melody'});
      beat += duration;
    });
    const chord = HARMONY[index];
    notes.push({beat:index*3,duration:2,midi:chord[0],velocity:.17,part:'bass'});
    [chord[1],chord[2],chord[1]].forEach((midi,i) => notes.push({beat:index*3+.25+i,duration:1.15,midi,velocity:.13,part:'harmony'}));
  });
  return notes.sort((a,b) => a.beat-b.beat);
}
export const MUSIC_SCORE: readonly MusicNote[] = createMusicScore();
export const midiFrequency = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
export function normalizeMusicVolume(volume: number): number {
  return Number.isFinite(volume) ? Math.max(0,Math.min(1,volume)) : MUSIC_DEFAULT_VOLUME;
}
export const musicGain = (volume: number, speaking: boolean) => normalizeMusicVolume(volume) * MAX_GAIN * (speaking ? MUSIC_DUCK_RATIO : 1);

interface Timers {
  setInterval(callback: () => void, milliseconds: number): unknown;
  clearInterval(token: unknown): void;
  setTimeout(callback: () => void, milliseconds: number): unknown;
  clearTimeout(token: unknown): void;
}
const timers: Timers = {
  setInterval: (callback,ms) => globalThis.setInterval(callback,ms),
  clearInterval: token => globalThis.clearInterval(token as ReturnType<typeof setInterval>),
  setTimeout: (callback,ms) => globalThis.setTimeout(callback,ms),
  clearTimeout: token => globalThis.clearTimeout(token as ReturnType<typeof setTimeout>),
};
const createContext = () => {
  const browser = globalThis as typeof globalThis & {webkitAudioContext?: typeof AudioContext};
  const Constructor = browser.AudioContext ?? browser.webkitAudioContext;
  if (!Constructor) throw new Error('AudioContext unavailable');
  return new Constructor({latencyHint:'playback'});
};

/** One context and one scheduler. unlock must be called from a real user gesture. */
export class MusicEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private wave: PeriodicWave | null = null;
  private voices = new Set<OscillatorNode>();
  private interval: unknown = null;
  private restoration: unknown = null;
  private options: MusicOptions = {enabled:false,volume:MUSIC_DEFAULT_VOLUME,speaking:false,paused:false};
  private unlocked = false;
  private running = false;
  private disposed = false;
  private resumePending: Promise<void> | null = null;
  private suspendPending: Promise<void> | null = null;
  private loopStart = 0;
  private cycle = 0;
  private cursor = 0;
  private lastStatus: MusicStatus = 'off';
  private readonly factory: () => AudioContext;
  private readonly timers: Timers;
  private readonly onStatus: (status: MusicStatus) => void;

  constructor(dependencies: {contextFactory?: () => AudioContext; timers?: Timers; onStatus?: (status: MusicStatus) => void} = {}) {
    this.factory = dependencies.contextFactory ?? createContext;
    this.timers = dependencies.timers ?? timers;
    this.onStatus = dependencies.onStatus ?? (() => {});
  }
  get status() { return this.lastStatus; }
  get isUnlocked() { return this.unlocked; }
  private publish(status: MusicStatus) {
    if (this.lastStatus === status) return;
    this.lastStatus = status;
    this.onStatus(status);
  }
  private wantsPlayback() { return this.options.enabled && !this.options.paused && this.unlocked && !this.disposed; }

  configure(options: MusicOptions) {
    if (this.disposed) return;
    const wasSpeaking = this.options.speaking;
    this.options = {...options,volume:normalizeMusicVolume(options.volume),paused:!!options.paused};
    if (!this.wantsPlayback()) {
      this.silence();
      this.publish(!options.enabled?'off':options.paused?'paused':'waiting');
      return;
    }
    if (!this.running) { this.resume(); return; }
    if (options.speaking) {
      this.clearRestoration();
      this.ramp(musicGain(this.options.volume,true),.075);
    } else if (wasSpeaking) {
      this.clearRestoration();
      this.restoration = this.timers.setTimeout(() => {
        this.restoration = null;
        if (this.running && !this.options.speaking) this.ramp(musicGain(this.options.volume,false),1.5);
      },500);
    } else this.ramp(musicGain(this.options.volume,this.restoration !== null),.65);
  }

  unlock() {
    if (this.disposed) return;
    this.unlocked = true;
    try {
      if (!this.context) {
        this.context = this.factory();
        const filter = this.context.createBiquadFilter();
        filter.type = 'lowpass'; filter.frequency.value = 2400; filter.Q.value = .45;
        this.master = this.context.createGain(); this.master.gain.value = 0;
        this.master.connect(filter); filter.connect(this.context.destination);
        this.wave = this.context.createPeriodicWave(new Float32Array(5),new Float32Array([0,.78,.16,.045,.015]));
      }
      // Resume in this gesture even when muted: no notes are scheduled while off.
      this.resume();
    } catch {
      this.publish('unavailable');
    }
  }
  private resume() {
    const context = this.context;
    if (!context || this.disposed || this.resumePending || this.suspendPending) return;
    if (context.state === 'running') {
      if (this.wantsPlayback()) this.begin(); else this.silence();
      return;
    }
    const pending = context.resume();
    this.resumePending = pending;
    void pending.then(() => {
      this.resumePending = null;
      if (this.disposed) return;
      if (this.wantsPlayback() && context.state === 'running') this.begin();
      else if (this.wantsPlayback()) this.resume();
      else this.silence();
    }).catch(() => {this.resumePending=null;if(!this.disposed)this.publish('unavailable');});
  }
  private begin() {
    if (this.running || !this.context || !this.wantsPlayback()) return;
    this.running = true;
    this.loopStart = this.context.currentTime + .08;
    this.cursor = 0; this.cycle = 0;
    this.ramp(musicGain(this.options.volume,this.options.speaking),1.2);
    this.schedule();
    this.interval = this.timers.setInterval(() => this.schedule(),50);
    this.publish('playing');
  }
  private schedule() {
    const context = this.context;
    if (!context || !this.running) return;
    const horizon = context.currentTime + .22;
    // Bounded catch-up protects against a delayed timer without creating a burst.
    for (let count=0; count<200; count++) {
      const note = MUSIC_SCORE[this.cursor];
      const time = this.loopStart + (this.cycle*MUSIC_LOOP_BEATS+note.beat)*SECONDS_PER_BEAT;
      if (time > horizon) break;
      if (time >= context.currentTime) this.playNote(note,time);
      if (++this.cursor === MUSIC_SCORE.length) {this.cursor=0;this.cycle++;}
    }
  }
  private playNote(note: MusicNote,time: number) {
    if (!this.context || !this.master || !this.wave) return;
    const oscillator = this.context.createOscillator(), envelope = this.context.createGain();
    oscillator.setPeriodicWave(this.wave);
    oscillator.frequency.value = midiFrequency(note.midi);
    const duration = note.duration*SECONDS_PER_BEAT;
    const sustain = note.velocity*(note.part==='bass'?.37:.2);
    envelope.gain.setValueAtTime(0,time);
    envelope.gain.linearRampToValueAtTime(note.velocity,time+.018);
    envelope.gain.exponentialRampToValueAtTime(sustain,time+.3);
    envelope.gain.exponentialRampToValueAtTime(.0001,time+duration+.65);
    oscillator.connect(envelope); envelope.connect(this.master);
    this.voices.add(oscillator);
    oscillator.onended = () => {this.voices.delete(oscillator);oscillator.disconnect();envelope.disconnect();};
    oscillator.start(time); oscillator.stop(time+duration+.7);
  }
  private ramp(value: number,seconds: number) {
    if (!this.master || !this.context) return;
    const gain = this.master.gain,now = this.context.currentTime;
    if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
    else {gain.cancelScheduledValues(now);gain.setValueAtTime(gain.value,now);}
    gain.linearRampToValueAtTime(value,now+seconds);
  }
  private clearRestoration() {
    if (this.restoration !== null) this.timers.clearTimeout(this.restoration);
    this.restoration = null;
  }
  private silence() {
    this.running = false;
    if (this.interval !== null) this.timers.clearInterval(this.interval);
    this.interval = null;
    this.clearRestoration();
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(0,this.context.currentTime);
    }
    for (const voice of this.voices) {try {voice.stop();} catch { /* already ended */ }}
    this.voices.clear();
    if (this.context?.state === 'running' && !this.suspendPending) {
      const pending = this.context.suspend();
      this.suspendPending = pending;
      void pending.then(() => {
        this.suspendPending = null;
        if (this.wantsPlayback()) this.resume();
      }).catch(() => {this.suspendPending=null;});
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.silence();
    if (this.context && this.context.state !== 'closed') void this.context.close().catch(() => {});
  }
}
