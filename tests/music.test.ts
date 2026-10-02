import test from 'node:test';
import assert from 'node:assert/strict';
import { MUSIC_DUCK_RATIO, MUSIC_LOOP_BEATS, MUSIC_SCORE, MUSIC_TEMPO, MusicEngine, midiFrequency, musicGain, normalizeMusicVolume } from '../src/music-engine';

class FakeParam {
  value = 0;
  ramps: {value:number;time:number}[] = [];
  cancellations = 0;
  setValueAtTime(value:number,_time:number) {this.value=value;return this;}
  linearRampToValueAtTime(value:number,time:number) {this.ramps.push({value,time});this.value=value;return this;}
  exponentialRampToValueAtTime(value:number,_time:number) {this.value=value;return this;}
  cancelScheduledValues(_time:number) {this.cancellations++;return this;}
  cancelAndHoldAtTime(_time:number) {this.cancellations++;return this;}
}
class FakeGain {
  gain = new FakeParam();
  disconnected = false;
  connect(_target:unknown) {}
  disconnect() {this.disconnected=true;}
}
class FakeOscillator {
  frequency = new FakeParam();
  starts: number[] = [];
  stops: number[] = [];
  disconnected = false;
  onended: (()=>void) | null = null;
  constructor(private context: FakeContext) {}
  setPeriodicWave(_wave:unknown) {}
  connect(_target:unknown) {}
  disconnect() {this.disconnected=true;}
  start(time:number) {this.starts.push(time);}
  stop(time=this.context.currentTime) {this.stops.push(time);if(time<=this.context.currentTime)this.onended?.();}
}
class FakeContext {
  state: AudioContextState = 'suspended';
  currentTime = 0;
  destination = {};
  gains: FakeGain[] = [];
  oscillators: FakeOscillator[] = [];
  resumes = 0;
  suspensions = 0;
  closed = 0;
  deferSuspension = false;
  finishSuspension: (()=>void) | null = null;
  createGain() {const gain=new FakeGain();this.gains.push(gain);return gain;}
  createBiquadFilter() {return {type:'',frequency:{value:0},Q:{value:0},connect:()=>{}};}
  createPeriodicWave(real:Float32Array,imaginary:Float32Array) {assert.equal(real.length,imaginary.length);return {};}
  createOscillator() {const oscillator=new FakeOscillator(this);this.oscillators.push(oscillator);return oscillator;}
  resume() {this.resumes++;this.state='running';return Promise.resolve();}
  suspend() {
    this.suspensions++;
    if(this.deferSuspension)return new Promise<void>(resolve=>{this.finishSuspension=()=>{this.state='suspended';resolve();};});
    this.state='suspended';return Promise.resolve();
  }
  close() {this.closed++;this.state='closed';return Promise.resolve();}
}
class FakeTimers {
  sequence = 0;
  intervals = new Map<number,()=>void>();
  timeouts = new Map<number,{callback:()=>void;milliseconds:number}>();
  setInterval = (callback:()=>void,_ms:number) => {const token=++this.sequence;this.intervals.set(token,callback);return token;};
  clearInterval = (token:unknown) => {this.intervals.delete(token as number);};
  setTimeout = (callback:()=>void,milliseconds:number) => {const token=++this.sequence;this.timeouts.set(token,{callback,milliseconds});return token;};
  clearTimeout = (token:unknown) => {this.timeouts.delete(token as number);};
  tick() {for(const callback of [...this.intervals.values()])callback();}
  release() {for(const [token,{callback}] of [...this.timeouts]){this.timeouts.delete(token);callback();}}
}
const settle = async () => {await Promise.resolve();await Promise.resolve();await Promise.resolve();};
function setup() {
  const context=new FakeContext(),timers=new FakeTimers(),statuses:string[]=[];
  let creations=0;
  const engine=new MusicEngine({contextFactory:()=>{creations++;return context as unknown as AudioContext;},timers,onStatus:status=>statuses.push(status)});
  return {context,timers,statuses,engine,creations:()=>creations};
}
const options={enabled:true,volume:.22,speaking:false,paused:false};

test('music has an original full phrase, accompaniment, bounded volume and distinct pitches',()=>{
  const melody=MUSIC_SCORE.filter(note=>note.part==='melody');
  assert.ok(melody.length>=40);
  assert.ok(new Set(melody.map(note=>note.midi)).size>=8);
  assert.equal(MUSIC_LOOP_BEATS*60/MUSIC_TEMPO,40);
  assert.equal(MUSIC_SCORE.filter(note=>note.part==='bass').length,16);
  assert.equal(MUSIC_SCORE.filter(note=>note.part==='harmony').length,48);
  assert.ok(MUSIC_SCORE.every(note=>note.beat>=0&&note.beat<MUSIC_LOOP_BEATS&&note.duration>0&&note.velocity>0&&note.velocity<.5));
  assert.ok(Math.abs(midiFrequency(60)-261.6256)<.001);
  assert.equal(normalizeMusicVolume(-1),0);assert.equal(normalizeMusicVolume(5),1);assert.equal(normalizeMusicVolume(NaN),.22);
  assert.equal(musicGain(1,false),.16);
  assert.equal(musicGain(.22,true)/musicGain(.22,false),MUSIC_DUCK_RATIO);
});

