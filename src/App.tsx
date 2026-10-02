import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, BookOpen, Check, ChevronDown, Clock3, Flower2, Home, Leaf, Music2, PawPrint, Settings2, ShieldCheck, Sparkles, Star, Volume2, VolumeX, X } from 'lucide-react';
import type { Hanzi, Poem, Profile, SaveData, Screen } from './types';
import hanziJSON from './data/hanzi.json';
import poemsJSON from './data/poems.json';
import { completedCount, createSave, dueLessons, loadSave, newlyCompletedToday, persistSave, startReview, updateLesson } from './store';
import { useSpeech } from './speech';
import { useMusic } from './music';
import IslandScene from './components/IslandScene';
import HanziLesson from './components/HanziLesson';
import PoemLesson from './components/PoemLesson';
import { HanziLibrary, PoemLibrary } from './components/Libraries';
import Parents from './components/Parents';
import Zoo from './components/Zoo';
import { REWARDS } from './data/rewards';
import { narrationText } from './pronunciation';
import PwaControls from './components/PwaControls';

const words=hanziJSON as Hanzi[],poems=poemsJSON as Poem[];
const NAV = [{id:'home',icon:Home,label:'我的小岛'},{id:'hanzi',icon:BookOpen,label:'汉字冒险'},{id:'poems',icon:Flower2,label:'诗词花园'},{id:'zoo',icon:PawPrint,label:'我的动物园'}] as const;
function initial(){try{return loadSave(window.localStorage);}catch{return {data:createSave(),error:'浏览器不允许本地保存。请允许此网页使用本机存储，或在家长区导出备份。'};}}

