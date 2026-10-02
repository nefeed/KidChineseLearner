import { Volume2 } from 'lucide-react';
import type { Poem } from '../types';
import connections from '../data/today-connections.json';
export default function TodayConnection({poem,onSpeak}:{poem:Poem;onSpeak:(text:string)=>void}){
  const date=new Date().toLocaleDateString('sv-SE');
  const context=[poem.theme,...poem.keywords,poem.title].join('');
  const cards=connections.filter(card=>date>=card.start&&date<=card.end&&new RegExp(card.match).test(context)).slice(0,1);
  return <>{cards.map(card=><section className="today-connection" key={card.id} aria-label="诗词与今天的生活">
    <span className="mini-label">{card.icon} 今天小岛一起关注 · {card.date}</span><h3>{card.title}</h3>
    <p>{card.fact}</p><p>{card.connection}</p>
    <div className="today-connection-action"><b>我们的小实践</b><p>{card.activity}</p></div>
    <button className="pill-button" onClick={()=>onSpeak(`${card.fact}${card.connection}${card.activity}`)}><Volume2 size={20}/>听今天的小发现</button>
    <details><summary>家长查看资料</summary><a href={card.source} target="_blank" rel="noreferrer">{card.sourceName}</a><p>资料核对：{card.verifiedAt}。诗与生活的联系及活动为本课程设计。日期过后自动收起此卡。</p></details>
  </section>)}</>;
}