test('no autoplay before gesture and repeated starts keep one context and one scheduler',async()=>{
  const {context,timers,engine,creations}=setup();
  engine.configure(options);
  assert.equal(engine.status,'waiting');assert.equal(creations(),0);assert.equal(timers.intervals.size,0);
  engine.unlock();engine.unlock();await settle();
  assert.equal(creations(),1);assert.equal(engine.status,'playing');assert.equal(timers.intervals.size,1);
  const count=context.oscillators.length;
  engine.unlock();engine.configure(options);await settle();
  assert.equal(context.oscillators.length,count);assert.equal(timers.intervals.size,1);
  engine.dispose();assert.equal(timers.intervals.size,0);assert.equal(context.closed,1);
});

test('speech ducks promptly, restores after the entire utterance, and new speech cancels restoration',async()=>{
  const {context,timers,engine}=setup();engine.configure(options);engine.unlock();await settle();
  context.currentTime=5;
  engine.configure({...options,speaking:true});
  assert.deepEqual(context.gains[0].gain.ramps.at(-1),{value:musicGain(.22,true),time:5.075});
  engine.configure(options);
  assert.equal(timers.timeouts.size,1);assert.equal([...timers.timeouts.values()][0].milliseconds,500);
  assert.equal(context.gains[0].gain.ramps.at(-1)?.value,musicGain(.22,true));
  engine.configure({...options,speaking:true});assert.equal(timers.timeouts.size,0);
  engine.configure(options);context.currentTime=5.5;timers.release();
  assert.deepEqual(context.gains[0].gain.ramps.at(-1),{value:musicGain(.22,false),time:7});
  engine.configure({...options,volume:0});assert.equal(context.gains[0].gain.ramps.at(-1)?.value,0);
  engine.dispose();
});

test('master off or background pause immediately silences scheduled notes and resumes once',async()=>{
  const {context,timers,engine}=setup();engine.configure(options);engine.unlock();await settle();
  const voices=[...context.oscillators];
  engine.configure({...options,paused:true});
  assert.equal(engine.status,'paused');assert.equal(timers.intervals.size,0);assert.equal(context.gains[0].gain.value,0);
  assert.ok(voices.every(voice=>voice.stops.includes(0)&&voice.disconnected));
  engine.configure(options);await settle();assert.equal(engine.status,'playing');assert.equal(timers.intervals.size,1);
  engine.configure({...options,enabled:false});await settle();
  assert.equal(engine.status,'off');assert.equal(context.state,'suspended');assert.equal(timers.intervals.size,0);
  engine.configure({...options,enabled:false,speaking:true});assert.equal(context.gains[0].gain.value,0);
  engine.dispose();
});

test('rapid re-enable during an asynchronous suspension does not leave playback stalled or duplicate it',async()=>{
  const {context,timers,engine}=setup();engine.configure(options);engine.unlock();await settle();
  context.deferSuspension=true;
  engine.configure({...options,enabled:false});engine.configure(options);
  assert.equal(timers.intervals.size,0);
  context.finishSuspension?.();await settle();
  assert.equal(engine.status,'playing');assert.equal(timers.intervals.size,1);
  context.deferSuspension=false;engine.dispose();
});

test('scheduler repeats the musical loop and skips elapsed notes instead of emitting a burst',async()=>{
  const {context,timers,engine}=setup();engine.configure(options);engine.unlock();await settle();
  for(let time=.1;time<40.5;time+=.1){context.currentTime=time;timers.tick();}
  assert.ok(context.oscillators.some(voice=>voice.starts[0]>=40.08));
  const before=context.oscillators.length;context.currentTime=55;timers.tick();
  const latest=context.oscillators.slice(before);
  assert.ok(latest.length<=4);assert.ok(latest.every(voice=>voice.starts[0]>=55));
  engine.dispose();
});

test('unsupported music is reported without throwing or scheduling sound',()=>{
  const timers=new FakeTimers(),engine=new MusicEngine({contextFactory:()=>{throw new Error('unsupported');},timers});
  engine.configure(options);assert.doesNotThrow(()=>engine.unlock());
  assert.equal(engine.status,'unavailable');assert.equal(timers.intervals.size,0);engine.dispose();
});
