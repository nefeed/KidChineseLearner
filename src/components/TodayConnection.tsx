import { useState } from 'react';
import { ChevronLeft, ChevronRight, Volume2 } from 'lucide-react';
import type { Poem } from '../types';
import connections from '../data/today-connections.json';
import { useTabletViewport } from '../tablet-viewport';
export default function TodayConnection({poem,onSpeak}:{poem:Poem;onSpeak:(text:string)=>void}){
  const [page,setPage]=useState(0);
  const {tablet}=useTabletViewport();
  const date=new Date().toLocaleDateString('sv-SE');
  const context=[poem.theme,...poem.keywords,poem.title].join('');
  const cards=connections.filter(card=>date>=card.start&&date<=card.end&&new RegExp(card.match).test(context)).slice(0,1);
  return <>{tablet&&cards.length===0&&<p className="poem-today-empty">今天没有额外的时事小卡。我们可以继续完成诗里的生活小任务。</p>}{cards.map(card=><section className="today-connection" key={card.id} aria-label="诗词与今天的生活">
    <span className="mini-label">{card.icon} 今天小岛一起关注 · {card.date}</span><h3>{card.title}</h3>
    {tablet?<>    <div className="today-connection-page">{page===0&&<p>{card.fact}</p>}{page===1&&<p>{card.connection}</p>}{page===2&&<div className="today-connection-action"><b>我们的小实践</b><p>{card.activity}</p></div>}{page===3&&<div className="today-connection-source"><a href={card.source} target="_blank" rel="noreferrer">{card.sourceName}</a><p>资料核对：{card.verifiedAt}。诗与生活的联系及活动为本课程设计。日期过后自动收起此卡。</p></div>}</div>
    <nav className="poem-page-controls" aria-label={`今天的生活资料分页`}><button className="pill-button" aria-label={`上一页生活资料`} disabled={page===0} onClick={()=>setPage(page-1)}><ChevronLeft size={18}/>上一页</button><span role="status" aria-live="polite">{['今天的发现','诗与生活','我们的小实践','家长查看资料'][page]} · {page+1} / 4</span><button className="pill-button" aria-label={`下一页生活资料`} disabled={page===3} onClick={()=>setPage(page+1)}>下一页<ChevronRight size={18}/></button></nav>
</>:<><p>{card.fact}</p><p>{card.connection}</p><div className="today-connection-action"><b>我们的小实践</b><p>{card.activity}</p></div></>}
    <button className="pill-button" onClick={()=>onSpeak(`${card.fact}${card.connection}${card.activity}`)}><Volume2 size={20}/>听今天的小发现</button>
    {!tablet&&<details><summary>家长查看资料</summary><a href={card.source} target="_blank" rel="noreferrer">{card.sourceName}</a><p>资料核对：{card.verifiedAt}。诗与生活的联系及活动为本课程设计。日期过后自动收起此卡。</p></details>}
  </section>)}</>;
}
