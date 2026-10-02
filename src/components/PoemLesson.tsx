import { useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronLeft, ChevronRight, Leaf, Pause, Play, Sparkles, Volume2, X } from 'lucide-react';
import type { Poem, Profile } from '../types';
import { finishLesson, initialProgress, lessonMistake, updateLesson } from '../store';
import Quiz from './Quiz';
import Recitation from './Recitation';
import PoetryScene from './PoetryScene';
import TodayConnection from './TodayConnection';
import type { NarrationOptions } from '../narration-player';
import { useTabletViewport } from '../tablet-viewport';
import '../poem-viewport.css';
const steps = ['听诗', '故事', '诗意', '今天', '背诵', '过关'];
function displayPages(text:string,limit:number){
  const characters=[...text],pages:string[]=[];
  for(let start=0;start<characters.length;){
    let end=Math.min(start+limit,characters.length);
    if(end<characters.length){
      for(let i=end-1;i>=start+Math.floor(limit/2);i--){
        if(/[。！？；，、]/u.test(characters[i])){end=i+1;break;}
      }
    }
    pages.push(characters.slice(start,end).join(''));start=end;
  }
  return pages.length?pages:[''];
}
function PageControls({page,count,onChange,label}:{page:number;count:number;onChange:(page:number)=>void;label:string}){
  if(count<=1)return null;
  return <nav className="poem-page-controls" aria-label={`${label}分页`}>
    <button className="pill-button" aria-label={`上一页${label}`} disabled={page===0} onClick={()=>onChange(page-1)}><ChevronLeft size={18}/>上一页</button>
    <span role="status" aria-live="polite">第 {page+1} / {count} 页</span>
    <button className="pill-button" aria-label={`下一页${label}`} disabled={page===count-1} onClick={()=>onChange(page+1)}>下一页<ChevronRight size={18}/></button>
  </nav>;
}
function PinyinLine({line,sounds}:{line:string;sounds:string[]}){
  let index=0;
  return <span className="poem-ruby">{[...line].map((char,i)=>/\p{Script=Han}/u.test(char)?<ruby key={i}>{char}<rt>{sounds[index++]??''}</rt></ruby>:<span key={i} className="poem-punctuation">{char}</span>)}</span>;
}
export default function PoemLesson({poem,profile,onUpdate,onSpeak,onPrepare,onStop,onClose,onZoo}:{poem:Poem;profile:Profile;onUpdate:(updater:(p:Profile)=>Profile)=>void;onSpeak:(text:string,options?:NarrationOptions)=>Promise<boolean>;onPrepare:(texts:string[])=>void;onStop:()=>void;onClose:()=>void;onZoo:()=>void}){
  const progress=profile.poems[poem.id]??initialProgress();
  const stage=progress.stage;
  const overlay=useRef<HTMLDivElement>(null);
  const content=useRef<HTMLElement>(null);
  const {tablet}=useTabletViewport();
  const lineRefs=useRef<(HTMLButtonElement|null)[]>([]);
  const [compact,setCompact]=useState(()=>typeof window!=='undefined'&&window.innerHeight<900);
  const [readPage,setReadPage]=useState(0);
  const [storyPage,setStoryPage]=useState(0);
  const [todayPage,setTodayPage]=useState(0);
  useEffect(()=>{
    const element=content.current;if(!element)return;
    const measure=()=>setCompact(element.clientHeight<680);
    measure();const observer=new ResizeObserver(measure);observer.observe(element);
    return()=>observer.disconnect();
  },[]);
  useEffect(()=>{overlay.current?.scrollTo(0,0);},[stage]);
  const [reading,setReading]=useState(false);
  const [activeLine,setActiveLine]=useState(-1);
  const linesPerPage=tablet?(compact?3:4):poem.lines.length;
  const readingPageCount=Math.ceil(poem.lines.length/linesPerPage);
  const currentReadPage=Math.min(readPage,readingPageCount-1);
  useEffect(()=>{
    if(activeLine<0)return;
    if(tablet)setReadPage(Math.floor(activeLine/linesPerPage));
    else lineRefs.current[activeLine]?.scrollIntoView({block:'nearest',behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  },[activeLine,linesPerPage,tablet]);
  const heardLines=progress.listenedLines??[];
  const listened=heardLines.length>=poem.lines.length;
  const [showPinyin,setShowPinyin]=useState(true);
  const [storySeen,setStorySeen]=useState(0);
  const [activity,setActivity]=useState(0);
  const [objects,setObjects]=useState<string[]>([]);
  const token=useRef(0);
  const next=()=>{token.current++;onStop();setReading(false);setActiveLine(-1);onUpdate(p=>updateLesson(p,'poems',poem.id,{stage:stage+1,quizRound:0}));};
  const mistake=()=>onUpdate(p=>lessonMistake(p,'poems',poem.id));
  useEffect(()=>()=>{token.current++;onStop();},[onStop]);
  async function readAll(){
    if(reading){token.current++;onStop();setReading(false);setActiveLine(-1);return;}
    const seq=++token.current;setReading(true);onPrepare(poem.lines);
    for(let i=0;i<poem.lines.length;i++){if(token.current!==seq)return;if(!listened&&heardLines.includes(i))continue;onPrepare(poem.lines.slice(i,i+4));setActiveLine(i);const completed=await onSpeak(poem.lines[i],{pauseAfterMs:240});if(token.current!==seq)return;if(!completed)break;markListened(i);}
    if(token.current===seq){setReading(false);setActiveLine(-1);}
  }
  function markListened(index:number){onUpdate(p=>{const old=p.poems[poem.id]?.listenedLines??[];return updateLesson(p,'poems',poem.id,{listenedLines:old.includes(index)?old:[...old,index]});});}
  async function readLine(index:number){const seq=++token.current;setReading(false);setActiveLine(index);const completed=await onSpeak(poem.lines[index]);if(seq===token.current){if(completed)markListened(index);setActiveLine(-1);}}
  const storyParts=[{title:'诗人是谁？',text:`${poem.dynasty}代的${poem.author}，写下了《${poem.title}》。`},{title:'那时发生了什么？',text:poem.background},{title:'诗里看见了什么？',text:poem.interpretation.join(' ')}];
  const storyTextPages=displayPages(storyParts[storySeen].text,compact?100:180);
  const currentStoryPage=Math.min(storyPage,storyTextPages.length-1);
  return <div ref={overlay} className="lesson-overlay poetry-overlay" role="dialog" aria-modal="true" aria-label={`${poem.title}诗词学习`}><div className="lesson-shell">
    <header className="lesson-header"><button className="text-button" onClick={onClose}><ChevronLeft size={22}/>回诗词花园</button><div className="lesson-title"><span>{poem.icon}</span><span>{poem.title}</span></div><button className="icon-button" onClick={onClose} aria-label="关闭诗词学习，保存进度"><X size={22}/></button></header>
    <div className="stage-track">{steps.map((s,i)=><div className={`stage-node ${i===stage?'current':''} ${i<stage?'done':''}`} key={s}><span>{i<stage?<Check size={17}/>:i+1}</span><b>{s}</b></div>)}</div>
    <main ref={content} className={`lesson-content poem-viewport-content poem-stage-${stage}`}>
      {stage===0&&<div className="poem-reading"><PoetryScene poem={poem} found={objects} onFind={k=>{token.current++;setReading(false);setActiveLine(-1);setObjects(a=>a.includes(k)?a:[...a,k]);void onSpeak(poem.lines.find(line=>line.includes(k))??k);}}/><div className="poem-paper"><span className="mini-label">{poem.dynasty} · {poem.author}</span><h2>{poem.title}</h2><div className="poem-lines">{poem.lines.slice(currentReadPage*linesPerPage,(currentReadPage+1)*linesPerPage).map((line,offset)=>{const i=currentReadPage*linesPerPage+offset;return <button key={i} ref={element=>{lineRefs.current[i]=element;}} className={`poem-line ${i===activeLine?'reading':''}`} onClick={()=>{void readLine(i);}}>{showPinyin?<PinyinLine line={line} sounds={poem.pinyin[i]||[]}/>:line}<Volume2 size={15}/></button>;})}</div><PageControls page={currentReadPage} count={readingPageCount} onChange={setReadPage} label="诗句"/><div className="poem-read-controls"><button className="pill-button" onClick={()=>void readAll()}>{reading?<Pause size={20}/>:<Play size={20}/>} {reading?'暂停':heardLines.length>0&&!listened?'继续听剩下的诗句':'慢慢听整首'}</button><button className="text-button" onClick={()=>setShowPinyin(!showPinyin)}>{showPinyin?'收起拼音':'显示拼音'}</button></div><button className="primary-button" onClick={()=>{if(!listened){void readAll();}else next();}}>{listened?'去听诗里的故事':reading?'正在听诗':'先听完这首诗'}<ArrowRight size={20}/></button></div></div>}
      {stage===1&&<div className="poem-story"><span className="mini-label"><BookOpen size={16}/>穿过时光，认识诗人</span><h2>每一首诗，都有一个故事</h2>{tablet?<><div className="poem-story-tabs" role="group" aria-label="选择诗的故事">{storyParts.map((part,i)=><button className={`pill-button ${storySeen===i?'active':''}`} aria-pressed={storySeen===i} key={i} onClick={()=>{setStorySeen(i);setStoryPage(0);void onSpeak(part.text);}}>{part.title}</button>)}</div><button className="story-card active poem-story-card" onClick={()=>void onSpeak(storyParts[storySeen].text)}><span>0{storySeen+1}</span><h3>{storyParts[storySeen].title}</h3><p>{storyTextPages[currentStoryPage]}</p><Volume2 size={20}/></button><PageControls page={currentStoryPage} count={storyTextPages.length} onChange={setStoryPage} label="故事"/></>:<div className="story-pages">{storyParts.map((part,i)=><button className={`story-card ${storySeen===i?'active':''}`} key={i} onClick={()=>{setStorySeen(i);void onSpeak(part.text);}}><span>0{i+1}</span><h3>{part.title}</h3><p>{part.text}</p><Volume2 size={20}/></button>)}</div>}<p className="muted small">家长资料：<a href={poem.backgroundSource} target="_blank" rel="noreferrer">查看背景来源</a>{poem.reviewStatus==='draft'?' · 本篇解读仍待编辑复核':''}</p><button className="primary-button" onClick={next}>走进这幅诗的画<ArrowRight size={20}/></button></div>}
      {stage===2&&<div className="poem-understanding"><span className="mini-label">我读懂啦</span><Quiz key={poem.id} questions={[poem.question]} savedRound={progress.quizRound} onCheckpoint={n=>onUpdate(p=>updateLesson(p,'poems',poem.id,{quizRound:n}))} onComplete={next} onMistake={mistake} onSpeak={t=>void onSpeak(t)}/></div>}
      {stage===3&&<div className="poem-today"><span className="mini-label"><Leaf size={16}/>诗，也住在今天</span><h2>把诗中的发现带到生活里</h2>{tablet?<><div className="poem-today-tabs" role="group" aria-label="选择生活实践内容"><button className={`pill-button ${todayPage===0?'active':''}`} aria-pressed={todayPage===0} onClick={()=>setTodayPage(0)}>生活小任务</button><button className={`pill-button ${todayPage===1?'active':''}`} aria-pressed={todayPage===1} onClick={()=>setTodayPage(1)}>今天的小发现</button></div>{todayPage===0?<div className="today-card"><span>{poem.icon}</span><p>{poem.activity}</p><button className="round-audio" aria-label="听生活小任务" onClick={()=>void onSpeak(poem.activity)}><Volume2 size={24}/></button></div>:<TodayConnection poem={poem} onSpeak={t=>void onSpeak(t)}/>}</>:<><div className="today-card"><span>{poem.icon}</span><p>{poem.activity}</p><button className="round-audio" aria-label="听生活小任务" onClick={()=>void onSpeak(poem.activity)}><Volume2 size={24}/></button></div><TodayConnection poem={poem} onSpeak={t=>void onSpeak(t)}/></>}<div className="today-steps"><button className={activity>=1?'done':''} onClick={()=>{setActivity(1);void onSpeak('和家长商量一下，准备试试看。');}}><span>1</span>我和家长商量好了</button><button className={activity>=2?'done':''} disabled={activity<1} onClick={()=>{setActivity(2);onUpdate(p=>updateLesson(p,'poems',poem.id,{activityDone:true}));void onSpeak('把你的发现说给动物朋友听吧。');}}><span>2</span>我们尝试过，分享了发现</button></div><p className="muted">离开屏幕去观察也没关系，回来仍在这一关。</p>{(activity===2||progress.activityDone)&&<button className="primary-button" onClick={next}>去走记忆小桥<ArrowRight size={20}/></button>}</div>}
      {stage===4&&<Recitation key={poem.id} poem={poem} pageSize={linesPerPage} saved={progress.recitation} onCheckpoint={recitation=>onUpdate(p=>updateLesson(p,'poems',poem.id,{recitation}))} onSpeak={t=>void onSpeak(t)} onMistake={mistake} onComplete={()=>{onUpdate(p=>updateLesson(p,'poems',poem.id,{stage:5,recitationDone:true}));}}/>}
      {stage===5&&<Quiz key={`poem-final-${poem.id}`} questions={[poem.question,{prompt:'这首作品是谁写的？',options:[poem.author,...['李白','杜甫','苏轼','李清照'].filter(a=>a!==poem.author).slice(0,2)],answer:0,explanation:`${poem.dynasty}代的${poem.author}写下了《${poem.title}》。`}]} savedRound={progress.quizRound} onCheckpoint={n=>onUpdate(p=>updateLesson(p,'poems',poem.id,{quizRound:n}))} onComplete={()=>onUpdate(p=>finishLesson(p,'poems',poem.id))} onMistake={mistake} onSpeak={t=>void onSpeak(t)}/>}
      {stage===6&&<div className="completion"><div className="poem-completion-icon">{poem.icon}</div><span className="mini-label">在心里，种下一首诗</span><h2>《{poem.title}》的小旅程完成啦</h2><div className="earned-stars">{progress.reviewCount>0?'🌿 复习完成，已安排下次温习':'⭐ 首次过关奖励 8 颗星星'}</div><p>{poem.lines[0]}</p><p className="muted">诗里的风景，也可以在生活中再次遇见。<br/>隔一段时间，我们再读一读。</p><div className="completion-actions"><button className="pill-button" onClick={onClose}>回诗词花园</button><button className="primary-button" onClick={onZoo}>去动物园<Sparkles size={20}/></button></div></div>}
    </main><footer className="lesson-footer"><span>跟着节奏读，跟着生活懂。</span><span>喜欢的诗，多听几次也很好 🌼</span></footer>
  </div></div>;
}
