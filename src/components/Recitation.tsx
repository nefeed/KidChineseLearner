import { useMemo, useState } from 'react';
import { Check, RotateCcw, Volume2 } from 'lucide-react';
import type { LessonProgress, Poem } from '../types';
import Quiz from './Quiz';
const hanChars = (s:string) => [...s].filter(c=>/\p{Script=Han}/u.test(c));
const shuffle = <T,>(items:T[]) => {
  const result=[...items];
  for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
};
type Checkpoint = NonNullable<LessonProgress['recitation']>;
export default function Recitation({ poem, saved, onCheckpoint, onComplete, onMistake, onSpeak }: {
  poem:Poem; saved?:Checkpoint; onCheckpoint:(state:Checkpoint)=>void;
  onComplete:()=>void; onMistake:()=>void; onSpeak:(text:string)=>void;
}) {
  const chunks = useMemo(()=>Array.from({length:Math.ceil(poem.lines.length/4)},(_,i)=>poem.lines.slice(i*4,i*4+4)),[poem]);
  const [state,setState] = useState<Checkpoint>(()=>({
    phase:saved?.phase??0,chunk:Math.min(saved?.chunk??0,chunks.length-1),
    selected:saved?.selected??[],clozeRound:Math.min(saved?.clozeRound??0,poem.lines.length-1),
  }));
  const [hint,setHint] = useState('');
  const [show,setShow] = useState(false);
  const [parentConfirmed,setParentConfirmed] = useState(false);
  const options = useMemo(()=>shuffle(chunks[state.chunk].map((line,i)=>({line,index:i}))),[state.chunk,chunks]);
  const cloze = useMemo(()=>poem.lines.map((line,i)=>{
    const chars=hanChars(line),target=chars[Math.floor(chars.length/2)]||chars[0];
    const pos=line.indexOf(target);
    const pool=Array.from(new Set(poem.lines.flatMap(hanChars).filter(c=>c!==target)));
    const others=[...pool.slice(i%Math.max(1,pool.length)),...pool];
    const distractors=Array.from(new Set([...others,'月','风','山','人'].filter(c=>c!==target))).slice(0,2);
    return {prompt:line.slice(0,pos)+'□'+line.slice(pos+target.length),audio:line,options:[target,...distractors],answer:0,explanation:line};
  }),[poem]);
  function checkpoint(patch:Partial<Checkpoint>){const next={...state,...patch};setState(next);onCheckpoint(next);}
  function choose(index:number){
    if(state.selected.includes(index))return;
    if(index!==state.selected.length){setHint('这一句还在后面，先听听前一句。');onSpeak(chunks[state.chunk][state.selected.length]);onMistake();return;}
    checkpoint({selected:[...state.selected,index]});setHint('接对啦！');onSpeak(chunks[state.chunk][index]);
  }
  if(state.phase===1)return <div><span className="mini-label">记忆小桥 · 填一填</span><Quiz key={poem.id} questions={cloze} savedRound={state.clozeRound} onCheckpoint={clozeRound=>checkpoint({clozeRound})} onComplete={()=>checkpoint({phase:2})} onMistake={onMistake} onSpeak={onSpeak}/></div>;
  if(state.phase===2)return <div className="recite-final">
    <span className="mini-label">记忆小桥 · 读一读</span><h2>现在，试着读给动物朋友听</h2>
    <p>想不起来时，可以打开小提示。</p>
    <div className={`hidden-poem ${show?'visible':''}`}>{poem.lines.map((line,i)=><p key={i}>{show?line:'●  ●  ●  ●  ●'}</p>)}</div>
    <button className="pill-button" onClick={()=>setShow(!show)}>{show?'收起提示':'看看提示'}</button>
    <button className="pill-button" onClick={()=>onSpeak(poem.lines.join(''))}><Volume2 size={20}/>再听一次</button>
    <p className="muted small">陪同家长听完后确认；当前没有自动评测背诵。</p>
    <button className={`pill-button ${parentConfirmed?'confirmed':''}`} onClick={()=>setParentConfirmed(true)}><Check size={20}/>{parentConfirmed?'家长已确认背诵练习':'家长确认：孩子已尝试完整背诵'}</button>
    {parentConfirmed&&<button className="primary-button" onClick={onComplete}>记忆小桥走完啦<Check size={20}/></button>}
  </div>;
  return <div className="line-order">
    <span className="mini-label">记忆小桥 · 接一接</span><h2>给诗句排好队</h2>
    <p>第 {state.chunk+1} 组 / {chunks.length} 组 · 点卡片，接在前一句后面。</p>
    <div className="ordered-lines">{state.selected.length===0?<span className="muted">第一句会是哪一张呢？</span>:state.selected.map(i=><div className="ordered-line" key={i}><Check size={18}/>{chunks[state.chunk][i]}</div>)}</div>
    <div className="line-options">{options.map(({line,index})=><button className={`line-option ${state.selected.includes(index)?'used':''}`} key={index} disabled={state.selected.includes(index)} onClick={()=>choose(index)}>{line}<Volume2 size={18}/></button>)}</div>
    <p className="gentle-hint" role="status">{hint||'一边听，一边找。'}</p>
    <button className="text-button" onClick={()=>{checkpoint({selected:[]});setHint('');}}><RotateCcw size={18}/>重新排队</button>
    {state.selected.length===chunks[state.chunk].length&&<button className="primary-button" onClick={()=>{
      if(state.chunk===chunks.length-1)checkpoint({phase:1});
      else{checkpoint({chunk:state.chunk+1,selected:[]});setHint('');}
    }}>{state.chunk===chunks.length-1?'去填一填':'下一组诗句'}<Check size={20}/></button>}
  </div>;
}
