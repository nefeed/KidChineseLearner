// Reproducible Mandarin narration labels and spoken contexts, independent of renderer.
// Local Qwen3 and historical Kokoro share this plan; it makes no network calls.
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pronunciationParts, pronunciationText, narrationText } from '../src/pronunciation.ts';
import { COLORS, PETS, FOOD_WORDS } from '../src/word-play-narration.ts';
import { zooNarrationTexts } from '../src/zoo-narration.ts';
import ts from 'typescript';
const root=new URL('../',import.meta.url);
const words=JSON.parse(readFileSync(new URL('src/data/hanzi.json',root),'utf8'));
const poems=JSON.parse(readFileSync(new URL('src/data/poems.json',root),'utf8'));
const connections=JSON.parse(readFileSync(new URL('src/data/today-connections.json',root),'utf8'));
const plan=new Map();
// Tingting emits an empty stream for some Chinese/Latin reading annotations. Keep the
// written source unchanged, while speaking the reading through Chinese context.
function spokenReading(text){return text.replaceAll('观读guàn','观是道观的观，读第四声').replaceAll('读yān','读第一声，和烟同音').replaceAll('“省”读 xǐng','省是反省的省，读第三声，和醒同音');}
function add(text,kind,spoken=text){if(!text?.trim())return;spoken=spokenReading(spoken);const old=plan.get(text);if(old&&old.spoken!==text&&spoken===text)return;const key=createHash('sha256').update(spoken).digest('hex').slice(0,20),entry={text,spoken,file:`${key}.m4a`,kind};plan.set(text,entry);if(spoken!==text&&!plan.has(spoken))plan.set(spoken,{...entry,text:spoken});}
for(const w of words){
  add(w.char,'character',pronunciationText(w));for(const s of w.words)add(s,'word');add(w.sentence,'sentence');add(w.meaning,'meaning');add(w.prompt,'character-game');
  add(`${w.words[0]}。${w.sentence}`,'character-game');add(`${w.words[0]}。${w.meaning}`,'character-game');add(`${w.char}。${w.meaning}`,'character-game',narrationText(w,`${w.char}。${w.meaning}`));add(`再听句子，找找${w.words[0]}。`,'character-game');add(`找对啦！${w.sentence}`,'quiz-feedback');add(`找对啦！${w.words[0]||w.char}`,'quiz-feedback');add(`找对啦！${w.char}，读作${w.char}。`,'quiz-feedback',narrationText(w,`找对啦！${w.char}，读作${w.char}。`));add(`“${w.char}”是什么意思？`,'quiz-prompt');add(`哪个词里有“${w.char}”？`,'quiz-prompt');
  const part=pronunciationParts(w.pinyin);
  const toneText=({'1':'一声平平的，像走平路。','2':'二声往上扬，像小车上山。','3':'三声先下后上，像走进小山谷。','4':'四声从高到低，像滑滑梯。','0':'轻声轻轻的，短一些。'})[part.tone];
  add(`${w.char}。${toneText}`,'tone-guide',`${pronunciationText(w)}。${toneText}`);
}
for(const c of connections)add(`${c.fact}${c.connection}${c.activity}`,'current-life');
// Include literal child-facing speech prompts from the lesson and zoo components.
// Dynamic course text is covered by the data loops above.
for(const file of ['src/components/WordPlay.tsx','src/word-play-narration.ts','src/components/Zoo.tsx','src/components/StrokePractice.tsx','src/components/Recitation.tsx','src/trace.ts']){
  const code=readFileSync(new URL(file,root),'utf8');
  // Parse literals instead of pairing quote characters: adjacent ternaries and
  // JSX attributes can otherwise consume a spoken sentence without recording it.
  const source=ts.createSourceFile(file,code,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  function visit(node){
    if(ts.isStringLiteralLike(node)&&/\p{Script=Han}/u.test(node.text)&&!/[<>{}]/.test(node.text))add(node.text,'interface-prompt');
    ts.forEachChild(node,visit);
  }
  visit(source);
}
// Template expressions are not string literals. Expand the finite scene
// vocabulary so an ordinary game action never silently changes to a system voice.
for(const [char,pet] of Object.entries(PETS)){
  add(`这份不适合。${pet.hint}`,'game-feedback');
  add(`${pet.name}吃了一口。${char}。`,'game-feedback');
}
for(const [char,food] of Object.entries(FOOD_WORDS)){
  add(`这不是${food.name}，再看看。`,'game-feedback');
  add(`${food.name}放进碗里。${char}。`,'game-feedback');
}
for(const char of Object.keys(COLORS)){
  add(`先选${char}色。`,'game-feedback');add(`${char}色的花瓣。`,'game-feedback');add(`${char}色。`,'game-feedback');
}
for(const char of ['大','小','多','少','长','短'])add(`你找到了${char}的${['大','小'].includes(char)?'皮球':['多','少'].includes(char)?'数量':'绳子'}。`,'game-feedback');
for(const item of ['牙膏','肥皂'])add(`先点${item}。`,'game-feedback');
for(const item of ['小花','小草','树'])for(let count=1;count<=3;count++)add(`${count}棵${item}长出来啦。`,'game-feedback');
for(const text of ['这首作品是谁写的？','听一听，词语里有哪个字？','你们尝试过，也分享了发现。'])add(text,'instruction');
for(const text of zooNarrationTexts())add(text,'zoo-feedback');
for(const p of poems){
  for(const line of p.lines){add(line,'poetry-line');add(`找对啦！${line}`,'poetry-feedback');}
  add(p.lines.join(''),'whole-poem');add(p.title,'poetry-title');add(p.author,'poetry-author');add(p.background,'poetry-background');add(p.interpretation.join(' '),'poetry-interpretation');add(p.activity,'poetry-activity');
  add(p.question.prompt,'poetry-quiz');for(const option of p.question.options)add(option,'poetry-quiz');add(p.question.explanation,'poetry-feedback');add(`找对啦！${p.question.explanation}`,'poetry-feedback');
  add(`${p.dynasty}代的${p.author}，写下了《${p.title}》。`,'poetry-author');add(`找对啦！${p.dynasty}代的${p.author}写下了《${p.title}》。`,'poetry-feedback');for(const key of p.keywords)add(key,'poetry-keyword');
}
const initials={b:'波',p:'坡',m:'摸',f:'佛',d:'得',t:'特',n:'呢',l:'勒',g:'哥',k:'科',h:'喝',j:'鸡',q:'七',x:'西',zh:'知',ch:'吃',sh:'诗',r:'日',z:'资',c:'词',s:'思',y:'衣',w:'乌'};
for(const [key,sound]of Object.entries(initials))add(`声母${key}，听起来像${sound}。`,'pinyin-guide');
for(const s of ['从小圆点开始，沿着箭头慢慢画。','先找到发亮的小圆点，从这里开始。','再画长一点，送小星星到笔画的终点。','沿着这一笔慢慢走完。','靠近发亮的笔画，再试一次就好。','转弯的地方也要一起画到哦。','看看这个字是怎样一笔一笔写成的。','你说得真认真。','没关系，再听一听。','找一找和这个字有关的朋友。','再找找。','和家长商量一下，准备试试看。','你们尝试过，也分享了发现。','每个字都是一个新朋友，先玩一玩，再认识它。'])add(s,'instruction');
for(let i=1;i<=10;i++)add(String(i),'counting');
const finals={a:'啊',o:'喔',e:'鹅',i:'衣',u:'乌',ü:'迂',ai:'哀',ei:'诶',ao:'凹',ou:'欧',an:'安',en:'恩',ang:'昂',eng:'哼的后半段',ong:'翁的后半段',ia:'呀',ie:'耶',iao:'腰',iu:'优',iou:'优',ian:'烟',in:'因',iang:'央',ing:'英',iong:'雍',ua:'蛙',uo:'窝',uai:'歪',ui:'威',uei:'威',uan:'弯',un:'温',uen:'温',uang:'汪',ueng:'翁',üe:'约',ue:'约',üan:'冤',ün:'晕'};
for(const w of words){const {final,apical}=pronunciationParts(w.pinyin);add(apical?`这是舌尖韵母，跟着读${w.char}。`:`韵母${final}，听起来像${finals[final]||w.char}。`,'pinyin-guide');}

export {plan};
