import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, CheckCircle2, ChevronLeft, Mic, Sparkles, Volume2, X } from 'lucide-react';
import { pronunciationParts } from '../pronunciation';
import type { Hanzi, Profile } from '../types';
import { finishLesson, initialProgress, lessonMistake, updateLesson } from '../store';
import { createHanziQuestions, selectHanziDistractors } from '../hanzi-quiz';
import Quiz from './Quiz';
import StrokePractice from './StrokePractice';
import WordPlay from './WordPlay';

const stages = ['玩', '认', '练', '写', '说', '过关'];
const initials: Record<string,string> = { b:'波',p:'坡',m:'摸',f:'佛',d:'得',t:'特',n:'呢',l:'勒',g:'哥',k:'科',h:'喝',j:'鸡',q:'七',x:'西',zh:'知',ch:'吃',sh:'诗',r:'日',z:'资',c:'词',s:'思',y:'衣',w:'乌' };
const finals: Record<string,string> = { a:'啊',o:'喔',e:'鹅',i:'衣',u:'乌',ü:'迂',ai:'哀',ei:'诶',ao:'凹',ou:'欧',an:'安',en:'恩',ang:'昂',eng:'哼的后半段',ong:'翁的后半段',ia:'呀',ie:'耶',iao:'腰',iu:'优',iou:'优',ian:'烟',in:'因',iang:'央',ing:'英',iong:'雍',ua:'蛙',uo:'窝',uai:'歪',ui:'威',uei:'威',uan:'弯',un:'温',uen:'温',uang:'汪',ueng:'翁',üe:'约',ue:'约',üan:'冤',ün:'晕' };
export default function HanziLesson({ word, words, profile, onUpdate, onSpeak, onClose, onNext, onZoo }: { word: Hanzi; words: Hanzi[]; profile: Profile; onUpdate: (updater:(p:Profile)=>Profile)=>void; onSpeak:(text:string)=>Promise<boolean>; onClose:()=>void; onNext:()=>void; onZoo:()=>void }) {
  const progress = profile.hanzi[word.id] ?? initialProgress();
  const stage = progress.stage;
  const overlay=useRef<HTMLDivElement>(null);
  useEffect(()=>{overlay.current?.scrollTo(0,0);},[stage]);
  const [heard, setHeard] = useState(false);
  const [listening, setListening] = useState(false);
  const listenToken = useRef(0);
  const sound = profile.settings.sound;
  const listenContext = `${word.id}:${stage}:${sound}`;
  const currentListenContext = useRef(listenContext);
  currentListenContext.current = listenContext;
  useEffect(()=>{
    listenToken.current++;setListening(false);
    return()=>{listenToken.current++;};
  },[word.id,stage,sound]);
  async function listenTo(text:string,onCompleted:()=>void){
    if(!sound)return;
    const seq=++listenToken.current,context=currentListenContext.current;
    setListening(true);
    const completed=await onSpeak(text).catch(()=>false);
    if(seq!==listenToken.current||context!==currentListenContext.current)return;
    setListening(false);
    if(completed)onCompleted();
  }
  const [spoken, setSpoken] = useState(false);
  const [written, setWritten] = useState(false);
  const [example, setExample] = useState(0);
  const distractors = useMemo(()=>selectHanziDistractors(word,words),[word,words]);
  const {practice,finalQuiz} = useMemo(()=>createHanziQuestions(word,distractors,sound),[word,distractors,sound]);
  const nextStage = () => { listenToken.current++;setListening(false);onUpdate(p=>updateLesson(p,'hanzi',word.id,{stage:stage+1,quizRound:0})); setHeard(false); setSpoken(false); };
  const {initial,final,tone,apical} = pronunciationParts(word.pinyin);
  const toneText = ({'1':'一声平平的，像走平路。','2':'二声往上扬，像小车上山。','3':'三声先下后上，像走进小山谷。','4':'四声从高到低，像滑滑梯。','0':'轻声轻轻的，短一些。'} as Record<string,string>)[tone]||'跟着声音，慢慢读一读。';
  return <div ref={overlay} className="lesson-overlay" role="dialog" aria-modal="true" aria-label={`${word.char}字学习`}>
    <div className="lesson-shell">
      <header className="lesson-header"><button className="text-button" onClick={onClose}><ChevronLeft size={22}/>回小岛</button><div className="lesson-title"><span className="lesson-title-icon">{word.icon}</span><span>汉字小冒险 · {word.char}</span></div><button className="icon-button" onClick={onClose} aria-label="关闭学习，保存进度"><X size={22}/></button></header>
      <div className="stage-track">{stages.map((s,i)=><div className={`stage-node ${i===stage?'current':''} ${i<stage?'done':''}`} key={s}><span>{i<stage?<Check size={17}/>:i+1}</span><b>{s}</b></div>)}</div>
      <main className={`lesson-content lesson-stage-${stage}`}>
        {stage===0&&<WordPlay key={word.id} word={word} onComplete={nextStage} onSpeak={onSpeak} soundEnabled={profile.settings.sound}/>}
        {stage===1&&<div className="recognize-layout"><div className="big-letter-card"><div className="word-illustration">{word.icon}</div><button className="big-char" disabled={listening||!sound} onClick={()=>void listenTo(word.char,()=>setHeard(true))} aria-label={`听${word.char}字读音`}>{word.char}</button><button className="pinyin-button" disabled={listening||!sound} onClick={()=>void listenTo(word.char,()=>setHeard(true))}>{word.pinyin}<Volume2 size={20}/></button></div><div className="word-story"><span className="mini-label">看一看 · 听一听</span><h2>{word.meaning}</h2><div className="word-pills">{word.words.map(w=><button className="pill-button" key={w} onClick={()=>onSpeak(w)}><Volume2 size={17}/>{w}</button>)}</div><p className="example-sentence">{word.sentence}</p><button className="text-button" onClick={()=>onSpeak(word.sentence)}><Volume2 size={18}/>听这句话</button><div className="pronunciation-guide"><span className="mini-label">拼音小老师</span><div className="sound-parts">{initial&&<button disabled={listening||!sound} onClick={()=>onSpeak(`声母${initial}，听起来像${initials[initial]||word.char}。`)}><small>声母</small><b>{initial}</b><Volume2 size={16}/></button>}<button disabled={listening||!sound} onClick={()=>onSpeak(apical?`这是舌尖韵母，跟着读${word.char}。`:`韵母${final}，听起来像${finals[final]||word.char}。`)}><small>韵母</small><b>{final}</b><Volume2 size={16}/></button><button disabled={listening||!sound} onClick={()=>onSpeak(`${word.char}。${toneText}`)}><small>声调</small><b>{tone==='0'?'轻声':`${tone}声`}</b><Volume2 size={16}/></button></div><p>{toneText}</p></div><button className="primary-button" disabled={listening} onClick={()=>{if(!sound||heard)nextStage();else void listenTo(word.char,()=>setHeard(true));}}>{!sound?'静音学习：去找字朋友':listening?'正在听这个字':heard?'去找字朋友':'先听听这个字'}<ArrowRight size={20}/></button></div></div>}
        {stage===2&&<Quiz key={`practice-${word.id}`} questions={practice} savedRound={progress.quizRound} onCheckpoint={n=>onUpdate(p=>updateLesson(p,'hanzi',word.id,{quizRound:n}))} onComplete={nextStage} onMistake={()=>onUpdate(p=>lessonMistake(p,'hanzi',word.id))} onSpeak={onSpeak}/>}
        {stage===3&&<div className="writing-layout"><div className="writing-intro"><span className="mini-label">小手写一写</span><h2>一笔一笔，写出“{word.char}”</h2><p>先看示范，再从圆点出发。<br/>像画画一样，慢慢来就好。</p><div className="writing-mascot">{word.icon}</div><p className="muted">小朋友可以和爸爸妈妈一起画。</p></div><div><StrokePractice key={word.id} char={word.char} savedIndex={progress.strokeIndex??0} onStroke={n=>{setWritten(false);onUpdate(p=>updateLesson(p,'hanzi',word.id,{strokeIndex:n}));}} onComplete={()=>setWritten(true)} onIncomplete={()=>setWritten(false)} onSpeak={onSpeak}/>{written&&<button className="primary-button" onClick={nextStage}>我的字写好啦<CheckCircle2 size={20}/></button>}</div></div>}
        {stage===4&&<div className="say-stage"><span className="mini-label"><Mic size={17}/>我的声音真好听</span><h2>让这个字，变成一句话</h2><div className="speak-bubble"><span>{word.icon}</span><h3>{example===0?word.words[0]:word.sentence}</h3><button className="round-audio" aria-label="听跟读示范" disabled={listening||!sound} onClick={()=>void listenTo(example===0?word.words[0]:word.sentence,()=>onUpdate(p=>updateLesson(p,'hanzi',word.id,example===0?{heardWord:true}:{heardSentence:true})))}><Volume2 size={28}/></button></div><div className="sentence-switch"><button className={example===0?'active':''} onClick={()=>{setExample(0);setHeard(false);}}>词语</button><button className={example===1?'active':''} onClick={()=>{setExample(1);setHeard(false);}}>一句话</button></div><p>{sound?'先听一遍，再用你自己的声音说一说。':'当前已静音，请看词语和句子，和家长一起说一说。'}</p><button className="pill-button" disabled={listening} onClick={()=>{if(!sound){setSpoken(true);}else if(!progress.heardWord){setExample(0);void listenTo(word.words[0],()=>onUpdate(p=>updateLesson(p,'hanzi',word.id,{heardWord:true})));}else if(!progress.heardSentence){setExample(1);void listenTo(word.sentence,()=>onUpdate(p=>updateLesson(p,'hanzi',word.id,{heardSentence:true})));}else{setSpoken(true);void onSpeak('你说得真认真。');}}}><Check size={20}/>{listening?'正在听示范':spoken?'家长已确认朗读':!sound?'家长确认：孩子已尝试读词语和句子':progress.heardWord&&progress.heardSentence?'家长确认：孩子已跟读词语和句子':!progress.heardWord?'先听词语':'再听一句话'}</button><p className="muted small">此处由陪同家长确认，不进行自动语音评分。</p>{spoken&&<button className="primary-button" onClick={nextStage}>去过关<ArrowRight size={20}/></button>}</div>}
        {stage===5&&<Quiz key={`final-${word.id}`} questions={finalQuiz} savedRound={progress.quizRound} onCheckpoint={n=>onUpdate(p=>updateLesson(p,'hanzi',word.id,{quizRound:n}))} onComplete={()=>onUpdate(p=>finishLesson(p,'hanzi',word.id))} onMistake={()=>onUpdate(p=>lessonMistake(p,'hanzi',word.id))} onSpeak={onSpeak}/>}
        {stage===6&&<div className="completion"><div className="completion-stars"><Sparkles size={35}/><span>{word.char}</span><Sparkles size={35}/></div><span className="mini-label">小小探险家，真棒</span><h2>{progress.reviewCount>0?'老朋友记得更牢啦！':'又认识了一个新朋友！'}</h2><p>{word.char} · {word.pinyin}</p><div className="earned-stars">{progress.reviewCount>0?'🌿 复习完成，已安排下次温习':'⭐ 首次过关奖励 3 颗星星'}</div><p className="muted">下次在生活中看到“{word.char}”，记得和它打招呼。<br/>明天，小岛会提醒你再见见它。</p><div className="completion-actions"><button className="pill-button" onClick={onZoo}>看看我的动物园</button><button className="primary-button" onClick={onNext}>下一个字<ArrowRight size={20}/></button></div></div>}
      </main>
      <footer className="lesson-footer"><span>每一步都会保存，随时可以回来。</span><span>玩着学，慢慢长大 🌱</span></footer>
    </div>
  </div>;
}