export default function App(){
  const [loaded]=useState(initial);
  const [data,setData]=useState<SaveData>(loaded.data),[saveError,setSaveError]=useState(loaded.error??'');
  const [screen,setScreen]=useState<Screen>('home');
  const [lesson,setLesson]=useState<{kind:'hanzi'|'poems';id:string}|null>(null);
  const [profileMenu,setProfileMenu]=useState(false),[parentGate,setParentGate]=useState(false),[parentAnswer,setParentAnswer]=useState(''),[gateError,setGateError]=useState('');
  const [rest,setRest]=useState(false),[recoveryBlocked,setRecoveryBlocked]=useState(!!loaded.error);
  const dataRef=useRef(data),blockedRef=useRef(recoveryBlocked),restStart=useRef(Date.now());
  const profile=data.profiles.find(p=>p.id===data.activeId)!;
  const speech=useSpeech(profile.settings.sound,profile.settings.speechRate);
  const music=useMusic({enabled:profile.settings.sound && (profile.settings.music ?? true),volume:profile.settings.musicVolume ?? .22,speaking:speech.speaking,paused:rest,profileId:profile.id});
  const learned=completedCount(profile.hanzi),poetryLearned=completedCount(profile.poems);
  const daily=newlyCompletedToday(profile.hanzi);
  const continuePoem=profile.lastActivity?.kind==='poems'?poems.find(p=>p.id===profile.lastActivity?.id&&!profile.poems[p.id]?.completed):undefined;
  const nextWord=words.find(w=>w.id===profile.lastActivity?.id&&!profile.hanzi[w.id]?.completed)||words.find(w=>!profile.hanzi[w.id]?.completed)||words[0];
  const upcomingReward=REWARDS.find(r=>r.source==='hanzi'&&r.threshold>learned);
  const reviews=dueLessons(profile);

  const commit=useCallback((next:SaveData,force=false)=>{
    const saved={...next,savedAt:Date.now()};dataRef.current=saved;setData(saved);
    if(blockedRef.current&&!force)return;
    try{persistSave(window.localStorage,saved);setSaveError('');}catch(e){setSaveError(`进度暂时未写入本机：${e instanceof Error?e.message:'存储空间不足'}。请到家长区导出备份。`);}
  },[]);
  const updateProfile=useCallback((updater:(p:Profile)=>Profile)=>{
    const current=dataRef.current;
    const next={...current,profiles:current.profiles.map(p=>p.id===current.activeId?{...updater(p),updatedAt:Date.now()}:p)};commit(next);
  },[commit]);
  const replaceSave=useCallback((next:SaveData)=>{
    blockedRef.current=false;setRecoveryBlocked(false);speech.stop();setLesson(null);commit(next,true);
  },[commit,speech.stop]);
  useEffect(()=>{if(!loaded.error)commit(dataRef.current);},[commit,loaded.error]);
  useEffect(()=>{const timer=setInterval(()=>{if(Date.now()-restStart.current>=profile.settings.sessionMinutes*60_000){speech.stop();setRest(true);restStart.current=Date.now();}},15_000);return()=>clearInterval(timer);},[profile.id,profile.settings.sessionMinutes,speech.stop]);
  useEffect(()=>{const handler=(e:StorageEvent)=>{if(e.key==='ziyou-island-v1'&&e.newValue){const fresh=loadSave(window.localStorage);if(!fresh.error&&fresh.data.savedAt>dataRef.current.savedAt){dataRef.current=fresh.data;setData(fresh.data);}}};window.addEventListener('storage',handler);return()=>window.removeEventListener('storage',handler);},[]);
  const closeLesson=useCallback(()=>{speech.stop();setLesson(null);},[speech.stop]);
  useEffect(()=>{
    if(!lesson&&!parentGate&&!rest)return;
    const previous=document.activeElement as HTMLElement;
    const timer=setTimeout(()=>document.querySelector<HTMLElement>('.lesson-overlay button, .modal button')?.focus(),40);
    const handler=(e:KeyboardEvent)=>{
      if(e.key==='Escape'){if(lesson)closeLesson();else if(parentGate)setParentGate(false);else setRest(false);}
      if(e.key==='Tab'){const selector=lesson?'.lesson-overlay':'.modal';const nodes=[...document.querySelectorAll<HTMLElement>(`${selector} button:not(:disabled), ${selector} input, ${selector} a[href]`)];if(!nodes.length)return;const first=nodes[0],last=nodes.at(-1)!;if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
    };window.addEventListener('keydown',handler);return()=>{clearTimeout(timer);window.removeEventListener('keydown',handler);previous?.focus();};
  },[lesson,parentGate,rest,closeLesson]);
  function navigate(s:Screen){speech.stop();setScreen(s);setProfileMenu(false);window.scrollTo(0,0);}
  function openWord(w:Hanzi){
    speech.stop();updateProfile(p=>p.hanzi[w.id]?.completed?startReview(p,'hanzi',w.id):updateLesson(p,'hanzi',w.id,{}));setLesson({kind:'hanzi',id:w.id});
  }
  function openPoem(p:Poem){speech.stop();updateProfile(pr=>pr.poems[p.id]?.completed?startReview(pr,'poems',p.id):updateLesson(pr,'poems',p.id,{}));setLesson({kind:'poems',id:p.id});}
  function switchProfile(id:string){speech.stop();closeLesson();commit({...dataRef.current,activeId:id});setProfileMenu(false);setScreen('home');restStart.current=Date.now();}
  const activeWord=lesson?.kind==='hanzi'?words.find(w=>w.id===lesson.id):undefined;
  const activePoem=lesson?.kind==='poems'?poems.find(p=>p.id===lesson.id):undefined;
  return <>
    <div className="app-frame" inert={!!lesson||parentGate||rest}>
      <aside className="sidebar"><button className="brand" onClick={()=>navigate('home')} aria-label="回到字游小岛"><span className="brand-mark"><Leaf size={24}/><i>字</i></span><span>字游小岛<small>一点发现 · 一点成长</small></span></button><div className="nav-caption">今天去哪里探险？</div><nav>{NAV.map(n=><button key={n.id} aria-label={n.label} className={`nav-link ${screen===n.id?'active':''}`} onClick={()=>navigate(n.id)}><n.icon size={21}/><span>{n.label}</span>{screen===n.id&&<span className="nav-active-dot"/>}</button>)}</nav><div className="sidebar-bottom"><div className="sidebar-sprout"><span>🌱</span><p>不着急，慢慢来<br/>每一天都在长大</p></div><button aria-label="家长小屋" className={`nav-link parent-nav ${screen==='parents'?'active':''}`} onClick={()=>{setParentGate(true);setParentAnswer('');setGateError('');}}><Settings2 size={20}/><span>家长小屋</span><ShieldCheck size={15}/></button><span className="sidebar-footnote">给 3 岁起的小小探险家</span></div></aside>
      <div className="main-frame"><header className="topbar"><div className="breadcrumb">字游小岛<span>/</span>{NAV.find(n=>n.id===screen)?.label||'家长小屋'}</div><div className="topbar-actions"><span className="star-wallet"><Star size={18} fill="currentColor"/>{profile.stars}<span>星星</span></span><button className={`icon-button sound-toggle ${speech.speaking?'is-speaking':''}`} data-system-voice={speech.systemVoiceAvailable} data-speaking={speech.speaking} data-method={speech.method} aria-label={profile.settings.sound?'关闭声音':'打开声音'} onClick={()=>updateProfile(p=>({...p,settings:{...p.settings,sound:!p.settings.sound}}))}>{profile.settings.sound?<Volume2 size={20}/>:<VolumeX size={20}/>}</button><button className={`icon-button music-toggle ${profile.settings.music ?? true ? "music-enabled" : ""}`} data-music-status={music.status} aria-label={profile.settings.music ?? true ? "关闭小岛音乐" : "打开小岛音乐"} aria-pressed={profile.settings.music ?? true} disabled={!profile.settings.sound} onClick={()=>{music.start();updateProfile(p=>({...p,settings:{...p.settings,music:!(p.settings.music ?? true)}}));}}><Music2 size={20}/></button><PwaControls/><div className="profile-control"><button className="profile-switch" aria-label="切换儿童档案" aria-expanded={profileMenu} onClick={()=>setProfileMenu(!profileMenu)}><span>{profile.avatar}</span><b>{profile.name}</b><ChevronDown size={16}/></button>{profileMenu&&<div className="profile-dropdown">{data.profiles.map(p=><button key={p.id} onClick={()=>switchProfile(p.id)}><span>{p.avatar}</span>{p.name}{p.id===profile.id&&<Check size={15}/>}</button>)}<button className="add-profile-link" onClick={()=>{setProfileMenu(false);setParentGate(true);}}>管理儿童档案</button></div>}</div></div></header>
      {saveError&&<div className="save-banner" role="alert">{recoveryBlocked?'旧档案已保护。':''}{saveError}<button onClick={()=>{setParentGate(true);setParentAnswer('');}}>打开家长区</button></div>}
      <main className="main-content">
        {screen==='home'&&<div className="home-page"><div className="greeting-row"><div><span className="eyebrow"><Sparkles size={15}/>又是发现新朋友的一天</span><h1>你好，{profile.name}<span className="wave">👋</span></h1><p>准备好了吗？小岛上的朋友们在等你。</p></div><span className="local-badge"><ShieldCheck size={15}/>{saveError?'等待保存':'成长已记录在本机'}</span></div>
          <section className="home-hero"><div className="hero-copy"><span className="hero-kicker"><span/>玩着学，慢慢长大</span><h2>每一个字，<br/>都是一场<span>小冒险。</span></h2><p>和动物朋友一起听一听、玩一玩，<br/>发现汉字里藏着的奇妙世界。</p><button className="primary-button" onClick={()=>continuePoem?openPoem(continuePoem):openWord(nextWord)}>{continuePoem?`继续《${continuePoem.title}》`:profile.hanzi[nextWord.id]?'继续我的冒险':'开始我的冒险'}<ArrowRight size={22}/></button><div className="hero-footnote"><span>1000 个汉字</span><i/><span>300 首唐诗宋词</span><i/><span>我的专属动物园</span></div></div><div className="hero-art"><IslandScene/></div></section>
          <div className="home-middle"><section className="today-goal panel"><div className="section-title"><h2><Leaf size={20}/>今天的小目标</h2><span>慢慢来就很好</span></div><div className="goal-content"><div><b>{Math.min(daily,profile.settings.dailyGoal)}<span> / {profile.settings.dailyGoal}</span></b><p>认识新字，收获小小成就</p></div><div className="goal-leaves">{Array.from({length:Math.min(5,profile.settings.dailyGoal)},(_,i)=><span key={i} className={i<daily?'filled':''}><Leaf size={23}/></span>)}</div></div><div className="progress-bar"><span style={{width:`${Math.min(100,daily/profile.settings.dailyGoal*100)}%`}}/></div><div className="goal-note"><Clock3 size={15}/>每次 {profile.settings.sessionMinutes} 分钟，记得休息小眼睛</div></section>
          <section className="next-friend panel"><div className="section-title"><h2>下一位汉字朋友</h2><button className="text-button" onClick={()=>navigate('hanzi')}>看全部<ArrowRight size={16}/></button></div><div className="next-word-row"><button className="next-char" onClick={()=>openWord(nextWord)}>{nextWord.char}<small>{nextWord.pinyin}</small></button><div><span className="mini-label">{nextWord.theme}</span><h3>{nextWord.words[0]}</h3><p>{nextWord.sentence}</p></div><button className="circle-arrow" aria-label={`开始学习${nextWord.char}`} onClick={()=>openWord(nextWord)}><ArrowRight size={21}/></button></div></section></div>
          <div className="section-title explore-title"><h2>去看看，更大的世界</h2><span>每一种发现，都值得开心</span></div><div className="explore-grid"><button className="explore-card letters-explore" onClick={()=>navigate('hanzi')}><div className="explore-illustration"><span>山</span><span>水</span><span>日</span></div><div className="explore-card-label"><h3>汉字冒险</h3><ArrowRight size={21}/></div><p>玩一个字，认识一个新朋友</p><span className="explore-progress">已过关 {learned} / 1000 个字</span></button><button className="explore-card poems-explore" onClick={()=>navigate('poems')}><div className="explore-illustration"><span className="poem-moon">🌙</span><span className="poem-cloud">☁</span><i>诗</i></div><div className="explore-card-label"><h3>诗词花园</h3><ArrowRight size={21}/></div><p>听古人的故事，发现今天的美</p><span className="explore-progress">已过关 {poetryLearned} / 300 首诗词</span></button><button className="explore-card zoo-explore" onClick={()=>navigate('zoo')}><div className="explore-illustration"><span className="zoo-giraffe">🦒</span><span className="zoo-tree">🌳</span></div><div className="explore-card-label"><h3>我的动物园</h3><ArrowRight size={21}/></div><p>喂喂小动物，给它洗个泡泡澡</p><span className="explore-progress">{Object.keys(profile.zoo.animals).length} 位动物朋友在等你</span></button></div>
          <section className="journey-strip"><div className="journey-icon">🎁</div><div><h3>{upcomingReward?`再认识 ${upcomingReward.threshold-learned} 个字，迎接新的动物朋友`:'1000 个字的小旅程，还可以继续复习'}</h3><p>每一份认真，都能让自己的动物园更热闹。</p></div><button className="text-button" onClick={()=>navigate('zoo')}>看看奖励<ArrowRight size={18}/></button></section>
          {reviews.length>0&&<section className="review-strip"><span>🌿 今天可以和 {reviews.length} 位老朋友再见一面</span><button className="pill-button" onClick={()=>{const r=reviews[0];if(r.kind==='hanzi'){const w=words.find(w=>w.id===r.id);if(w)openWord(w);}else{const p=poems.find(p=>p.id===r.id);if(p)openPoem(p);}}}>温习一下<ArrowRight size={17}/></button></section>}
          <footer className="home-footer"><Leaf size={15}/>让好奇心带路，让快乐伴随每一点成长。</footer>
        </div>}
        {screen==='hanzi'&&<HanziLibrary words={words} profile={profile} onOpen={openWord} onSpeak={t=>void speech.speak(t)}/>}
        {screen==='poems'&&<PoemLibrary poems={poems} profile={profile} onOpen={openPoem}/>}
        {screen==='zoo'&&<Zoo profile={profile} onUpdate={updateProfile} onSpeak={t=>void speech.speak(t)}/>}
        {screen==='parents'&&<Parents musicStatus={music.status} onMusicStart={music.start} data={data} profile={profile} onReplace={replaceSave} onUpdate={updateProfile} saveError={saveError} corrupted={loaded.corrupted} onResumeSave={()=>{blockedRef.current=false;setRecoveryBlocked(false);commit(dataRef.current,true);}}/>}
      </main></div>
    </div>
    {activeWord&&<HanziLesson key={`${profile.id}-${activeWord.id}`} word={activeWord} words={words} profile={profile} onUpdate={updateProfile} onSpeak={t=>void speech.speak(t,undefined,narrationText(activeWord,t))} onClose={closeLesson} onNext={()=>{const index=words.indexOf(activeWord);if(index<words.length-1)openWord(words[index+1]);else closeLesson();}} onZoo={()=>{closeLesson();navigate('zoo');}}/>}
    {activePoem&&<PoemLesson key={`${profile.id}-${activePoem.id}`} poem={activePoem} profile={profile} onUpdate={updateProfile} onSpeak={(text,options)=>speech.speak(text,undefined,text,options)} onPrepare={speech.preload} onStop={speech.stop} onClose={closeLesson} onZoo={()=>{closeLesson();navigate('zoo');}}/>}
    {parentGate&&<div className="modal-backdrop"><div className="modal parent-gate" role="dialog" aria-modal="true" aria-label="家长验证"><button className="icon-button modal-close" onClick={()=>setParentGate(false)} aria-label="关闭家长验证"><X size={20}/></button><span className="gate-icon"><ShieldCheck size={32}/></span><h2>请家长帮忙开门</h2><p>这里可以调整学习节奏、切换档案和备份进度。</p><form onSubmit={e=>{e.preventDefault();if(parentAnswer.trim()==='13'){setParentGate(false);navigate('parents');}else setGateError('请家长再算一算。');}}><label>6 + 7 = <input type="text" inputMode="numeric" autoComplete="off" aria-label="家长验证答案" value={parentAnswer} onChange={e=>setParentAnswer(e.target.value)}/></label><p className="form-error" role="status">{gateError}</p><button className="primary-button" type="submit">打开家长小屋<ArrowRight size={20}/></button></form></div></div>}
    {rest&&<div className="modal-backdrop rest-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-label="休息提醒"><span className="rest-icon">🌳</span><h2>小眼睛，休息一下吧</h2><p>站起来看看远处，<br/>和家人说说今天认识的新朋友。</p><button className="primary-button" onClick={()=>{setRest(false);closeLesson();navigate('home');}}>回小岛，休息一会儿<Leaf size={20}/></button><button className="text-button" onClick={()=>{setRest(false);restStart.current=Date.now();}}>家长陪伴下继续</button></div></div>}
    {speech.notice&&<div className="speech-notice" role="status"><Volume2 size={19}/><p>{speech.notice}</p><button className="icon-button" aria-label="关闭声音提示" onClick={speech.clearNotice}><X size={16}/></button></div>}
  </>;
}
